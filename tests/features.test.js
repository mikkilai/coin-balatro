"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

function charm(id) { return L.CHARMS.find(c => c.id === id); }
function boss(id) { return L.BOSSES.find(b => b.id === id); }

// ---------- Pouches ----------

test("default run uses the Penny Pouch", () => {
  L.newRun();
  const S = L.getState();
  assert.equal(S.pouch.id, "penny");
  assert.equal(S.coins.length, 5);
  assert.ok(S.coins.every(c => c.type === "standard"));
  assert.equal(S.money, 4);
});

test("pouches set coins, money, and per-round modifiers", () => {
  L.newRun("merchant");
  const S = L.getState();
  assert.equal(S.coins.length, 6);
  assert.equal(S.money, 10);
  assert.equal(S.rerollsLeft, 2, "merchant pouch costs a reroll");

  L.newRun("clover");
  const S2 = L.getState();
  assert.equal(S2.coins.length, 4);
  assert.ok(S2.coins.every(c => c.type === "lucky"));

  L.newRun("serpent");
  const S3 = L.getState();
  assert.deepEqual(S3.coins.map(c => c.type).sort(), ["serpent", "serpent", "serpent", "standard"]);

  L.newRun("nonsense-falls-back-to-penny");
  assert.equal(L.getState().pouch.id, "penny");
});

// ---------- Charm pool ----------

test("each run draws a limited charm pool and the shop honors it", () => {
  L.newRun();
  const S = L.getState();
  assert.equal(S.charmPool.length, L.CHARM_POOL_SIZE);
  assert.equal(new Set(S.charmPool).size, L.CHARM_POOL_SIZE, "pool has no duplicates");
  const pool = new Set(S.charmPool);
  for (let i = 0; i < 40; i++) {
    L.rollShopStock();
    for (const c of S.shopStock.charms) assert.ok(pool.has(c.id), `${c.id} not in this run's pool`);
  }
});

// ---------- Boss order ----------

test("boss order covers all bosses once, one per ante", () => {
  L.newRun();
  const S = L.getState();
  assert.equal(S.bossOrder.length, L.BOSSES.length);
  assert.equal(new Set(S.bossOrder).size, L.BOSSES.length, "no repeated bosses");
  for (let ante = 0; ante < 8; ante++) {
    S.ante = ante;
    S.blind = 2;
    L.startRound();
    assert.equal(S.boss.id, S.bossOrder[ante]);
  }
});

// ---------- New bosses ----------

test("The Anchor locks the first coin against rerolls", () => {
  L.newRun();
  const S = L.getState();
  S.boss = boss("anchor");
  assert.ok(L.isCoinLocked(0));
  assert.ok(!L.isCoinLocked(1));
  L.commitFlip(["T", "T", "T", "T", "T"]);
  S.selected = new Set([0]);
  assert.equal(L.canReroll(), false, "only-locked selection can't reroll");
  assert.equal(L.reroll(), null);
  assert.equal(S.rerollsLeft, 3, "no reroll consumed");
  S.selected = new Set([0, 1, 2]);
  const rr = L.reroll();
  assert.deepEqual(rr.indices.sort(), [1, 2], "locked coin filtered out");
});

test("The Purist zeroes base chips on lean patterns only", () => {
  L.newRun();
  const S = L.getState();
  S.boss = boss("purist");
  // Heads Lean: base 15 → 0, coin chips remain
  const lean = L.computeScore(["H", "H", "H", "T", "T"]);
  assert.equal(lean.chips, 0 + 3 * 10 + 2 * 5);
  // Perfect Balance is also censored
  S.coins = S.coins.slice(0, 4);
  assert.equal(L.computeScore(["H", "H", "T", "T"]).chips, 30);
  // Near Crown is untouched
  assert.equal(L.computeScore(["H", "H", "H", "T"]).chips, 30 + 35);
});

test("The Cramp removes a reroll; floors at zero", () => {
  L.newRun();
  const S = L.getState();
  S.bossOrder = ["cramp", ...S.bossOrder.filter(id => id !== "cramp")];
  S.ante = 0;
  S.blind = 2;
  L.startRound();
  assert.equal(S.rerollsLeft, 2);
  // merchant pouch (-1) + cramp (-1) still can't go negative even without charms
  L.newRun("merchant");
  const S2 = L.getState();
  S2.bossOrder = ["cramp", ...S2.bossOrder.filter(id => id !== "cramp")];
  S2.blind = 2;
  L.startRound();
  assert.equal(S2.rerollsLeft, 1);
});

test("The Leveler ignores pattern levels", () => {
  L.newRun();
  const S = L.getState();
  S.patternLevels["Full Crown"] = 4;
  const leveled = L.computeScore(["H", "H", "H", "H", "H"]);
  assert.equal(leveled.total, (60 + 3 * 25 + 50) * (8 + 3 * 3));
  S.boss = boss("leveler");
  const flat = L.computeScore(["H", "H", "H", "H", "H"]);
  assert.equal(flat.total, (60 + 50) * 8);
  assert.equal(flat.level, 1);
});

// ---------- Score steps (animation breakdown) ----------

test("score steps start with the pattern and sum to the totals", () => {
  L.newRun();
  const S = L.getState();
  S.charms = [charm("lint"), charm("hunter"), charm("crown")];
  const sc = L.computeScore(["H", "H", "H", "H", "H"]);
  assert.equal(sc.steps[0].kind, "pattern");
  let chips = 0, mult = 0;
  for (const st of sc.steps) {
    if (st.kind === "pattern") { chips = st.chips; mult = st.mult; }
    else if (st.kind === "xmult") mult *= st.x;
    else { chips += st.chips; mult += st.mult; }
  }
  assert.equal(chips, sc.chips, "step chips sum to the final chips");
  assert.equal(mult, sc.mult, "step mults reduce to the final mult");
  assert.equal(Math.floor(chips * mult), sc.total);
  assert.ok(sc.steps.some(st => st.kind === "xmult" && st.id === "crown"));
});

test("steps replay consistently for every charm and boss combination", () => {
  for (let i = 0; i < 500; i++) {
    L.newRun(L.POUCHES[Math.floor(Math.random() * L.POUCHES.length)].id);
    const S = L.getState();
    S.charms = [...L.CHARMS].sort(() => Math.random() - 0.5).slice(0, 5);
    S.boss = Math.random() < 0.5 ? L.BOSSES[Math.floor(Math.random() * L.BOSSES.length)] : null;
    S.money = Math.floor(Math.random() * 40);
    S.results = S.coins.map(c => L.tossCoin(c));
    const sc = L.computeScore(S.results);
    let chips = 0, mult = 0;
    for (const st of sc.steps) {
      if (st.kind === "pattern") { chips = st.chips; mult = st.mult; }
      else if (st.kind === "xmult") mult *= st.x;
      else { chips += st.chips; mult += st.mult; }
    }
    assert.equal(chips, sc.chips);
    assert.equal(mult, sc.mult);
  }
});

// ---------- Save / load ----------

test("export/import round-trips a mid-run state", () => {
  L.newRun("merchant");
  const S = L.getState();
  S.charms = [charm("lint"), charm("crown")];
  S.patternLevels["Zigzag"] = 3;
  S.money = 23;
  S.ante = 4;
  S.blind = 1;
  S.roundScore = 1234;
  S.bestToss = 999;
  const results = L.flip();
  L.commitFlip(results);
  S.selected.add(1);

  const json = L.exportState();
  assert.ok(json);
  L.newRun(); // clobber
  const R = L.importState(json);
  assert.ok(R);
  assert.equal(R.pouch.id, "merchant");
  assert.equal(R.money, 23);
  assert.equal(R.ante, 4);
  assert.equal(R.blind, 1);
  assert.equal(R.roundScore, 1234);
  assert.equal(R.bestToss, 999);
  assert.deepEqual(R.results, results);
  assert.ok(R.selected.has(1));
  assert.deepEqual(R.charms.map(c => c.id), ["lint", "crown"]);
  assert.equal(R.patternLevels["Zigzag"], 3);
  assert.equal(R.charms[0].desc, charm("lint").desc, "charm objects rehydrated");
  // restored state must be fully playable
  const out = L.scoreToss();
  assert.ok(out);
});

test("export/import round-trips an open shop", () => {
  L.newRun();
  L.enterShop();
  const S = L.getState();
  L.buyCharm(0); // may fail on funds; either way stock state must survive
  const stock = JSON.parse(JSON.stringify({
    charms: S.shopStock.charms.map(c => (c ? c.id : null)),
    coins: S.shopStock.coins,
    omens: S.shopStock.omens,
  }));
  const json = L.exportState();
  L.newRun();
  const R = L.importState(json);
  assert.equal(R.inShop, true);
  assert.deepEqual(R.shopStock.charms.map(c => (c ? c.id : null)), stock.charms);
  assert.deepEqual(R.shopStock.coins, stock.coins);
  assert.deepEqual(R.shopStock.omens, stock.omens);
});

test("import rejects garbage and pending tosses are not exported", () => {
  assert.equal(L.importState("not json"), null);
  assert.equal(L.importState("{}"), null);
  assert.equal(L.importState(JSON.stringify({ v: 99, coins: [], pouch: {} })), null);
  L.newRun();
  L.flip(); // pending, uncommitted
  assert.equal(L.exportState(), null, "no saving mid-toss");
});
