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
];

const MIN_COINS = 3;
const MAX_COINS = 8;
const MAX_CHARMS = 5;
const SHOP_REROLL_COST = 2;

// ---------- State ----------

let S = null;

function getState() { return S; }

function newRun() {
  S = {
    ante: 0, blind: 0, money: 4,
    coins: Array.from({ length: 5 }, () => ({ type: "standard" })),
    charms: [],
    patternLevels: {},
    roundScore: 0, flipsLeft: 0, rerollsLeft: 0, tossesScored: 0,
    results: null,        // array of "H"|"T"|"E" after a flip, null between tosses
    pendingToss: false,   // a flip/reroll is awaiting its commit
    rerolledIdx: new Set(),
    selected: new Set(),
    boss: null,
    shopStock: null,
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

function startRound() {
  S.roundScore = 0;
  S.tossesScored = 0;
  S.flipsLeft = 4 + (hasCharm("stamina") ? 1 : 0);
  S.rerollsLeft = 3 + (hasCharm("patience") ? 1 : 0);
  S.results = null;
  S.pendingToss = false;
  S.selected.clear();
  S.rerolledIdx.clear();
  S.boss = S.blind === 2 ? BOSSES[(S.ante * 7 + 3) % BOSSES.length] : null;
  if (S.boss && S.boss.id === "hurry") S.flipsLeft -= 1;
}

// ---------- Coin physics ----------

function headsProbFor(coin) {
  let p = COIN_TYPES[coin.type].headsProb;
  if (hasCharm("fortune")) p += 0.05;
  if (S.boss && S.boss.id === "gravity") p -= 0.20;
  return Math.min(0.95, Math.max(0.05, p));
}

function tossCoin(coin) {
  if (hasCharm("edge") && Math.random() < 1 / 12) return "E";
  return Math.random() < headsProbFor(coin) ? "H" : "T";
}

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

function computeScore(results) {
  const patName = evalPattern(results);
  const pat = patternValues(patName);
  let chips = pat.chips;
  if (S.boss && S.boss.id === "miser") chips = Math.floor(chips / 2);
  let mult = pat.mult;
  const xmults = [];
  const censor = S.boss && S.boss.id === "censor";
  const edgeBonus = hasCharm("alchemy") ? 100 : 50;

  results.forEach((r, i) => {
    const ct = COIN_TYPES[S.coins[i].type];
    if (r === "H" || r === "E") { chips += ct.headsChips; mult += ct.headsMult; }
    if (r === "T" || r === "E") { if (!censor) chips += ct.tailsChips; mult += ct.tailsMult; }
    if (r === "E") chips += edgeBonus;
    if (S.rerolledIdx.has(i) && hasCharm("magnet")) chips += 10;
  });

  const h = results.filter(r => r === "H" || r === "E").length;
  const t = results.filter(r => r === "T" || r === "E").length;
  if (hasCharm("lint")) mult += 4;
  if (hasCharm("hunter")) chips += 15 * h;
  if (hasCharm("tailwind")) mult += 2 * t;
  if (hasCharm("echo")) mult += S.tossesScored;
  if (hasCharm("feather") && S.coins.length <= 4) chips += 40;
  if (hasCharm("hoarder")) chips += Math.min(20, S.money);
  if (hasCharm("streak")) {
    let run = 0, best = 0;
    for (const r of results) { run = (r === "H" || r === "E") ? run + 1 : 0; best = Math.max(best, run); }
    if (best >= 3) chips += 25;
  }
  if (hasCharm("crown") && h === results.length) xmults.push(3);
  if (hasCharm("twin") && h === t) xmults.push(2);
  if (hasCharm("zigzag") && patName === "Zigzag") xmults.push(2);
  if (hasCharm("overkill") && S.flipsLeft === 0) xmults.push(2);

  let total = chips * mult;
  for (const x of xmults) { mult *= x; total = chips * mult; }
  return { pattern: patName, level: patternLevel(patName), chips, mult, total: Math.floor(total) };
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

function canReroll() { return !!(S && S.results && !S.pendingToss && S.rerollsLeft > 0 && S.selected.size > 0); }

function reroll() {
  if (!canReroll()) return null;
  const free = hasCharm("gambler") && Math.random() < 0.25;
  if (!free) S.rerollsLeft -= 1;
  const indices = [...S.selected];
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
function scoreToss() {
  if (!S.results) return null;
  const sc = computeScore(S.results);
  S.roundScore += sc.total;
  S.tossesScored += 1;
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
  S.shopStock = {
    charms: pick(CHARMS.filter(c => !owned.has(c.id)), 2),
    coins: pick(Object.keys(COIN_TYPES).filter(k => k !== "standard"), 2),
    omens: pick(Object.keys(PATTERNS), 2),
  };
}

// Fresh shop visit: new stock and the Crucible relights.
function enterShop() {
  rollShopStock();
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

// ---------- Node export (browser loads this as a plain script) ----------

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    COIN_TYPES, CHARMS, PATTERNS, ANTE_BASE, BLINDS, BOSSES,
    MIN_COINS, MAX_COINS, MAX_CHARMS, SHOP_REROLL_COST,
    getState, newRun, startRound, hasCharm, blindInfo, headsProbFor, tossCoin,
    evalPattern, patternLevel, patternValues, interestCap, computeScore,
    canFlip, flip, commitFlip, canReroll, reroll, commitReroll, scoreToss,
    winBlind, advanceBlind,
    omenCost, rollShopStock, enterShop, rerollShop,
    buyCharm, buyCoin, buyOmen, canMelt, meltCoin,
  };
}
