// Animation engine: owns the canvas loop, idle life, reactions and particles.
import { drawCreature } from "./pet.js";

const W = 520;
const H = 380;
const FLOOR = 300;
const CX = W / 2;
const SCALE = 13;

const DURATION = { eat: 1750, happy: 1150, sad: 1400, sleep: 1600, levelup: 2300 };
const HEART = "#e05a7a";
const CRUMB = "#d9a441";
const CONFETTI = ["#ccff00", "#111111", "#e05a7a", "#2f7d5b", "#1f6fb3", "#e0b64a"];

export function createAnimator(canvas) {
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;

  let pet = null;
  let mood = "content";
  let mode = "idle";
  let modeT = 0;
  let modeDur = 0;
  let onDone = null;
  let t = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let blinkAt = 1800;
  let blinkT = 0;
  let hopAt = 2600;
  let hopT = 0;
  let hopDur = 520;
  let flash = 0;
  let spawnAcc = 0;
  const particles = [];
  const texts = [];

  const baseMode = () => (mood === "worried" || mood === "hungry" ? "sad" : mood === "sleepy" ? "sleep" : "idle");

  function setPet(next) { pet = next; }
  function setMood(next) {
    if (next === mood) return;
    mood = next;
    if (mode === "idle" || mode === "sad" || mode === "sleep") mode = baseMode();
  }
  function play(name, options = {}) {
    mode = name;
    modeT = 0;
    modeDur = options.duration ?? DURATION[name] ?? 1000;
    onDone = options.onDone ?? null;
    if (name === "levelup" || name === "happy") {
      burst(24, CONFETTI);
      flash = 0.55;
    }
  }
  function float(text, color = "#111111") {
    texts.push({ text, x: CX + (Math.random() * 40 - 20), y: FLOOR - 220, life: 1400, max: 1400, color });
  }
  function burst(count, palette) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: CX + (Math.random() * 60 - 30),
        y: FLOOR - 170 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 2.6,
        vy: -2.4 - Math.random() * 2.4,
        g: 0.12,
        size: 3 + Math.floor(Math.random() * 3),
        life: 1200 + Math.random() * 700,
        max: 1900,
        color: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  }
  function spawnOne(color, opts = {}) {
    particles.push({
      x: CX + (Math.random() * 70 - 35) + (opts.dx ?? 0),
      y: FLOOR - 150 + (opts.dy ?? 0),
      vx: (Math.random() - 0.5) * 1.4 + (opts.vx ?? 0),
      vy: -1.6 - Math.random(),
      g: 0.05,
      size: 3,
      life: 1100,
      max: 1100,
      color,
      heart: opts.heart,
    });
  }

  function update(dt) {
    modeT += dt;
    t += dt;
    // idle timers
    if (mode === "idle" || mode === "sad" || mode === "sleep") {
      blinkAt -= dt;
      if (blinkAt <= 0) { blinkT = 130; blinkAt = 1800 + Math.random() * 3200; }
      if (mode === "idle") {
        hopAt -= dt;
        if (hopAt <= 0) { hopT = hopDur; hopAt = 3200 + Math.random() * 4200; }
      }
    }
    if (blinkT > 0) blinkT -= dt;
    if (hopT > 0) hopT -= dt;

    // particle emission per mode
    spawnAcc += dt;
    if (mode === "eat" && spawnAcc > 150) { spawnAcc = 0; spawnOne(CRUMB, { dy: 20, vx: 0.4 }); }
    if (mode === "happy" && spawnAcc > 130) { spawnAcc = 0; spawnOne(HEART, { heart: true }); }
    if (mode === "levelup" && spawnAcc > 220) { spawnAcc = 0; spawnOne(HEART, { heart: true }); }
    if (mode === "sleep" && spawnAcc > 1300) { spawnAcc = 0; texts.push({ text: "z", x: CX + 60, y: FLOOR - 180, life: 1400, max: 1400, color: "#8a8f98" }); }

    // mode end
    if (modeT >= modeDur - dt) {
      const done = onDone;
      onDone = null;
      mode = baseMode();
      modeT = 0;
      modeDur = 0;
      if (done) done();
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const tx = texts[i];
      tx.y -= dt * 0.02; tx.life -= dt;
      if (tx.life <= 0) texts.splice(i, 1);
    }
    if (flash > 0) flash = Math.max(0, flash - dt / 500);
  }

  function pose() {
    let sx = 1, sy = 1, dy = 0;
    const breathe = Math.sin(t / (mode === "sleep" ? 1200 : 650));
    if (mode === "idle") { sy = 1 + breathe * 0.025; sx = 1 - breathe * 0.016; }
    if (mode === "sleep") { sy = 1 + breathe * 0.02; dy = 6; }
    if (mode === "sad") { sy = 0.95; dy = 5; }
    if (mode === "eat") { dy = -Math.abs(Math.sin(modeT / 130)) * 3; sy = 1 + Math.sin(modeT / 60) * 0.07; }
    if (mode === "happy") { dy = -Math.abs(Math.sin(modeT / 170)) * 24; sy = 1 + Math.sin(modeT / 90) * 0.08; }
    if (mode === "levelup") { dy = -Math.abs(Math.sin(modeT / 150)) * 32; sy = 1 + Math.sin(modeT / 80) * 0.12; }
    if (hopT > 0 && mode === "idle") { dy = -Math.sin(Math.PI * (1 - hopT / hopDur)) * 16; sy = 1 + Math.sin(Math.PI * (1 - hopT / hopDur)) * 0.06; }
    return { sx, sy, dy };
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    // floor + rug
    ctx.fillStyle = "#e6e4dd";
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.strokeStyle = "#11111133";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, FLOOR + 0.5);
    ctx.lineTo(W, FLOOR + 0.5);
    ctx.stroke();
    ctx.strokeStyle = "#11111112";
    ctx.beginPath();
    ctx.ellipse(CX, FLOOR + 6, 150, 22, 0, 0, Math.PI * 2);
    ctx.stroke();

    const { sx, sy, dy } = pose();
    // shadow
    const shadowW = 70 * (1 + (dy < 0 ? dy / 200 : 0));
    ctx.fillStyle = "#11111122";
    ctx.beginPath();
    ctx.ellipse(CX, FLOOR + 4, shadowW, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    if (pet) {
      drawCreature(ctx, {
        mask: pet.mask,
        x: CX,
        y: FLOOR + dy,
        scale: SCALE,
        sx,
        sy,
        colors: pet.colors,
        stage: pet.stage ?? 0,
        accessory: pet.accessory ?? null,
        blink: blinkT > 0 ? 1 : 0,
      });
    }

    // particles
    for (const p of particles) {
      const alpha = Math.max(0, Math.min(1, p.life / (p.max * 0.5)));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.heart) {
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size, p.size);
        ctx.fillRect(p.x, p.y - p.size, p.size, p.size);
        ctx.fillRect(p.x - p.size / 2, p.y + p.size / 2, p.size, p.size);
      } else {
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;

    // floating text
    ctx.font = "700 20px ui-monospace, monospace";
    ctx.textAlign = "center";
    for (const tx of texts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, tx.life / (tx.max * 0.6)));
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;

    if (flash > 0) {
      ctx.fillStyle = `rgba(204,255,0,${flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(48, now - (last || now));
    last = now;
    update(dt);
    render();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  function setMode(next) { mode = next; modeT = 0; modeDur = 0; onDone = null; }

  return { setPet, setMood, play, float, burst, start, stop, setMode, pulse: () => burst(12, CONFETTI) };
}
