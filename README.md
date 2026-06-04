# Battleship vs. AI

A polished, single-player [Battleship](https://en.wikipedia.org/wiki/Battleship_(game))
game playable in the browser against an AI opponent. Plain HTML/CSS/JavaScript —
no backend, no build step, no framework — so it deploys cleanly as a static site.

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
hunt after a sink).

## Tech notes

- **Structure**
  - `src/constants.js` — board size, fleet, enums.
  - `src/board.js` — `Board` (placement, shots, sunk/win detection) and
    `randomFleet`. Pure logic, no DOM.
  - `src/ai.js` — the `AI` class implementing all three difficulties.
  - `src/game.js` — `Game` ties the two boards + AI together and tracks turns.
    UI-agnostic so it's driven by both the DOM and the tests.
  - `src/main.js` — DOM rendering and input wiring only.
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
