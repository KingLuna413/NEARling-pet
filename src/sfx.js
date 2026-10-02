// Tiny WebAudio blips â€” no audio files, no network. Muted until the user asks.
let ctx = null;
let muted = false;

function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function blip(freq, duration, type = "square", gain = 0.05, delay = 0) {
  if (muted) return;
  const c = audio();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(amp);
    amp.connect(c.destination);
    const start = c.currentTime + delay;
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.start(start);
    osc.stop(start + duration);
  } catch {
    /* ignore */
  }
}

export function unlockAudio() {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}
export function setMuted(value) { muted = Boolean(value); }
export function isMuted() { return muted; }

export const sfx = {
  click: () => blip(620, 0.06, "square", 0.035),
  feed: () => { blip(520, 0.07, "square", 0.05); blip(780, 0.1, "square", 0.05, 0.08); },
  eat: () => { blip(300, 0.07, "square", 0.055); blip(220, 0.09, "square", 0.045, 0.12); blip(260, 0.07, "square", 0.04, 0.26); },
  happy: () => [660, 880, 990].forEach((f, i) => blip(f, 0.12, "triangle", 0.05, i * 0.07)),
  level: () => [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.18, "triangle", 0.06, i * 0.09)),
  sad: () => blip(180, 0.22, "sawtooth", 0.035),
  eatError: () => { blip(240, 0.1, "sawtooth", 0.04); blip(170, 0.14, "sawtooth", 0.04, 0.12); },
};

export function buzz(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}
