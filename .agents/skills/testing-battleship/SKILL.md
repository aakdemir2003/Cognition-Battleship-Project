---
name: testing-battleship
description: Test the browser Battleship game (placement, firing, AI, naval theme, online multiplayer) end-to-end. Use when verifying UI, visual theme, or gameplay changes to the Battleship app.
---

# Testing the Battleship game

Plain HTML/CSS/JS single-page game (no backend/framework). Logic lives in `src/` and is decoupled from the DOM.

## Where to test
- **Live preview (devinapps):** https://battleship-ohibhjjc.devinapps.com — public, reflects the latest deployed branch. Fastest place to test.
- **GitHub Pages:** https://aakdemir2003.github.io/Cognition-Battleship-Project/ — only works once the user enables Settings → Pages (was 404 as of last test). Don't rely on it unless confirmed live.
- **Local:** serve the repo root statically (e.g. `python3 -m http.server 8099`) and open `index.html`.
- **Unit tests:** `npm test` (Node built-in test runner, no deps) — 26 tests covering placement/hit/sunk/win/AI.

## Coordinate-scaling gotcha (IMPORTANT)
The desktop/browser viewport renders wider than the screenshot the `computer` tool returns. In recent sessions `window.innerWidth` was **1600** but screenshots are **1024px** wide. So `getBoundingClientRect()` coordinates from the DOM (via `browser_console`) do **NOT** map 1:1 to the pixel coordinates you click with the `computer` tool.

Mapping that worked: `screen_x ≈ cdp_x * 0.64` (≈ 1024/1600); the y mapping has a toolbar offset, so it's easiest to measure board extents directly from a screenshot. These numbers may differ if the display resolution changes — recompute by reading two known cell rects and two on-screen positions, or just click empirically and `zoom` to confirm a marker appeared.

Symptom if you get this wrong: clicks land in gaps / off-board and **no hit/miss marker appears** and the turn never advances. If shots aren't registering, suspect the scaling before assuming the app is broken. `browser_console` runs over CDP and is NOT visible in recordings, so it's safe to use mid-recording to read element rects.

## Reading placed ship positions from the DOM (useful for precise targeting)
Game/board state is **module-scoped, not on `window`**, so you can't read the JS model directly. BUT the placed ships are rendered on the **own-fleet (left) board** with a `ship` CSS class, so you can read their cells from the DOM:
```js
const own = document.querySelectorAll('.board')[0]; // left = your fleet
const shipCells = [...own.querySelectorAll('.cell')]
  .filter(c => c.className.includes('ship'))
  .map(c => `${c.dataset.row},${c.dataset.col}`);
```
This returns the exact 17 ship cells (Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2). In multiplayer you can read the OPPONENT's fleet from their own tab this way to target precisely and drive a full game to completion quickly. (In single-player you can't read the AI's hidden board — only your own placed fleet — so play through the targeting grid normally.)

## Input lock / dropped clicks (IMPORTANT)
After each shot the UI is **busy-locked** during the missile animation (+ AI turn in single-player). If you chain clicks faster than the lock clears, the extra clicks are **silently dropped** (a shot you intended simply never registers — you'll see fewer hits than shots fired). Wait **~1.8–2s** between firing actions, and after a multi-shot batch use `zoom` to verify every intended cell actually shows a marker before concluding.

## Driving a battle to sink a ship (gameplay)
1. Click **Randomize**, pick a difficulty (Easy = fastest turns), click **Start Battle** (disabled until a full fleet is placed).
2. The **left** board is YOUR FLEET, the **right** board is the TARGETING GRID (where you fire).
3. Wait ~2s between clicks (see input-lock note above).
4. To sink a ship fast: fire until you get a red hit (✸), then probe adjacent cells along the row/column until destroyed. Ships can sit adjacent, so a run of hits may span two ships — the side roster tells you which ship sank.
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
None. The preview is public and no login is required. (Real cross-device multiplayer would need a Firebase web config in `src/firebase-config.js`, but that is not a Devin secret — it's public-by-design client config the user provides.)
