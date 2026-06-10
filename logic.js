"use strict";

// Pure game data, state, and rules. No DOM access — ui.js renders this,
// and Node loads it directly for tests and balance simulations.

// ---------- Data ----------

const COIN_TYPES = {
  standard: { name: "Penny",  headsChips: 10, tailsChips: 5,  headsProb: 0.50, headsMult: 0, tailsMult: 0, cost: 3,
    desc: "50% Heads. H: +10 chips, T: +5 chips" },
  gold:     { name: "Gold Coin", headsChips: 25, tailsChips: 15, headsProb: 0.50, headsMult: 0, tailsMult: 0, cost: 6,
    desc: "50% Heads. H: +25 chips, T: +15 chips" },
  lucky:    { name: "Lucky Coin", headsChips: 12, tailsChips: 4, headsProb: 0.65, headsMult: 0, tailsMult: 0, cost: 5,
    desc: "65% Heads. H: +12 chips, T: +4 chips" },
  loaded:   { name: "Loaded Coin", headsChips: 8, tailsChips: 2, headsProb: 0.78, headsMult: 0, tailsMult: 0, cost: 6,
    desc: "78% Heads. H: +8 chips, T: +2 chips" },
  mult:     { name: "Red Cent", headsChips: 4, tailsChips: 2, headsProb: 0.50, headsMult: 2, tailsMult: 0, cost: 6,
    desc: "50% Heads. H: +4 chips & +2 Mult, T: +2 chips" },
  serpent:  { name: "Serpent Coin", headsChips: 2, tailsChips: 6, headsProb: 0.50, headsMult: 0, tailsMult: 2, cost: 6,
    desc: "50% Heads. H: +2 chips, T: +6 chips & +2 Mult" },
};

const CHARMS = [
  { id: "lint",     name: "Lucky Lint",   cost: 4, desc: "+4 Mult" },
  { id: "hunter",   name: "Headhunter",   cost: 5, desc: "+15 Chips for each Heads" },
  { id: "tailwind", name: "Tailwind",     cost: 5, desc: "+2 Mult for each Tails" },
  { id: "crown",    name: "Crown Sigil",  cost: 8, desc: "×3 Mult if every coin shows Heads" },
  { id: "twin",     name: "Gemini",       cost: 7, desc: "×2 Mult if Heads and Tails are tied" },
  { id: "patience", name: "Worry Stone",  cost: 6, desc: "+1 Reroll each round" },
  { id: "stamina",  name: "Strong Thumb", cost: 7, desc: "+1 Flip each round" },
  { id: "edge",     name: "Edgelord",     cost: 6, desc: "Coins land on their Edge 1 in 12 (Edge counts as Heads AND Tails, +50 Chips)" },
  { id: "banker",   name: "Tiny Banker",  cost: 4, desc: "+$3 when you beat a Blind" },
  { id: "echo",     name: "Echo Charm",   cost: 6, desc: "+1 Mult for each toss already scored this round" },
  { id: "magnet",   name: "Magnet",       cost: 5, desc: "Rerolled coins get +10 Chips this toss" },
  { id: "fortune",  name: "Fortune Cat",  cost: 7, desc: "All coins get +5% Heads chance" },
  { id: "feather",  name: "Featherweight", cost: 6, desc: "+40 Chips if your purse holds 4 or fewer coins" },
  { id: "hoarder",  name: "Dragon's Eye", cost: 5, desc: "+1 Chip per $ you hold (max +20)" },
  { id: "gambler",  name: "Loose Thumb",  cost: 6, desc: "25% chance a Reroll is free" },
  { id: "overkill", name: "Last Hurrah",  cost: 7, desc: "×2 Mult on the final Flip of a round" },
  { id: "streak",   name: "Hot Streak",   cost: 5, desc: "+25 Chips if 3+ Heads land in a row" },
  { id: "alchemy",  name: "Alchemist",    cost: 5, desc: "Edge coins give +100 Chips instead of +50" },
  { id: "zigzag",   name: "Lightning Rod", cost: 6, desc: "×2 Mult on Zigzag patterns" },
  { id: "piggy",    name: "Piggy Bank",   cost: 5, desc: "Interest cap raised from $5 to $10" },
];

const CHARM_POOL_SIZE = 14; // charms available per run, for variety

// Patterns: base values plus per-level upgrade increments (Omens level them up).
const PATTERNS = {
  "Full Crown":      { chips: 60, mult: 8, upChips: 25, upMult: 3 },
  "Serpent Hoard":   { chips: 50, mult: 6, upChips: 20, upMult: 2 },
  "Zigzag":          { chips: 40, mult: 6, upChips: 20, upMult: 2 },
  "Near Crown":      { chips: 30, mult: 4, upChips: 15, upMult: 2 },
  "Near Hoard":      { chips: 25, mult: 4, upChips: 12, upMult: 2 },
  "Perfect Balance": { chips: 25, mult: 3, upChips: 15, upMult: 1 },
  "Heads Lean":      { chips: 15, mult: 2, upChips: 10, upMult: 1 },
  "Tails Lean":      { chips: 10, mult: 2, upChips: 8,  upMult: 1 },
};

const LEAN_PATTERNS = new Set(["Heads Lean", "Tails Lean", "Perfect Balance"]);

const ANTE_BASE = [100, 300, 800, 2000, 5000, 11000, 20000, 35000];
const BLINDS = [
  { name: "Small Blind", mul: 1.0, reward: 3 },
  { name: "Big Blind",   mul: 1.5, reward: 4 },
  { name: "Boss Blind",  mul: 2.0, reward: 5 },
];

const BOSSES = [
  { id: "censor",  name: "The Censor",  desc: "Tails coins score 0 Chips" },
  { id: "gravity", name: "The Gravity", desc: "All coins get -20% Heads chance" },
  { id: "hurry",   name: "The Hurry",   desc: "-1 Flip this round" },
  { id: "miser",   name: "The Miser",   desc: "Base pattern Chips are halved" },
  { id: "anchor",  name: "The Anchor",  desc: "Your first coin is locked and can't be rerolled" },
  { id: "purist",  name: "The Purist",  desc: "Lean and Balance patterns score 0 base Chips" },
  { id: "cramp",   name: "The Cramp",   desc: "-1 Reroll this round" },
  { id: "leveler", name: "The Leveler", desc: "Pattern levels are ignored this round" },
];

const POUCHES = [
  { id: "penny",    name: "Penny Pouch",     desc: "The classic. 5 Pennies and $4.",
    coins: ["standard", "standard", "standard", "standard", "standard"], money: 4 },
  { id: "clover",   name: "Clover Pouch",    desc: "4 Lucky Coins and $3. Luck is all you carry.",
    coins: ["lucky", "lucky", "lucky", "lucky"], money: 3 },
  { id: "merchant", name: "Merchant's Pouch", desc: "6 Pennies and $10, but -1 Reroll each round.",
    coins: ["standard", "standard", "standard", "standard", "standard", "standard"], money: 10, rerollMod: -1 },
  { id: "serpent",  name: "Serpent Pouch",   desc: "3 Serpent Coins, a Penny and $5. Tails pay.",
    coins: ["serpent", "serpent", "serpent", "standard"], money: 5 },
];

const MIN_COINS = 3;
const MAX_COINS = 8;
const MAX_CHARMS = 5;
const SHOP_REROLL_COST = 2;

// ---------- State ----------

let S = null;

function getState() { return S; }

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newRun(pouchId) {
  const pouch = POUCHES.find(p => p.id === pouchId) || POUCHES[0];
  S = {
    ante: 0, blind: 0, money: pouch.money,
    pouch: { id: pouch.id, flipMod: pouch.flipMod || 0, rerollMod: pouch.rerollMod || 0 },
    coins: pouch.coins.map(type => ({ type })),
    charms: [],
    charmPool: shuffled(CHARMS.map(c => c.id)).slice(0, CHARM_POOL_SIZE),
    bossOrder: shuffled(BOSSES.map(b => b.id)), // one boss per ante, no repeats
    patternLevels: {},
    roundScore: 0, flipsLeft: 0, rerollsLeft: 0, tossesScored: 0,
    bestToss: 0,
    results: null,        // array of "H"|"T"|"E" after a flip, null between tosses
    pendingToss: false,   // a flip/reroll is awaiting its commit
    rerolledIdx: new Set(),
    selected: new Set(),
    boss: null,
    shopStock: null,
    inShop: false,
    meltUsed: false,
    meltMode: false,
  };
  startRound();
  return S;
}

function hasCharm(id) { return S.charms.some(c => c.id === id); }

function blindInfo() {
  const b = BLINDS[S.blind];
  return { ...b, target: Math.floor(ANTE_BASE[S.ante] * b.mul) };
}

function bossIs(id) { return !!(S.boss && S.boss.id === id); }

function startRound() {
  S.roundScore = 0;
  S.tossesScored = 0;
  S.boss = S.blind === 2 ? BOSSES.find(b => b.id === S.bossOrder[S.ante]) : null;
  S.flipsLeft = Math.max(1, 4 + (hasCharm("stamina") ? 1 : 0) + S.pouch.flipMod - (bossIs("hurry") ? 1 : 0));
  S.rerollsLeft = Math.max(0, 3 + (hasCharm("patience") ? 1 : 0) + S.pouch.rerollMod - (bossIs("cramp") ? 1 : 0));
  S.results = null;
  S.pendingToss = false;
  S.selected.clear();
  S.rerolledIdx.clear();
}

// ---------- Coin physics ----------

function headsProbFor(coin) {
  let p = COIN_TYPES[coin.type].headsProb;
  if (hasCharm("fortune")) p += 0.05;
  if (bossIs("gravity")) p -= 0.20;
  return Math.min(0.95, Math.max(0.05, p));
}

function tossCoin(coin) {
  if (hasCharm("edge") && Math.random() < 1 / 12) return "E";
  return Math.random() < headsProbFor(coin) ? "H" : "T";
}

// Coins that can't be selected for a reroll this round.
function isCoinLocked(i) { return bossIs("anchor") && i === 0; }

// ---------- Patterns & scoring ----------

// Returns the pattern name for edge-inclusive heads/tails counts.
function evalPattern(results) {
  const n = results.length;
  const h = results.filter(r => r === "H" || r === "E").length;
  const t = results.filter(r => r === "T" || r === "E").length;
  const noEdge = results.every(r => r !== "E");
  const alternating = n >= 4 && noEdge && results.every((r, i) => i === 0 || r !== results[i - 1]);
  if (h === n) return "Full Crown";
  if (t === n) return "Serpent Hoard";
  if (alternating) return "Zigzag";
  if (h === n - 1 && t <= 1) return "Near Crown";
  if (t === n - 1 && h <= 1) return "Near Hoard";
  if (h === t) return "Perfect Balance";
  if (h > t) return "Heads Lean";
  return "Tails Lean";
}

function patternLevel(name) { return S.patternLevels[name] || 1; }

function patternValues(name) {
  const p = PATTERNS[name];
  const lv = patternLevel(name);
  return { chips: p.chips + (lv - 1) * p.upChips, mult: p.mult + (lv - 1) * p.upMult };
}

function interestCap() { return hasCharm("piggy") ? 10 : 5; }

// Computes the score of a toss along with a step-by-step breakdown the UI
// animates: [{kind:"pattern"|"coin"|"charm"|"xmult", ...}].
function computeScore(results) {
  const patName = evalPattern(results);
  const p = PATTERNS[patName];
  const lvl = bossIs("leveler") ? 1 : patternLevel(patName);
  let chips = p.chips + (lvl - 1) * p.upChips;
  let mult = p.mult + (lvl - 1) * p.upMult;
  if (bossIs("miser")) chips = Math.floor(chips / 2);
  if (bossIs("purist") && LEAN_PATTERNS.has(patName)) chips = 0;
  const steps = [{ kind: "pattern", label: patName + (lvl > 1 ? ` lv.${lvl}` : ""), chips, mult }];

  const censor = bossIs("censor");
  const edgeBonus = hasCharm("alchemy") ? 100 : 50;

  results.forEach((r, i) => {
    const ct = COIN_TYPES[S.coins[i].type];
    let dc = 0, dm = 0;
    if (r === "H" || r === "E") { dc += ct.headsChips; dm += ct.headsMult; }
    if (r === "T" || r === "E") { if (!censor) dc += ct.tailsChips; dm += ct.tailsMult; }
    if (r === "E") dc += edgeBonus;
    if (S.rerolledIdx.has(i) && hasCharm("magnet")) dc += 10;
    chips += dc; mult += dm;
    steps.push({ kind: "coin", i, chips: dc, mult: dm });
  });

  function addCharm(id, dc, dm) {
    chips += dc; mult += dm;
    steps.push({ kind: "charm", id, chips: dc, mult: dm });
  }

  const h = results.filter(r => r === "H" || r === "E").length;
  const t = results.filter(r => r === "T" || r === "E").length;
  if (hasCharm("lint")) addCharm("lint", 0, 4);
  if (hasCharm("hunter") && h > 0) addCharm("hunter", 15 * h, 0);
  if (hasCharm("tailwind") && t > 0) addCharm("tailwind", 0, 2 * t);
  if (hasCharm("echo") && S.tossesScored > 0) addCharm("echo", 0, S.tossesScored);
  if (hasCharm("feather") && S.coins.length <= 4) addCharm("feather", 40, 0);
  if (hasCharm("hoarder") && S.money > 0) addCharm("hoarder", Math.min(20, S.money), 0);
  if (hasCharm("streak")) {
    let run = 0, best = 0;
    for (const r of results) { run = (r === "H" || r === "E") ? run + 1 : 0; best = Math.max(best, run); }
    if (best >= 3) addCharm("streak", 25, 0);
  }

  function xmult(id, x) {
    mult *= x;
    steps.push({ kind: "xmult", id, x });
  }
  if (hasCharm("crown") && h === results.length) xmult("crown", 3);
  if (hasCharm("twin") && h === t) xmult("twin", 2);
  if (hasCharm("zigzag") && patName === "Zigzag") xmult("zigzag", 2);
  if (hasCharm("overkill") && S.flipsLeft === 0) xmult("overkill", 2);

  return { pattern: patName, level: lvl, chips, mult, total: Math.floor(chips * mult), steps };
}

// ---------- Round transitions ----------
// flip/reroll return the toss outcome without applying it, so the UI can
// animate first; commitFlip/commitReroll apply it. Headless callers just
// call both back to back.

function canFlip() { return !!S && !S.results && !S.pendingToss && S.flipsLeft > 0; }

function flip() {
  if (!canFlip()) return null;
  S.flipsLeft -= 1;
  S.rerolledIdx.clear();
  S.pendingToss = true;
  return S.coins.map(c => tossCoin(c));
}

function commitFlip(results) {
  S.results = results;
  S.pendingToss = false;
}

function canReroll() {
  return !!(S && S.results && !S.pendingToss && S.rerollsLeft > 0
    && [...S.selected].some(i => !isCoinLocked(i)));
}

function reroll() {
  if (!canReroll()) return null;
  const free = hasCharm("gambler") && Math.random() < 0.25;
  if (!free) S.rerollsLeft -= 1;
  const indices = [...S.selected].filter(i => !isCoinLocked(i));
  indices.forEach(i => S.rerolledIdx.add(i));
  S.pendingToss = true;
  return { indices, results: indices.map(i => tossCoin(S.coins[i])), free };
}

function commitReroll(indices, results) {
  indices.forEach((idx, k) => { S.results[idx] = results[k]; });
  S.selected.clear();
  S.pendingToss = false;
}

// Scores the current toss. Returns { sc, outcome: "win"|"lose"|"continue" }.
// Accepts a precomputed score so the UI can animate the exact breakdown.
function scoreToss(sc) {
  if (!S.results) return null;
  sc = sc || computeScore(S.results);
  S.roundScore += sc.total;
  S.tossesScored += 1;
  S.bestToss = Math.max(S.bestToss, sc.total);
  S.results = null;
  S.selected.clear();
  S.rerolledIdx.clear();
  const outcome = S.roundScore >= blindInfo().target ? "win"
    : (S.flipsLeft <= 0 ? "lose" : "continue");
  return { sc, outcome };
}

// Pays out the beaten blind. Returns { cash, gameWon }.
function winBlind() {
  const b = blindInfo();
  let cash = b.reward + S.flipsLeft + Math.min(interestCap(), Math.floor(S.money / 5));
  if (hasCharm("banker")) cash += 3;
  S.money += cash;
  return { cash, gameWon: S.blind === 2 && S.ante === 7 };
}

function advanceBlind() {
  S.blind += 1;
  if (S.blind > 2) { S.blind = 0; S.ante += 1; }
  S.inShop = false;
  startRound();
}

// ---------- Shop ----------

function pick(arr, n) {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

function omenCost(name) { return 4 + patternLevel(name); }

function rollShopStock() {
  const owned = new Set(S.charms.map(c => c.id));
  const pool = new Set(S.charmPool);
  S.shopStock = {
    charms: pick(CHARMS.filter(c => pool.has(c.id) && !owned.has(c.id)), 2),
    coins: pick(Object.keys(COIN_TYPES).filter(k => k !== "standard"), 2),
    omens: pick(Object.keys(PATTERNS), 2),
  };
}

// Fresh shop visit: new stock and the Crucible relights.
function enterShop() {
  rollShopStock();
  S.inShop = true;
  S.meltUsed = false;
  S.meltMode = false;
}

function rerollShop() {
  if (S.money < SHOP_REROLL_COST) return false;
  S.money -= SHOP_REROLL_COST;
  rollShopStock();
  S.meltMode = false;
  return true;
}

function buyCharm(i) {
  const c = S.shopStock.charms[i];
  if (!c || S.money < c.cost || S.charms.length >= MAX_CHARMS) return false;
  S.money -= c.cost;
  S.charms.push(c);
  S.shopStock.charms[i] = null;
  return true;
}

function buyCoin(i) {
  const key = S.shopStock.coins[i];
  if (!key || S.money < COIN_TYPES[key].cost || S.coins.length >= MAX_COINS) return false;
  S.money -= COIN_TYPES[key].cost;
  S.coins.push({ type: key });
  S.shopStock.coins[i] = null;
  return true;
}

function buyOmen(i) {
  const name = S.shopStock.omens[i];
  if (!name || S.money < omenCost(name)) return false;
  S.money -= omenCost(name);
  S.patternLevels[name] = patternLevel(name) + 1;
  S.shopStock.omens[i] = null;
  return true;
}

function canMelt() { return !S.meltUsed && S.coins.length > MIN_COINS; }

function meltCoin(i) {
  if (!canMelt() || i < 0 || i >= S.coins.length) return false;
  S.coins.splice(i, 1);
  S.money += 1;
  S.meltUsed = true;
  S.meltMode = false;
  return true;
}

// ---------- Save / load ----------

const SAVE_VERSION = 1;

function exportState() {
  if (!S || S.pendingToss) return null;
  return JSON.stringify({
    v: SAVE_VERSION,
    ...S,
    selected: [...S.selected],
    rerolledIdx: [...S.rerolledIdx],
    charms: S.charms.map(c => c.id),
    boss: S.boss ? S.boss.id : null,
    shopStock: S.shopStock ? {
      charms: S.shopStock.charms.map(c => (c ? c.id : null)),
      coins: [...S.shopStock.coins],
      omens: [...S.shopStock.omens],
    } : null,
  });
}

function importState(json) {
  let d;
  try { d = JSON.parse(json); } catch { return null; }
  if (!d || d.v !== SAVE_VERSION || !Array.isArray(d.coins) || !d.pouch) return null;
  const charmById = id => CHARMS.find(c => c.id === id);
  S = {
    ...d,
    selected: new Set(d.selected),
    rerolledIdx: new Set(d.rerolledIdx),
    charms: d.charms.map(charmById).filter(Boolean),
    boss: d.boss ? BOSSES.find(b => b.id === d.boss) || null : null,
    shopStock: d.shopStock ? {
      charms: d.shopStock.charms.map(id => (id ? charmById(id) || null : null)),
      coins: [...d.shopStock.coins],
      omens: [...d.shopStock.omens],
    } : null,
    pendingToss: false,
  };
  delete S.v;
  return S;
}

// ---------- Node export (browser loads this as a plain script) ----------

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    COIN_TYPES, CHARMS, PATTERNS, ANTE_BASE, BLINDS, BOSSES, POUCHES,
    MIN_COINS, MAX_COINS, MAX_CHARMS, SHOP_REROLL_COST, CHARM_POOL_SIZE,
    getState, newRun, startRound, hasCharm, blindInfo, headsProbFor, tossCoin,
    isCoinLocked, evalPattern, patternLevel, patternValues, interestCap, computeScore,
    canFlip, flip, commitFlip, canReroll, reroll, commitReroll, scoreToss,
    winBlind, advanceBlind,
    omenCost, rollShopStock, enterShop, rerollShop,
    buyCharm, buyCoin, buyOmen, canMelt, meltCoin,
    exportState, importState,
  };
}
