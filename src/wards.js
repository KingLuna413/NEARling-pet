// Wardrobe: pixel accessories drawn over the pet. Some unlock by level, some
// are premium and unlock with the live token (a sink for $NRLING).
export const ACCESSORIES = [
  { id: "sprout", name: "Leaf Sprout", slot: "head", unlock: 3, pixels: [[7, 4, "#3fae74"], [8, 4, "#3fae74"], [6, 3, "#2f7d5b"], [9, 3, "#2f7d5b"]] },
  { id: "bow", name: "Bow Tie", slot: "neck", unlock: 5, pixels: [[7, 11, "#e2574f"], [8, 11, "#e2574f"], [6, 12, "#e2574f"], [9, 12, "#e2574f"], [7, 12, "#1b1b1b"], [8, 12, "#1b1b1b"]] },
  { id: "star", name: "Star Pin", slot: "neck", unlock: 7, pixels: [[4, 10, "#f2c14e"], [5, 10, "#f2c14e"], [4, 11, "#f2c14e"], [5, 11, "#f2c14e"]] },
  { id: "glasses", name: "Round Glasses", slot: "face", unlock: 8, pixels: [[3, 7, "#1b1b1b"], [6, 7, "#1b1b1b"], [9, 7, "#1b1b1b"], [12, 7, "#1b1b1b"], [4, 6, "#1b1b1b"], [5, 6, "#1b1b1b"], [10, 6, "#1b1b1b"], [11, 6, "#1b1b1b"], [7, 6, "#1b1b1b"], [8, 6, "#1b1b1b"]] },
  { id: "bandana", name: "Blue Bandana", slot: "neck", unlock: 10, pixels: [[4, 11, "#4d7cc7"], [5, 11, "#4d7cc7"], [6, 11, "#4d7cc7"], [7, 11, "#4d7cc7"], [8, 11, "#4d7cc7"], [9, 11, "#4d7cc7"], [10, 11, "#4d7cc7"], [11, 11, "#4d7cc7"]] },
  { id: "scarf", name: "Red Scarf", slot: "neck", unlock: 12, pixels: [[4, 12, "#e2574f"], [5, 12, "#e2574f"], [6, 12, "#e2574f"], [7, 12, "#e2574f"], [8, 12, "#e2574f"], [9, 12, "#e2574f"], [10, 12, "#e2574f"], [11, 12, "#e2574f"], [11, 13, "#e2574f"], [10, 13, "#e2574f"]] },
  { id: "tophat", name: "Top Hat", slot: "head", unlock: 15, pixels: [[6, 0, "#1b1b1b"], [7, 0, "#1b1b1b"], [8, 0, "#1b1b1b"], [9, 0, "#1b1b1b"], [6, 1, "#1b1b1b"], [7, 1, "#1b1b1b"], [8, 1, "#1b1b1b"], [9, 1, "#1b1b1b"], [4, 2, "#1b1b1b"], [5, 2, "#1b1b1b"], [6, 2, "#1b1b1b"], [7, 2, "#1b1b1b"], [8, 2, "#1b1b1b"], [9, 2, "#1b1b1b"], [10, 2, "#1b1b1b"], [11, 2, "#1b1b1b"]] },
  { id: "halo", name: "Halo", slot: "head", unlock: 18, pixels: [[5, 0, "#f2c14e"], [6, 0, "#f2c14e"], [7, 0, "#f2c14e"], [8, 0, "#f2c14e"], [9, 0, "#f2c14e"], [10, 0, "#f2c14e"]] },
  { id: "crown", name: "Crown", slot: "head", unlock: 20, pixels: [[5, 1, "#f2c14e"], [6, 1, "#f2c14e"], [7, 1, "#f2c14e"], [8, 1, "#f2c14e"], [9, 1, "#f2c14e"], [10, 1, "#f2c14e"], [5, 0, "#f2c14e"], [8, 0, "#f2c14e"], [11, 0, "#f2c14e"]] },
  { id: "shades", name: "Neon Shades", slot: "face", premium: true, price: "500000000000000000000", pixels: [[4, 6, "#1b1b1b"], [5, 6, "#1b1b1b"], [6, 6, "#1b1b1b"], [9, 6, "#1b1b1b"], [10, 6, "#1b1b1b"], [11, 6, "#1b1b1b"], [7, 6, "#1b1b1b"], [8, 6, "#1b1b1b"], [4, 7, "#ccff00"], [5, 7, "#ccff00"], [10, 7, "#ccff00"], [11, 7, "#ccff00"]] },
  { id: "wings", name: "Angel Wings", slot: "back", premium: true, price: "1200000000000000000000", pixels: [[1, 8, "#eef4ff"], [1, 9, "#eef4ff"], [1, 10, "#eef4ff"], [2, 9, "#eef4ff"], [14, 8, "#eef4ff"], [14, 9, "#eef4ff"], [14, 10, "#eef4ff"], [13, 9, "#eef4ff"]] },
  { id: "party", name: "Party Hat", slot: "head", premium: true, price: "300000000000000000000", pixels: [[7, 0, "#e2574f"], [8, 0, "#e2574f"], [7, 1, "#4d7cc7"], [8, 1, "#4d7cc7"], [6, 2, "#f2c14e"], [7, 2, "#f2c14e"], [8, 2, "#f2c14e"], [9, 2, "#f2c14e"]] },
];

export const byId = id => ACCESSORIES.find(a => a.id === id) ?? null;

export function unlocked(accessory, level) {
  if (accessory.premium) return false;
  return level >= accessory.unlock;
}

export function pixelsFor(id) {
  return byId(id)?.pixels ?? null;
}

export function ownedIds(profile) {
  return Array.isArray(profile.owned) ? profile.owned : [];
}
export function isOwned(profile, id) {
  return ownedIds(profile).includes(id);
}
