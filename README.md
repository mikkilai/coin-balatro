# Flipjack

Balatro, but for coin flips. A roguelike deck-builder played entirely in the browser — no dependencies, no build step.

**Play it:** open `index.html` in a browser (or `python3 -m http.server` and visit `http://localhost:8000`).

## How it works

- Each **Blind** has a score target. Beat 8 Antes (Small / Big / Boss Blind each) to win.
- You get **4 Flips** per round. Each flip tosses your whole purse of coins; the heads/tails **pattern** (Full Crown, Zigzag, Perfect Balance, ...) sets base Chips × Mult, and every coin adds its own Chips and Mult.
- Spend **Rerolls** to re-toss selected coins before locking in a **Score**.
- Boss Blinds twist the rules (Tails score nothing, gravity-weighted coins, fewer flips...).
- Beating a Blind pays out cash (plus interest and unused-flip bonuses) to spend in **The Mint** on **Charms** (passive modifiers, the Jokers of this game) and new coins — Gold, Lucky, Loaded, Red Cent, Serpent.

## Hotkeys

`F` flip · `R` reroll selected · `S`/`Enter` score
