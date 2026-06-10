"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

const COIN_KEYS = Object.keys(L.COIN_TYPES);

function randomCoin() { return { type: COIN_KEYS[Math.floor(Math.random() * COIN_KEYS.length)] }; }

function randomCharms(n) {
  return [...L.CHARMS].sort(() => Math.random() - 0.5).slice(0, n);
}

test("computeScore is finite, integral, and non-negative for any state", () => {
  for (let i = 0; i < 2000; i++) {
    L.newRun();
    const S = L.getState();
    S.charms = randomCharms(Math.floor(Math.random() * 6));
    S.coins = Array.from({ length: L.MIN_COINS + Math.floor(Math.random() * 6) }, randomCoin);
    S.boss = Math.random() < 0.5 ? L.BOSSES[Math.floor(Math.random() * L.BOSSES.length)] : null;
    S.money = Math.floor(Math.random() * 60);
    S.flipsLeft = Math.floor(Math.random() * 5);
    S.tossesScored = Math.floor(Math.random() * 4);
    for (const name of Object.keys(L.PATTERNS)) {
      if (Math.random() < 0.3) S.patternLevels[name] = 1 + Math.floor(Math.random() * 5);
    }
    S.results = S.coins.map(c => L.tossCoin(c));
    if (Math.random() < 0.3) S.rerolledIdx = new Set([0]);
    const sc = L.computeScore(S.results);
    assert.ok(Number.isSafeInteger(sc.total), `total not an integer: ${sc.total}`);
    assert.ok(sc.total >= 0, `negative total: ${sc.total}`);
    assert.ok(L.PATTERNS[sc.pattern], `unknown pattern: ${sc.pattern}`);
    assert.ok(sc.chips > 0 && sc.mult > 0);
  }
});

test("tossCoin only returns H/T/E, and E only with Edgelord", () => {
  L.newRun();
  const S = L.getState();
  S.charms = [];
  for (let i = 0; i < 10000; i++) {
    const r = L.tossCoin({ type: "standard" });
    assert.ok(r === "H" || r === "T", `unexpected face: ${r}`);
  }
  S.charms = [L.CHARMS.find(c => c.id === "edge")];
  let edges = 0;
  const seen = new Set();
  for (let i = 0; i < 24000; i++) {
    const r = L.tossCoin({ type: "standard" });
    seen.add(r);
    if (r === "E") edges++;
  }
  assert.ok([...seen].every(r => ["H", "T", "E"].includes(r)));
  const rate = edges / 24000; // expected 1/12 ≈ 0.0833
  assert.ok(rate > 0.06 && rate < 0.11, `edge rate ${rate} outside [0.06, 0.11]`);
});

test("coin weighting is statistically sane", () => {
  L.newRun();
  const trials = 20000;
  for (const [key, expected] of [["standard", 0.50], ["lucky", 0.65], ["loaded", 0.78]]) {
    let heads = 0;
    for (let i = 0; i < trials; i++) if (L.tossCoin({ type: key }) === "H") heads++;
    const rate = heads / trials;
    assert.ok(Math.abs(rate - expected) < 0.02, `${key}: ${rate} vs expected ${expected}`);
  }
});

test("Loose Thumb refunds about a quarter of rerolls", () => {
  L.newRun();
  const S = L.getState();
  S.charms = [L.CHARMS.find(c => c.id === "gambler")];
  let free = 0;
  const trials = 4000;
  for (let i = 0; i < trials; i++) {
    S.results = S.coins.map(() => "T");
    S.selected = new Set([0]);
    S.rerollsLeft = 99;
    const rr = L.reroll();
    L.commitReroll(rr.indices, rr.results);
    if (rr.free) free++;
  }
  const rate = free / trials;
  assert.ok(rate > 0.20 && rate < 0.30, `free reroll rate ${rate} outside [0.20, 0.30]`);
});

test("flip/reroll/score respect resource guards", () => {
  L.newRun();
  const S = L.getState();
  assert.equal(L.scoreToss(), null, "can't score before flipping");
  assert.equal(L.reroll(), null, "can't reroll before flipping");
  const r1 = L.flip();
  assert.equal(L.flip(), null, "can't flip before committing");
  L.commitFlip(r1);
  assert.equal(L.flip(), null, "can't flip over an uncommitted toss");
  assert.equal(L.reroll(), null, "can't reroll with nothing selected");
  S.selected = new Set([0]);
  S.rerollsLeft = 0;
  assert.equal(L.reroll(), null, "can't reroll without rerolls");
  S.rerollsLeft = 1;
  const rr = L.reroll();
  assert.ok(rr);
  L.commitReroll(rr.indices, rr.results);
  assert.equal(S.selected.size, 0, "selection clears after reroll");
  const out = L.scoreToss();
  assert.ok(out);
  assert.equal(S.results, null, "toss clears after scoring");
  S.flipsLeft = 0;
  assert.equal(L.flip(), null, "can't flip without flips");
});

test("random full playthroughs never corrupt state", () => {
  for (let run = 0; run < 150; run++) {
    L.newRun();
    const S = L.getState();
    let safety = 2000;
    let alive = true;
    while (alive && safety-- > 0) {
      const results = L.flip();
      assert.ok(results, "flip must succeed with flips remaining");
      L.commitFlip(results);
      // random rerolls
      while (Math.random() < 0.5 && S.rerollsLeft > 0) {
        S.selected = new Set([Math.floor(Math.random() * S.coins.length)]);
        const rr = L.reroll();
        if (!rr) break;
        L.commitReroll(rr.indices, rr.results);
      }
      const { outcome } = L.scoreToss();
      if (outcome === "lose") { alive = false; break; }
      if (outcome === "win") {
        const { gameWon } = L.winBlind();
        if (gameWon) break;
        L.enterShop();
        // random shopping spree
        for (let i = 0; i < 2; i++) {
          if (Math.random() < 0.5) L.buyCharm(i);
          if (Math.random() < 0.5) L.buyCoin(i);
          if (Math.random() < 0.5) L.buyOmen(i);
        }
        if (Math.random() < 0.5 && L.canMelt()) L.meltCoin(Math.floor(Math.random() * S.coins.length));
        if (Math.random() < 0.3) L.rerollShop();
        L.advanceBlind();
      }
      // invariants hold at every step
      assert.ok(S.money >= 0, "money went negative");
      assert.ok(S.coins.length >= L.MIN_COINS && S.coins.length <= L.MAX_COINS, `purse size ${S.coins.length}`);
      assert.ok(S.charms.length <= L.MAX_CHARMS, "too many charms");
      assert.ok(S.ante >= 0 && S.ante < 8 && S.blind >= 0 && S.blind <= 2, "ante/blind out of range");
      assert.ok(S.flipsLeft >= 0 && S.rerollsLeft >= 0, "negative resources");
    }
    assert.ok(safety > 0, "playthrough did not terminate");
  }
});
