// Persistence: localStorage always, Supabase for the shared playground when
// configured. Every network call fails soft â€” the app works offline in local mode.
import { CONFIG, supabaseReady } from "./config.js";
import { petFromAccount, generateMask } from "./pet.js";

const KEY = account => `nearling:v2:${account}`;
const LAST = "nearling:last";
const REGISTRY = "nearling:registry";

export function loadProfile(account) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY(account))); } catch { /* ignore */ }
  const base = petFromAccount(account);
  const profile = raw ?? {};
  profile.account = account;
  if (!Array.isArray(profile.pets) || !profile.pets.length) {
    profile.pets = [{ id: "main", seed: base.seed, name: base.name, generation: 1, parents: [] }];
  }
  profile.pets = profile.pets.map(pet => ({ ...pet, seed: pet.seed ?? base.seed, name: pet.name ?? base.name, generation: pet.generation ?? 1, mask: pet.mask ?? generateMask(pet.seed ?? base.seed) }));
  profile.activeId = profile.activeId ?? profile.pets[0].id;
  profile.xp = profile.xp ?? 0;
  profile.buyXp = profile.buyXp ?? 0;
  profile.sNearling = profile.sNearling ?? 0;
  profile.lastAccrual = profile.lastAccrual ?? Date.now();
  profile.owned = Array.isArray(profile.owned) ? profile.owned : [];
  profile.equipped = profile.equipped ?? null;
  profile.eggs = Array.isArray(profile.eggs) ? profile.eggs : [];
  profile.calls = Array.isArray(profile.calls) ? profile.calls : [];
  profile.days = profile.days ?? {};
  profile.quest = profile.quest ?? { date: "", played: false, fed: false, called: false, paid: false };
  profile.boops = profile.boops ?? 0;
  profile.createdAt = profile.createdAt ?? Date.now();
  return profile;
}

export function saveProfile(profile) {
  try { localStorage.setItem(KEY(profile.account), JSON.stringify(profile)); } catch { /* ignore */ }
  try { localStorage.setItem(LAST, profile.account); } catch { /* ignore */ }
}

export function lastAccount() {
  try { return localStorage.getItem(LAST); } catch { return null; }
}

export function activePet(profile) {
  return profile.pets.find(pet => pet.id === profile.activeId) ?? profile.pets[0];
}

/* ---------- local registry (playground) ---------- */
export function saveLocalPet(summary) {
  try {
    const list = JSON.parse(localStorage.getItem(REGISTRY) ?? "[]").filter(row => row.account !== summary.account);
    list.push(summary);
    localStorage.setItem(REGISTRY, JSON.stringify(list.slice(-200)));
  } catch { /* ignore */ }
}
export function listLocalPets() {
  try { return JSON.parse(localStorage.getItem(REGISTRY) ?? "[]"); } catch { return []; }
}

/* ---------- Supabase (optional) ---------- */
function headers(extra = {}) {
  return {
    apikey: CONFIG.supabase.anonKey,
    Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}
const base = () => `${CONFIG.supabase.url.replace(/\/$/, "")}/rest/v1`;

export async function listPets(limit = 200) {
  if (!supabaseReady()) return null;
  try {
    const res = await fetch(`${base()}/nearling_pets?select=*&order=updated_at.desc&limit=${limit}`, { headers: headers() });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function upsertPet(summary) {
  if (!supabaseReady()) return false;
  try {
    const res = await fetch(`${base()}/nearling_pets?on_conflict=account`, {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([{ ...summary, updated_at: new Date().toISOString() }]),
    });
    return res.ok;
  } catch { return false; }
}

export async function addBoop(target) {
  if (!supabaseReady()) return false;
  try {
    const res = await fetch(`${base()}/nearling_boops`, {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify([{ target }]),
    });
    return res.ok;
  } catch { return false; }
}

export async function boopCounts() {
  if (!supabaseReady()) return null;
  try {
    const res = await fetch(`${base()}/nearling_boops?select=target&limit=5000`, { headers: headers() });
    if (!res.ok) return null;
    const rows = await res.json();
    const counts = {};
    for (const row of rows) counts[row.target] = (counts[row.target] ?? 0) + 1;
    return counts;
  } catch { return null; }
}

let reachable = false;

/** Verify the tables actually exist before claiming Supabase mode. */
export async function probe() {
  if (!supabaseReady()) { reachable = false; return false; }
  try {
    const res = await fetch(`${base()}/nearling_pets?select=account&limit=1`, { headers: headers() });
    reachable = res.ok;
  } catch { reachable = false; }
  return reachable;
}

export const mode = () => (reachable ? "supabase" : "local");
