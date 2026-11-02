# ChromaDial: ESP32 RGB Strip Setup

This feature sends the game's RGB values (0 through 255 for each channel) to a compatible ESP32 board, without cloud services. CMYK mixes are converted to RGB before being sent.

## Hardware support

- ESP32 boards supported by Arduino-ESP32, including original ESP32, ESP32-C3 and ESP32-S3.
- BLE connection on BLE-capable ESP32 models, using Chrome/Edge with a secure HTTPS origin. Chrome on compatible Android devices also supports Web Bluetooth.
- USB serial connection (baud 115200) in desktop browsers that support Web Serial.
- 5 V addressable WS2812B / NeoPixel-compatible RGB LED strips using the included addressable receiver (default GPIO5, 16 pixels, GRB order).
- 12 V / 24 V nonaddressable common-anode RGB LED strips using the separate analog PWM receiver and three properly rated logic-level MOSFET switches.
- The ESP32 must have the supplied ChromaDial firmware flashed. An arbitrary factory ESP32 cannot be automatically controlled.

Wi-Fi control and unapproved BLE devices are not supported by this version. The included receivers support addressable or common-anode analog RGB strips; these require different electrical circuits.

## Electrical wiring

| Source | Destination |
| --- | --- |
| ESP32 GPIO5 | 74AHCT125 logic level shifter (3.3 V to 5 V) -> 330–470 ohm resistor -> strip DIN |
| External regulated 5 V PSU + | Strip +5V |
| External PSU ground | Strip GND, ESP32 GND, level shifter GND |
| ESP32 USB connection | PC USB port (power and serial), or separate suitable supply in BLE mode |

Add a 1000 microfarad or larger capacitor rated at least 6.3 V across strip 5V/GND near the input, observing polarity. Follow DIN arrows. Never power the LED strip from an ESP32 GPIO. Avoid powering a high-current strip through a small board regulator.

A conservative worst-case supply estimate is 0.06 A per RGB LED plus margin. For 16 LEDs, the maximum can approach 0.96 A, so a regulated 5 V / 2 A PSU is a reasonable starting point.

12 V / 24 V analog strips require a three-channel low-side MOSFET driver and the **separate analog sketch** below. Do not connect an analog strip to the addressable data-pin circuit. Switch off power before rewiring.

## Flash the firmware

1. Install Arduino IDE, Espressif ESP32 board support, and Adafruit NeoPixel library.
2. Open firmware/ChromaDial_ESP32/ChromaDial_ESP32.ino in Arduino IDE.
3. Set LED_PIN, LED_COUNT, LED_ORDER for the actual hardware. By default: GPIO 5, 16 pixels, WS2812B GRB.
4. Choose the exact board and USB port, compile and upload.
5. Connect the 5 V external LED power and common ground.
6. Check Arduino Serial Monitor at 115200 baud: READY,CHROMADIAL,1 should appear. Close Serial Monitor before connecting from the browser.

BLE capable boards advertise as ChromaDial-ESP32.

## Hidden administrator settings

1. Open https://prabs25.github.io/Chromadial/ChromaDial/ using compatible Chrome/Edge.
2. Click the ChromaDial logo or title five times within three seconds, or press Ctrl+Shift+A.
3. On first visit in that browser, set an administrator username and password of at least ten characters. There is no universal default password.
4. Use Detect permitted devices to count previously approved USB and BLE devices.
5. To add one, select Connect Bluetooth LE or Connect USB serial and choose the ESP32 from the browser's permission dialog.
6. Only ChromaDial receivers are accepted, based on a BLE identity characteristic or USB serial handshake.
7. Once connected, move the game's Red, Green and Blue knobs. The strip updates live. Test with Red, Green, Blue, White and Off buttons, or disable output to switch the LEDs off.
8. Disconnect explicitly sends an all-off command.

Settings include live synchronization, output enable, connection detection, connection state and RGB test buttons.

## Wire protocol

USB serial: send HELLO followed by a newline. Device returns READY,CHROMADIAL,1 followed by a newline.

Send an RGB message such as RGB,255,0,128 followed by a newline to USB serial or the BLE write characteristic. It represents full red, zero green, and medium blue.

BLE service UUID: ddbe9d0a-5849-4a29-b83d-f04e7bb6d120
BLE RGB write UUID: ddbe9d0a-5849-4a29-b83d-f04e7bb6d121
BLE identity read UUID: ddbe9d0a-5849-4a29-b83d-f04e7bb6d122
BLE identity value: CHROMADIAL,1

The application coalesces frequent knob changes, sending the latest values rather than overwhelming BLE. The whole LED strip receives the same RGB value.

## Security and accuracy limitations

The admin account is a browser-local access convenience. It stores a salted PBKDF2-SHA-256 password verifier and preferences in local storage, but it is not server-side authentication and cannot securely protect the physical ESP32 from another BLE client. For deployment in a shared/public space, add device-side pairing authorization before trusting it. Clearing site storage resets the local administrator account as well as game statistics.

The numerical RGB triplet is transmitted without a colour conversion in RGB mode. Physical LED output may not look identical to a monitor due to LED spectra, monitor calibration, gamma, diffusion, ambient light and differences between displays. Exact perceived colour requires hardware calibration.

## Troubleshooting

- Device not found: Check flashed firmware, power and browser Bluetooth permissions. Detect permitted devices only lists already approved devices; connect to open a new chooser.
- USB missing: Use supported desktop Chrome/Edge, install appropriate serial driver, and close Arduino Serial Monitor.
- Serial handshake timeout: Confirm baud rate 115200, reset board and make sure the ChromaDial receiver firmware is present.
- LED strip black: Confirm the external 5 V supply, common ground, correct data pin, data direction and level shifter.
- Wrong colours: Adjust LED_ORDER (such as NEO_RGB instead of NEO_GRB) and reflash.
- Browser APIs unavailable on local files: Use the public HTTPS GitHub Pages site or local development server at localhost.

## Offline package

The existing downloads/ChromaDial.zip may be older than the live source. To get this feature immediately, use GitHub's Code > Download ZIP and extract the ChromaDial folder. For browser BLE/USB permission APIs, use HTTPS or localhost; local file:// access may be restricted.


## Alternative: 12 V / 24 V analog (nonaddressable) RGB strip

Use [the analog receiver firmware](../firmware/ChromaDial_AnalogRGB/ChromaDial_AnalogRGB.ino). It accepts the **same** ChromaDial BLE service, USB handshake, and `RGB,r,g,b` protocol. It drives all strip sections together using three independent 8-bit PWM outputs.

**Default GPIOs on a classic ESP32 DevKit:**

| ESP32 output | Circuit | Strip terminal |
| --- | --- | --- |
| GPIO25 | ~100–220 ohm resistor to red MOSFET gate | R negative through red MOSFET drain |
| GPIO26 | ~100–220 ohm resistor to green MOSFET gate | G negative through green MOSFET drain |
| GPIO27 | ~100–220 ohm resistor to blue MOSFET gate | B negative through blue MOSFET drain |
| ESP32 GND | Common with external supply negative and all three MOSFET sources | Shared ground |
| External supply positive | Supply at the voltage indicated on the strip, typically 12 V or 24 V | Common `+V` |

**Each MOSFET:** Use a suitable **logic-level N-channel MOSFET** whose on-resistance is specified at a gate voltage compatible with **3.3 V**, rated for its colour-channel current and thermal dissipation. Put a ~10 kΩ pull-down between each MOSFET gate and source so the strip stays off during boot. Check your MOSFET's pinout, heatsinking, and maximum voltage. Add an appropriate supply fuse. Do not directly attach the LED channel to an ESP32 output. LED strip positive stays at its rated external voltage, never the ESP32's 3.3 V rail.

The analog sketch uses Arduino-ESP32 **core 3.x** and `ledcAttach` / `ledcWrite`; choose board-specific GPIOs before uploading, especially on ESP32-C3/S3 where GPIO25–27 may not exist. The analog sketch also advertises Bluetooth as **ChromaDial-Analog**, which matches the game's device picker. To use it:

1. Install Arduino IDE and Espressif Arduino-ESP32 3.x.
2. Open `firmware/ChromaDial_AnalogRGB/ChromaDial_AnalogRGB.ino`.
3. Choose your exact ESP32 board, verify available output GPIO pins, then compile/upload.
4. Wire the external supply and the MOSFET stages with power **off**.
5. Open the live ChromaDial game on HTTPS; enter the hidden admin panel, pair over BLE or USB, and test Red/Green/Blue/White/Off.

This is **not** a constant-current LED driver, a 3-pin addressable LED strip circuit, or a driver for common-cathode strips. Do not mix the two wiring diagrams.

## What colour accuracy means

The game sends the RGB values with no numeric alteration. For a display and LED strip to *appear* to show the same colour, LED brightness, spectral response, white point, gamma behaviour, ambient light, and viewing conditions also matter. For colour-critical use, measure the physical strip with a colour sensor or spectrometer and apply a calibration lookup table per channel. Neither firmware claims calibrated spectral equivalence.
