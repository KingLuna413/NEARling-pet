// sNearling economy. Earning is deliberately hard for small holders: below
// 0.5% of supply you earn a few percent of the rate, and the rate climbs
// steeply toward full speed at 5%. 1 sNearling = 1 $NRLING at redemption.
import { CONFIG } from "./config.js";

const S = CONFIG.snearling;

export const TIERS = [
  { key: "seedling", label: "Seedling", min: 0, note: "a few % weight" },
  { key: "sprout", label: "Sprout", min: S.slowPct, note: "warming up" },
  { key: "grower", label: "Grower", min: 1, note: "steady" },
  { key: "prime", label: "Prime", min: 2.5, note: "fast" },
  { key: "whale", label: "Whale", min: S.fastPct, note: "full weight" },
];

/** Holding percentage of total supply. */
export function holdingPct(balance) {
  if (!balance || balance <= 0) return 0;
  return (balance / CONFIG.supply) * 100;
}

/** Earning weight: the multiplier applied to the base emission. */
export function earnWeight(pct) {
  if (pct <= 0) return 0;
  if (pct < S.slowPct) return (pct / S.slowPct) * S.dustCeiling;
  if (pct < S.fastPct) {
    const t = (pct - S.slowPct) / (S.fastPct - S.slowPct);
    return S.dustCeiling + Math.pow(t, 1.35) * (1 - S.dustCeiling);
  }
  return 1;
}
export const earnMultiplier = earnWeight;

export function tierFor(pct) {
  let tier = TIERS[0];
  for (const candidate of TIERS) if (pct >= candidate.min) tier = candidate;
  return tier;
}

export function pointsPerDay(pct) {
  return S.basePerDay * earnWeight(pct);
}
export function pointsPerHour(pct) {
  return pointsPerDay(pct) / 24;
}
export const fmtWeight = weight => `Ã—${weight >= 0.1 ? weight.toFixed(2) : weight.toFixed(3)}`;

export function nextTier(pct) {
  return TIERS.find(t => t.min > pct) ?? null;
}

/** Add offline accrual for the elapsed time. Mutates the profile. */
export function accrue(profile, pct, now = Date.now()) {
  const last = profile.lastAccrual ?? now;
  const hours = Math.max(0, (now - last) / 3_600_000);
  profile.lastAccrual = now;
  if (hours <= 0) return 0;
  const gained = pointsPerHour(pct) * hours;
  profile.sNearling = Math.round(((profile.sNearling ?? 0) + gained) * 100) / 100;
  return gained;
}

export function spend(profile, amount) {
  if ((profile.sNearling ?? 0) < amount) return false;
  profile.sNearling = Math.round((profile.sNearling - amount) * 100) / 100;
  return true;
}

export function grant(profile, amount) {
  profile.sNearling = Math.round(((profile.sNearling ?? 0) + amount) * 100) / 100;
}

export const fmtPoints = value =>
  Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
