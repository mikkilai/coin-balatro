# Flipjack

Balatro, but for coin flips. A roguelike deck-builder played entirely in the browser — no dependencies, no build step.

**Play it:** open `index.html` in a browser (or `python3 -m http.server` and visit `http://localhost:8000`).

## How it works

- Each **Blind** has a score target. Beat 8 Antes (Small / Big / Boss Blind each) to win.
- You get **4 Flips** per round. Each flip tosses your whole purse of coins; the heads/tails **pattern** (Full Crown, Zigzag, Perfect Balance, ...) sets base Chips × Mult, and every coin adds its own Chips and Mult.
- Spend **Rerolls** to re-toss selected coins before locking in a **Score**.
- Boss Blinds twist the rules (Tails score nothing, gravity-weighted coins, fewer flips...).
- Beating a Blind pays out cash (plus interest and unused-flip bonuses) to spend in **The Mint**:
  - **Charms** — 20 passive modifiers (the Jokers of this game), max 5 slots.
  - **Coins** — Gold, Lucky, Loaded, Red Cent, Serpent (purse max 8).
  - **Omens** — permanently level up a pattern's base Chips and Mult.
  - **The Crucible** — melt a coin out of your purse for +$1 (once per shop, min 3 coins). Thinner purses hit all-Heads/all-Tails patterns far more often.

Click the **?** button in the bottom-left (or press `?`) for the in-game tutorial and pattern table.

## Hotkeys

`F` flip · `R` reroll selected · `S`/`Enter` score · `?` tutorial · `Esc` close tutorial
