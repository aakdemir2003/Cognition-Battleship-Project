---
name: testing-battleship
description: Test the browser Battleship game (placement, firing, AI, naval theme, result card, admiral commentary, tactical heatmap) end-to-end. Use when verifying UI, visual theme, or gameplay changes to the Battleship app.
---

# Testing the Battleship app

The app is a static HTML/CSS/JS Battleship game (single-player vs AI + online multiplayer). No backend, no build step.

## Running it locally
- Serve the repo root on a port and open it in Chrome: `python3 -m http.server 8099` (from the repo dir), then visit `http://localhost:8099`.
- The live preview (devinapps) and GitHub Pages (`https://aakdemir2003.github.io/Cognition-Battleship-Project/`) are also valid targets. Both are public, no login.
- Run unit tests with `npm test` (Node's built-in test runner). No install needed. As of PR #16 there are 42 (board/ai/game + heatmap + share + commentary).

## Coordinate scaling gotcha (computer tool)
- The desktop viewport renders ~1600px wide but screenshots come back at 1024px. Scale: `screen_x ≈ page_x * 0.64`; for y, also add the browser chrome offset (~60px, measured ~62px in recent runs).
- Most robust: compute click coords in `browser_console` from the DOM. Example used for the targeting grid (`#ai-board`): `const scale=1024/innerWidth; const r=cell.getBoundingClientRect(); screen=[Math.round((r.left+r.width/2)*scale), Math.round((r.top+r.height/2)*scale)+62];`. Calibrate the +62 once per session by comparing a known element (e.g. the Tactical View button) against a coordinate you already clicked successfully.

## Input lock timing
- After each shot a missile animation plays and the UI is **locked** (~1.8–2s) AND the AI takes its turn. Wait ~2.5s after firing before the next click, or it's dropped. Don't batch rapid clicks.

## Reaching game-over fast (single-player) — temporary read-only hook
- In single-player the AI's own fleet board is NOT rendered, so the `.ship` DOM trick (below, multiplayer) can't read enemy positions. Instead add a temporary read-only hook to `src/main.js` right after `const game = new Game(...)`: `window.__game = game;` (mark it TEMP, do NOT commit it). Reload, then read every enemy cell: `game.aiBoard.ships.forEach(s=>s.cells.forEach(([r,c])=>...))`. Fire only those 17 cells to win at 100% accuracy in 17 shots while the AI is still hunting.
- **Always revert the hook before finishing** and confirm `git diff` is clean (it must not land in the PR).

## Reading board state from the DOM
- Own fleet is the LEFT `.board` (`#player-board`); targeting grid is the RIGHT `.board` (`#ai-board`). Cells carry `data-row`/`data-col` (0–9).
- Ship cells carry the `.ship` CSS class. In **multiplayer**, read the opponent's fleet layout by querying `.ship` cells on their own-fleet board from their tab.
- Fog of war: each shooter only sees cells THEY fired on the targeting grid.

## Single-player flow
1. Pick a difficulty (Easy/Medium/Hard) on the setup screen.
2. **Randomize** (or drag + R to rotate) to place all 5 ships; **Start Battle** stays disabled until the fleet is complete (17 cells).
3. Fire on the right (targeting) grid; hits go red, misses pale; "sunk" is announced.
4. Win/lose shows an end card with **Copy result** + **Play Again**, which fully resets to placement (also resets Tactical View off).
5. **Sink verification:** the sunk ship's roster row dims + line-through, and its hull is revealed on the targeting grid.

## Feature: Shareable result card (PR #16)
- End screen has a **Copy result** button that copies a Wordle-style summary: header `BATTLESHIP — Victory/Defeat in N shots (A% accuracy) on <Mode>`, a blank line, 10 rows of 10 emoji (🔥 hit / 🟦 miss / ⬛ never fired), then the game URL. Shows a **Copied!** toast.
- **Verifying the clipboard:** `navigator.clipboard.readText()` throws `NotAllowedError: Document is not focused` when called from `browser_console` (the eval context isn't focused). Fix: (1) click a neutral spot on the page with the computer tool to focus the document — Chrome shows a one-time "wants to see text copied to the clipboard" prompt; click **Allow**. (2) Re-click **Copy result** so the write happens with focus. (3) Read it: `navigator.clipboard.readText().then(t=>{window.__clip=t})`, then in a second console call inspect `window.__clip`. Assert header text, 10×10 grid, and that the 🔥 count equals hits and 🟦 equals misses.

## Feature: Enemy admiral commentary (PR #16)
- After every shot a quip is appended to the battle log as a distinct `.log-quip` row (italic, ⚓ marker, accent left-border) vs plain `.log-entry` shot rows (`You/Enemy <coord> Hit/Miss`).
- Verify: quips are varied per event (hit/miss/sink, yours and the AI's) with no immediate repeats, and the tone scales — Easy encouraging, Medium neutral ("Registered. Your aim holds."), Hard smug/taunting ("Cute. I've sunk better captains."). Read the `<li>` text from the `#battle-log`/`[aria-label="Battle log"]` list to compare tone across difficulties.

## Feature: Tactical View heatmap (PR #16)
- Toggle button above the targeting grid (`#tactical-btn`). On = warm overlay on unfired cells ∝ legal placements of the enemy's remaining unsunk ships; recomputed after every shot; pure overlay (no AI/game-state change).
- **DOM verification:** the overlay lives in `#ai-board > .heat-layer`; each tile is an absolutely-positioned div with an `rgba(255,159,67,alpha)` background. Match tiles to cells by `offsetLeft/offsetTop`. Assertions that catch regressions:
  - Fired cells have NO tile (alpha null) — tile count = 100 − (#fired).
  - Hunt mode (no outstanding unsunk hits): non-uniform — center cells hotter than corners.
  - After a hit that leaves a ship unsunk, it switches to **target mode** and collapses to a handful of cells concentrated around the hit; cells in-line with the hit are hottest, far cells score 0 (no tile). This proves recompute + the "adjacent-to-hit scores higher / no-fit cells score zero" spec.
  - Toggle off removes all tiles and restores the normal grid.

## Testing online multiplayer (vs Player mode, PR #7+)
- **Setup:** open **two browser tabs** on the same local origin. Tab A = Host, Tab B = Guest.
- **Transport fallback:** if `src/firebase-config.js` exports `null`, online mode uses a **localStorage** backend that syncs across same-origin tabs via the `storage` event — valid functional test but **same-device only**, does NOT prove cross-internet play. Call that out. Clear stale rooms: `Object.keys(localStorage).filter(k=>k.startsWith('bs_room_')).forEach(k=>localStorage.removeItem(k))`.
- **Flow:** Host → **vs Player (online)** → **Create game** (4-char code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`). Guest switches to online mode, types code, **Join**.
- **Cross-tab sync check (core claim):** after Guest joins, Guest shows "Connected!" AND Host status auto-updates to "Opponent connected" with no Host action.
- **Start:** both **Randomize** + **Start Battle**. Host gets first turn; exactly one side on turn.
- **Firing:** fire from on-turn tab, switch tabs, confirm same coord shows matching hit/miss on the other's own-fleet board; turn flips. Fog of war per shooter.
- **Reach game over:** read opponent fleet via DOM `.ship` trick; off-turn side fires filler to pass the turn. Last ship sunk → Victory (confetti + Cognition end card) on winner, Defeat on loser.
- **Cancel room (PR #14):** after Create/Join a red **Cancel room** button tears the room down in place (no reload) and re-enables Create/Join.

## Verifying the naval theme (visual)
Run in `browser_console`:
```js
fetch('assets/battle-bg.svg').then(r => console.log('svg', r.status)); // expect 200
console.log('font', document.fonts.check("16px 'Black Ops One'")); // expect true
console.log('h1', getComputedStyle(document.querySelector('h1')).fontFamily);
```
Then `zoom` into the horizon to confirm warship silhouettes + sun glow render, and into the title to confirm the blocky stencil face.

## Gotchas
- No CI is configured on the repo (static site), so `git_pr_checks` returns 0 checks — expected, not a failure. (Devin Review still runs and posts findings.)
- Animations respect `prefers-reduced-motion`.
- The mood background tints per difficulty (Easy blue / Medium amber / Hard red) and pulses in "overtime" (≤2 ships left) — expect backdrop color shifts during a game; intended.

## Devin Secrets Needed
None. The preview is public and no login is required. The Firebase web config in `src/firebase-config.js` is public-by-design client config (not a Devin secret); access is gated by `database.rules.json`, applied once in the Firebase console.
