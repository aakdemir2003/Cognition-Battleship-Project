import { BOARD_SIZE } from "./constants.js";

// --- Tactical heatmap math ---
//
// Given only what the *player* legitimately knows about the enemy board — which
// cells have been fired at (hits vs. misses), which enemy ships have been sunk,
// and therefore which ship sizes remain — score every still-unfired cell by how
// many ways the remaining (unsunk) enemy ships could still legally occupy it.
//
// This is a pure, DOM-free function so it can be unit tested. It NEVER looks at
// the actual positions of unsunk enemy ships, so it cannot leak hidden info and
// has no effect on game state or AI behavior — it is a presentation aid only.
//
// Model: each remaining ship is counted independently (the standard Battleship
// "probability density" map). A placement is *legal* if every cell is in bounds,
// is not a known miss, and is not occupied by an already-sunk ship.
//
// Hits steer the map. When there are outstanding hits (hits not yet part of a
// sunk ship), only placements that cover at least one such hit are counted —
// the unsunk ship that was struck must extend from there — which concentrates
// the score on the unfired cells around known hits ("target mode"). With no
// outstanding hits every legal placement is counted ("hunt mode").
//
// Inputs (all coordinates are [row, col]):
//   size           board dimension (default BOARD_SIZE)
//   hits           array of [r,c] cells known to be hits
//   misses         array of [r,c] cells known to be misses
//   sunkCells      array of [r,c] cells belonging to fully-sunk ships
//   remainingSizes array of sizes of ships still unsunk (e.g. [5,3,2])
//
// Returns a size×size array of integer scores. Cells that have already been
// fired at (hits, misses, sunk) are left at 0 — the overlay only shades unfired
// water.
export function computeHeatmap({
  size = BOARD_SIZE,
  hits = [],
  misses = [],
  sunkCells = [],
  remainingSizes = [],
} = {}) {
  const key = (r, c) => `${r},${c}`;
  const hitSet = new Set(hits.map(([r, c]) => key(r, c)));
  const missSet = new Set(misses.map(([r, c]) => key(r, c)));
  const sunkSet = new Set(sunkCells.map(([r, c]) => key(r, c)));

  // Outstanding hits = struck ship cells whose ship is not yet sunk.
  const outstanding = hits.filter(([r, c]) => !sunkSet.has(key(r, c)));
  const targetMode = outstanding.length > 0;

  const scores = Array.from({ length: size }, () => new Array(size).fill(0));

  const inBounds = (r, c) => r >= 0 && r < size && c >= 0 && c < size;
  const fired = (r, c) =>
    hitSet.has(key(r, c)) || missSet.has(key(r, c)) || sunkSet.has(key(r, c));

  // A placement is legal if no cell is off-board, a known miss, or part of an
  // already-sunk ship (that ship is resolved, so its cells are unavailable).
  const legal = (cells) =>
    cells.every(
      ([r, c]) => inBounds(r, c) && !missSet.has(key(r, c)) && !sunkSet.has(key(r, c))
    );

  const coversOutstandingHit = (cells) =>
    cells.some(([r, c]) => hitSet.has(key(r, c)) && !sunkSet.has(key(r, c)));

  for (const len of remainingSizes) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Horizontal then vertical. A length-1 ship would be counted twice, so
        // only take its horizontal orientation (the fleet has none, but guard).
        const orientations = len === 1 ? [true] : [true, false];
        for (const horiz of orientations) {
          const cells = [];
          for (let i = 0; i < len; i++) {
            cells.push(horiz ? [r, c + i] : [r + i, c]);
          }
          if (!legal(cells)) continue;
          if (targetMode && !coversOutstandingHit(cells)) continue;
          for (const [cr, cc] of cells) {
            // Only shade unfired water; struck cells already show their result.
            if (!fired(cr, cc)) scores[cr][cc] += 1;
          }
        }
      }
    }
  }

  return scores;
}
