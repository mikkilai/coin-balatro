"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

// Fresh run with a known setup: purse of pennies, no charms, no boss.
function setup({ coins = 5, charms = [], boss = null } = {}) {
  L.newRun();
  const S = L.getState();
  S.coins = Array.from({ length: coins }, () => ({ type: "standard" }));
  S.charms = charms.map(id => L.CHARMS.find(c => c.id === id));
  S.boss = boss ? L.BOSSES.find(b => b.id === boss) : null;
  return S;
}

test("baseline: 5 pennies all heads = (60 + 5×10) × 8 = 880", () => {
  setup();
  assert.equal(L.computeScore(["H", "H", "H", "H", "H"]).total, 880);
});

test("coin chips and mult contributions", () => {
  const S = setup();
  S.coins = [{ type: "gold" }, { type: "mult" }, { type: "serpent" }, { type: "lucky" }, { type: "loaded" }];
  // H,H,T,H,H → Near Crown (30, 4); chips 30+25+4+6+12+8=85; mult 4+2(red cent H)+2(serpent T)=8
  const sc = L.computeScore(["H", "H", "T", "H", "H"]);
  assert.equal(sc.pattern, "Near Crown");
  assert.equal(sc.chips, 85);
  assert.equal(sc.mult, 8);
  assert.equal(sc.total, 680);
});

test("each additive charm in isolation", () => {
  // Toss H,H,T,T,H on 5 pennies: Heads Lean (15, 2), coin chips 40 → 55 × 2 = 110
  const toss = ["H", "H", "T", "T", "H"];
  assert.equal(setup() && L.computeScore(toss).total, 110);

  setup({ charms: ["lint"] });
  assert.equal(L.computeScore(toss).total, 55 * 6);

  setup({ charms: ["hunter"] }); // +15 × 3 heads
  assert.equal(L.computeScore(toss).total, (55 + 45) * 2);

  setup({ charms: ["tailwind"] }); // +2 mult × 2 tails
  assert.equal(L.computeScore(toss).total, 55 * 6);

  const S = setup({ charms: ["echo"] });
  S.tossesScored = 2;
  assert.equal(L.computeScore(toss).total, 55 * 4);

  const S2 = setup({ charms: ["magnet"] });
  S2.rerolledIdx = new Set([0, 3]);
  assert.equal(L.computeScore(toss).total, (55 + 20) * 2);

  setup({ coins: 4, charms: ["feather"] });
  // H,H,T,T on 4 pennies: Perfect Balance (25,3) + 30 coin chips + 40 feather = 95 × 3
  assert.equal(L.computeScore(["H", "H", "T", "T"]).total, 95 * 3);

  const S3 = setup({ charms: ["hoarder"] });
  S3.money = 12;
  assert.equal(L.computeScore(toss).total, (55 + 12) * 2);
  S3.money = 99; // capped at +20
  assert.equal(L.computeScore(toss).total, (55 + 20) * 2);

  setup({ charms: ["streak"] }); // H,H,T,T,H best run = 2 → no bonus
  assert.equal(L.computeScore(toss).total, 110);
  assert.equal(L.computeScore(["H", "H", "H", "T", "T"]).total, (55 + 25) * 2);
});

test("multiplicative charms and their stacking order", () => {
  setup({ charms: ["crown"] });
  assert.equal(L.computeScore(["H", "H", "H", "H", "H"]).total, 110 * 8 * 3);

  setup({ coins: 4, charms: ["twin"] });
  assert.equal(L.computeScore(["H", "H", "T", "T"]).total, 55 * 3 * 2);

  setup({ coins: 4, charms: ["zigzag"] });
  // Zigzag (40,6) + 30 coin chips = 70 × 6 × 2
  assert.equal(L.computeScore(["H", "T", "H", "T"]).total, 70 * 12);

  const S = setup({ charms: ["overkill"] });
  S.flipsLeft = 1;
  assert.equal(L.computeScore(["H", "H", "H", "H", "H"]).total, 880);
  S.flipsLeft = 0;
  assert.equal(L.computeScore(["H", "H", "H", "H", "H"]).total, 1760);

  // crown + twin can't both apply (all heads ≠ tied) unless edges tie it
  const S2 = setup({ coins: 2, charms: ["crown", "twin"] });
  const sc = L.computeScore(["E", "E"]); // h=2=n, t=2 → both xmults
  // Full Crown (60,8) + edge heads/tails chips (10+5)×2 + edge bonus 50×2 = 190; mult 8×3×2
  assert.equal(sc.total, 190 * 48);
  assert.ok(S2);
});

test("edge coins: +50 chips, +100 with Alchemist", () => {
  setup();
  // E,H,H,H,H → Full Crown; chips 60 + heads 5×10 + tails 5 (edge) + 50 = 165 × 8
  assert.equal(L.computeScore(["E", "H", "H", "H", "H"]).total, 165 * 8);
  setup({ charms: ["alchemy"] });
  assert.equal(L.computeScore(["E", "H", "H", "H", "H"]).total, 215 * 8);
});

test("boss: The Censor zeroes tails chips but keeps tails mult", () => {
  const S = setup({ boss: "censor" });
  S.coins = [{ type: "serpent" }, { type: "standard" }, { type: "standard" }, { type: "standard" }, { type: "standard" }];
  // T,H,H,H,H → Near Crown (30,4); serpent tails chips censored, +2 tails mult kept
  const sc = L.computeScore(["T", "H", "H", "H", "H"]);
  assert.equal(sc.chips, 30 + 40);
  assert.equal(sc.mult, 6);
  // Edge under censor: heads chips and edge bonus still count, tails chips don't
  const sc2 = L.computeScore(["E", "H", "H", "H", "H"]);
  assert.equal(sc2.chips, 60 + 2 + 4 * 10 + 50); // serpent E heads 2, pennies 10, edge 50
});

test("boss: The Miser halves base pattern chips only", () => {
  setup({ boss: "miser" });
  // Full Crown 60→30, coin chips unaffected
  assert.equal(L.computeScore(["H", "H", "H", "H", "H"]).chips, 30 + 50);
});

test("boss: The Gravity shifts heads probability, clamped", () => {
  const S = setup({ boss: "gravity" });
  assert.equal(L.headsProbFor({ type: "standard" }), 0.30);
  assert.ok(Math.abs(L.headsProbFor({ type: "loaded" }) - 0.58) < 1e-9);
  S.boss = null;
  S.charms = [L.CHARMS.find(c => c.id === "fortune")];
  assert.equal(L.headsProbFor({ type: "standard" }), 0.55);
});

test("pattern level applies inside computeScore", () => {
  const S = setup();
  S.patternLevels["Full Crown"] = 2;
  // (60+25 + 50) × (8+3) = 135 × 11
  const sc = L.computeScore(["H", "H", "H", "H", "H"]);
  assert.equal(sc.total, 135 * 11);
  assert.equal(sc.level, 2);
});
