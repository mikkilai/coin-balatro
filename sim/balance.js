#!/usr/bin/env node
"use strict";

// Balance simulation: plays full runs with simple bot strategies and reports
// how far each gets. A design tool, not a correctness test — but with
// --assert it enforces loose sanity bounds in CI (e.g. the early game must
// be winnable, no strategy should trivialize the whole run).
//
// Usage: node sim/balance.js [--runs N] [--assert]

const L = require("../logic.js");

// ---------- Toss tactics ----------

// Reroll every tails coin while rerolls remain, chasing Full Crown.
function chaseHeads(S) {
  while (S.rerollsLeft > 0) {
    const tails = S.results.map((r, i) => (r === "T" ? i : -1)).filter(i => i >= 0);
    if (tails.length === 0) break;
    S.selected = new Set(tails);
    const rr = L.reroll();
    if (!rr) break;
    L.commitReroll(rr.indices, rr.results);
  }
}

// ---------- Shop policies ----------

function buyEverything(S) {
  let bought = true;
  while (bought) {
    bought = false;
    for (let i = 0; i < 2; i++) {
      if (L.buyCharm(i)) bought = true;
      if (L.buyOmen(i)) bought = true;
      if (L.buyCoin(i)) bought = true;
    }
  }
}

const THIN_CHARMS = new Set(["crown", "hunter", "fortune", "feather", "lint", "stamina", "patience", "gambler"]);
const THIN_OMENS = new Set(["Full Crown", "Near Crown", "Heads Lean"]);
const THIN_COINS = new Set(["loaded", "lucky"]);

// Order in which the thin build melts coins (worst payout first).
const MELT_ORDER = ["standard", "serpent", "mult", "lucky", "gold", "loaded"];

function thinShopping(S) {
  if (L.canMelt()) {
    for (const type of MELT_ORDER) {
      const i = S.coins.findIndex(c => c.type === type);
      if (i >= 0) { L.meltCoin(i); break; }
    }
  }
  let bought = true;
  while (bought) {
    bought = false;
    for (let i = 0; i < 2; i++) {
      const c = S.shopStock.charms[i];
      if (c && THIN_CHARMS.has(c.id) && L.buyCharm(i)) bought = true;
      const o = S.shopStock.omens[i];
      if (o && THIN_OMENS.has(o) && L.buyOmen(i)) bought = true;
      const k = S.shopStock.coins[i];
      if (k && THIN_COINS.has(k) && S.coins.length < 4 && L.buyCoin(i)) bought = true;
    }
  }
}

// ---------- Strategies ----------

const STRATEGIES = {
  // Flip and score immediately, never reroll, never shop.
  naive: { toss() {}, shop() {} },
  // Chase heads with every reroll, buy everything affordable.
  greedy: { toss: chaseHeads, shop: buyEverything },
  // Chase heads, melt down to a tiny purse of weighted coins, level heads patterns.
  thin: { toss: chaseHeads, shop: thinShopping },
};

// ---------- Runner ----------

function playBlind(strat) {
  const S = L.getState();
  while (true) {
    const results = L.flip();
    if (!results) return false;
    L.commitFlip(results);
    strat.toss(S);
    const { outcome } = L.scoreToss();
    if (outcome === "win") return true;
    if (outcome === "lose") return false;
  }
}

function playRun(strat) {
  L.newRun();
  const S = L.getState();
  while (true) {
    if (!playBlind(strat)) return { won: false, ante: S.ante + 1, blind: S.blind };
    const { gameWon } = L.winBlind();
    if (gameWon) return { won: true, ante: 8, blind: 2 };
    L.enterShop();
    strat.shop(S);
    L.advanceBlind();
  }
}

function simulate(name, runs) {
  const strat = STRATEGIES[name];
  const anteCounts = new Array(9).fill(0); // index = ante the run ended on
  let wins = 0;
  let ante1SmallWins = 0; // runs that at least cleared the very first blind
  for (let i = 0; i < runs; i++) {
    const result = playRun(strat);
    if (result.won) wins++;
    if (result.won || result.ante > 1 || result.blind > 0) ante1SmallWins++;
    anteCounts[result.ante]++;
  }
  return { name, runs, wins, ante1SmallWins, anteCounts };
}

function pct(x, n) { return ((100 * x) / n).toFixed(1).padStart(5) + "%"; }

function report(r) {
  console.log(`\n=== ${r.name} (${r.runs} runs) ===`);
  console.log(`  ante-1 small blind cleared: ${pct(r.ante1SmallWins, r.runs)}`);
  console.log(`  full runs won:              ${pct(r.wins, r.runs)}`);
  process.stdout.write("  fell on ante:  ");
  for (let a = 1; a <= 8; a++) {
    const fell = a === 8 ? r.anteCounts[8] - r.wins : r.anteCounts[a];
    process.stdout.write(`${a}:${pct(Math.max(0, fell), r.runs).trim()}  `);
  }
  console.log("");
}

function main() {
  const args = process.argv.slice(2);
  const runsIdx = args.indexOf("--runs");
  const runs = runsIdx >= 0 ? parseInt(args[runsIdx + 1], 10) : 500;
  const assertMode = args.includes("--assert");

  const results = Object.keys(STRATEGIES).map(name => simulate(name, runs));
  results.forEach(report);

  if (assertMode) {
    const get = name => results.find(r => r.name === name);
    const checks = [
      // The opening blind must be nearly free even for a bot that never rerolls.
      [get("naive").ante1SmallWins / runs >= 0.95, "naive bot should clear ante-1 small blind ≥95%"],
      // A bot that plays reasonably should consistently get past the early game.
      [get("greedy").anteCounts[1] + get("greedy").anteCounts[2] <= runs * 0.2,
        "greedy bot should fall before ante 3 in ≤20% of runs"],
      // Simple bots must not trivialize the run — if they win most games, humans win all of them.
      [get("greedy").wins / runs <= 0.9, "greedy bot win rate should be ≤90%"],
      [get("thin").wins / runs <= 0.9, "thin bot win rate should be ≤90%"],
      // Strategy must meaningfully beat button-mashing.
      [get("greedy").wins >= get("naive").wins, "shopping should not hurt"],
      [get("thin").wins >= get("greedy").wins, "the focused build should beat unfocused shopping"],
      // The game must remain winnable: the focused build wins sometimes.
      [runs < 200 || get("thin").wins > 0, "thin bot should win at least once in 200+ runs"],
    ];
    let failed = 0;
    for (const [ok, msg] of checks) {
      if (!ok) { console.error(`ASSERT FAILED: ${msg}`); failed++; }
    }
    if (failed) process.exit(1);
    console.log(`\nAll ${checks.length} balance assertions passed.`);
  }
}

main();
