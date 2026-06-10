# Flipjack

Balatro, but for coin flips. A roguelike deck-builder played entirely in the browser — no dependencies, no build step.

**Play it:** open `index.html` in a browser (or `python3 -m http.server` and visit `http://localhost:8000`).

## How it works

- Pick a **starting pouch** (classic pennies, lucky coins, merchant's cash, or a tails-flavored serpent set) — each run also draws a limited charm pool and a shuffled boss order, so no two runs offer the same toys.
- Each **Blind** has a score target. Beat 8 Antes (Small / Big / Boss Blind each) to win.
- You get **4 Flips** per round. Each flip tosses your whole purse of coins; the heads/tails **pattern** (Full Crown, Zigzag, Perfect Balance, ...) sets base Chips × Mult, and every coin adds its own Chips and Mult — watch the score count up coin by coin.
- Spend **Rerolls** to re-toss selected coins before locking in a **Score**.
- 8 **Boss Blinds** twist the rules: censored tails, gravity-weighted coins, locked coins, ignored pattern levels, and more.
- Beating a Blind pays out cash (plus interest and unused-flip bonuses) to spend in **The Mint**:
  - **Charms** — 20 passive modifiers (the Jokers of this game), max 5 slots.
  - **Coins** — Gold, Lucky, Loaded, Red Cent, Serpent (purse max 8).
  - **Omens** — permanently level up a pattern's base Chips and Mult.
  - **The Crucible** — melt a coin out of your purse for +$1 (once per shop, min 3 coins). Thinner purses hit all-Heads/all-Tails patterns far more often.

Click the **?** button in the bottom-left (or press `?`) for the in-game tutorial and pattern table. The speaker button toggles sound. Runs save automatically — close the tab and continue later — and lifetime stats (wins, best ante, best toss) live on the title and game-over screens.

## Hotkeys

`F` flip · `R` reroll selected · `S`/`Enter` score · `?` tutorial · `Esc` close tutorial

## Development

The code is split into `logic.js` (game state and rules, no DOM — also loads in Node) and `ui.js` (rendering, animation, input). Tests need Node 22+, no dependencies:

```sh
npm test               # unit + invariant tests (node --test)
npm run balance        # balance simulation: 3 bot strategies × 1000 runs
npm run balance:assert # the loose balance bounds CI enforces
```

`tests/` covers pattern classification, exact scoring math for every charm and boss, economy rules (payouts, interest, shop guards, melting), and randomized invariant soaks. `sim/balance.js` plays full runs with bot strategies (never-reroll, buy-everything, thin-purse) and reports win rates per ante — useful for tuning difficulty. CI runs all of it on every PR.
