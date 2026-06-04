import { test } from "node:test";
import assert from "node:assert/strict";
import { Board, shipCells, inBounds, randomFleet } from "../src/board.js";
import { ORIENTATION, SHIPS } from "../src/constants.js";
import { mulberry32 } from "./helpers.js";

test("shipCells lays out horizontal and vertical ships correctly", () => {
  assert.deepEqual(shipCells(2, 3, 3, ORIENTATION.HORIZONTAL), [
    [2, 3],
    [2, 4],
    [2, 5],
  ]);
  assert.deepEqual(shipCells(2, 3, 3, ORIENTATION.VERTICAL), [
    [2, 3],
    [3, 3],
    [4, 3],
  ]);
});

test("inBounds rejects off-board coordinates", () => {
  assert.equal(inBounds(0, 0), true);
  assert.equal(inBounds(9, 9), true);
  assert.equal(inBounds(-1, 0), false);
  assert.equal(inBounds(0, 10), false);
});

// --- Placement validation ---
test("placement: rejects ships that run off the board", () => {
  const b = new Board();
  // Carrier (5) starting at col 6 horizontally would need cols 6..10 -> off board.
  assert.equal(b.canPlace(0, 6, 5, ORIENTATION.HORIZONTAL), false);
  // Vertical at row 6 needs rows 6..10 -> off board.
  assert.equal(b.canPlace(6, 0, 5, ORIENTATION.VERTICAL), false);
  assert.equal(b.canPlace(0, 0, 5, ORIENTATION.HORIZONTAL), true);
});

test("placement: rejects overlapping ships", () => {
  const b = new Board();
  b.place("Carrier", 0, 0, 5, ORIENTATION.HORIZONTAL);
  // Vertical ship crossing (0,2) overlaps the carrier.
  assert.equal(b.canPlace(0, 2, 3, ORIENTATION.VERTICAL), false);
  // Adjacent but non-overlapping is allowed (ships may touch).
  assert.equal(b.canPlace(1, 0, 3, ORIENTATION.HORIZONTAL), true);
});

test("place throws on an illegal placement", () => {
  const b = new Board();
  b.place("Carrier", 0, 0, 5, ORIENTATION.HORIZONTAL);
  assert.throws(() => b.place("Cruiser", 0, 2, 3, ORIENTATION.VERTICAL));
});

// --- Hit / miss / sunk detection ---
test("receiveShot reports miss, hit, and sunk; repeats are flagged", () => {
  const b = new Board();
  b.place("Destroyer", 0, 0, 2, ORIENTATION.HORIZONTAL); // cells (0,0),(0,1)

  const miss = b.receiveShot(5, 5);
  assert.equal(miss.result, "miss");
  assert.equal(miss.sunk, false);

  const hit1 = b.receiveShot(0, 0);
  assert.equal(hit1.result, "hit");
  assert.equal(hit1.sunk, false);

  const repeat = b.receiveShot(0, 0);
  assert.equal(repeat.result, "repeat");

  const hit2 = b.receiveShot(0, 1);
  assert.equal(hit2.result, "hit");
  assert.equal(hit2.sunk, true, "ship should be sunk after all cells hit");
  assert.equal(b.isShipSunk(hit2.ship), true);
});

// --- Win condition ---
test("allSunk is only true once the entire fleet is placed and destroyed", () => {
  const b = new Board();
  const rng = mulberry32(7);
  randomFleet(b, rng);
  assert.equal(b.ships.length, SHIPS.length);
  assert.equal(b.allSunk(), false);

  for (const ship of b.ships) {
    for (const [r, c] of ship.cells) b.receiveShot(r, c);
  }
  assert.equal(b.allSunk(), true);
});

test("allSunk is false when not all ships are placed even if placed ones are sunk", () => {
  const b = new Board();
  b.place("Destroyer", 0, 0, 2, ORIENTATION.HORIZONTAL);
  b.receiveShot(0, 0);
  b.receiveShot(0, 1);
  assert.equal(b.allSunk(), false);
});

// --- Random fleet integrity ---
test("randomFleet places the full fleet with no overlaps and in bounds", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const b = new Board();
    randomFleet(b, mulberry32(seed));
    assert.equal(b.ships.length, SHIPS.length);

    const occupied = new Set();
    for (const ship of b.ships) {
      assert.equal(ship.cells.length, ship.size);
      for (const [r, c] of ship.cells) {
        assert.equal(inBounds(r, c), true, `cell ${r},${c} out of bounds`);
        const key = `${r},${c}`;
        assert.equal(occupied.has(key), false, `overlap at ${key}`);
        occupied.add(key);
      }
    }
  }
});
