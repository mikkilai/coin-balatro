"use strict";

// All DOM rendering, animation, and input wiring. Game rules live in
// logic.js, loaded before this file; its top-level bindings (S via
// getState(), the action functions, the data tables) are visible here.

let busy = false; // true while a flip animation is running

// ---------- Rendering ----------

function el(id) { return document.getElementById(id); }
function fmt(n) { return n.toLocaleString("en-US"); }

function faceChar(r) { return r === "H" ? "♛" : r === "T" ? "🐍" : "◈"; }

function render() {
  const S = getState();
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
  el("charm-count").textContent = `${S.charms.length}/${MAX_CHARMS}`;

  // Charms
  const ch = el("charms");
  ch.innerHTML = "";
  S.charms.forEach(c => {
    const d = document.createElement("div");
    d.className = "charm";
    d.innerHTML = `<div class="charm-name">${c.name}</div><div class="charm-desc">${c.desc}</div>`;
    ch.appendChild(d);
  });
  for (let i = S.charms.length; i < MAX_CHARMS; i++) {
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
      if (!S.results || busy) return;
      if (S.selected.has(i)) S.selected.delete(i); else S.selected.add(i);
      render();
    };
    co.appendChild(d);
  });

  // Calc preview
  if (S.results) {
    const sc = computeScore(S.results);
    el("pattern-name").textContent = sc.pattern + (sc.level > 1 ? ` lv.${sc.level}` : "");
    el("calc-chips").textContent = fmt(sc.chips);
    el("calc-mult").textContent = fmt(sc.mult);
  } else {
    el("pattern-name").textContent = "—";
    el("calc-chips").textContent = "0";
    el("calc-mult").textContent = "0";
  }

  // Buttons & hint
  el("btn-flip").disabled = busy || !canFlip();
  el("btn-reroll").disabled = busy || !canReroll();
  el("btn-reroll").textContent = S.selected.size ? `Reroll ${S.selected.size} Coin${S.selected.size > 1 ? "s" : ""}` : "Reroll Selected";
  el("btn-score").disabled = busy || !S.results;
  el("flip-hint").textContent = S.results
    ? "Click coins to select them for a reroll, or Score this toss"
    : (S.flipsLeft > 0 ? "Flip your coins!" : "Out of flips...");
}

function renderShop(banner) {
  const S = getState();
  el("shop-money").textContent = (banner ? banner + " — " : "") + "$" + S.money;
  const sc = el("shop-charms");
  sc.innerHTML = "";
  S.shopStock.charms.forEach((c, i) => {
    const d = document.createElement("div");
    if (!c) { d.className = "shop-item sold"; d.textContent = "SOLD"; }
    else {
      const afford = S.money >= c.cost && S.charms.length < MAX_CHARMS;
      d.className = "shop-item charm-item" + (afford ? "" : " cant");
      d.innerHTML = `<div class="charm-name">${c.name}</div><div class="charm-desc">${c.desc}</div><div class="price">$${c.cost}</div>`;
      d.onclick = () => { if (buyCharm(i)) { renderShop(); render(); } };
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
      const afford = S.money >= ct.cost && S.coins.length < MAX_COINS;
      d.className = `shop-item coin-item ${k}` + (afford ? "" : " cant");
      d.innerHTML = `<div class="charm-name">${ct.name}</div><div class="charm-desc">${ct.desc}</div><div class="price">$${ct.cost}</div>`;
      d.onclick = () => { if (buyCoin(i)) { renderShop(); render(); } };
    }
    sn.appendChild(d);
  });

  const so = el("shop-omens");
  so.innerHTML = "";
  S.shopStock.omens.forEach((name, i) => {
    const d = document.createElement("div");
    if (!name) { d.className = "shop-item sold"; d.textContent = "SOLD"; }
    else {
      const p = PATTERNS[name];
      const lv = patternLevel(name);
      const cost = omenCost(name);
      const afford = S.money >= cost;
      d.className = "shop-item omen-item" + (afford ? "" : " cant");
      d.innerHTML = `<div class="charm-name">${name} lv.${lv} → lv.${lv + 1}</div>` +
        `<div class="charm-desc">+${p.upChips} base Chips, +${p.upMult} base Mult</div><div class="price">$${cost}</div>`;
      d.onclick = () => { if (buyOmen(i)) { renderShop(); render(); } };
    }
    so.appendChild(d);
  });

  // Melt service
  const sv = el("shop-melt");
  sv.innerHTML = "";
  if (!S.meltMode) {
    const d = document.createElement("div");
    if (S.meltUsed) { d.className = "shop-item sold"; d.textContent = "CRUCIBLE COOLING"; }
    else {
      d.className = "shop-item melt-item" + (canMelt() ? "" : " cant");
      d.innerHTML = `<div class="charm-name">Melt a Coin</div><div class="charm-desc">Remove a coin from your purse for +$1. ` +
        `Fewer coins = more consistent patterns. (min ${MIN_COINS} coins, once per shop)</div><div class="price">+$1</div>`;
      if (canMelt()) d.onclick = () => { S.meltMode = true; renderShop(); };
    }
    sv.appendChild(d);
  } else {
    S.coins.forEach((coin, i) => {
      const ct = COIN_TYPES[coin.type];
      const d = document.createElement("div");
      d.className = `shop-item coin-item ${coin.type} melt-pick`;
      d.innerHTML = `<div class="charm-name">🔥 ${ct.name}</div><div class="charm-desc">${ct.desc}</div>`;
      d.onclick = () => { if (meltCoin(i)) { renderShop(); render(); } };
      sv.appendChild(d);
    });
    const cancel = document.createElement("div");
    cancel.className = "shop-item sold";
    cancel.textContent = "CANCEL";
    cancel.style.cursor = "pointer";
    cancel.onclick = () => { S.meltMode = false; renderShop(); };
    sv.appendChild(cancel);
  }
}

// ---------- Game flow ----------

function doFlip() {
  if (busy) return;
  const results = flip();
  if (!results) return;
  busy = true;
  render();
  animateFlip(getState().coins.map((_, i) => i), () => {
    commitFlip(results);
    busy = false;
    render();
  });
}

function doReroll() {
  if (busy) return;
  const rr = reroll();
  if (!rr) return;
  busy = true;
  render();
  animateFlip(rr.indices, () => {
    commitReroll(rr.indices, rr.results);
    busy = false;
    render();
    if (rr.free) el("flip-hint").textContent = "Loose Thumb! That reroll was free.";
  });
}

function doScore() {
  if (busy) return;
  const out = scoreToss();
  if (!out) return;
  popScore(out.sc);
  if (out.outcome === "win") setTimeout(handleWin, 900);
  else if (out.outcome === "lose") setTimeout(() => showEnd(false), 900);
  render();
}

function handleWin() {
  const { cash, gameWon } = winBlind();
  if (gameWon) { showEnd(true); return; }
  enterShop();
  el("shop").classList.remove("hidden");
  renderShop(`Blind beaten! +$${cash}`);
}

function showEnd(won) {
  const S = getState();
  el("end-title").textContent = won ? "YOU WIN!" : "Game Over";
  el("end-detail").textContent = won
    ? "You conquered all 8 Antes. The coin gods smile upon you."
    : `Defeated on Ante ${S.ante + 1} — ${blindInfo().name} (needed ${fmt(blindInfo().target)}, scored ${fmt(S.roundScore)}).`;
  el("gameover").classList.remove("hidden");
}

// ---------- Tutorial ----------

const TUT_PATTERN_HINTS = {
  "Full Crown": "Every coin shows Heads",
  "Serpent Hoard": "Every coin shows Tails",
  "Zigzag": "Heads and Tails perfectly alternate (4+ coins)",
  "Near Crown": "All Heads except one",
  "Near Hoard": "All Tails except one",
  "Perfect Balance": "Heads and Tails are tied",
  "Heads Lean": "More Heads than Tails",
  "Tails Lean": "More Tails than Heads",
};

function renderTutorialPatterns() {
  const tbody = el("tut-patterns");
  tbody.innerHTML = "";
  for (const [name, p] of Object.entries(PATTERNS)) {
    const inRun = !!getState();
    const lv = inRun ? patternLevel(name) : 1;
    const v = inRun ? patternValues(name) : { chips: p.chips, mult: p.mult };
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${name}${lv > 1 ? ` <span class="lv">lv.${lv}</span>` : ""}</td>` +
      `<td>${TUT_PATTERN_HINTS[name]}</td><td class="num">${v.chips} × ${v.mult}</td>`;
    tbody.appendChild(tr);
  }
}

function openTutorial() {
  renderTutorialPatterns();
  el("tutorial").classList.remove("hidden");
}

// ---------- Animation ----------

function animateFlip(indices, done) {
  const coinEls = document.querySelectorAll("#coins .coin");
  indices.forEach(i => {
    const e = coinEls[i];
    if (!e) return;
    e.classList.remove("landed", "heads", "tails", "edge", "selected", "resting");
    e.classList.add("flipping");
    e.querySelector(".coin-face").textContent = "";
  });
  setTimeout(done, 650);
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
el("btn-start").onclick = () => { el("intro").classList.add("hidden"); newRun(); render(); };
el("btn-restart").onclick = () => { el("gameover").classList.add("hidden"); newRun(); render(); };
el("btn-next-round").onclick = () => { el("shop").classList.add("hidden"); advanceBlind(); render(); };
el("btn-shop-reroll").onclick = () => { if (rerollShop()) renderShop(); };
el("btn-help").onclick = openTutorial;
el("btn-tutorial-close").onclick = () => el("tutorial").classList.add("hidden");
el("tutorial").onclick = e => { if (e.target === el("tutorial")) el("tutorial").classList.add("hidden"); };

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { el("tutorial").classList.add("hidden"); return; }
  if (e.key === "?") { openTutorial(); return; }
  if (!getState() || document.querySelector(".overlay:not(.hidden)")) return;
  if (e.key === "f") doFlip();
  if (e.key === "r") doReroll();
  if (e.key === "s" || e.key === "Enter") doScore();
});
