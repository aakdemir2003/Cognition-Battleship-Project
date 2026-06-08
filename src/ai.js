import { BOARD_SIZE, SHIPS } from "./constants.js";
import { computeHeatmap } from "./heatmap.js";

export const DIFFICULTY = {
  EASY: "easy",
  MEDIUM: "medium",
  HARD: "hard",
};

// The AI opponent. A single class implements three strategies selected by
// `difficulty`. All strategies share one invariant: nextShot() NEVER returns a
// cell that has already been fired at.
//
//  - EASY:   pure random firing among unfired cells.
//  - MEDIUM: hunt/target. Hunt randomly; after a hit, queue the 4 orthogonal
//            neighbors and probe them until the ship is sunk, then resume hunt.
//  - HARD:   probability density. Every shot fires at the cell where the most
//            legal placements of the remaining (unsunk) ships could still sit,
//            given all known hits, misses and sunk ships (the same optimal model
//            the Tactical View overlay shows). With no outstanding hits this is
//            an efficient, center/parity-weighted hunt that targets the cells
//            most likely to hide a ship; once a ship is hit the model only
//            counts placements covering that hit, so fire concentrates around
//            the hit and follows the ship's line until it is sunk.
export class AI {
  constructor(size = BOARD_SIZE, rng = Math.random, difficulty = DIFFICULTY.MEDIUM) {
    this.size = size;
    this.rng = rng;
    this.difficulty = difficulty;
    this.fired = new Set(); // "r,c" for every cell fired at
    this.targetQueue = []; // [r,c] candidates to probe while hunting a ship (MEDIUM)
    this.hits = []; // [r,c] hits on the current, not-yet-sunk ship (MEDIUM)
    // HARD probability-density bookkeeping:
    this.misses = []; // [r,c] cells known to be misses
    this.allHits = []; // [r,c] every cell hit (sunk or not)
    this.sunkCells = []; // [r,c] cells belonging to fully-sunk ships
    this.remainingSizes = SHIPS.map((s) => s.size); // lengths of unsunk ships
  }

  key(r, c) {
    return `${r},${c}`;
  }

  inBounds(r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  unfired(r, c) {
    return this.inBounds(r, c) && !this.fired.has(this.key(r, c));
  }

  allUnfired() {
    const cells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.fired.has(this.key(r, c))) cells.push([r, c]);
      }
    }
    return cells;
  }

  pick(cells) {
    return cells[Math.floor(this.rng() * cells.length)];
  }

  // Returns the next [r,c] to fire at, or null if the board is exhausted.
  nextShot() {
    let shot;
    if (this.difficulty === DIFFICULTY.EASY) {
      shot = this.randomShot();
    } else if (this.difficulty === DIFFICULTY.HARD) {
      shot = this.probabilityShot() || this.randomShot();
    } else {
      shot = this.targetShot() || this.huntShot();
    }
    if (!shot) return null;
    this.fired.add(this.key(shot[0], shot[1]));
    return shot;
  }

  randomShot() {
    const cells = this.allUnfired();
    return cells.length ? this.pick(cells) : null;
  }

  // MEDIUM hunt: any unfired cell at random.
  huntShot() {
    return this.randomShot();
  }

  // HARD: fire at the unfired cell with the highest probability-density score.
  // Ties are broken at random so the AI is not predictable. Returns null if the
  // model yields no positive score anywhere (caller falls back to randomShot).
  probabilityShot() {
    if (this.remainingSizes.length === 0) return null;
    const scores = computeHeatmap({
      size: this.size,
      hits: this.allHits,
      misses: this.misses,
      sunkCells: this.sunkCells,
      remainingSizes: this.remainingSizes,
    });
    let best = 0;
    let bestCells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.fired.has(this.key(r, c))) continue;
        const s = scores[r][c];
        if (s > best) {
          best = s;
          bestCells = [[r, c]];
        } else if (s === best && s > 0) {
          bestCells.push([r, c]);
        }
      }
    }
    return bestCells.length ? this.pick(bestCells) : null;
  }

  // Target mode (MEDIUM). Returns the next queued probe still unfired, or null.
  targetShot() {
    while (this.targetQueue.length) {
      const [r, c] = this.targetQueue.shift();
      if (this.unfired(r, c)) return [r, c];
    }
    return null;
  }

  // Feeds the result of the AI's last shot back so it can update its strategy.
  // `res` is { result: 'hit'|'miss', ship, sunk }.
  registerResult(r, c, res) {
    if (this.difficulty === DIFFICULTY.EASY) return;

    if (this.difficulty === DIFFICULTY.HARD) {
      if (res.result === "miss") {
        this.misses.push([r, c]);
        return;
      }
      if (res.result === "hit") {
        this.allHits.push([r, c]);
        if (res.sunk && res.ship) {
          for (const [sr, sc] of res.ship.cells) this.sunkCells.push([sr, sc]);
          const idx = this.remainingSizes.indexOf(res.ship.size);
          if (idx !== -1) this.remainingSizes.splice(idx, 1);
        }
      }
      return;
    }

    // MEDIUM hunt/target.
    if (res.result !== "hit") return;
    if (res.sunk) {
      // Ship destroyed: drop all targeting state and go back to hunting.
      this.hits = [];
      this.targetQueue = [];
      return;
    }
    this.hits.push([r, c]);
    this.enqueueTargets(r, c);
  }

  enqueueTargets(r, c) {
    const neighbors = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
    for (const [nr, nc] of neighbors) {
      if (this.unfired(nr, nc)) this.targetQueue.push([nr, nc]);
    }
  }
}
