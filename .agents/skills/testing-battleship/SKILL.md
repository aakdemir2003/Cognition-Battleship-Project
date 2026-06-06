---
name: testing-battleship
description: Test the browser Battleship game (placement, firing, AI, naval theme) end-to-end. Use when verifying UI, visual theme, or gameplay changes to the Battleship app.
---

# Testing the Battleship game

Plain HTML/CSS/JS single-page game (no backend/framework). Logic lives in `src/` and is decoupled from the DOM.

## Where to test
- **Live preview (devinapps):** https://battleship-ohibhjjc.devinapps.com — public, reflects the latest deployed branch. Fastest place to test.
- **GitHub Pages:** https://aakdemir2003.github.io/Cognition-Battleship-Project/ — only works once the user enables Settings → Pages (was 404 as of last test). Don't rely on it unless confirmed live.
- **Local:** serve the repo root statically (e.g. `python3 -m http.server`) and open `index.html`.
- **Unit tests:** `npm test` (Node built-in test runner, no deps) — 26 tests covering placement/hit/sunk/win/AI.

## Coordinate-scaling gotcha (IMPORTANT)
The desktop/browser viewport renders wider than the screenshot the `computer` tool returns. In the last session `window.innerWidth` was **1600** but screenshots are **1024px** wide (and 768 tall over ~1069 viewport height). So `getBoundingClientRect()` coordinates from the DOM (via `browser_console`) do **NOT** map 1:1 to the pixel coordinates you click with the `computer` tool.

Mapping that worked: `screen_x ≈ 9 + cdp_x * 0.63`, `screen_y ≈ 56 + cdp_y * 0.63` (the y-offset accounts for the browser toolbar; the ~0.63 factor ≈ 1024/1600). These numbers may differ if the display resolution changes — recompute by reading two known cell rects and two on-screen positions, or just click empirically and `zoom` to confirm a marker appeared.

Symptom if you get this wrong: clicks land in gaps / off-board and **no hit/miss marker appears** and the turn never advances (status stays "Your turn"). If shots aren't registering, suspect the scaling before assuming the app is broken. `browser_console` runs over CDP and is NOT visible in recordings, so it's safe to use mid-recording to read element rects.

## Verifying the naval theme (visual)
Run in `browser_console`:
```js
fetch('assets/battle-bg.svg').then(r => console.log('svg', r.status)); // expect 200
console.log('font', document.fonts.check("16px 'Black Ops One'")); // expect true
console.log('h1', getComputedStyle(document.querySelector('h1')).fontFamily);
```
Then `zoom` into the horizon to confirm warship silhouettes + sun glow render (not a flat navy fill), and into the title to confirm the blocky Black Ops One stencil face.

## Driving a battle to sink a ship (gameplay)
1. Click **Randomize**, pick a difficulty (Easy = fastest turns), click **Start Battle** (disabled until a full fleet is placed).
2. The **left** board is YOUR FLEET, the **right** board is the TARGETING GRID (where you fire).
3. After each shot the UI is **busy-locked** during the missile animation + AI turn (~2-3s). Wait ~3s between clicks or they get dropped.
4. To sink a ship fast: fire until you get a red hit (✸), then probe adjacent cells along the row/column until the ship is destroyed. Ships can sit adjacent, so a run of hits may span two ships.
5. **Sink verification:** the sunk ship's row in the side roster goes dimmed + line-through, and its hull is revealed on the targeting grid (sunk cells render darker/continuous vs. bright-red hits on still-afloat ships). Status briefly announces "You sunk the <Ship>!" (it gets overwritten by the AI's turn status).

## Gotchas
- `game`/board state is **module-scoped, not on `window`** — you can't query ship positions from the console. Play through the UI to find ships.
- No CI is configured on the repo (static site), so `git_pr_checks` returns 0 checks — that's expected, not a failure.
- Animations respect `prefers-reduced-motion`.

## Devin Secrets Needed
None. The preview is public and no login is required.
