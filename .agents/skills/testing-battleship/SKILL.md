---
name: testing-battleship
description: Test the browser Battleship game (placement, firing, AI, naval theme) end-to-end. Use when verifying UI, visual theme, or gameplay changes to the Battleship app.
---

# Testing the Battleship app

The app is a static HTML/CSS/JS Battleship game (single-player vs AI + online multiplayer). No backend, no build step.

## Running it locally
- Serve the repo root on a port and open it in Chrome: `python3 -m http.server 8099` (from the repo dir), then visit `http://localhost:8099`.
- The live preview (devinapps) and GitHub Pages (`https://aakdemir2003.github.io/Cognition-Battleship-Project/`) are also valid targets. Both are public, no login.
- Run unit tests with `npm test` (Node's built-in test runner, 26 tests). No install needed.

## Coordinate scaling gotcha (computer tool)
- The desktop viewport renders ~1600px wide but screenshots come back at 1024px. Scale: `screen_x ≈ cdp_x * 0.64`; for y, also add the browser toolbar offset (~55px).
- More robust: read the exact target cell's `getBoundingClientRect()` from the DOM, then scale by the viewport/screenshot ratio to get click coordinates. Don't eyeball grid cells.

## Input lock timing
- After each shot a missile animation plays and the UI is **locked** (~1.8–2s). Wait ~2s after firing before the next click, or it's dropped. Don't batch rapid clicks.

## Reading board state from the DOM
- Own fleet is the LEFT `.board`; targeting grid is the RIGHT `.board`: `document.querySelectorAll('.board')[0]` / `[1]`.
- Ship cells carry the `.ship` CSS class. To read the opponent's fleet layout (e.g. to target every ship and force a quick game-over), query `.ship` cells on their own-fleet board from their tab.
- Fog of war: each shooter only sees cells THEY fired on the targeting grid — unrevealed opponent cells stay blank.

## Single-player flow
1. Pick a difficulty (Easy/Medium/Hard) on the setup screen.
2. **Randomize** (or drag + R to rotate) to place all 5 ships; **Start Battle** stays disabled until the fleet is complete (17 cells).
3. Fire on the right (targeting) grid; hits go red, misses pale; "sunk" is announced.
4. Win/lose shows an end card with **Play Again**, which fully resets to placement.
5. **Sink verification:** the sunk ship's roster row goes dimmed + line-through, and its hull is revealed on the targeting grid (sunk cells render darker/continuous vs. bright-red hits on still-afloat ships). Status briefly announces "You sunk the <Ship>!" (it gets overwritten by the next turn's status).

## Testing online multiplayer (vs Player mode, PR #7+)
- **Setup:** open **two browser tabs** on the same local origin (`http://localhost:8099`). Tab A = Host, Tab B = Guest. They are the two "laptops".
- **Transport fallback:** if `src/firebase-config.js` exports `null` (no Firebase project wired yet), online mode uses a **localStorage** backend that syncs across same-origin tabs via the `storage` event. This exercises the same `Room` API the Firebase backend uses, so it's a valid functional test of the multiplayer flow — but it is **same-device only** and does NOT prove real cross-internet play. Call that limitation out in the report. Clear stale rooms between runs: `Object.keys(localStorage).filter(k=>k.startsWith('bs_room_')).forEach(k=>localStorage.removeItem(k))`.
- **Flow:** Host clicks **vs Player (online)** → **Create game** (gets a 4-char code from alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`). Guest switches to online mode, types the code, clicks **Join**.
- **Cross-tab sync check (the core claim):** after Guest joins, the Guest shows "Connected!" AND the Host status auto-updates to "Opponent connected" without any Host action. If the Host doesn't change on its own, sync is broken.
- **Start:** both **Randomize** + **Start Battle**. Host gets the first turn ("Your turn — fire at the targeting grid!"); Guest sees "Opponent's turn…". Exactly one side is on turn.
- **Firing:** fire from the on-turn tab, then switch to the other tab and confirm the **same coordinate** on its own-fleet (left) board shows the matching hit/miss; the turn then flips. Fog of war: each shooter only sees its own fired cells.
- **Reach game over:** read the opponent's fleet cells from their tab (DOM `.ship` trick above) so you can target every ship; have the off-turn side fire filler shots just to pass the turn back. Sinking the last ship triggers **Victory!** (confetti + "Thank you for playing" Cognition end card) on the winner and **Defeat** on the loser, simultaneously.
- **Turn alternation requires both sides to act:** to let one side keep hitting, the other side must fire something each round to pass the turn — there's no "pass".

## Verifying the naval theme (visual)
Run in `browser_console`:
```js
fetch('assets/battle-bg.svg').then(r => console.log('svg', r.status)); // expect 200
console.log('font', document.fonts.check("16px 'Black Ops One'")); // expect true
console.log('h1', getComputedStyle(document.querySelector('h1')).fontFamily);
```
Then `zoom` into the horizon to confirm warship silhouettes + sun glow render (not a flat navy fill), and into the title to confirm the blocky Black Ops One stencil face.

## Gotchas
- No CI is configured on the repo (static site), so `git_pr_checks` returns 0 checks — that's expected, not a failure.
- Animations respect `prefers-reduced-motion`.
- The mood background tints green/red based on who's ahead and pulses in "overtime" (≤2 ships left) — expect the backdrop color to shift during a game; that's intended.

## Devin Secrets Needed
None. The preview is public and no login is required. The Firebase web config in `src/firebase-config.js` is public-by-design client config (not a Devin secret); access is gated by `database.rules.json`, which must be applied once in the Firebase console.
