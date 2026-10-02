// Deterministic pixel pets â€” round, big-eyed and sweet. One creature per account.

const SYLLABLES = [
  "near", "nib", "paw", "zip", "momo", "bibi", "kumo", "taro", "lumi", "pico",
  "gogo", "nano", "wisp", "bean", "peb", "yuki", "rune", "pip", "mochi", "bobo",
];
const SUFFIX = ["ling", "let", "kin", "pup", "bud", "wink", "bo", "nyx", "o", "z"];
const TITLES = ["Sprout", "Scout", "Ranger", "Guardian", "Elder"];

export const RANKS = [
  { key: "fresh", label: "Fresh", ink: "#b9c2d0", accent: "#e7ecf3", outline: "#4a5560" },
  { key: "steady", label: "Steady", ink: "#6fcf97", accent: "#c9f5dc", outline: "#1f6b48" },
  { key: "strong", label: "Strong", ink: "#6bb6f2", accent: "#cde8ff", outline: "#1c5a8a" },
  { key: "rare", label: "Rare", ink: "#b58cf0", accent: "#ebdcff", outline: "#5b2f96" },
  { key: "legend", label: "Legend", ink: "#f4b768", accent: "#ffe6b8", outline: "#8a5300" },
];

export const EVOLUTIONS = ["Hatchling", "Sprouted", "Scarfed", "Crowned"];

export function hashString(value) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 16x16 cute creature.
 * '#' body Â· '+' accent (belly/cheeks) Â· 'O' eye white Â· 'o' pupil Â· 'm' mouth Â· '.' empty
 */
export function generateMask(seed) {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const g = Array.from({ length: 16 }, () => Array(16).fill("."));
  const set = (x, y, ch) => { if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = ch; };

  // Round body (squashed for a chubby silhouette).
  const cx = 7.5;
  const cy = 10;
  const rx = 5.0 + rand() * 0.7;
  const ry = 4.7 + rand() * 0.7;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1) set(x, y, "#");
  }
  const headTop = Math.max(2, Math.round(cy - ry));

  // Ears: rounded bear / tall cat / small nubs.
  const ear = Math.floor(rand() * 3);
  if (ear === 0) {
    set(4, headTop - 1, "#"); set(5, headTop - 1, "#"); set(10, headTop - 1, "#"); set(11, headTop - 1, "#");
    set(3, headTop, "#"); set(4, headTop, "#"); set(5, headTop, "#");
    set(10, headTop, "#"); set(11, headTop, "#"); set(12, headTop, "#");
  } else if (ear === 1) {
    set(4, headTop - 2, "#"); set(5, headTop - 1, "#"); set(4, headTop - 1, "#"); set(4, headTop, "#");
    set(11, headTop - 2, "#"); set(10, headTop - 1, "#"); set(11, headTop - 1, "#"); set(11, headTop, "#");
  } else {
    set(4, headTop - 1, "#"); set(5, headTop - 1, "#"); set(10, headTop - 1, "#"); set(11, headTop - 1, "#");
  }

  // Big friendly eyes.
  const eyeY = headTop + 2;
  for (const ex of [4, 10]) {
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) set(ex + dx, eyeY + dy, "O");
    const pupilX = ex + (rand() > 0.5 ? 0 : 1);
    const pupilY = eyeY + (rand() > 0.5 ? 0 : 1);
    set(pupilX, pupilY, "o");
  }

  // Cheeks + smile, one row under the eyes.
  set(3, eyeY + 2, "+");
  set(12, eyeY + 2, "+");
  set(7, eyeY + 2, "m");
  set(8, eyeY + 2, "m");

  // Belly patch.
  for (let y = eyeY + 3; y <= eyeY + 5; y++) for (let x = 6; x <= 9; x++) if (g[y]?.[x] === "#") set(x, y, "+");

  // Little tail.
  if (rand() > 0.45) { set(13, 13, "#"); set(14, 12, "#"); }
  if (rand() > 0.7) { set(2, 13, "#"); set(1, 12, "#"); }
  return g.map(row => row.join(""));
}

export function petName(seed) {
  const rand = mulberry32(seed ^ 0x51ed270b);
  const a = SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
  const b = SUFFIX[Math.floor(rand() * SUFFIX.length)];
  const name = a + b;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function titleForLevel(level) {
  return TITLES[Math.min(TITLES.length - 1, Math.floor(level / 6))];
}
export function rankForLevel(level) {
  if (level >= 24) return RANKS[4];
  if (level >= 15) return RANKS[3];
  if (level >= 8) return RANKS[2];
  if (level >= 3) return RANKS[1];
  return RANKS[0];
}
export function evolutionStage(level) {
  if (level >= 20) return 3;
  if (level >= 12) return 2;
  if (level >= 5) return 1;
  return 0;
}

export function petFromAccount(account) {
  const key = (account || "demo").toLowerCase();
  const seed = hashString(key);
  return { account: key, seed, mask: generateMask(seed), name: petName(seed) };
}

/** Draw in pixel-grid space with a bold outline, white halo and soft accessories. */
export function drawCreature(ctx, { mask, x, y, scale, sx = 1, sy = 1, colors, stage = 0, blink = 0, accessory = null }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * sx, scale * sy);
  ctx.imageSmoothingEnabled = false;
  const solid = (gx, gy) => gx >= 0 && gx < 16 && gy >= 0 && gy < 16 && mask[gy][gx] !== ".";
  const fill = (gx, gy, color) => { ctx.fillStyle = color; ctx.fillRect(gx - 8, gy - 16, 1, 1); };

  // white halo
  ctx.fillStyle = "#ffffff";
  for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 16; gx++) if (solid(gx, gy)) ctx.fillRect(gx - 9, gy - 17, 3, 3);

  // bold outline
  for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 16; gx++) {
    if (solid(gx, gy)) continue;
    if (solid(gx - 1, gy) || solid(gx + 1, gy) || solid(gx, gy - 1) || solid(gx, gy + 1)) fill(gx, gy, colors.outline);
  }

  // body + face
  for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 16; gx++) {
    const ch = mask[gy][gx];
    if (ch === ".") continue;
    let color = colors.ink;
    if (ch === "+") color = colors.accent;
    else if (ch === "O") color = blink ? colors.ink : "#ffffff";
    else if (ch === "o") color = blink ? colors.outline : "#1b1b1b";
    else if (ch === "m") color = colors.outline;
    fill(gx, gy, color);
  }

  // equipped accessory wins; otherwise show the evolution accessory
  if (accessory && accessory.length) {
    for (const [gx, gy, color] of accessory) fill(gx, gy, color);
  } else {
    if (stage >= 1) { fill(7, 4, "#3fae74"); fill(8, 4, "#3fae74"); fill(6, 3, "#2f7d5b"); fill(9, 3, "#2f7d5b"); }
    if (stage >= 2) { for (let gx = 4; gx <= 11; gx++) fill(gx, 12, "#e2574f"); fill(11, 13, "#e2574f"); fill(10, 13, "#e2574f"); }
    if (stage >= 3) { for (let gx = 5; gx <= 10; gx++) fill(gx, 1, "#f2c14e"); fill(5, 0, "#f2c14e"); fill(8, 0, "#f2c14e"); fill(11, 0, "#f2c14e"); }
  }
  ctx.restore();
}
