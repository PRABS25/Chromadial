(function () {
  "use strict";

  const E = window.ColorEngine;
  const sounds = window.ChromaDialSounds;
  const channels = {
    rgb: [
      { key: "r", label: "RED", max: 255, colour: "#ff5d73" },
      { key: "g", label: "GREEN", max: 255, colour: "#62e69b" },
      { key: "b", label: "BLUE", max: 255, colour: "#5b8cff" }
    ],
    cmyk: [
      { key: "c", label: "CYAN", max: 100, colour: "#2de2e6" },
      { key: "m", label: "MAGENTA", max: 100, colour: "#ff4fd8" },
      { key: "y", label: "YELLOW", max: 100, colour: "#ffe45c" },
      { key: "k", label: "BLACK", max: 100, colour: "#8991a5" }
    ]
  };

  const state = {
    mode: "match",
    model: "rgb",
    values: { r: 128, g: 128, b: 128 },
    target: E.namedColours[26],
    round: 0,
    fireworksRun: 0,
    stats: loadStats()
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const el = {
    knobRack: $("#knobRack"), targetDisc: $("#targetDisc"), targetName: $("#targetName"),
    targetPrompt: $("#targetPrompt"), stageEyebrow: $("#stageEyebrow"), stageTitle: $("#stageTitle"),
    roundChip: $("#roundChip"), mixturePreview: $("#mixturePreview"), mixName: $("#mixName"),
    mixValues: $("#mixValues"), similarityValue: $("#similarityValue"),
    similarityMeter: $("#similarityMeter"), feedback: $("#feedback"),
    checkButton: $("#checkButton"), newRoundButton: $("#newRoundButton"),
    randomiseButton: $("#randomiseButton"), resetStatsButton: $("#resetStatsButton"),
    soundButton: $("#soundButton"),
    bestStat: $("#bestStat"), solvedStat: $("#solvedStat"), streakStat: $("#streakStat"),
    fireworksCanvas: $("#fireworksCanvas")
  };

  function loadStats() {
    try {
      return { best: 0, solved: 0, streak: 0, ...JSON.parse(localStorage.getItem("chromadial-stats") || "{}") };
    } catch (_) {
      return { best: 0, solved: 0, streak: 0 };
    }
  }

  function saveStats() {
    try {
      localStorage.setItem("chromadial-stats", JSON.stringify(state.stats));
    } catch (_) {
      // The game remains fully usable if a locked-down browser blocks local storage.
    }
    renderStats();
  }

  function currentRgb() {
    return state.model === "rgb" ? { ...state.values } : E.cmykToRgb(state.values);
  }

  function setModel(model) {
    if (model === state.model) return;
    const rgb = currentRgb();
    state.model = model;
    state.values = model === "rgb" ? rgb : E.rgbToCmyk(rgb);
    $$(".model-button").forEach(button => button.classList.toggle("active", button.dataset.model === model));
    renderKnobs();
    updateColour();
    setFeedback(`${model.toUpperCase()} controls selected. The mixed colour has been preserved.`, "neutral");
  }

  function setMode(mode) {
    state.mode = mode;
    document.body.classList.toggle("free-mode", mode === "free");
    $$(".mode-button").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
    if (mode === "match") {
      el.stageEyebrow.textContent = "TARGET COLOUR";
      el.stageTitle.textContent = "Match this colour";
      el.targetPrompt.textContent = "Use the dials to reproduce it";
      el.roundChip.textContent = `ROUND ${state.round}`;
      el.targetDisc.style.background = state.target.hex;
      el.targetName.textContent = state.target.name;
      setFeedback("Adjust the dials, then check how closely the colours match.", "neutral");
    } else {
      el.stageEyebrow.textContent = "COLOUR IDENTIFIER";
      el.stageTitle.textContent = "Explore your mixture";
      el.roundChip.textContent = "LIVE";
      el.targetPrompt.textContent = "Nearest recognised colour name";
      setFeedback("Mix freely. The closest colour name and exact values update instantly.", "neutral");
    }
    updateColour();
  }

  function renderKnobs() {
    el.knobRack.replaceChildren();
    for (const channel of channels[state.model]) {
      const control = document.createElement("div");
      control.className = "knob-control";
      control.style.setProperty("--channel", channel.colour);
      control.innerHTML = `
        <div class="knob-wrap" role="slider" tabindex="0" aria-label="${channel.label}" aria-valuemin="0" aria-valuemax="${channel.max}" aria-valuenow="${state.values[channel.key]}">
          <div class="knob-track"></div>
          <div class="knob-face"></div>
        </div>
        <span class="knob-label">${channel.label}</span>
        <span class="knob-value"></span>`;
      const wrap = control.querySelector(".knob-wrap");
      bindKnob(wrap, channel);
      el.knobRack.append(control);
      paintKnob(control, channel);
    }
  }

  function paintKnob(control, channel) {
    const value = state.values[channel.key];
    const ratio = value / channel.max;
    control.style.setProperty("--angle", `${-135 + ratio * 270}deg`);
    control.style.setProperty("--fill-angle", `${ratio * 270}deg`);
    control.querySelector(".knob-value").textContent = `${value} / ${channel.max}`;
    control.querySelector(".knob-wrap").setAttribute("aria-valuenow", value);
  }

  function bindKnob(wrap, channel) {
    let startY = 0, startValue = 0;
    const set = next => {
      state.values[channel.key] = Math.round(E.clamp(next, 0, channel.max));
      paintKnob(wrap.closest(".knob-control"), channel);
      updateColour();
    };
    wrap.addEventListener("pointerdown", event => {
      startY = event.clientY;
      startValue = state.values[channel.key];
      wrap.setPointerCapture(event.pointerId);
    });
    wrap.addEventListener("pointermove", event => {
      if (!wrap.hasPointerCapture(event.pointerId)) return;
      const scale = channel.max / 170;
      set(startValue + (startY - event.clientY) * scale);
    });
    wrap.addEventListener("wheel", event => {
      event.preventDefault();
      const step = event.shiftKey ? Math.max(1, Math.round(channel.max / 10)) : 1;
      set(state.values[channel.key] + (event.deltaY < 0 ? step : -step));
    }, { passive: false });
    wrap.addEventListener("keydown", event => {
      const large = Math.max(1, Math.round(channel.max / 10));
      if (["ArrowUp", "ArrowRight"].includes(event.key)) { event.preventDefault(); set(state.values[channel.key] + (event.shiftKey ? large : 1)); }
      if (["ArrowDown", "ArrowLeft"].includes(event.key)) { event.preventDefault(); set(state.values[channel.key] - (event.shiftKey ? large : 1)); }
      if (event.key === "Home") { event.preventDefault(); set(0); }
      if (event.key === "End") { event.preventDefault(); set(channel.max); }
    });
  }

  function updateColour() {
    const rgb = currentRgb();
    const hex = E.rgbToHex(rgb);
    const nearest = E.nearestColour(rgb);
    el.mixturePreview.style.background = hex;
    el.mixName.textContent = nearest.name;
    if (state.model === "rgb") {
      el.mixValues.textContent = `RGB ${rgb.r}, ${rgb.g}, ${rgb.b} · ${hex}`;
    } else {
      const v = state.values;
      el.mixValues.textContent = `CMYK ${v.c}, ${v.m}, ${v.y}, ${v.k} · ${hex}`;
    }
    if (state.mode === "match") {
      const score = E.similarity(rgb, state.target.rgb);
      el.similarityValue.textContent = `${score}%`;
      el.similarityMeter.style.width = `${score}%`;
    } else {
      el.targetDisc.style.background = hex;
      el.targetName.textContent = nearest.name;
    }
  }

  function newTarget() {
    let next;
    do {
      next = E.namedColours[Math.floor(Math.random() * E.namedColours.length)];
    } while (next.name === state.target.name);
    state.target = next;
    state.round += 1;
    el.targetDisc.style.background = next.hex;
    el.targetName.textContent = next.name;
    el.roundChip.textContent = `ROUND ${state.round}`;
    setFeedback("New target ready. Reproduce the colour as closely as you can.", "neutral");
    updateColour();
  }

  function checkMatch() {
    const rgb = currentRgb();
    const score = E.similarity(rgb, state.target.rgb);
    sounds.playMatch(score >= 97);
    state.stats.best = Math.max(state.stats.best, score);
    if (score === 100) {
      state.stats.solved += 1;
      state.stats.streak += 1;
      setFeedback("Perfect match: 100/100! The colours are visually indistinguishable.", "good");
      launchFireworks();
    } else if (score >= 97) {
      state.stats.solved += 1;
      state.stats.streak += 1;
      setFeedback(`Excellent match: ${score}/100. That difference is barely perceptible.`, "good");
    } else {
      state.stats.streak = 0;
      setFeedback(`${score}/100. ${buildHint(rgb)}`, "warn");
    }
    saveStats();
  }

  function launchFireworks() {
    const canvas = el.fireworksCanvas;
    const context = canvas.getContext("2d");
    if (!context) return;
    const runId = ++state.fireworksRun;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.classList.add("active");

    const colours = ["#ff5d73", "#ffd166", "#62e69b", "#5b8cff", "#c86bfa", "#ffffff"];
    const particles = [];
    const burstCount = Math.max(5, Math.min(8, Math.round(width / 240)));

    for (let burst = 0; burst < burstCount; burst += 1) {
      const originX = width * (0.12 + Math.random() * 0.76);
      const originY = height * (0.12 + Math.random() * 0.48);
      const delay = burst * 170;
      const count = 46 + Math.floor(Math.random() * 24);

      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index / count) + (Math.random() - 0.5) * 0.12;
        const speed = 95 + Math.random() * 155;
        particles.push({
          originX,
          originY,
          delay,
          life: 1050 + Math.random() * 700,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          colour: colours[Math.floor(Math.random() * colours.length)],
          size: 1.6 + Math.random() * 2.8
        });
      }
    }

    const startedAt = performance.now();
    const duration = burstCount * 170 + 1900;

    function drawFrame(now) {
      if (runId !== state.fireworksRun) return;
      const elapsed = now - startedAt;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      for (const particle of particles) {
        const age = elapsed - particle.delay;
        if (age < 0 || age > particle.life) continue;
        const seconds = age / 1000;
        const progress = age / particle.life;
        const x = particle.originX + particle.vx * seconds;
        const y = particle.originY + particle.vy * seconds + 92 * seconds * seconds;
        const alpha = Math.pow(1 - progress, 1.4);

        context.beginPath();
        context.arc(x, y, particle.size * (1 - progress * 0.35), 0, Math.PI * 2);
        context.fillStyle = particle.colour;
        context.globalAlpha = alpha;
        context.fill();
      }

      context.globalAlpha = 1;
      if (elapsed < duration) {
        requestAnimationFrame(drawFrame);
      } else {
        context.clearRect(0, 0, width, height);
        canvas.classList.remove("active");
      }
    }

    requestAnimationFrame(drawFrame);
  }

  function buildHint(rgb) {
    if (state.model === "rgb") {
      const differences = ["r", "g", "b"].map(key => ({ key, diff: state.target.rgb[key] - rgb[key] }));
      differences.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      const item = differences[0];
      const label = { r: "red", g: "green", b: "blue" }[item.key];
      return `${item.diff > 0 ? "Increase" : "Reduce"} ${label} first.`;
    }
    const target = E.rgbToCmyk(state.target.rgb);
    const differences = ["c", "m", "y", "k"].map(key => ({ key, diff: target[key] - state.values[key] }));
    differences.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const item = differences[0];
    const label = { c: "cyan", m: "magenta", y: "yellow", k: "black" }[item.key];
    return `${item.diff > 0 ? "Increase" : "Reduce"} ${label} first.`;
  }

  function randomise() {
    for (const channel of channels[state.model]) state.values[channel.key] = Math.floor(Math.random() * (channel.max + 1));
    renderKnobs();
    updateColour();
    setFeedback("A random mixture was generated. Keep adjusting it to explore nearby colours.", "neutral");
  }

  function setFeedback(message, tone) {
    el.feedback.textContent = message;
    el.feedback.dataset.tone = tone;
  }

  function renderStats() {
    el.bestStat.textContent = state.stats.best;
    el.solvedStat.textContent = state.stats.solved;
    el.streakStat.textContent = state.stats.streak;
  }

  function renderSoundButton() {
    const enabled = sounds.isEnabled();
    el.soundButton.textContent = sounds.supported ? (enabled ? "Sound on" : "Sound off") : "Sound unavailable";
    el.soundButton.setAttribute("aria-pressed", String(enabled));
    el.soundButton.disabled = !sounds.supported;
    el.soundButton.title = sounds.supported
      ? (enabled ? "Turn game sounds off" : "Turn game sounds on")
      : "This browser does not support game sounds";
  }

  $$(".mode-button").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $$(".model-button").forEach(button => button.addEventListener("click", () => setModel(button.dataset.model)));
  el.checkButton.addEventListener("click", checkMatch);
  el.soundButton.addEventListener("click", () => {
    sounds.setEnabled(!sounds.isEnabled());
    renderSoundButton();
  });
  el.newRoundButton.addEventListener("click", newTarget);
  el.randomiseButton.addEventListener("click", randomise);
  el.resetStatsButton.addEventListener("click", () => {
    if (!confirm("Reset all ChromaDial statistics?")) return;
    state.stats = { best: 0, solved: 0, streak: 0 };
    saveStats();
    setFeedback("Statistics reset.", "neutral");
  });

  renderKnobs();
  renderStats();
  renderSoundButton();
  newTarget();
})();
