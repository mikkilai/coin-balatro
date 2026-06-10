"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

test("pattern classification", async t => {
  const cases = [
    [["H", "H", "H", "H", "H"], "Full Crown"],
    [["T", "T", "T", "T", "T"], "Serpent Hoard"],
    [["H", "T", "H", "T", "H"], "Zigzag"],
    [["T", "H", "T", "H"], "Zigzag"],
    [["H", "H", "H", "H", "T"], "Near Crown"],
    [["T", "H", "H", "H", "H"], "Near Crown"],
    [["T", "T", "T", "T", "H"], "Near Hoard"],
    [["H", "H", "T", "T"], "Perfect Balance"],
    [["H", "H", "H", "T", "T"], "Heads Lean"],
    [["H", "T", "T", "T", "T", "H", "T"], "Tails Lean"],
    // Edges count as both Heads and Tails
    [["H", "H", "E", "H", "H"], "Full Crown"],
    [["T", "T", "E", "T", "T"], "Serpent Hoard"],
    [["E", "E", "E"], "Full Crown"], // all-edge: h === n wins the tie
    [["H", "H", "H", "E", "T"], "Heads Lean"], // h=4,t=2 — edge blocks Near Crown (t>1? no, t=2>1)
    // Zigzag requires 4+ coins and no edges; 3 coins fall through to Near Crown
    [["H", "T", "H"], "Near Crown"],
    [["H", "T", "E", "T", "H"], "Perfect Balance"], // edge ties it: h=3, t=3
  ];

  for (const [results, expected] of cases) {
    await t.test(`${results.join("")} → ${expected}`, () => {
      assert.equal(L.evalPattern(results), expected);
    });
  }
});

test("near patterns require the rest to be uniform", () => {
  // 4 heads + 1 tail of 5 → Near Crown; 4 heads + 1 edge → h=5 → Full Crown
  assert.equal(L.evalPattern(["H", "H", "H", "H", "T"]), "Near Crown");
  assert.equal(L.evalPattern(["H", "H", "H", "H", "E"]), "Full Crown");
});

test("pattern levels scale base chips and mult", () => {
  L.newRun();
  const S = L.getState();
  assert.deepEqual(L.patternValues("Full Crown"), { chips: 60, mult: 8 });
  S.patternLevels["Full Crown"] = 3;
  assert.deepEqual(L.patternValues("Full Crown"), { chips: 60 + 2 * 25, mult: 8 + 2 * 3 });
  assert.equal(L.patternLevel("Full Crown"), 3);
  assert.equal(L.patternLevel("Zigzag"), 1);
});

test("every pattern in PATTERNS is reachable from evalPattern", () => {
  const seen = new Set([
    L.evalPattern(["H", "H", "H"]),
    L.evalPattern(["T", "T", "T"]),
    L.evalPattern(["H", "T", "H", "T"]),
    L.evalPattern(["H", "H", "H", "T"]),
    L.evalPattern(["T", "T", "T", "H"]),
    L.evalPattern(["H", "H", "T", "T", "T", "H"]),
    L.evalPattern(["H", "H", "H", "T", "T"]),
    L.evalPattern(["T", "T", "T", "H", "H"]),
  ]);
  for (const name of Object.keys(L.PATTERNS)) {
    assert.ok(seen.has(name), `${name} not produced by any test toss`);
  }
});
