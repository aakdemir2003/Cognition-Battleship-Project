# Battleship vs. AI

A polished [Battleship](https://en.wikipedia.org/wiki/Battleship_(game)) game
playable in the browser — against a built-in AI opponent, or head-to-head
online against another player. Plain HTML/CSS/JavaScript — no backend, no build
step, no framework — so it deploys cleanly as a static site.

**Play it live:** _(GitHub Pages URL added on deploy)_

## How to run locally

The game is fully static. Because it uses ES modules, open it through a local
web server (not `file://`).

```bash
# clone, then from the repo root:
python3 -m http.server 8000   # or:  npm start
# open http://localhost:8000
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

## How to play

1. **Choose a difficulty** — Easy, Medium, or Hard (see below).
2. **Place your fleet** on the left board:
   - **Drag** a ship from the tray onto the board.
   - **Rotate** between horizontal/vertical with the **Rotate** button or the
     **R** key.
   - Or hit **Randomize** to auto-place the whole fleet. **Clear** removes all
     ships. Placement is validated — no overlaps, nothing off-board.
3. Click **Start Battle**.
4. **Fire** by clicking cells on the right **Targeting Grid**. You and the AI
   alternate turns. Hits are red, misses are pale dots, and sunk ships are
   announced and shaded darker.
5. Destroy the entire enemy fleet to win — or lose if yours is sunk first.
   **Play Again** fully resets the game.

## Features

Beyond the core game, the battle screen has a few extras:

- **Shareable result card.** On the WIN/DEFEAT screen, **Copy result** copies a
  Wordle-style emoji summary of your targeting grid to the clipboard — one row
  per board row (🔥 hit, 🟦 miss, ⬛ never fired) under a header like
  `BATTLESHIP — Victory in 41 shots (44% accuracy) on Hard`. It uses the
  Clipboard API with a textarea fallback and shows a **Copied!** confirmation.
- **Enemy admiral commentary.** In vs-Computer mode the AI has a personality
  that quips in the battle log on every hit, miss, and sinking (yours and its
  own). The tone scales with difficulty — encouraging on Easy, neutral on
  Medium, smug on Hard — drawing from several lines per event at random with no
  immediate repeats. Quips are styled distinctly so they don't clutter the shot
  history.
- **Tactical View heatmap.** A toggle above the targeting grid overlays each
  unfired cell with warm shading proportional to how many ways the enemy's
  remaining (unsunk) ships could still legally occupy it, given every hit and
  miss so far. It recomputes after each shot. This is a pure presentation aid
  built only from information you already have (struck cells, sunk ships, and
  the public fleet sizes) — it never reveals hidden ship positions and never
  changes the AI or game state. Toggle it off to restore the normal view.
- **Sound effects.** A small Web Audio synth (no audio files) plays a missile
  launch on every shot, a splash on a miss, an explosion on a hit, a bigger
  blast + sinking groan when a ship is sunk, a victory fanfare / defeat sting on
  game over, and a subtle tick for button presses and ship placement. Audio
  only initialises after your first interaction (browser autoplay policy) and is
  throttled + voice-capped so fast turns never pile into noise. A **Sound**
  toggle (top-right) mutes/unmutes for the session; everything keeps working
  while muted.
- **Per-class ship looks.** Each ship class has its own silhouette and livery —
  Carrier (gunmetal flat-top with a yellow flight-deck stripe), Battleship (dark
  gunmetal with gun turrets), Cruiser (lighter gray-blue), Submarine (dark teal
  with a conning tower), Destroyer (light hull with a red deck stripe) — shown
  consistently in the placement tray, the player-board sprites, and the
  fleet-status icons. Hit/sunk markers still read clearly on every colour.

## Online multiplayer (two players)

Switch the **Mode** toggle to **vs Player (online)** to play another person
instead of the AI:

1. One player clicks **Create game** and shares the 4-character room code.
2. The other player types the code and clicks **Join**.
3. Both place their fleets and click **Start Battle**; play begins once both are
   ready. Turns alternate, and each player only sees what their shots reveal on
   the opponent's board (fog of war).

**Transport.** The site stays fully static. Cross-device play uses
[Firebase Realtime Database](https://firebase.google.com/docs/database). The
project's `firebaseConfig` lives in [`src/firebase-config.js`](./src/firebase-config.js)
(these web-config values are public by design; access is gated by database
security rules). If the config is removed (set to `null`), online mode falls
back to a same-device, cross-tab backend (via `localStorage`) so the flow is
still playable and testable by opening two browser tabs on one machine.

**Security rules.** [`database.rules.json`](./database.rules.json) locks the
database down to game rooms only (everything outside `/rooms/<code>` is denied)
and validates `meta.status`/`meta.turn`. Apply it in the Firebase console
(**Realtime Database → Rules → paste → Publish**) or via the CLI
(`firebase deploy --only database`). This replaces the open 30-day "test mode"
default so the database isn't world-readable/writable after the trial expires.

### Fleet

| Ship       | Size |
| ---------- | ---- |
| Carrier    | 5    |
| Battleship | 4    |
| Cruiser    | 3    |
| Submarine  | 3    |
| Destroyer  | 2    |

## AI difficulty

The AI never fires at the same cell twice on any difficulty.

- **Easy** — fires at random unexplored cells.
- **Medium** — *hunt/target*. Hunts at random until it lands a hit, then probes
  the four orthogonally-adjacent cells until the ship is sunk, then resumes
  hunting.
- **Hard** — *parity hunt + directional targeting*. In hunt mode it only fires
  at checkerboard cells `((row + col) % 2 === 0)`, which is enough to find every
  ship (the smallest is length 2) while spending ~half as many hunting shots.
  After two hits it infers the ship's orientation and fires along that line
  instead of wasting shots on perpendicular neighbors.

Over 200 simulated games, average shots to clear the board: **Easy ≈ 95,
Medium ≈ 70, Hard ≈ 59** — confirming each tier is meaningfully smarter.

## Tests

Core logic is covered by automated tests using Node's built-in test runner
(no dependencies):

```bash
npm test            # or: node --test
```

Coverage includes ship-placement validation, hit/miss/sunk detection, the win
condition, and that the AI never repeats or wastes a shot — plus the
difficulty-specific tactics (parity hunting, directional targeting, returning to
hunt after a sink). The newer features are covered too: the **tactical heatmap**
math (`test/heatmap.test.js` — cells adjacent to a known hit score higher, cells
where no remaining ship fits score zero, misses and sunk cells block
placements), the **result card** text builder (`test/share.test.js`), and the
**admiral commentary** picker (`test/commentary.test.js` — tone pools per
difficulty, no immediate repeats).

## Tech notes

- **Structure**
  - `src/constants.js` — board size, fleet, enums.
  - `src/board.js` — `Board` (placement, shots, sunk/win detection) and
    `randomFleet`. Pure logic, no DOM.
  - `src/ai.js` — the `AI` class implementing all three difficulties.
  - `src/game.js` — `Game` ties the two boards + AI together and tracks turns.
    UI-agnostic so it's driven by both the DOM and the tests.
  - `src/main.js` — DOM rendering and input wiring only.
  - `src/heatmap.js` — pure Tactical View math: scores each unfired cell by the
    number of legal placements of the enemy's remaining ships. No DOM.
  - `src/share.js` — builds the Wordle-style shareable result text. No DOM.
  - `src/commentary.js` — the enemy admiral's quip pools (per difficulty/event)
    and a no-immediate-repeat picker. No DOM.
  - `src/net.js` — transport abstraction exposing a uniform `Room` API over two
    interchangeable backends: Firebase Realtime Database (cross-device) and
    `localStorage` (same-device, cross-tab fallback).
  - `src/online.js` — `OnlineMatch`, the 1v1 state machine (create/join, ready
    sync, turn alternation, authoritative own-board shot/ack handshake).
  - `src/firebase-config.js` — the Firebase web config (public by design); set
    to `null` to force the `localStorage` fallback.
  - `index.html` / `styles.css` — markup and styling.
- **No framework / no bundler.** Source is split into ES modules and loaded with
  `<script type="module">`. This keeps it trivially deployable to any static
  host and keeps the game logic testable in Node by importing the same modules.
- **Placement uses pointer events**, not the native HTML5 drag-and-drop API
  (see `BUGS.md` for why), which also makes it work on touch.
- **Determinism for tests:** all randomness flows through an injectable `rng`,
  so tests seed a small PRNG (`test/helpers.js`) for reproducible games.

## Project log

See [`BUGS.md`](./BUGS.md) for the debugging trail kept while building this.
