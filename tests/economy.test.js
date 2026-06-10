"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

function charm(id) { return L.CHARMS.find(c => c.id === id); }

test("winBlind pays reward + unused flips + interest", () => {
  L.newRun();
  const S = L.getState();
  S.money = 10;
  S.flipsLeft = 2;
  const { cash, gameWon } = L.winBlind();
  assert.equal(cash, 3 + 2 + 2); // small blind $3, 2 flips, floor(10/5) interest
  assert.equal(S.money, 17);
  assert.equal(gameWon, false);
});

test("interest is capped at $5, $10 with Piggy Bank", () => {
  L.newRun();
  const S = L.getState();
  S.money = 100;
  S.flipsLeft = 0;
  assert.equal(L.winBlind().cash, 3 + 5);
  S.money = 100;
  S.charms = [charm("piggy")];
  assert.equal(L.interestCap(), 10);
  assert.equal(L.winBlind().cash, 3 + 10);
});

test("Tiny Banker adds $3 to blind rewards", () => {
  L.newRun();
  const S = L.getState();
  S.money = 0;
  S.flipsLeft = 0;
  S.charms = [charm("banker")];
  assert.equal(L.winBlind().cash, 3 + 3);
});

test("winning the final boss blind wins the game", () => {
  L.newRun();
  const S = L.getState();
  S.ante = 7;
  S.blind = 2;
  assert.equal(L.winBlind().gameWon, true);
});

test("advanceBlind cycles blinds and antes, assigns bosses, resets round", () => {
  L.newRun();
  const S = L.getState();
  S.roundScore = 999;
  L.advanceBlind();
  assert.equal(S.blind, 1);
  assert.equal(S.roundScore, 0);
  assert.equal(S.boss, null);
  L.advanceBlind();
  assert.equal(S.blind, 2);
  assert.ok(S.boss, "boss blind must have a boss");
  L.advanceBlind();
  assert.equal(S.blind, 0);
  assert.equal(S.ante, 1);
});

test("blind targets scale with ante and blind multiplier", () => {
  L.newRun();
  const S = L.getState();
  assert.equal(L.blindInfo().target, 100);
  S.blind = 1;
  assert.equal(L.blindInfo().target, 150);
  S.ante = 7;
  S.blind = 2;
  assert.equal(L.blindInfo().target, 70000);
});

test("The Hurry boss costs a flip; charms grant extra flips/rerolls", () => {
  L.newRun();
  const S = L.getState();
  S.charms = [charm("stamina"), charm("patience")];
  S.blind = 0;
  L.startRound();
  assert.equal(S.flipsLeft, 5);
  assert.equal(S.rerollsLeft, 4);
  // force the hurry boss
  S.blind = 2;
  L.startRound();
  if (S.boss.id === "hurry") assert.equal(S.flipsLeft, 4);
  S.boss = null;
});

test("shop purchases: funds, caps, and stock removal", () => {
  L.newRun();
  const S = L.getState();
  L.enterShop();
  S.shopStock.charms = [charm("lint"), charm("hunter")];
  S.shopStock.coins = ["gold", "lucky"];

  S.money = 0;
  assert.equal(L.buyCharm(0), false, "can't afford");
  S.money = 100;
  assert.equal(L.buyCharm(0), true);
  assert.equal(S.shopStock.charms[0], null, "slot sold out");
  assert.equal(L.buyCharm(0), false, "can't rebuy sold slot");
  assert.equal(S.charms.length, 1);

  S.charms = [charm("lint"), charm("crown"), charm("twin"), charm("echo"), charm("magnet")];
  assert.equal(L.buyCharm(1), false, "charm slots full");

  assert.equal(L.buyCoin(0), true);
  assert.equal(S.coins.length, 6);
  assert.equal(S.coins[5].type, "gold");
  S.coins = Array.from({ length: L.MAX_COINS }, () => ({ type: "standard" }));
  assert.equal(L.buyCoin(1), false, "purse full");
});

test("omens level patterns and cost scales with level", () => {
  L.newRun();
  const S = L.getState();
  L.enterShop();
  S.shopStock.omens = ["Full Crown", "Zigzag"];
  S.money = 100;
  assert.equal(L.omenCost("Full Crown"), 5);
  assert.equal(L.buyOmen(0), true);
  assert.equal(L.patternLevel("Full Crown"), 2);
  assert.equal(S.money, 95);
  assert.equal(L.omenCost("Full Crown"), 6);
  assert.equal(L.buyOmen(0), false, "slot sold");
});

test("melting: +$1, once per shop, 3-coin floor, relights on next shop", () => {
  L.newRun();
  const S = L.getState();
  L.enterShop();
  const money = S.money;
  assert.equal(L.meltCoin(0), true);
  assert.equal(S.coins.length, 4);
  assert.equal(S.money, money + 1);
  assert.equal(L.meltCoin(0), false, "once per shop");
  L.enterShop();
  assert.equal(L.meltCoin(0), true, "crucible relights");
  assert.equal(S.coins.length, 3);
  L.enterShop();
  assert.equal(L.canMelt(), false, "at minimum purse");
  assert.equal(L.meltCoin(0), false);
  assert.equal(S.coins.length, L.MIN_COINS);
});

test("shop reroll costs $2 and replaces stock", () => {
  L.newRun();
  const S = L.getState();
  L.enterShop();
  S.money = 1;
  assert.equal(L.rerollShop(), false);
  S.money = 2;
  assert.equal(L.rerollShop(), true);
  assert.equal(S.money, 0);
  assert.equal(S.shopStock.charms.length, 2);
  assert.equal(S.shopStock.omens.length, 2);
});

test("shop never stocks charms the player owns", () => {
  L.newRun();
  const S = L.getState();
  S.charms = L.CHARMS.slice(0, 4);
  const owned = new Set(S.charms.map(c => c.id));
  for (let i = 0; i < 50; i++) {
    L.rollShopStock();
    for (const c of S.shopStock.charms) assert.ok(!owned.has(c.id));
  }
});
