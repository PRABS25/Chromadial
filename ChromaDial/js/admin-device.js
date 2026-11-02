(function () {
  "use strict";

  // Local UI access control only. Hosting a static webpage cannot enforce server-side security.
  const AUTH_KEY = "chromadial-admin-auth-v1";
  const PREF_KEY = "chromadial-esp32-prefs-v1";
  const SERVICE = "ddbe9d0a-5849-4a29-b83d-f04e7bb6d120";
  const CHARACTERISTIC = "ddbe9d0a-5849-4a29-b83d-f04e7bb6d121";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const $ = id => document.getElementById(id);
  const defaults = { sync: true, output: true };
  let prefs = { ...defaults };
  try { prefs = { ...defaults, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; } catch (_) {}
  let rgb = (window.ChromaDialCurrentRgb && window.ChromaDialCurrentRgb()) || { r: 128, g: 128, b: 128 };
  let unlocked = false;
  let connection = null, closing = false, busy = false;
  let port = null, writer = null, reader = null, readTask = null;
  let bleDevice = null, characteristic = null;
  let readyResolve = null, readyReject = null;
  let queued = null, sending = false, timer = null;
  let clicks = 0, firstClick = 0;
  let failures = 0, blockUntil = 0;

  const root = document.createElement("div");
  root.innerHTML = [
    '<dialog class="admin-dialog" id="cdAdminDialog" aria-labelledby="cdAdminTitle">',
    '  <header class="admin-header"><div><span class="admin-eyebrow">CHROMADIAL / PRIVATE</span>',
    '    <h2 id="cdAdminTitle">Hardware administration</h2></div>',
    '    <button type="button" id="cdAdminClose" class="admin-close" aria-label="Close">×</button></header>',
    '  <form id="cdAdminLogin" class="admin-form">',
    '    <p id="cdAuthHelp" class="admin-hint"></p>',
    '    <label>Username<input id="cdUsername" required minlength="3" maxlength="32" autocomplete="username"></label>',
    '    <label>Password<input id="cdPassword" type="password" required minlength="10" autocomplete="current-password"></label>',
    '    <button type="submit" id="cdAuthSubmit" class="admin-primary">Unlock settings</button>',
    '    <p id="cdAuthStatus" role="status" class="admin-status"></p>',
    '  </form>',
    '  <section id="cdAdminSettings" hidden>',
    '    <p class="admin-hint">ESP32 boards need the ChromaDial firmware. Choose a device and grant browser permission before connecting.</p>',
    '    <div class="admin-controls">',
    '      <button type="button" id="cdFind" class="admin-secondary">Detect permitted devices</button>',
    '      <button type="button" id="cdBle" class="admin-primary">Connect Bluetooth LE</button>',
    '      <button type="button" id="cdUsb" class="admin-secondary">Connect USB serial</button>',
    '      <button type="button" id="cdDisconnect" class="admin-secondary">Disconnect</button>',
    '    </div>',
    '    <p id="cdDetected" class="admin-hint"></p>',
    '    <div class="admin-connection"><span id="cdLed" class="admin-led"></span>',
    '      <div><strong id="cdConnection">Not connected</strong><small id="cdTransport">No ESP32 linked</small></div></div>',
    '    <label class="admin-check"><input type="checkbox" id="cdSync"> Sync dial changes live (RGB 0–255)</label>',
    '    <label class="admin-check"><input type="checkbox" id="cdOutput"> Enable LED strip output</label>',
    '    <div class="admin-rgb"><span>Colour sent to ESP32</span><strong id="cdRgb">128, 128, 128</strong>',
    '      <i id="cdSwatch"></i></div>',
    '    <p class="admin-hint">Hardware tests (override current dial colour until the next dial change):</p>',
    '    <div class="admin-tests">',
    '      <button type="button" data-test="255,0,0">Red</button>',
    '      <button type="button" data-test="0,255,0">Green</button>',
    '      <button type="button" data-test="0,0,255">Blue</button>',
    '      <button type="button" data-test="255,255,255">White</button>',
    '      <button type="button" data-test="0,0,0">Off</button>',
    '    </div>',
    '    <p class="admin-hint" id="cdHardwareStatus" role="status">Ready to pair.</p>',
    '    <p class="admin-note">Local account only: credentials are stored as a salted password verifier in this browser. This is not a security boundary for the physical device. Never expose the ESP32 to untrusted users.</p>',
    '  </section>',
    '</dialog>'
  ].join("");
  document.body.append(root);
  const dialog = $("cdAdminDialog");

  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) {}
  }

  function status(message, error) {
    $("cdHardwareStatus").textContent = message;
    $("cdHardwareStatus").classList.toggle("is-error", !!error);
  }

  function connectionUI() {
    $("cdLed").classList.toggle("active", !!connection);
    $("cdConnection").textContent = connection ? "Connected: " + connection.name : "Not connected";
    $("cdTransport").textContent = connection ? connection.type : "No ESP32 linked";
    for (const id of ["cdBle", "cdUsb", "cdDisconnect"]) {
      $(id).disabled = busy || (id === "cdDisconnect" ? !connection : !!connection);
    }
  }

  function paintRgb() {
    $("cdRgb").textContent = [rgb.r, rgb.g, rgb.b].join(", ");
    $("cdSwatch").style.backgroundColor = "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")";
  }

  function wire(value) {
    const clamp = n => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
    return "RGB," + clamp(value.r) + "," + clamp(value.g) + "," + clamp(value.b) + "\n";
  }

  async function transmit(packet) {
    if (connection && connection.type === "Bluetooth LE" && characteristic) {
      await characteristic.writeValueWithResponse(encoder.encode(packet));
    } else if (connection && connection.type === "USB serial" && writer) {
      await writer.write(encoder.encode(packet));
    } else {
      throw new Error("Device disconnected.");
    }
  }

  function sendLatest() {
    if (!connection || closing || !prefs.sync || !prefs.output) return;
    queued = wire(rgb);
    if (!timer && !sending) timer = setTimeout(drain, 65);
  }

  async function drain() {
    timer = null;
    if (sending || closing || !connection) return;
    sending = true;
    try {
      while (queued && connection && !closing) {
        const packet = queued;
        queued = null;
        await transmit(packet);
        if (queued) await new Promise(resolve => setTimeout(resolve, 65));
      }
    } catch (error) {
      status("Transmission failed: " + error.message, true);
    } finally {
      sending = false;
      if (queued && !closing && connection && !timer) timer = setTimeout(drain, 65);
    }
  }

  function updateRgb(next) {
    if (!next) return;
    rgb = { r: next.r, g: next.g, b: next.b };
    paintRgb();
    sendLatest();
  }

  async function closeTransport(blackout) {
    closing = true;
    clearTimeout(timer);
    timer = null;
    queued = null;
    while (sending) await new Promise(resolve => setTimeout(resolve, 20));
    if (blackout && connection) {
      try { await transmit("RGB,0,0,0\n"); } catch (_) {}
    }
    connection = null;
    if (bleDevice) {
      try { bleDevice.gatt.disconnect(); } catch (_) {}
    }
    bleDevice = null;
    characteristic = null;
    if (reader) {
      try { await reader.cancel(); } catch (_) {}
    }
    if (readTask) {
      try { await readTask; } catch (_) {}
    }
    if (writer) {
      try { writer.releaseLock(); } catch (_) {}
      writer = null;
    }
    if (port) {
      try { await port.close(); } catch (_) {}
      port = null;
    }
    closing = false;
    connectionUI();
  }

  async function connectBle() {
    if (!navigator.bluetooth || !navigator.bluetooth.requestDevice) {
      throw new Error("Web Bluetooth is unavailable. Use Chrome or Edge with HTTPS and Bluetooth enabled.");
    }
    // requestDevice must run from the explicit button click, not automatic background scanning.
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "ChromaDial-" }],
      optionalServices: [SERVICE]
    });
    bleDevice = device;
    device.addEventListener("gattserverdisconnected", () => {
      if (closing) return;
      connection = null;
      characteristic = null;
      queued = null;
      connectionUI();
      status("Bluetooth disconnected. Reconnect from the panel.", true);
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE);
    const candidate = await service.getCharacteristic(CHARACTERISTIC);
    const identity = decoder.decode(await candidate.readValue());
    if (identity !== "CHROMADIAL,1") {
      throw new Error("The device did not identify itself as compatible ChromaDial firmware.");
    }
    characteristic = candidate;
    connection = { type: "Bluetooth LE", name: device.name || "ESP32" };
  }

  async function readSerialLoop(selectedPort) {
    let buffer = "";
    try {
      reader = selectedPort.readable.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 512) buffer = buffer.slice(-256);
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (line.trim() === "READY,CHROMADIAL,1" && readyResolve) {
            const resolve = readyResolve;
            readyResolve = null; readyReject = null;
            resolve();
          }
        }
      }
    } catch (error) {
      if (readyReject) {
        const reject = readyReject;
        readyResolve = null; readyReject = null;
        reject(error);
      } else if (!closing) {
        connection = null;
        connectionUI();
        status("USB serial disconnected: " + error.message, true);
      }
    } finally {
      if (reader) {
        try { reader.releaseLock(); } catch (_) {}
        reader = null;
      }
    }
  }

  async function connectUsb() {
    if (!navigator.serial || !navigator.serial.requestPort) {
      throw new Error("Web Serial is unavailable. Try Chrome or Edge on desktop over HTTPS.");
    }
    const selected = await navigator.serial.requestPort();
    port = selected;
    await port.open({ baudRate: 115200 });
    const handshake = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    readTask = readSerialLoop(port);
    writer = port.writable.getWriter();
    await writer.write(encoder.encode("HELLO\n"));
    await Promise.race([
      handshake,
      new Promise((_, reject) => setTimeout(() => reject(new Error("ESP32 firmware handshake timed out.")), 2500))
    ]);
    readyResolve = null; readyReject = null;
    const info = selected.getInfo ? selected.getInfo() : {};
    const id = info.usbProductId ? "USB PID " + info.usbProductId.toString(16).toUpperCase() : "ESP32 serial";
    connection = { type: "USB serial", name: id };
  }

  async function connect(which) {
    if (!unlocked || busy || connection) return;
    busy = true;
    connectionUI();
    status("Choose your ESP32 in the browser permission dialog.");
    try {
      if (which === "ble") await connectBle();
      else await connectUsb();
      status("Connected. RGB dial changes are now sent to the ESP32.");
      sendLatest();
    } catch (error) {
      await closeTransport(false);
      status("Connection failed: " + error.message, true);
    } finally {
      busy = false;
      connectionUI();
    }
  }

  async function detect() {
    const found = [];
    try {
      if (navigator.serial && navigator.serial.getPorts) {
        const ports = await navigator.serial.getPorts();
        found.push(ports.length + " permitted USB serial port(s)");
      }
      if (navigator.bluetooth && navigator.bluetooth.getDevices) {
        const devices = await navigator.bluetooth.getDevices();
        const compatible = devices.filter(device => (device.name || "").startsWith("ChromaDial-"));
        found.push(compatible.length + " permitted ChromaDial BLE device(s)");
      }
      $("cdDetected").textContent = found.length ? found.join(" · ") : "This browser does not expose device discovery APIs.";
    } catch (error) {
      $("cdDetected").textContent = "Discovery error: " + error.message;
    }
  }

  async function manualColour(text) {
    if (!unlocked || !connection || busy) {
      status("Connect an ESP32 first to test the LED strip.", true);
      return;
    }
    const [r, g, b] = text.split(",").map(Number);
    queued = null;
    clearTimeout(timer);
    timer = null;
    while (sending) await new Promise(resolve => setTimeout(resolve, 20));
    try {
      await transmit(wire({ r, g, b }));
      status("Test colour sent: " + text + ". Move a dial to resume live output.");
    } catch (error) {
      status("Test failed: " + error.message, true);
    }
  }

  function account() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch (_) { return null; }
  }

  async function verifier(password, salt) {
    if (!crypto || !crypto.subtle) throw new Error("Secure browser cryptography is unavailable. Open via HTTPS or localhost.");
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({
      name: "PBKDF2", salt: Uint8Array.from(salt), iterations: 200000, hash: "SHA-256"
    }, key, 256);
    return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function authScreen() {
    const setup = !account();
    $("cdAdminLogin").hidden = false;
    $("cdAdminSettings").hidden = true;
    $("cdAuthHelp").textContent = setup
      ? "First use on this browser: create your local administrator account. Use a unique password of at least 10 characters."
      : "Enter the administrator credentials configured in this browser.";
    $("cdAuthSubmit").textContent = setup ? "Create administrator account" : "Unlock settings";
    $("cdPassword").autocomplete = setup ? "new-password" : "current-password";
    $("cdAuthStatus").textContent = "";
    $("cdPassword").value = "";
  }

  function showAdmin() {
    if (dialog.open) return;
    unlocked = false;
    authScreen();
    dialog.showModal();
    $("cdUsername").focus();
  }

  function authenticateOk() {
    unlocked = true;
    $("cdAdminLogin").hidden = true;
    $("cdAdminSettings").hidden = false;
    $("cdSync").checked = !!prefs.sync;
    $("cdOutput").checked = !!prefs.output;
    paintRgb();
    connectionUI();
    status(connection ? "Device connected." : "Ready to pair.");
    detect();
  }

  $("cdAdminLogin").addEventListener("submit", async event => {
    event.preventDefault();
    const now = Date.now();
    if (now < blockUntil) {
      $("cdAuthStatus").textContent = "Too many attempts. Try again after 30 seconds.";
      return;
    }
    const username = $("cdUsername").value.trim();
    const password = $("cdPassword").value;
    const existing = account();
    $("cdAuthSubmit").disabled = true;
    try {
      if (!existing) {
        if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) throw new Error("Use 3–32 letters, digits, dots, underscores or hyphens for username.");
        if (password.length < 10) throw new Error("Password must contain at least 10 characters.");
        const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
        localStorage.setItem(AUTH_KEY, JSON.stringify({
          username, salt, hash: await verifier(password, salt)
        }));
        authenticateOk();
      } else {
        const attempted = await verifier(password, existing.salt);
        // Compare the same-length digest without early exit.
        let diff = attempted.length ^ String(existing.hash).length;
        for (let i = 0; i < attempted.length; i++) diff |= attempted.charCodeAt(i) ^ (String(existing.hash).charCodeAt(i) || 0);
        if (username !== existing.username || diff !== 0) {
          failures++;
          if (failures >= 5) { blockUntil = Date.now() + 30000; failures = 0; }
          throw new Error("Incorrect username or password.");
        }
        failures = 0;
        authenticateOk();
      }
    } catch (error) {
      $("cdAuthStatus").textContent = error.message;
    } finally {
      $("cdAuthSubmit").disabled = false;
    }
  });

  $("cdAdminClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { unlocked = false; $("cdPassword").value = ""; });
  $("cdBle").addEventListener("click", () => connect("ble"));
  $("cdUsb").addEventListener("click", () => connect("usb"));
  $("cdFind").addEventListener("click", detect);
  $("cdDisconnect").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    connectionUI();
    await closeTransport(true);
    busy = false;
    connectionUI();
    status("Disconnected; blackout command sent to the LEDs.");
  });
  $("cdSync").addEventListener("change", event => {
    prefs.sync = event.target.checked;
    savePrefs();
    if (prefs.sync) sendLatest();
  });
  $("cdOutput").addEventListener("change", async event => {
    prefs.output = event.target.checked;
    savePrefs();
    if (prefs.output) {
      sendLatest();
    } else if (connection) {
      queued = "RGB,0,0,0\n";
      if (!sending && !timer) timer = setTimeout(drain, 0);
    }
  });
  document.querySelectorAll(".admin-tests button").forEach(button =>
    button.addEventListener("click", () => manualColour(button.dataset.test))
  );

  const brand = document.querySelector(".brand");
  brand.title = "ChromaDial";
  brand.addEventListener("click", () => {
    const now = Date.now();
    if (now - firstClick > 3000) { firstClick = now; clicks = 0; }
    clicks++;
    if (clicks >= 5) { clicks = 0; showAdmin(); }
  });
  document.addEventListener("keydown", event => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      showAdmin();
    }
  });
  window.ChromaDialAdmin = { setRgb: updateRgb };
  paintRgb();
  connectionUI();
})();
