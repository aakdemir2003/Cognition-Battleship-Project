import { BOARD_SIZE } from "./constants.js";

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
//  - HARD:   parity (checkerboard) hunt so it only fires at cells that can fit
//            the smallest remaining ship; in target mode it infers orientation
//            from 2+ collinear hits and fires along that line.
export class AI {
  constructor(size = BOARD_SIZE, rng = Math.random, difficulty = DIFFICULTY.MEDIUM) {
    this.size = size;
    this.rng = rng;
    this.difficulty = difficulty;
    this.fired = new Set(); // "r,c" for every cell fired at
    this.targetQueue = []; // [r,c] candidates to probe while hunting a ship
    this.hits = []; // [r,c] hits on the current, not-yet-sunk ship
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

  // Hunt mode. MEDIUM hunts at any unfired cell; HARD restricts to a parity
  // (checkerboard) subset, falling back to any unfired cell if that subset is
  // exhausted.
  huntShot() {
    if (this.difficulty === DIFFICULTY.HARD) {
      const parityCells = this.allUnfired().filter(
        ([r, c]) => (r + c) % 2 === 0
      );
      if (parityCells.length) return this.pick(parityCells);
    }
    return this.randomShot();
  }

  // Target mode. Returns the next queued probe that is still unfired, or null.
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
    // HARD: once we have 2+ hits we usually know the orientation, so fire along
    // that line rather than probing every neighbor.
    if (this.difficulty === DIFFICULTY.HARD && this.hits.length >= 2) {
      const directional = this.directionalTargets();
      if (directional.length) {
        this.targetQueue = directional;
        return;
      }
    }
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

  // Given collinear hits, return the unfired cells extending the line at each
  // end. Returns [] if the hits are not (yet) collinear.
  directionalTargets() {
    const rows = this.hits.map((h) => h[0]);
    const cols = this.hits.map((h) => h[1]);
    const sameRow = rows.every((x) => x === rows[0]);
    const sameCol = cols.every((x) => x === cols[0]);
    const ends = [];
    if (sameRow && !sameCol) {
      const r = rows[0];
      const sorted = cols.slice().sort((a, b) => a - b);
      ends.push([r, sorted[0] - 1], [r, sorted[sorted.length - 1] + 1]);
    } else if (sameCol && !sameRow) {
      const c = cols[0];
      const sorted = rows.slice().sort((a, b) => a - b);
      ends.push([sorted[0] - 1, c], [sorted[sorted.length - 1] + 1, c]);
    } else {
      return [];
    }
    return ends.filter(([r, c]) => this.unfired(r, c));
  }
}
