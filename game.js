"use strict";

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
];

// Pattern table: f(headsEq, tailsEq, n) using edge-inclusive counts.
function evalPattern(results) {
  const n = results.length;
  const h = results.filter(r => r === "H" || r === "E").length;
  const t = results.filter(r => r === "T" || r === "E").length;
  const noEdge = results.every(r => r !== "E");
  const alternating = n >= 4 && noEdge && results.every((r, i) => i === 0 || r !== results[i - 1]);
  if (h === n) return { name: "Full Crown",    chips: 60, mult: 8 };
  if (t === n) return { name: "Serpent Hoard", chips: 50, mult: 6 };
  if (alternating)        return { name: "Zigzag",        chips: 40, mult: 6 };
  if (h === n - 1 && t <= 1) return { name: "Near Crown", chips: 30, mult: 4 };
  if (t === n - 1 && h <= 1) return { name: "Near Hoard", chips: 25, mult: 4 };
  if (h === t)            return { name: "Perfect Balance", chips: 25, mult: 3 };
  if (h > t)              return { name: "Heads Lean",    chips: 15, mult: 2 };
  return                         { name: "Tails Lean",    chips: 10, mult: 2 };
}

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

// ---------- State ----------

let S = null;

function newRun() {
  S = {
    ante: 0, blind: 0, money: 4,
    coins: Array.from({ length: 5 }, () => ({ type: "standard" })),
    charms: [],
    roundScore: 0, flipsLeft: 0, rerollsLeft: 0, tossesScored: 0,
    results: null,        // array of "H"|"T"|"E" after a flip, null between tosses
    rerolledIdx: new Set(),
    selected: new Set(),
    boss: null,
    shopStock: null,
    busy: false,
  };
  startRound();
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
  S.selected.clear();
  S.rerolledIdx.clear();
  S.boss = S.blind === 2 ? BOSSES[(S.ante * 7 + 3) % BOSSES.length] : null;
  if (S.boss && S.boss.id === "hurry") S.flipsLeft -= 1;
  render();
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

// ---------- Scoring ----------

function computeScore(results) {
  const pat = evalPattern(results);
  let chips = pat.chips;
  if (S.boss && S.boss.id === "miser") chips = Math.floor(pat.chips / 2);
  let mult = pat.mult;
  const xmults = [];
  const censor = S.boss && S.boss.id === "censor";

  results.forEach((r, i) => {
    const ct = COIN_TYPES[S.coins[i].type];
    if (r === "H" || r === "E") { chips += censor && r === "E" ? 0 : ct.headsChips; mult += ct.headsMult; }
    if (r === "T" || r === "E") { if (!censor) chips += ct.tailsChips; mult += ct.tailsMult; }
    if (r === "E") chips += 50;
    if (S.rerolledIdx.has(i) && hasCharm("magnet")) chips += 10;
  });

  const h = results.filter(r => r === "H" || r === "E").length;
  const t = results.filter(r => r === "T" || r === "E").length;
  if (hasCharm("lint")) mult += 4;
  if (hasCharm("hunter")) chips += 15 * h;
  if (hasCharm("tailwind")) mult += 2 * t;
  if (hasCharm("echo")) mult += S.tossesScored;
  if (hasCharm("crown") && h === results.length) xmults.push(3);
  if (hasCharm("twin") && h === t) xmults.push(2);

  let total = chips * mult;
  for (const x of xmults) { mult *= x; total = chips * mult; }
  return { pattern: pat.name, chips, mult, total: Math.floor(total) };
}

// ---------- Actions ----------

function doFlip() {
  if (S.busy || S.flipsLeft <= 0 || S.results) return;
  S.busy = true;
  S.flipsLeft -= 1;
  S.rerolledIdx.clear();
  animateFlip(S.coins.map((_, i) => i), S.coins.map(c => tossCoin(c)), results => {
    S.results = results;
    S.busy = false;
    render();
  });
}

function doReroll() {
  if (S.busy || !S.results || S.rerollsLeft <= 0 || S.selected.size === 0) return;
  S.busy = true;
  S.rerollsLeft -= 1;
  const idx = [...S.selected];
  idx.forEach(i => S.rerolledIdx.add(i));
  const fresh = idx.map(i => tossCoin(S.coins[i]));
  animateFlip(idx, fresh, () => {
    idx.forEach((i, k) => { S.results[i] = fresh[k]; });
    S.selected.clear();
    S.busy = false;
    render();
  });
}

function doScore() {
  if (S.busy || !S.results) return;
  const sc = computeScore(S.results);
  S.roundScore += sc.total;
  S.tossesScored += 1;
  S.results = null;
  S.selected.clear();
  S.rerolledIdx.clear();
  popScore(sc);

  const { target } = blindInfo();
  if (S.roundScore >= target) {
    setTimeout(winBlind, 900);
  } else if (S.flipsLeft <= 0) {
    setTimeout(() => endRun(false), 900);
  }
  render();
}

function winBlind() {
  const b = blindInfo();
  let cash = b.reward + S.flipsLeft + Math.min(5, Math.floor(S.money / 5));
  if (hasCharm("banker")) cash += 3;
  S.money += cash;
  if (S.blind === 2 && S.ante === 7) { endRun(true); return; }
  openShop(cash);
}

function advanceBlind() {
  S.blind += 1;
  if (S.blind > 2) { S.blind = 0; S.ante += 1; }
  startRound();
}

function endRun(won) {
  el("end-title").textContent = won ? "YOU WIN!" : "Game Over";
  el("end-detail").textContent = won
    ? "You conquered all 8 Antes. The coin gods smile upon you."
    : `Defeated on Ante ${S.ante + 1} — ${blindInfo().name} (needed ${fmt(blindInfo().target)}, scored ${fmt(S.roundScore)}).`;
  el("gameover").classList.remove("hidden");
}

// ---------- Shop ----------

function pick(arr, n) {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

function rollShopStock() {
  const owned = new Set(S.charms.map(c => c.id));
  S.shopStock = {
    charms: pick(CHARMS.filter(c => !owned.has(c.id)), 2),
    coins: pick(Object.keys(COIN_TYPES).filter(k => k !== "standard"), 2),
  };
}

function openShop(cash) {
  rollShopStock();
  el("shop").classList.remove("hidden");
  renderShop(`Blind beaten! +$${cash}`);
}

function buyCharm(i) {
  const c = S.shopStock.charms[i];
  if (!c || S.money < c.cost || S.charms.length >= 5) return;
  S.money -= c.cost;
  S.charms.push(c);
  S.shopStock.charms[i] = null;
  renderShop(); render();
}

function buyCoin(i) {
  const key = S.shopStock.coins[i];
  if (!key || S.money < COIN_TYPES[key].cost || S.coins.length >= 8) return;
  S.money -= COIN_TYPES[key].cost;
  S.coins.push({ type: key });
  S.shopStock.coins[i] = null;
  renderShop(); render();
}

// ---------- Rendering ----------

function el(id) { return document.getElementById(id); }
function fmt(n) { return n.toLocaleString("en-US"); }

function faceChar(r) { return r === "H" ? "♛" : r === "T" ? "🐍" : "◈"; }

function render() {
  const b = blindInfo();
  el("blind-name").textContent = S.boss ? S.boss.name : b.name;
  el("blind-name").classList.toggle("boss", !!S.boss);
  const bd = el("boss-desc");
  bd.classList.toggle("hidden", !S.boss);
  if (S.boss) bd.textContent = S.boss.desc;
  el("blind-target").textContent = fmt(b.target);
  el("blind-reward").textContent = "$" + b.reward;
  el("round-score").textContent = fmt(S.roundScore);
  el("flips-left").textContent = S.flipsLeft;
  el("rerolls-left").textContent = S.rerollsLeft;
  el("money").textContent = "$" + S.money;
  el("ante").textContent = `${S.ante + 1}/8`;
  el("charm-count").textContent = `${S.charms.length}/5`;

  // Charms
  const ch = el("charms");
  ch.innerHTML = "";
  S.charms.forEach(c => {
    const d = document.createElement("div");
    d.className = "charm";
    d.innerHTML = `<div class="charm-name">${c.name}</div><div class="charm-desc">${c.desc}</div>`;
    ch.appendChild(d);
  });
  for (let i = S.charms.length; i < 5; i++) {
    const d = document.createElement("div");
    d.className = "charm empty";
    ch.appendChild(d);
  }

  // Coins
  const co = el("coins");
  co.innerHTML = "";
  S.coins.forEach((coin, i) => {
    const ct = COIN_TYPES[coin.type];
    const r = S.results ? S.results[i] : null;
    const d = document.createElement("div");
    d.className = `coin ${coin.type}` + (r ? ` landed ${r === "H" ? "heads" : r === "T" ? "tails" : "edge"}` : " resting")
      + (S.selected.has(i) ? " selected" : "");
    d.dataset.i = i;
    d.innerHTML = `<div class="coin-face">${r ? faceChar(r) : "?"}</div><div class="coin-label">${ct.name}</div>`;
    d.title = ct.desc;
    d.onclick = () => {
      if (!S.results || S.busy) return;
      if (S.selected.has(i)) S.selected.delete(i); else S.selected.add(i);
      render();
    };
    co.appendChild(d);
  });

  // Calc preview
  if (S.results) {
    const sc = computeScore(S.results);
    el("pattern-name").textContent = sc.pattern;
    el("calc-chips").textContent = fmt(sc.chips);
    el("calc-mult").textContent = fmt(sc.mult);
  } else {
    el("pattern-name").textContent = "—";
    el("calc-chips").textContent = "0";
    el("calc-mult").textContent = "0";
  }

  // Buttons & hint
  el("btn-flip").disabled = S.busy || !!S.results || S.flipsLeft <= 0;
  el("btn-reroll").disabled = S.busy || !S.results || S.rerollsLeft <= 0 || S.selected.size === 0;
  el("btn-reroll").textContent = S.selected.size ? `Reroll ${S.selected.size} Coin${S.selected.size > 1 ? "s" : ""}` : "Reroll Selected";
  el("btn-score").disabled = S.busy || !S.results;
  el("flip-hint").textContent = S.results
    ? "Click coins to select them for a reroll, or Score this toss"
    : (S.flipsLeft > 0 ? "Flip your coins!" : "Out of flips...");
}

function renderShop(banner) {
  el("shop-money").textContent = (banner ? banner + " — " : "") + "$" + S.money;
  const sc = el("shop-charms");
  sc.innerHTML = "";
  S.shopStock.charms.forEach((c, i) => {
    const d = document.createElement("div");
    if (!c) { d.className = "shop-item sold"; d.textContent = "SOLD"; }
    else {
      const afford = S.money >= c.cost && S.charms.length < 5;
      d.className = "shop-item charm-item" + (afford ? "" : " cant");
      d.innerHTML = `<div class="charm-name">${c.name}</div><div class="charm-desc">${c.desc}</div><div class="price">$${c.cost}</div>`;
      d.onclick = () => buyCharm(i);
    }
    sc.appendChild(d);
  });
  const sn = el("shop-coins");
  sn.innerHTML = "";
  S.shopStock.coins.forEach((k, i) => {
    const d = document.createElement("div");
    if (!k) { d.className = "shop-item sold"; d.textContent = "SOLD"; }
    else {
      const ct = COIN_TYPES[k];
      const afford = S.money >= ct.cost && S.coins.length < 8;
      d.className = `shop-item coin-item ${k}` + (afford ? "" : " cant");
      d.innerHTML = `<div class="charm-name">${ct.name}</div><div class="charm-desc">${ct.desc}</div><div class="price">$${ct.cost}</div>`;
      d.onclick = () => buyCoin(i);
    }
    sn.appendChild(d);
  });
}

// ---------- Animation ----------

function animateFlip(indices, results, done) {
  const coinEls = document.querySelectorAll("#coins .coin");
  indices.forEach(i => {
    const e = coinEls[i];
    if (!e) return;
    e.classList.remove("landed", "heads", "tails", "edge", "selected", "resting");
    e.classList.add("flipping");
    e.querySelector(".coin-face").textContent = "";
  });
  setTimeout(() => done(results), 650);
}

function popScore(sc) {
  const p = document.createElement("div");
  p.className = "score-pop";
  p.innerHTML = `${sc.pattern}<br><b>+${fmt(sc.total)}</b>`;
  el("coins-area").appendChild(p);
  setTimeout(() => p.remove(), 1400);
}

// ---------- Wiring ----------

el("btn-flip").onclick = doFlip;
el("btn-reroll").onclick = doReroll;
el("btn-score").onclick = doScore;
el("btn-start").onclick = () => { el("intro").classList.add("hidden"); newRun(); };
el("btn-restart").onclick = () => { el("gameover").classList.add("hidden"); newRun(); };
el("btn-next-round").onclick = () => { el("shop").classList.add("hidden"); advanceBlind(); };
el("btn-shop-reroll").onclick = () => {
  if (S.money < 2) return;
  S.money -= 2;
  rollShopStock();
  renderShop();
};

document.addEventListener("keydown", e => {
  if (!S || document.querySelector(".overlay:not(.hidden)")) return;
  if (e.key === "f") doFlip();
  if (e.key === "r") doReroll();
  if (e.key === "s" || e.key === "Enter") doScore();
});
