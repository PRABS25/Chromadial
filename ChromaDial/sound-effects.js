(function () {
  "use strict";

  // ================= EDIT YOUR SOUNDS HERE =================
  // Replace the game's js/sound-effects.js with this file.
  // Save your edits, then close and reopen the game.
  // volume: 0 = silent, 1 = loudest (for master and each sound).
  // wave: "sine" = smooth, "triangle" = bright, "square" = buzzer.
  // frequency: pitch in Hz; higher numbers make higher notes.
  // at: start time in seconds. duration: note length in seconds.
  // Success follows the result shown by the game, including your
  // custom pass percentage. No percentage needs editing here.
  const SOUND_SETTINGS = {
    volume: 0.85,
    correct: {
      volume: 0.90,
      wave: "triangle",
      notes: [
        { frequency: 523.25, at: 0.00, duration: 0.14 },
        { frequency: 659.25, at: 0.16, duration: 0.14 },
        { frequency: 783.99, at: 0.32, duration: 0.14 },
        { frequency: 1046.50, at: 0.48, duration: 0.32 }
      ]
    },
    incorrect: {
      volume: 0.80,
      wave: "square",
      notes: [
        { frequency: 329.63, at: 0.00, duration: 0.18 },
        { frequency: 246.94, at: 0.22, duration: 0.24 }
      ]
    }
  };
  // ============= NO NEED TO EDIT BELOW THIS LINE =============

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const supported = Boolean(AudioContextClass);
  const activeVoices = new Set();
  let context;
  let playbackRequest = 0;
  let enabled = supported;

  try {
    enabled = supported && localStorage.getItem("chromadial-sound") !== "off";
  } catch (_) {
    // Sound remains usable if browser storage is blocked.
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function stopSounds() {
    if (!context || context.state === "closed") return;
    for (const voice of activeVoices) {
      // Hold the current level before fading, including notes not yet started.
      if (typeof voice.gain.gain.cancelAndHoldAtTime === "function") {
        voice.gain.gain.cancelAndHoldAtTime(context.currentTime);
      } else {
        const level = voice.gain.gain.value;
        voice.gain.gain.cancelScheduledValues(context.currentTime);
        voice.gain.gain.setValueAtTime(level, context.currentTime);
      }
      voice.gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.015);
      voice.oscillator.stop(context.currentTime + 0.02);
    }
    activeVoices.clear();
  }

  function playNotes(preset) {
    const master = clamp(SOUND_SETTINGS.volume, 0, 1, 0.85);
    const volume = master * clamp(preset.volume, 0, 1, 0.85) * 0.55;
    if (volume === 0) return;
    const start = context.currentTime + 0.02;
    const wave = ["sine", "triangle", "square", "sawtooth"].includes(preset.wave)
      ? preset.wave : "triangle";
    const notes = Array.isArray(preset.notes) ? preset.notes : [];

    for (const note of notes) {
      const frequency = clamp(note.frequency, 80, 4000, 440);
      const at = start + clamp(note.at, 0, 5, 0);
      const duration = clamp(note.duration, 0.06, 2, 0.2);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const voice = { oscillator, gain };
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.008);
      // Hold most of the volume instead of immediately fading to silence.
      gain.gain.linearRampToValueAtTime(volume * 0.85, at + duration * 0.70);
      gain.gain.linearRampToValueAtTime(0, at + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      activeVoices.add(voice);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        activeVoices.delete(voice);
      };
      oscillator.start(at);
      oscillator.stop(at + duration + 0.01);
    }
  }

  async function playResult(correct, followGameFeedback) {
    const request = ++playbackRequest;
    try {
      stopSounds();
      if (!enabled || !supported) return;
      // Begin audio activation during the original Check match button press.
      if (!context || context.state === "closed") context = new AudioContextClass();
      const ready = context.state === "running" ? Promise.resolve() : context.resume();
      await ready;
      // The game's click handler has now finished updating the visible result.
      if (!enabled || request !== playbackRequest || context.state !== "running") return;
      if (followGameFeedback) {
        const tone = document.getElementById("feedback")?.dataset.tone;
        if (tone === "good") correct = true;
        else if (tone === "warn") correct = false;
      }
      playNotes(correct ? SOUND_SETTINGS.correct : SOUND_SETTINGS.incorrect);
    } catch (error) {
      // Keep the game usable, but leave a useful diagnostic if audio fails.
      console.warn("ChromaDial could not play the result sound:", error);
    }
  }

  function setEnabled(value) {
    enabled = supported && Boolean(value);
    playbackRequest += 1;
    if (!enabled) {
      try { stopSounds(); } catch (_) { /* Audio may already have closed. */ }
    }
    try {
      localStorage.setItem("chromadial-sound", enabled ? "on" : "off");
    } catch (_) {
      // The preference still applies for the current visit.
    }
  }

  window.ChromaDialSounds = {
    supported,
    isEnabled: () => enabled,
    setEnabled,
    playMatch: correct => playResult(Boolean(correct), true),
    // Optional console previews: ChromaDialSounds.preview(true) or preview(false).
    preview: correct => playResult(Boolean(correct), false)
  };
})();
