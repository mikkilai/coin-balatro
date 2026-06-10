"use strict";

// All DOM rendering, animation, sound, and input wiring. Game rules live in
// logic.js, loaded before this file; its top-level bindings (getState(), the
// action functions, the data tables) are visible here.

let busy = false; // true while a flip or scoring animation is running

const SAVE_KEY = "flipjack-save";
const STATS_KEY = "flipjack-stats";
const MUTE_KEY = "flipjack-muted";

// ---------- Sound (tiny Web Audio synth, no assets) ----------

const Sfx = (() => {
  let ctx = null;
  let muted = localStorage.getItem(MUTE_KEY) === "1";
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function blip(freq, dur = 0.08, type = "square", gain = 0.04, when = 0) {
    if (muted) return;
    try {
      const a = ac(), o = a.createOscillator(), g = a.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain, a.currentTime + when);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + when + dur);
      o.connect(g).connect(a.destination);
      o.start(a.currentTime + when);
      o.stop(a.currentTime + when + dur);
    } catch { /* audio unavailable */ }
  }
  return {
    get muted() { return muted; },
    toggle() { muted = !muted; localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); return muted; },
    flip()   { blip(196, 0.06, "triangle", 0.05); blip(294, 0.06, "triangle", 0.05, 0.06); },
    land()   { blip(660, 0.04, "square", 0.03); },
    select() { blip(440, 0.03, "square", 0.025); },
    tick(i)  { blip(440 + Math.min(i, 14) * 55, 0.05, "square", 0.03); },
    xmult()  { blip(880, 0.1, "sawtooth", 0.045); blip(1175, 0.12, "sawtooth", 0.04, 0.07); },
    score()  { blip(523, 0.08, "triangle", 0.05); blip(659, 0.08, "triangle", 0.05, 0.08); blip(784, 0.14, "triangle", 0.05, 0.16); },
    win()    { [523, 659, 784, 1047, 1319].forEach((f, i) => blip(f, 0.16, "triangle", 0.05, i * 0.11)); },
    lose()   { [392, 330, 262, 196].forEach((f, i) => blip(f, 0.2, "sawtooth", 0.035, i * 0.16)); },
    buy()    { blip(988, 0.06, "square", 0.04); blip(1319, 0.1, "square", 0.04, 0.06); },
    melt()   { blip(220, 0.25, "sawtooth", 0.04); blip(110, 0.3, "sawtooth", 0.035, 0.1); },
  };
})();

// ---------- Persistence ----------

function saveGame() {
  const json = exportState();
  if (json) localStorage.setItem(SAVE_KEY, json);
}

function clearSave() { localStorage.removeItem(SAVE_KEY); }

function loadStats() {
  try {
    return { runs: 0, wins: 0, bestAnte: 0, bestToss: 0, ...JSON.parse(localStorage.getItem(STATS_KEY) || "{}") };
  } catch { return { runs: 0, wins: 0, bestAnte: 0, bestToss: 0 }; }
}

function recordRun(won) {
  const S = getState();
  const stats = loadStats();
  stats.runs += 1;
  if (won) stats.wins += 1;
  stats.bestAnte = Math.max(stats.bestAnte, won ? 8 : S.ante + 1);
  stats.bestToss = Math.max(stats.bestToss, S.bestToss);
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  return stats;
}

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
    d.dataset.charm = c.id;
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
    const locked = isCoinLocked(i);
    const d = document.createElement("div");
    d.className = `coin ${coin.type}` + (r ? ` landed ${r === "H" ? "heads" : r === "T" ? "tails" : "edge"}` : " resting")
      + (S.selected.has(i) ? " selected" : "") + (locked ? " locked" : "");
    d.dataset.i = i;
    d.innerHTML = `<div class="coin-face">${r ? faceChar(r) : "?"}</div>`
      + (locked ? `<div class="coin-lock">🔒</div>` : "")
      + `<div class="coin-label">${ct.name}</div>`;
    d.title = locked ? `${ct.desc} — locked by ${S.boss.name}` : ct.desc;
    d.onclick = () => {
      if (!S.results || busy || locked) return;
      if (S.selected.has(i)) S.selected.delete(i); else S.selected.add(i);
      Sfx.select();
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
  const selCount = [...S.selected].filter(i => !isCoinLocked(i)).length;
  el("btn-reroll").textContent = selCount ? `Reroll ${selCount} Coin${selCount > 1 ? "s" : ""}` : "Reroll Selected";
  el("btn-score").disabled = busy || !S.results;
  el("flip-hint").textContent = S.results
    ? "Click coins to select them for a reroll, or Score this toss"
    : (S.flipsLeft > 0 ? "Flip your coins!" : "Out of flips...");

  saveGame();
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
      d.onclick = () => { if (buyCharm(i)) { Sfx.buy(); renderShop(); render(); } };
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
      d.onclick = () => { if (buyCoin(i)) { Sfx.buy(); renderShop(); render(); } };
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
      d.onclick = () => { if (buyOmen(i)) { Sfx.buy(); renderShop(); render(); } };
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
      d.onclick = () => { if (meltCoin(i)) { Sfx.melt(); renderShop(); render(); } };
      sv.appendChild(d);
    });
    const cancel = document.createElement("div");
    cancel.className = "shop-item sold";
    cancel.textContent = "CANCEL";
    cancel.style.cursor = "pointer";
    cancel.onclick = () => { S.meltMode = false; renderShop(); };
    sv.appendChild(cancel);
  }

  saveGame();
}

// ---------- Game flow ----------

function doFlip() {
  if (busy) return;
  const results = flip();
  if (!results) return;
  busy = true;
  Sfx.flip();
  render();
  animateFlip(getState().coins.map((_, i) => i), () => {
    commitFlip(results);
    busy = false;
    Sfx.land();
    render();
  });
}

function doReroll() {
  if (busy) return;
  const rr = reroll();
  if (!rr) return;
  busy = true;
  Sfx.flip();
  render();
  animateFlip(rr.indices, () => {
    commitReroll(rr.indices, rr.results);
    busy = false;
    Sfx.land();
    render();
    if (rr.free) el("flip-hint").textContent = "Loose Thumb! That reroll was free.";
  });
}

async function doScore() {
  const S = getState();
  if (busy || !S.results) return;
  busy = true;
  render();
  const sc = computeScore(S.results);
  await animateScore(sc);
  const out = scoreToss(sc);
  busy = false;
  popScore(out.sc);
  Sfx.score();
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
  const stats = recordRun(won);
  clearSave();
  if (won) Sfx.win(); else Sfx.lose();
  el("end-title").textContent = won ? "YOU WIN!" : "Game Over";
  el("end-detail").textContent = won
    ? "You conquered all 8 Antes. The coin gods smile upon you."
    : `Defeated on Ante ${S.ante + 1} — ${blindInfo().name} (needed ${fmt(blindInfo().target)}, scored ${fmt(S.roundScore)}).`;
  el("end-stats").innerHTML =
    `<div class="end-stat"><span>This run's best toss</span><b>${fmt(S.bestToss)}</b></div>` +
    `<div class="end-stat"><span>Antes reached</span><b>${won ? 8 : S.ante + 1}/8</b></div>` +
    `<div class="end-stat"><span>Lifetime</span><b>${stats.wins} win${stats.wins === 1 ? "" : "s"} / ${stats.runs} run${stats.runs === 1 ? "" : "s"}</b></div>` +
    `<div class="end-stat"><span>All-time best toss</span><b>${fmt(stats.bestToss)}</b></div>`;
  el("gameover").classList.remove("hidden");
}

// ---------- Intro / pouch selection ----------

function renderIntro() {
  const pc = el("pouches");
  pc.innerHTML = "";
  POUCHES.forEach(p => {
    const d = document.createElement("div");
    d.className = "pouch";
    const contents = p.coins.map(t => COIN_TYPES[t].name).reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {});
    const list = Object.entries(contents).map(([n, c]) => `${c}× ${n}`).join(", ");
    d.innerHTML = `<div class="charm-name">${p.name}</div><div class="charm-desc">${p.desc}</div>` +
      `<div class="pouch-contents">${list}</div>`;
    d.onclick = () => {
      el("intro").classList.add("hidden");
      newRun(p.id);
      render();
    };
    pc.appendChild(d);
  });

  const save = localStorage.getItem(SAVE_KEY);
  const canResume = !!(save && importPreview(save));
  el("btn-continue").classList.toggle("hidden", !canResume);

  const stats = loadStats();
  el("intro-stats").textContent = stats.runs
    ? `${stats.wins} win${stats.wins === 1 ? "" : "s"} in ${stats.runs} run${stats.runs === 1 ? "" : "s"} · best ante ${stats.bestAnte} · best toss ${fmt(stats.bestToss)}`
    : "";
}

// Validate a save without clobbering current state.
function importPreview(json) {
  try {
    const d = JSON.parse(json);
    return d && d.v === 1 && Array.isArray(d.coins) && d.pouch;
  } catch { return false; }
}

function resumeGame() {
  const restored = importState(localStorage.getItem(SAVE_KEY) || "");
  if (!restored) { clearSave(); renderIntro(); return; }
  el("intro").classList.add("hidden");
  if (restored.inShop && restored.shopStock) {
    el("shop").classList.remove("hidden");
    renderShop("Welcome back");
  }
  render();
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

function pulse(e) {
  if (!e) return;
  e.classList.remove("pulsing");
  void e.offsetWidth; // restart the animation
  e.classList.add("pulsing");
}

function chipPop(e, chips, mult) {
  if (!e || (!chips && !mult)) return;
  const p = document.createElement("div");
  p.className = "chip-pop";
  p.innerHTML = (chips ? `<span class="cp-chips">+${chips}</span>` : "")
    + (mult ? `<span class="cp-mult">+${mult}×</span>` : "");
  e.appendChild(p);
  setTimeout(() => p.remove(), 700);
}

// Walks the score breakdown step by step, ticking up the Chips × Mult panel.
async function animateScore(sc) {
  const S = getState();
  const coinEls = document.querySelectorAll("#coins .coin");
  let chips = 0, mult = 0, k = 0;
  for (const st of sc.steps) {
    if (st.kind === "pattern") {
      chips = st.chips; mult = st.mult;
      el("pattern-name").textContent = st.label;
      pulse(el("pattern-name"));
    } else if (st.kind === "coin") {
      chips += st.chips; mult += st.mult;
      pulse(coinEls[st.i]);
      chipPop(coinEls[st.i], st.chips, st.mult);
      if (st.chips || st.mult) Sfx.tick(k++);
    } else if (st.kind === "charm") {
      chips += st.chips; mult += st.mult;
      const ce = document.querySelector(`#charms .charm[data-charm="${st.id}"]`);
      pulse(ce);
      chipPop(ce, st.chips, st.mult);
      Sfx.tick(k++);
    } else if (st.kind === "xmult") {
      mult *= st.x;
      const ce = document.querySelector(`#charms .charm[data-charm="${st.id}"]`);
      pulse(ce);
      pulse(el("calc-mult").parentElement);
      Sfx.xmult();
    }
    el("calc-chips").textContent = fmt(chips);
    el("calc-mult").textContent = fmt(mult);
    if (st.kind !== "coin" || st.chips || st.mult) await sleep(st.kind === "pattern" ? 300 : 170);
  }
  await sleep(200);
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
el("btn-continue").onclick = resumeGame;
el("btn-restart").onclick = () => {
  el("gameover").classList.add("hidden");
  renderIntro();
  el("intro").classList.remove("hidden");
};
el("btn-next-round").onclick = () => { el("shop").classList.add("hidden"); advanceBlind(); render(); };
el("btn-shop-reroll").onclick = () => { if (rerollShop()) renderShop(); };
el("btn-help").onclick = openTutorial;
el("btn-mute").onclick = () => { el("btn-mute").textContent = Sfx.toggle() ? "🔇" : "🔊"; };
el("btn-mute").textContent = Sfx.muted ? "🔇" : "🔊";
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

renderIntro();
