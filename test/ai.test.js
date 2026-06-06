import { test } from "node:test";
import assert from "node:assert/strict";
import { Board, randomFleet } from "../src/board.js";
import { AI, DIFFICULTY } from "../src/ai.js";
import { mulberry32 } from "./helpers.js";

const DIFFICULTIES = [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD];

// Plays a full game where the AI fires at a fleet until everything is sunk.
// Returns { shots, seen } so tests can assert on behavior.
function playOut(difficulty, seed) {
  const rng = mulberry32(seed);
  const board = new Board();
  randomFleet(board, rng);
  const ai = new AI(board.size, rng, difficulty);
  const seen = new Set();
  let shots = 0;
  while (!board.allSunk()) {
    const shot = ai.nextShot();
    assert.ok(shot, "AI must always produce a shot until the board is cleared");
    const key = `${shot[0]},${shot[1]}`;
    assert.equal(seen.has(key), false, `AI repeated a shot at ${key}`);
    seen.add(key);
    const res = board.receiveShot(shot[0], shot[1]);
    ai.registerResult(shot[0], shot[1], res);
    shots += 1;
    assert.ok(shots <= 100, "AI should never need more than 100 shots");
  }
  return { shots, seen };
}

for (const difficulty of DIFFICULTIES) {
  test(`AI (${difficulty}) never repeats or wastes a shot over many games`, () => {
    for (let seed = 1; seed <= 100; seed++) {
      playOut(difficulty, seed);
    }
  });
}

test("AI never fires outside the board", () => {
  for (const difficulty of DIFFICULTIES) {
    const { seen } = playOut(difficulty, 42);
    for (const key of seen) {
      const [r, c] = key.split(",").map(Number);
      assert.ok(r >= 0 && r < 10 && c >= 0 && c < 10, `out of bounds: ${key}`);
    }
  }
}); 

test("nextShot returns null once every cell has been fired at", () => {
  const ai = new AI(10, mulberry32(1), DIFFICULTY.MEDIUM);
  const fired = new Set();
  for (let i = 0; i < 100; i++) {
    const shot = ai.nextShot();
    assert.ok(shot);
    fired.add(`${shot[0]},${shot[1]}`);
    // Tell the AI everything was a miss so it stays in hunt mode.
    ai.registerResult(shot[0], shot[1], { result: "miss", sunk: false });
  }
  assert.equal(fired.size, 100);
  assert.equal(ai.nextShot(), null);
});

test("MEDIUM enters target mode and probes neighbors after a hit", () => {
  const ai = new AI(10, mulberry32(1), DIFFICULTY.MEDIUM);
  // Simulate a hit at (5,5) that did not sink a ship.
  ai.fired.add("5,5");
  ai.registerResult(5, 5, { result: "hit", sunk: false });
  const queued = new Set(ai.targetQueue.map(([r, c]) => `${r},${c}`));
  assert.deepEqual(
    queued,
    new Set(["4,5", "6,5", "5,4", "5,6"]),
    "should queue the four orthogonal neighbors"
  );
});

test("target mode skips cells that were already fired at", () => {
  const ai = new AI(10, mulberry32(1), DIFFICULTY.MEDIUM);
  ai.fired.add("5,5");
  ai.fired.add("4,5"); // pretend this neighbor is already shot
  ai.registerResult(5, 5, { result: "hit", sunk: false });
  // nextShot should never return the already-fired neighbor.
  for (let i = 0; i < 4; i++) {
    const shot = ai.nextShot();
    if (!shot) break;
    assert.notEqual(`${shot[0]},${shot[1]}`, "4,5");
  }
});

test("HARD hunts only on parity (checkerboard) cells", () => {
  const ai = new AI(10, mulberry32(3), DIFFICULTY.HARD);
  // With an empty target queue, the first 30 hunt shots should all be on the
  // same parity ((r+c) even).
  for (let i = 0; i < 30; i++) {
    const shot = ai.nextShot();
    assert.equal((shot[0] + shot[1]) % 2, 0, `hunt shot off parity: ${shot}`);
    ai.registerResult(shot[0], shot[1], { result: "miss", sunk: false });
  }
});

test("HARD fires along the inferred line after two collinear hits", () => {
  const ai = new AI(10, mulberry32(1), DIFFICULTY.HARD);
  // Two horizontal hits at (5,5) and (5,6), ship not yet sunk.
  ai.fired.add("5,5");
  ai.registerResult(5, 5, { result: "hit", sunk: false });
  ai.fired.add("5,6");
  ai.registerResult(5, 6, { result: "hit", sunk: false });
  const queued = new Set(ai.targetQueue.map(([r, c]) => `${r},${c}`));
  // Should extend the row at both ends: (5,4) and (5,7). No vertical probes.
  assert.deepEqual(queued, new Set(["5,4", "5,7"]));
});

test("HARD returns to hunt mode after a ship is sunk", () => {
  const ai = new AI(10, mulberry32(1), DIFFICULTY.HARD);
  ai.fired.add("5,5");
  ai.registerResult(5, 5, { result: "hit", sunk: false });
  assert.ok(ai.targetQueue.length > 0);
  ai.fired.add("5,6");
  ai.registerResult(5, 6, { result: "hit", sunk: true });
  assert.equal(ai.targetQueue.length, 0, "target queue cleared after sink");
  assert.equal(ai.hits.length, 0, "hit tracking cleared after sink");
});
