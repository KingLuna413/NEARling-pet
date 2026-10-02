// Breeding: two pets make an egg; the egg hatches into a child with mixed
// traits and its own generation. v1 stores everything client-side (and syncs
// the public registry to Supabase when configured).
import { hashString, generateMask, petName, rankForLevel } from "./pet.js";

export const EGG_SECONDS = 90;
export const BREED_COST = 120;

/** Dominant traits: child mask is deterministic from both parents. */
export function childFrom(parentA, parentB) {
  const mix = (hashString(`${parentA.seed}:${parentB.seed}`) ^ (parentA.seed + parentB.seed)) >>> 0;
  const seed = mix || parentA.seed ^ parentB.seed;
  const generation = Math.max(parentA.generation ?? 1, parentB.generation ?? 1) + 1;
  return { seed, mask: generateMask(seed), name: petName(seed ^ (parentA.seed << 1)), generation };
}

export function eggFor(owner, parentA, parentB) {
  const child = childFrom(parentA, parentB);
  return {
    id: `${owner}:${Date.now().toString(36)}`,
    owner,
    parentA: { name: parentA.name, seed: parentA.seed, generation: parentA.generation ?? 1 },
    parentB: { name: parentB.name, seed: parentB.seed, generation: parentB.generation ?? 1 },
    seed: child.seed,
    name: child.name,
    generation: child.generation,
    laidAt: Date.now(),
    hatchAt: Date.now() + EGG_SECONDS * 1000,
  };
}

export function ready(egg, now = Date.now()) {
  return now >= egg.hatchAt;
}
export function secondsLeft(egg, now = Date.now()) {
  return Math.max(0, Math.ceil((egg.hatchAt - now) / 1000));
}

export function hatched(egg) {
  return {
    id: egg.id,
    seed: egg.seed,
    name: egg.name,
    generation: egg.generation,
    mask: generateMask(egg.seed),
    parents: [egg.parentA, egg.parentB],
    bornAt: Date.now(),
  };
}

export function rankOf(seed, level) {
  return rankForLevel(level);
}

/** Public summary used by the playground registry. */
export function petSummary(account, pet, level, rank, boops = 0) {
  return {
    account,
    name: pet.name,
    seed: pet.seed,
    level,
    rarity: rank?.label ?? "Fresh",
    generation: pet.generation ?? 1,
    boops,
  };
}
