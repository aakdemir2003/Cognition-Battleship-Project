import { BOARD_SIZE } from "./constants.js";

// Phase 1 placeholder AI: fires at a random un-fired cell. This is replaced by
// the hunt/target AI in Phase 2. It still guarantees it never repeats a shot.
export class RandomAI {
  constructor(size = BOARD_SIZE, rng = Math.random) {
    this.size = size;
    this.rng = rng;
    this.available = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) this.available.push([r, c]);
    }
  }

  nextShot() {
    if (this.available.length === 0) return null;
    const idx = Math.floor(this.rng() * this.available.length);
    return this.available.splice(idx, 1)[0];
  }

  // No-op hooks so the game loop has a stable interface across AI versions.
  registerResult() {}
}
