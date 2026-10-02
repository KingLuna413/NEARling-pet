import { CONFIG, isLive, supabaseReady, nearlyTokenUrl } from "./config.js";
import { petFromAccount, rankForLevel, titleForLevel, evolutionStage, EVOLUTIONS, drawCreature } from "./pet.js";
import { readTokenState, accountExists, isValidAccount, openExternal } from "./chain.js";
import { petVoice, dailyCall, moodFor, MOODS } from "./voice.js";
import { createAnimator } from "./anim.js";
import { sfx, buzz, unlockAudio, setMuted, isMuted } from "./sfx.js";
import { ACCESSORIES, byId, unlocked, pixelsFor, isOwned } from "./wards.js";
import { loadProfile, saveProfile, activePet, lastAccount, saveLocalPet, listLocalPets, listPets, upsertPet, addBoop, boopCounts, mode, probe } from "./store.js";
import { holdingPct, earnWeight, tierFor, pointsPerDay, pointsPerHour, nextTier, accrue, spend, grant, fmtPoints, fmtWeight, TIERS } from "./snearling.js";
import { eggFor, ready, secondsLeft, hatched, BREED_COST } from "./breeding.js";

const $ = id => document.getElementById(id);
const app = $("app");
const today = () => new Date().toISOString().slice(0, 10);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const fmt = n => Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const DEMO_PETS = ["pawling.near", "nibkin.near", "wispbud.near", "mochipup.near", "zipo.near", "kumonyx.near", "bobobud.near", "zipz.near"];

let S = { account: null, profile: null, pet: null, token: null, registry: [], boops: {}, anim: null, lastBalance: null, pendingFeed: 0, busy: false, pendingAnim: null, pendingFloat: null, message: null, timers: [] };
let pairing = null;
let ticker = 0;

/* ---------------- stats ---------------- */

function balanceOf() {
  if (isLive() && S.token) return S.token.balance;
  return S.profile?.demoBalance ?? 0;
}
function statsOf(profile, balance) {
  const care = profile;
  const fullness = clamp((balance / CONFIG.fullnessTarget) * 100, 0, 100);
  const activity = Math.floor(Math.sqrt(Math.max(0, balance)) / 2);
  const xp = (care.xp ?? 0) + (care.buyXp ?? 0) + activity;
  const level = Math.floor(Math.sqrt(xp / 12)) + 1;
  const nextAt = Math.pow(level, 2) * 12;
  const prevAt = Math.pow(level - 1, 2) * 12;
  const pct = holdingPct(balance);
  return {
    balance, fullness, xp, level,
    progress: clamp(((xp - prevAt) / Math.max(1, nextAt - prevAt)) * 100, 0, 100),
    pct,
    tier: tierFor(pct),
    weight: earnWeight(pct),
    perDay: pointsPerDay(pct),
    perHour: pointsPerHour(pct),
    rank: rankForLevel(level),
    stage: evolutionStage(level),
    mood: moodFor({ fullness, change24h: isLive() ? S.token?.change24h ?? 0 : 0 }),
  };
}
function refresh() {
  if (!S.profile) return;
  accrue(S.profile, holdingPct(balanceOf()));
  saveProfile(S.profile);
  S.stats = statsOf(S.profile, balanceOf());
}

/* ---------------- shared UI ---------------- */

function drawWardrobePreview(canvasId, accessoryId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !S.profile || !S.stats) return;
  canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 16);
  drawCreature(ctx, { mask: activePet(S.profile).mask, x: 8, y: 16, scale: 1, colors: S.stats.rank, stage: S.stats.stage, accessory: pixelsFor(accessoryId) });
}

function bar(label, value, detail, tone) {
  return `<div class="stat" data-tone="${tone}"><div class="stat-head"><span>${label}</span><strong>${detail}</strong></div><div class="stat-track"><span style="width:${clamp(value, 0, 100)}%"></span></div></div>`;
}
function petCard(row, { compact, breed } = {}) {
  const rank = rankForLevel(row.level ?? 1);
  const pet = { mask: row.mask ?? petFromAccount(row.account).mask, name: row.name };
  const canvasId = `c-${Math.random().toString(36).slice(2, 8)}`;
  queueMicrotask(() => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 16, 16);
    drawCreature(ctx, { mask: pet.mask, x: 8, y: 16, scale: 1, colors: rank, accessory: pixelsFor(row.accessory) });
  });
  return `<article class="pcard">
    <canvas class="pcard-art" id="${canvasId}" width="16" height="16" style="width:${compact ? 64 : 92}px;height:${compact ? 64 : 92}px"></canvas>
    <div class="pcard-body">
      <strong>${esc(pet.name)}</strong>
      <small>${esc(row.account)}</small>
      <small class="muted">${rank.label} Â· Lv ${row.level ?? 1} Â· G${row.generation ?? 1}${row.boops ? ` Â· ${row.boops} boops` : ""}</small>
    </div>
    <div class="pcard-actions">
      <button type="button" data-view="${esc(row.account)}">View</button>
      <button type="button" data-boop="${esc(row.account)}">Boop</button>
      ${breed ? `<button type="button" data-breed="${esc(row.account)}" ${S.account ? "" : "disabled"}>Breed</button>` : ""}
    </div>
  </article>`;
}

/* ---------------- pages ---------------- */

function accountPrompt() {
  return `<section class="card"><h2>Enter your NEAR account</h2>
    <p class="muted small">Your pet, wardrobe, nursery and rewards are tied to your account.</p>
    <form class="open" id="enter" autocomplete="off"><input id="account" name="account" placeholder="yourname.near" spellcheck="false" /><button type="submit">Enter</button></form>
    <p class="small muted">Before launch any valid account id works, so you can try everything.</p></section>`;
}

function homePage() {
  const account = S.account;
  const modeLabel = supabaseReady() ? "supabase" : "local";
  const chestKey = `nearling:chest:${account ?? "guest"}`;
  const claimed = (() => { try { return localStorage.getItem(chestKey) === today(); } catch { return false; } })();
  return `
  <section class="hero card">
    <h1>A little friend that grows with the chain</h1>
    <p class="muted">Hold <strong>$NRLING</strong> to feed your NEARling, play daily, breed new friends, and earn <strong>sNearling</strong> â€” redeemable 1:1 for $NRLING when the treasury goes live.</p>
    <form id="enter" class="open" autocomplete="off">
      <input id="account" name="account" placeholder="yourname.near" value="${esc(account ?? "")}" spellcheck="false" />
      <button type="submit">Enter</button>
    </form>
    <p class="small muted">Mode: <strong>${modeLabel}</strong> Â· reads NEAR mainnet read-only Â· never asks for a key</p>
  </section>
  <section class="tiles">
    <a class="tile" href="#/pet/${esc(account ?? "")}"><b>My NEARling</b><span>feed, play, evolve</span></a>
    <a class="tile" href="#/playground"><b>Playground</b><span>meet other pets</span></a>
    <a class="tile" href="#/wardrobe"><b>Wardrobe</b><span>accessories</span></a>
    <a class="tile" href="#/nursery"><b>Nursery</b><span>eggs &amp; children</span></a>
    <a class="tile" href="#/rewards"><b>Rewards</b><span>sNearling &amp; share</span></a>
    <a class="tile" href="#/how"><b>How it works</b><span>the rules</span></a>
  </section>
  <section class="card">
    <h2>Daily chest</h2>
    ${account ? (claimed
      ? `<p class="muted">Claimed today. Come back tomorrow for <strong>+${CONFIG.snearling.bonuses.daily} sNearling</strong>.</p>`
      : `<button id="chest" type="button">Claim +${CONFIG.snearling.bonuses.daily} sNearling</button>`) : `<p class="muted">Enter an account to claim.</p>`}
  </section>
  <section class="card">
    <h2>Registry</h2>
    <p class="muted small">${S.registry.length} pets in the playground registry right now.</p>
  </section>`;
}

function petPage(account, viewOnly) {
  const isMine = account === S.account;
  if (isMine && (!S.profile || !S.stats)) return accountPrompt();
  const pet = isMine ? activePet(S.profile) : { name: petFromAccount(account).name, seed: petFromAccount(account).seed, generation: 1 };
  if (!isMine) {
    const level = S.registry.find(r => r.account === account)?.level ?? 1;
    const rank = rankForLevel(level);
    const row = S.registry.find(r => r.account === account) ?? { account, level, generation: 1 };
    return `<section class="card"><h1>${esc(pet.name)}</h1><p class="muted">${esc(account)} Â· ${rank.label} Â· Lv ${level} Â· G${row.generation ?? 1}</p>
      <div class="pet-view">${petCard({ ...row, mask: pet.mask })}</div>
      <div class="care">
        <button type="button" data-boop="${esc(account)}">Boop</button>
        <button type="button" data-breed="${esc(account)}" ${S.account ? "" : "disabled"}>Breed with mine</button>
      </div>
      <p class="small muted">Read-only view of another player's NEARling.</p></section>`;
  }
  const st = S.stats;
  const equipped = S.profile.equipped ? byId(S.profile.equipped) : null;
  const next = nextTier(st.pct);
  const pending = S.profile.eggs.filter(e => !e.done).length;
  return `
  <section class="card pet-card">
    <div class="scene"><canvas id="stage" width="520" height="380" role="img" aria-label="Your NEARling"></canvas></div>
    <h2 id="pet-name">${esc(pet.name)} Â· ${EVOLUTIONS[st.stage]}${equipped ? ` Â· ${esc(equipped.name)}` : ""}</h2>
    <p class="muted small">${titleForLevel(st.level)} Â· ${esc(account)} Â· ${st.rank.label} Â· G${pet.generation ?? 1}</p>
    <p class="small">${isLive() ? `Holding ${fmt(st.balance)} ${CONFIG.ticker}` : `Demo balance ${fmt(st.balance)} ${CONFIG.ticker} Â· token not live`}</p>
    <div class="stats">
      ${bar("Fullness", st.fullness, `${Math.round(st.fullness)}%`, "fullness")}
      ${bar("Level", st.progress, `Lv ${st.level} Â· ${fmt(st.xp)} XP`, "level")}
      ${bar("Mood", st.mood === "joyful" ? 100 : st.mood === "content" ? 70 : st.mood === "hungry" ? 18 : 45, MOODS.find(m => m.key === st.mood)?.label ?? "â€”", "mood")}
    </div>
    <div class="care">
      <button id="play" type="button">Play Â· daily</button>
      <button id="feed" type="button">Feed Â· ${isLive() ? "buy $NRLING" : "try it"}</button>
      <button id="call" type="button">Log call</button>
      <button id="share" type="button">Share card</button>
    </div>
    <p class="small muted">Feed opens nearly.trade; come back and your pet eats automatically when your balance rises. <button id="recheck" class="linkish" type="button">Check now</button></p>
    <p id="feedback" class="feedback" role="status"></p>
  </section>

  <section class="card">
    <h2>sNearling</h2>
    <p><strong>${fmtPoints(S.profile.sNearling)}</strong> sNearling Â· 1 sNearling = 1 $NRLING (planned)</p>
    <p>Tier <strong>${st.tier.label}</strong> Â· earning weight <strong>${fmtWeight(st.weight)}</strong> at ${st.pct.toFixed(3)}% of supply held.</p>
    <p class="small muted">${next ? `Next tier ${next.label} at ${next.min}% held.` : "Maximum earning weight reached."} ${pending ? `Â· ${pending} egg incubating` : ""}</p>
    <div class="row"><a href="#/rewards">Rewards &amp; redeem</a><a href="#/nursery">Nursery</a></div>
  </section>

  <section class="card">
    <h2>Daily quests</h2>
    <ul class="quests">${["played", "fed", "called"].map((k, i) => `<li data-done="${S.profile.quest[k]}"><span class="tick">${S.profile.quest[k] ? "âœ“" : "â—‹"}</span>${["Play with it", "Feed it", "Log today's call"][i]}</li>`).join("")}</ul>
    <div class="streak">${streakCells()}<span class="streak-count">${streakOf()} day streak</span></div>
  </section>

  <section class="card">
    <h2>Your NEARling says</h2>
    <p class="voice">${esc(petVoice({ account, name: pet.name, level: st.level, fullness: st.fullness, mood: st.mood, change24h: isLive() ? S.token?.change24h ?? 0 : 0, day: today() }))}</p>
    <p class="muted small">Today's call: <strong>${callState().side.toUpperCase()}</strong> Â· ${callState().confidence}% Â· "${esc(callState().reason)}"</p>
    <p class="muted small">Record: ${S.record.total ? `${S.record.hits}/${S.record.total} landed` : "0/0 Â· scored after 24h"}</p>
  </section>`;
}

function playgroundPage() {
  const rows = S.registry;
  if (!rows.length) return `<section class="card"><h2>Playground</h2><p class="muted">No pets registered yet. Enter an account and open your NEARling to register it.</p></section>`;
  return `<section class="card">
    <h2>Playground <span class="small muted">${rows.length} pets Â· ${mode()}</span></h2>
    <div class="filters">
      <label>Sort <select id="sort"><option value="level">Level</option><option value="boops">Boops</option><option value="generation">Generation</option></select></label>
      <label>Filter <select id="rarity"><option value="">All</option>${[...new Set(rows.map(r => r.rarity))].map(r => `<option>${esc(r)}</option>`).join("")}</select></label>
    </div>
    <div id="grid" class="pgrid">${rows.map(row => petCard(row, { compact: true, breed: true })).join("")}</div>
  </section>`;
}

function wardrobePage() {
  if (!S.profile || !S.stats) return accountPrompt();
  const level = S.stats.level;
  return `<section class="card">
    <h2>Wardrobe</h2>
    <p class="muted small">Equip accessories on your active NEARling. Level accessories are free; premium ones unlock with $NRLING once the token is live (a sink for the token).</p>
    <div class="wgrid">${ACCESSORIES.map(item => {
      const owned = isOwned(S.profile, item.id) || unlocked(item, level);
      const equipped = S.profile.equipped === item.id;
      const price = item.price ? `${fmt(Number(item.price) / 1e18)} $NRLING` : "";
      const state = equipped ? "Equipped" : owned ? "Owned" : item.premium ? `Locked Â· ${price}` : `Unlocks at Lv${item.unlock}`;
      const canvasId = `w-${item.id}`;
      queueMicrotask(() => drawWardrobePreview(canvasId, item.id));
      return `<article class="wcard ${equipped ? "is-equipped" : ""}">
        <canvas class="wcard-art" id="${canvasId}" width="16" height="16" role="img" aria-label="${esc(item.name)}"></canvas>
        <strong>${esc(item.name)}</strong>
        <small class="muted">${esc(item.slot)} Â· ${state}</small>
        <div class="wcard-actions">
          ${owned ? `<button type="button" data-equip="${item.id}">${equipped ? "Unequip" : "Equip"}</button>` : item.premium ? `<button type="button" data-buy="${item.id}" ${isLive() ? "" : "disabled"}>Buy</button>` : `<button type="button" disabled>Locked</button>`}
        </div>
      </article>`;
    }).join("")}</div>
  </section>`;
}

function nurseryPage() {
  if (!S.profile || !S.stats) return accountPrompt();
  const eggs = S.profile.eggs.filter(e => !e.done);
  const kids = S.profile.pets.filter(p => p.id !== "main");
  return `<section class="card">
    <h2>Nursery</h2>
    <p class="muted small">Breed your NEARling with another pet in the playground. Cost <strong>${BREED_COST} sNearling</strong> per egg. Eggs incubate, then hatch into a child with mixed traits and generation +1.</p>
    <div class="row"><a href="#/playground">Pick a partner in the Playground â†’</a></div>
    <div id="eggs" class="egglist">${eggs.length ? eggs.map(egg => {
      const left = secondsLeft(egg);
      return `<div class="egg" data-egg="${egg.id}"><span class="egg-icon">ðŸ¥š</span><div><strong>${esc(egg.name)}</strong><small class="muted">G${egg.generation} Â· ${esc(egg.parentA.name)} Ã— ${esc(egg.parentB.name)}</small></div>
        ${ready(egg) ? `<button type="button" data-hatch="${egg.id}">Hatch</button>` : `<span class="muted small" data-count="${egg.id}">${left}s</span>`}</div>`;
    }).join("") : `<p class="muted">No eggs incubating.</p>`}</div>
  </section>
  <section class="card">
    <h2>Children</h2>
    ${kids.length ? kids.map(kid => `<div class="egg"><span class="egg-icon">ðŸ£</span><div><strong>${esc(kid.name)}</strong><small class="muted">G${kid.generation} Â· ${esc(kid.parents?.map(p => p.name).join(" Ã— ") ?? "â€”")}</small></div><button type="button" data-activate="${kid.id}" ${kid.id === S.profile.activeId ? "disabled" : ""}>${kid.id === S.profile.activeId ? "Active" : "Set active"}</button></div>`).join("") : `<p class="muted">No children yet.</p>`}
  </section>`;
}

function rewardsPage() {
  if (!S.profile || !S.stats) return accountPrompt();
  const st = S.stats;
  const weight = Math.pow(st.level, 2);
  const totalWeight = S.registry.reduce((sum, row) => sum + Math.pow(row.level ?? 1, 2), 0) + weight;
  const sharePct = totalWeight ? (weight / totalWeight) * 100 : 0;
  return `<section class="card">
    <h2>sNearling</h2>
    <p><strong>${fmtPoints(S.profile.sNearling)}</strong> sNearling</p>
    <p class="muted small">Earning tier <strong>${st.tier.label}</strong> Â· weight <strong>${fmtWeight(st.weight)}</strong> Â· holding ${st.pct.toFixed(3)}% of supply.</p>
    <p class="small muted">Your <strong>weight</strong> is the multiplier applied to the base emission â€” it is not a promise of an amount. It is deliberately small for small bags: below <strong>0.5%</strong> held you have only a few percent weight, and it climbs steeply to full weight at <strong>5%</strong>. 1 sNearling = 1 $NRLING at redemption (planned).</p>
    <table><thead><tr><th>Tier</th><th>From</th><th>Weight</th></tr></thead><tbody>
      ${TIERS.map((t, index) => {
        const w = index === 0 ? earnWeight(CONFIG.snearling.slowPct) : earnWeight(t.min);
        return `<tr${st.tier.key === t.key ? ' class="you"' : ""}><td>${t.label}</td><td>${t.min}% held</td><td>${index === 0 ? `up to ${fmtWeight(w)}` : fmtWeight(w)}</td></tr>`;
      }).join("")}
    </tbody></table>
    <h3 class="sub">How the weight is calculated</h3>
    <pre class="calc">share = your $NRLING / 1,000,000,000

share &lt; 0.5%   â†’ weight = (share / 0.5%) Ã— 0.05
0.5%â€“5%    â†’ weight = 0.05 + ((share âˆ’ 0.5%) / 4.5%)^1.35 Ã— 0.95
share â‰¥ 5%  â†’ weight = 1.00</pre>
    <div class="care"><button type="button" disabled>Redeem 1:1 â€” treasury live soon</button></div>
    <p class="small muted">Redemption needs a funded on-chain treasury and a claim contract. That is the next step after launch â€” nothing is paid until it exists.</p>
  </section>
  <section class="card">
    <h2>Holder reward share</h2>
    <p class="muted small">Creator fees from nearly.trade (80% of the 1% pool fee) fund weekly prizes. Your estimated share scales with levelÂ².</p>
    <ul class="facts">
      <li><span>Your reward weight</span><strong>${fmt(weight)}</strong></li>
      <li><span>Share of the weekly pool</span><strong>${sharePct.toFixed(2)}%</strong></li>
      <li><span>Automatic layer</span><strong>tax â†’ holders</strong></li>
    </ul>
    <p class="small muted">The automatic holder layer is set at launch by the tax split. The level-based share is distributed weekly by the team from creator fees (contract automation later). Estimates only.</p>
    <div class="row"><a href="https://nearly.trade/burn" target="_blank" rel="noopener">Burn board â†—</a><a href="https://nearly.trade" target="_blank" rel="noopener">nearly.trade â†—</a></div>
  </section>
  <section class="card planned">
    <h2>Planned <span class="small muted">not live yet</span></h2>
    <ul class="facts">
      <li><span>Genesis premium earning</span><strong>no token hold needed</strong></li>
      <li><span>Weekly draw</span><strong>hold â‰¥ 4% for 7 days</strong></li>
      <li><span>Prize</span><strong>random Genesis airdrop</strong></li>
    </ul>
    <p class="small muted">Genesis NFTs will unlock a premium earning path that does <strong>not</strong> require holding $NRLING. Separately, wallets holding <strong>4% or more</strong> of supply for a full week enter a weekly draw â€” one eligible wallet receives a <strong>Genesis airdrop</strong>. Snapshots, eligibility and mechanics are subject to launch; none of it is active today.</p>
  </section>`;
}

function howPage() {
  return `<section class="card">
    <h2>How NEARling works</h2>
    <ol class="how">
      <li><strong>One pet per wallet.</strong> Your NEAR account decides your creature â€” same account, same pet.</li>
      <li><strong>Feed = buy $NRLING.</strong> Tap Feed, buy on nearly.trade, come back. When your balance rises, your NEARling eats and gains XP.</li>
      <li><strong>Level up from buying.</strong> Every detected buy adds XP. Higher level unlocks accessories, breeding slots and a bigger reward weight.</li>
      <li><strong>Play daily.</strong> Once a day plus daily quests (play, feed, log a call) â€” streak bonus XP.</li>
      <li><strong>sNearling.</strong> Earned from care, quests, breeding and holding. Earning scales with how much supply you hold: below 0.5% is slow, full speed at 5%. Redeemable 1:1 for $NRLING when the treasury is live.</li>
      <li><strong>Breed.</strong> Pick a partner in the Playground, pay sNearling, get an egg. It hatches into a child with mixed traits and a higher generation.</li>
      <li><strong>Wardrobe.</strong> Equip hats, glasses and auras. Level ones are free; premium ones will cost $NRLING (a sink).</li>
      <li><strong>Rewards.</strong> Creator fees fund weekly prizes; your share scales with levelÂ². The tax â†’ holders layer is automatic from launch.</li>
      <li><strong>Planned â€” Genesis premium earning.</strong> Holding a Genesis NFT will unlock a premium earning path that does not need a $NRLING balance.</li>
      <li><strong>Planned â€” weekly airdrop draw.</strong> Wallets that hold <strong>4% or more</strong> of supply for a full week enter a weekly draw for a random <strong>Genesis airdrop</strong>.</li>
    </ol>
    <p class="small muted">Everything on-chain is read-only for now. The token, treasury and redemption are launched by the builder; nothing here is financial advice.</p>
  </section>`;
}

/* ---------------- actions ---------------- */

function streakOf() {
  const days = S.profile.days ?? {};
  let streak = 0;
  let cursor = new Date();
  if (!days[cursor.toISOString().slice(0, 10)]) cursor = new Date(Date.now() - 86400000);
  while (days[cursor.toISOString().slice(0, 10)]) { streak++; cursor = new Date(cursor.getTime() - 86400000); }
  return streak;
}
function streakCells() {
  const days = S.profile.days ?? {};
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
    return `<span class="day" data-on="${days[d] ? "true" : "false"}">${["S", "M", "T", "W", "T", "F", "S"][new Date(d).getDay()]}</span>`;
  }).join("");
}
function callState() {
  return dailyCall({ account: S.account, day: today() });
}
function scoreCalls() {
  let hits = 0, total = 0;
  for (const call of S.profile.calls) {
    if (typeof call.score !== "number") continue;
    total++;
    if ((call.side === "bull" && call.score >= 0) || (call.side === "bear" && call.score < 0)) hits++;
  }
  return { hits, total };
}
function feedback(text, isError) {
  S.message = { text, isError: Boolean(isError) };
  const el = $("feedback");
  if (!el) return;
  el.textContent = text;
  el.dataset.error = isError ? "true" : "false";
}
function addXp(amount, reason) {
  const before = S.stats.level;
  S.profile.xp = (S.profile.xp ?? 0) + amount;
  refresh();
  S.pendingFloat = `+${amount} XP`;
  if (S.stats.level > before) {
    S.pendingAnim = "levelup";
    sfx.level();
    buzz([12, 40, 12, 40, 24]);
    feedback(`Level ${S.stats.level} â€” ${reason}.`);
  }
  saveProfile(S.profile);
  render();
}
function addPoints(amount, reason, { silent } = {}) {
  grant(S.profile, amount);
  saveProfile(S.profile);
  if (!silent) feedback(`${amount > 0 ? "+" : ""}${fmtPoints(amount)} sNearling Â· ${reason}.`);
}
function checkQuest() {
  const q = S.profile.quest;
  if (q.date !== today()) { S.profile.quest = { date: today(), played: false, fed: false, called: false, paid: false }; }
  const q2 = S.profile.quest;
  if (q2.played && q2.fed && q2.called && !q2.paid) {
    q2.paid = true;
    addPoints(CONFIG.snearling.bonuses.quest, "daily quests");
    addXp(60, "Daily quests complete");
  }
  saveProfile(S.profile);
}
function play() {
  unlockAudio();
  const date = today();
  if (S.profile.days[date]) { sfx.sad(); feedback("Already played today.", true); return; }
  S.profile.days[date] = true;
  S.profile.quest.played = true;
  S.pendingAnim = "happy"; sfx.happy(); buzz(18);
  addPoints(CONFIG.snearling.bonuses.play, "played", { silent: true });
  addXp(24 + streakOf() * 4, "Played");
  checkQuest();
}
function logCall() {
  unlockAudio();
  const state = callState();
  if (S.profile.calls.some(c => c.day === today())) { sfx.sad(); feedback("Today's call is already on record.", true); return; }
  S.profile.calls.push({ day: today(), side: state.side, confidence: state.confidence });
  S.profile.quest.called = true;
  S.record = scoreCalls();
  sfx.click();
  addPoints(CONFIG.snearling.bonuses.call, "call logged", { silent: true });
  addXp(18, "Call logged");
  checkQuest();
}
function feed() {
  unlockAudio();
  if (!isLive()) {
    sfx.feed();
    feedback("Demo feed: simulating a $NRLING buyâ€¦");
    setTimeout(() => {
      const next = (S.profile.demoBalance || 0) + 120_000 + Math.random() * 300_000;
      applyFeed(next - balanceOf(), "Demo buy");
    }, 700);
    return;
  }
  S.pendingFeed = Date.now();
  S.lastBalance = S.stats.balance;
  sfx.feed();
  feedback("Opened nearly.trade. Buy $NRLING, then come back â€” your pet will eat when the balance rises.");
  openExternal(nearlyTokenUrl());
}
function applyFeed(delta, source) {
  if (!isLive()) S.profile.demoBalance = (S.profile.demoBalance || 0) + delta;
  const buyXp = 20 + Math.min(180, Math.round(Math.sqrt(Math.max(0, delta)) / 3));
  S.profile.buyXp = (S.profile.buyXp ?? 0) + buyXp;
  S.profile.quest.fed = true;
  S.pendingFeed = 0;
  refresh();
  S.pendingAnim = "eat";
  sfx.eat(); buzz([10, 30, 16]);
  addPoints(CONFIG.snearling.bonuses.feed, source, { silent: true });
  saveProfile(S.profile);
  addXp(buyXp, source);
  checkQuest();
}
async function checkFeed() {
  if (!isLive() || !S.account) return;
  feedback("Checking for new $NRLINGâ€¦");
  let token = null;
  try { token = await readTokenState(S.account); } catch { token = null; }
  if (!token) { feedback("Could not read the token right now.", true); return; }
  const previous = S.lastBalance ?? S.stats.balance;
  S.token = token;
  if (token.balance > previous) { applyFeed(token.balance - previous, "Buy detected"); return; }
  refresh(); render();
  feedback("No new $NRLING yet.");
}
async function autoCheck() {
  if (!isLive() || !S.account) return;
  try {
    const token = await readTokenState(S.account);
    if (!token) return;
    const previous = S.lastBalance ?? S.stats.balance;
    if (token.balance > previous) { S.token = token; applyFeed(token.balance - previous, "Buy detected"); }
  } catch { /* ignore */ }
}
function share() {
  const pet = activePet(S.profile);
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 420;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eee"; ctx.fillRect(0, 0, 640, 420);
  ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 638, 418);
  const rank = S.stats.rank;
  ctx.save(); ctx.translate(184, 300);
  drawCreature(ctx, { mask: pet.mask, x: 0, y: 0, scale: 12, colors: rank, stage: S.stats.stage, accessory: pixelsFor(S.profile.equipped) });
  ctx.restore();
  ctx.fillStyle = "#111";
  ctx.font = "bold 40px ui-monospace, monospace"; ctx.fillText(pet.name, 348, 110);
  ctx.font = "20px ui-monospace, monospace";
  ctx.fillText(`${EVOLUTIONS[S.stats.stage]} Â· Lv ${S.stats.level} Â· G${pet.generation ?? 1}`, 348, 146);
  ctx.font = "16px ui-monospace, monospace";
  ctx.fillText(`Fullness ${Math.round(S.stats.fullness)}%`, 348, 194);
  ctx.fillText(`sNearling ${fmtPoints(S.profile.sNearling)}`, 348, 222);
  ctx.fillText(`Tier ${S.stats.tier.label} Â· weight ${fmtWeight(S.stats.weight)}`, 348, 250);
  ctx.fillText(S.account, 348, 292);
  ctx.font = "14px ui-monospace, monospace"; ctx.fillText("NEARling Â· nearly.trade", 40, 392);
  const link = document.createElement("a");
  link.download = `nearling-${S.account}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/* ---------------- registry ---------------- */

async function loadRegistry() {
  const remote = await listPets();
  const boops = (await boopCounts()) ?? {};
  const local = listLocalPets();
  const demo = DEMO_PETS.map((account, i) => {
    const pet = petFromAccount(account);
    const level = [3, 6, 9, 13, 17, 21, 5, 11][i] ?? 4;
    return { account, name: pet.name, seed: pet.seed, level, rarity: rankForLevel(level).label, generation: 1, boops: boops[account] ?? 0 };
  });
  const merged = new Map();
  for (const row of [...demo, ...(remote ?? []), ...local]) {
    if (!row?.account) continue;
    merged.set(row.account, { ...row, boops: row.boops ?? boops[row.account] ?? 0, mask: row.mask ?? petFromAccount(row.account).mask });
  }
  S.registry = [...merged.values()];
  saveLocalPet({ account: S.account, name: activePet(S.profile).name, seed: activePet(S.profile).seed, level: S.stats.level, rarity: S.stats.rank.label, generation: activePet(S.profile).generation ?? 1, accessory: S.profile.equipped, boops: S.profile.boops ?? 0 });
  await upsertPet({ account: S.account, name: activePet(S.profile).name, seed: activePet(S.profile).seed, level: S.stats.level, rarity: S.stats.rank.label, generation: activePet(S.profile).generation ?? 1, accessory: S.profile.equipped, boops: S.profile.boops ?? 0 });
}

/* ---------------- router ---------------- */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { page: parts[0] || "home", param: parts[1] ? decodeURIComponent(parts[1]) : null, query: new URLSearchParams(query ?? "") };
}

function render() {
  const { page, param, query } = parseHash();
  if (S.anim) { S.anim.stop(); S.anim = null; }
  for (const timer of S.timers) clearInterval(timer);
  S.timers = [];
  ticker += 1;
  const id = ticker;
  let html = "";
  if (page === "home") html = homePage();
  else if (page === "playground") html = playgroundPage();
  else if (page === "wardrobe") html = wardrobePage();
  else if (page === "nursery") html = nurseryPage();
  else if (page === "rewards") html = rewardsPage();
  else if (page === "how") html = howPage();
  else if (page === "pet") {
    const target = param ?? S.account;
    const viewOnly = query.get("view") === "1" || (Boolean(target) && target !== S.account);
    html = viewOnly && target ? petPage(target, true) : S.account ? petPage(S.account, false) : accountPrompt();
  } else html = homePage();
  app.innerHTML = html;
  bind(id, page);
}

function bind(id, page) {
  if (id !== ticker) return;
  const modeEl = $("mode");
  if (modeEl) { modeEl.textContent = mode(); modeEl.dataset.mode = mode(); }
  $("enter")?.addEventListener("submit", event => { event.preventDefault(); unlockAudio(); enterAccount($("account").value); });
  $("mute")?.addEventListener("click", toggleMute);
  $("mute") && ($("mute").textContent = isMuted() ? "Sound off" : "Sound on");
  $("chest")?.addEventListener("click", () => {
    unlockAudio();
    addPoints(CONFIG.snearling.bonuses.daily, "daily chest");
    try { localStorage.setItem(`nearling:chest:${S.account}`, today()); } catch { /* ignore */ }
    render();
  });

  if (page === "pet") {
    const canvas = $("stage");
    if (canvas && S.account && (parseHash().param ?? S.account) === S.account) {
      const pet = activePet(S.profile);
      S.anim = createAnimator(canvas);
      S.anim.setPet({ mask: pet.mask, colors: S.stats.rank, stage: S.stats.stage, accessory: pixelsFor(S.profile.equipped) });
      S.anim.setMood(S.stats.mood);
      S.anim.start();
      if (S.pendingAnim) { S.anim.play(S.pendingAnim); S.pendingAnim = null; }
      if (S.pendingFloat) { S.anim.float(S.pendingFloat); S.pendingFloat = null; }
      $("play")?.addEventListener("click", play);
      $("feed")?.addEventListener("click", feed);
      $("call")?.addEventListener("click", logCall);
      $("share")?.addEventListener("click", share);
      $("recheck")?.addEventListener("click", () => void checkFeed());
    }
  }

  app.querySelectorAll("[data-boop]").forEach(btn => btn.addEventListener("click", async () => {
    const target = btn.dataset.boop;
    sfx.click(); buzz(8);
    if (S.account && target === S.account) {
      S.profile.boops = (S.profile.boops ?? 0) + 1;
      saveProfile(S.profile);
    }
    await addBoop(target);
    const row = S.registry.find(r => r.account === target);
    if (row) row.boops = (row.boops ?? 0) + 1;
    feedback(`Booped ${target}.`);
    render();
  }));
  app.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => { location.hash = `#/pet/${encodeURIComponent(btn.dataset.view)}?view=1`; }));
  app.querySelectorAll("[data-breed]").forEach(btn => btn.addEventListener("click", () => {
    pairing = btn.dataset.breed;
    location.hash = "#/nursery";
  }));
  app.querySelectorAll("[data-equip]").forEach(btn => btn.addEventListener("click", () => {
    const item = byId(btn.dataset.equip);
    if (!item) return;
    if (S.profile.equipped === item.id) S.profile.equipped = null;
    else {
      if (!isOwned(S.profile, item.id)) S.profile.owned.push(item.id);
      S.profile.equipped = item.id;
    }
    saveProfile(S.profile); sfx.click(); render();
  }));
  app.querySelectorAll("[data-buy]").forEach(btn => btn.addEventListener("click", () => {
    feedback(isLive() ? "Token purchases open after launch." : "Premium accessories unlock when $NRLING is live.", true);
  }));
  app.querySelectorAll("[data-hatch]").forEach(btn => btn.addEventListener("click", () => {
    const egg = S.profile.eggs.find(e => e.id === btn.dataset.hatch);
    if (!egg || !ready(egg)) return;
    const child = hatched(egg);
    S.profile.eggs = S.profile.eggs.filter(e => e.id !== egg.id);
    S.profile.pets.push(child);
    grant(S.profile, CONFIG.snearling.bonuses.hatch);
    saveProfile(S.profile); sfx.level(); buzz(20);
    feedback(`${child.name} hatched! Generation ${child.generation}.`);
    refresh(); render();
  }));
  app.querySelectorAll("[data-activate]").forEach(btn => btn.addEventListener("click", () => {
    S.profile.activeId = btn.dataset.activate;
    saveProfile(S.profile); sfx.click(); refresh(); render();
  }));
  $("sort")?.addEventListener("change", sortGrid);
  $("rarity")?.addEventListener("change", sortGrid);

  if (S.message && $("feedback")) {
    $("feedback").textContent = S.message.text;
    $("feedback").dataset.error = S.message.isError ? "true" : "false";
  }

  if (page === "nursery") {
    S.timers.push(setInterval(() => {
      for (const egg of S.profile.eggs) {
        const el = document.querySelector(`[data-count="${egg.id}"]`);
        if (el) el.textContent = `${secondsLeft(egg)}s`;
      }
    }, 1000));
  }

  if (page === "nursery" && pairing) {
    const partner = S.registry.find(r => r.account === pairing);
    if (partner && S.account) {
      const ready2 = (S.profile.sNearling ?? 0) >= BREED_COST;
      const box = document.createElement("section");
      box.className = "card";
      box.innerHTML = `<h2>Breed with ${esc(partner.name)}</h2>
        <p class="muted small">${esc(partner.account)} Â· Lv ${partner.level} Â· G${partner.generation ?? 1}</p>
        <p class="small">Cost <strong>${BREED_COST} sNearling</strong> Â· you have ${fmtPoints(S.profile.sNearling)}.</p>
        <div class="care"><button id="breed-go" type="button" ${ready2 ? "" : "disabled"}>Lay egg</button><button id="breed-cancel" type="button">Cancel</button></div>`;
      app.prepend(box);
      $("breed-go").addEventListener("click", () => {
        const me = activePet(S.profile);
        if (!spend(S.profile, BREED_COST)) { feedback("Not enough sNearling.", true); return; }
        const egg = eggFor(S.account, me, { name: partner.name, seed: partner.seed, generation: partner.generation ?? 1 });
        S.profile.eggs.push(egg);
        saveProfile(S.profile); sfx.feed(); feedback("Egg laid! It is incubating in the nursery.");
        pairing = null; refresh(); render();
      });
      $("breed-cancel").addEventListener("click", () => { pairing = null; render(); });
    }
  }
}

function sortGrid() {
  const sortKey = $("sort")?.value ?? "level";
  const rarity = $("rarity")?.value ?? "";
  const rows = [...S.registry]
    .filter(row => !rarity || row.rarity === rarity)
    .sort((a, b) => sortKey === "boops" ? (b.boops ?? 0) - (a.boops ?? 0) : sortKey === "generation" ? (b.generation ?? 1) - (a.generation ?? 1) : (b.level ?? 1) - (a.level ?? 1));
  const grid = $("grid");
  if (!grid) return;
  grid.innerHTML = rows.map(row => petCard(row, { compact: true, breed: true })).join("");
  app.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => { location.hash = `#/pet/${encodeURIComponent(btn.dataset.view)}?view=1`; }));
  app.querySelectorAll("[data-boop]").forEach(btn => btn.addEventListener("click", async () => {
    await addBoop(btn.dataset.boop);
    const row = S.registry.find(r => r.account === btn.dataset.boop);
    if (row) row.boops = (row.boops ?? 0) + 1;
    sfx.click(); feedback(`Booped ${btn.dataset.boop}.`); render();
  }));
  app.querySelectorAll("[data-breed]").forEach(btn => btn.addEventListener("click", () => { pairing = btn.dataset.breed; location.hash = "#/nursery"; }));
}

function toggleMute() {
  const next = !isMuted();
  setMuted(next);
  if (!next) { unlockAudio(); sfx.click(); }
  const btn = $("mute");
  if (btn) { btn.textContent = next ? "Sound off" : "Sound on"; btn.setAttribute("aria-pressed", String(!next)); }
}

/* ---------------- bootstrap ---------------- */

async function enterAccount(raw) {
  const account = (raw || "").trim().toLowerCase();
  if (!isValidAccount(account)) { feedback("That does not look like a NEAR account id.", true); return; }
  S.account = account;
  S.profile = loadProfile(account);
  S.profile.demoBalance = S.profile.demoBalance || (40_000 + (activePet(S.profile).seed % 4_000_000));
  refresh();
  S.record = scoreCalls();
  S.lastBalance = S.stats.balance;
  saveProfile(S.profile);
  const chip = $("account-chip");
  if (chip) chip.textContent = account;
  render();
  // Registry first (fast, local), then the chain lookup in the background.
  try { await loadRegistry(); } catch { /* ignore */ }
  refresh();
  render();
  void (async () => {
    let exists = false;
    try { exists = await accountExists(account); } catch { exists = false; }
    if (exists && isLive()) { try { S.token = await readTokenState(account); } catch { S.token = null; } }
    refresh();
    render();
  })();
}

async function boot() {
  await probe();
  const account = lastAccount();
  if (account) {
    S.account = account;
    S.profile = loadProfile(account);
    S.profile.demoBalance = S.profile.demoBalance || (40_000 + (activePet(S.profile).seed % 4_000_000));
    refresh();
    S.record = scoreCalls();
    S.lastBalance = S.stats.balance;
    await loadRegistry();
    $("account-chip") && ($("account-chip").textContent = account);
  } else {
    S.profile = null;
  }
  render();
  window.addEventListener("hashchange", render);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void autoCheck(); });
  window.addEventListener("focus", () => void autoCheck());
  setInterval(() => { if (document.visibilityState === "visible") void autoCheck(); }, 15000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
