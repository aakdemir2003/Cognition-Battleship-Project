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

test("HARD opens on a high-probability central cell, never an edge", () => {
  // The probability-density hunt should fire where the most ship placements
  // overlap. On an empty board that is the center, never a corner/edge — which
  // is what makes it strictly better than the old random/parity hunt.
  for (let seed = 1; seed <= 20; seed++) {
    const ai = new AI(10, mulberry32(seed), DIFFICULTY.HARD);
    const [r, c] = ai.nextShot();
    assert.ok(r > 0 && r < 9 && c > 0 && c < 9, `opening shot on edge: ${r},${c}`);
  }
});

test("HARD concentrates fire orthogonally adjacent to a hit (target mode)", () => {
  const ai = new AI(10, mulberry32(1), DIFFICULTY.HARD);
  // A hit at (5,5) that did not sink. The next shot must extend a possible ship
  // through that hit, i.e. one of the four orthogonal neighbors — never a
  // diagonal (no straight ship can cover both (5,5) and a diagonal cell).
  ai.fired.add("5,5");
  ai.registerResult(5, 5, { result: "hit", sunk: false });
  const neighbors = new Set(["4,5", "6,5", "5,4", "5,6"]);
  for (let i = 0; i < 3; i++) {
    const next = ai.probabilityShot();
    assert.ok(
      neighbors.has(`${next[0]},${next[1]}`),
      `target shot not adjacent to the hit: ${next}`
    );
    // mark it fired+miss so the next iteration picks a different neighbor
    ai.fired.add(`${next[0]},${next[1]}`);
    ai.registerResult(next[0], next[1], { result: "miss", sunk: false });
  }
});

test("HARD pursues a struck ship to the kill without wandering off", () => {
  // One length-3 ship at (4,4),(4,5),(4,6); nothing else on the board.
  const ai = new AI(10, mulberry32(7), DIFFICULTY.HARD);
  ai.remainingSizes = [3];
  const shipSet = new Set(["4,4", "4,5", "4,6"]);
  const shipCells = [
    [4, 4],
    [4, 5],
    [4, 6],
  ];
  const hitsLeft = new Set(shipSet);
  // Seed the first hit at the middle cell, then let target mode finish it.
  ai.fired.add("4,5");
  hitsLeft.delete("4,5");
  ai.registerResult(4, 5, { result: "hit", sunk: false });

  let shots = 0;
  while (hitsLeft.size > 0) {
    const shot = ai.probabilityShot() || ai.randomShot();
    assert.ok(shot, "AI must produce a shot");
    const k = `${shot[0]},${shot[1]}`;
    ai.fired.add(k);
    if (shipSet.has(k)) {
      hitsLeft.delete(k);
      const sunk = hitsLeft.size === 0;
      ai.registerResult(shot[0], shot[1], {
        result: "hit",
        sunk,
        ship: sunk ? { size: 3, cells: shipCells } : undefined,
      });
    } else {
      ai.registerResult(shot[0], shot[1], { result: "miss", sunk: false });
    }
    shots += 1;
    assert.ok(shots <= 12, "should finish the ship quickly, not wander");
  }
  // After the sink the ship's size is gone and its cells are recorded.
  assert.equal(ai.remainingSizes.includes(3), false, "sunk size removed");
  assert.equal(ai.sunkCells.length, 3, "sunk cells recorded");
});

test("HARD wins in fewer shots on average than MEDIUM (more advanced)", () => {
  let hard = 0;
  let medium = 0;
  const games = 60;
  for (let seed = 1; seed <= games; seed++) {
    hard += playOut(DIFFICULTY.HARD, seed).shots;
    medium += playOut(DIFFICULTY.MEDIUM, seed).shots;
  }
  assert.ok(
    hard < medium,
    `HARD (${(hard / games).toFixed(1)} avg) should beat MEDIUM (${(
      medium / games
    ).toFixed(1)} avg)`
  );
});
