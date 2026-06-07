import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResultText, EMOJI } from "../src/share.js";

// Build a 10×10 grid that's all null (never fired) except the given overrides.
function makeGrid(overrides = {}) {
  const grid = Array.from({ length: 10 }, () => new Array(10).fill(null));
  for (const [key, val] of Object.entries(overrides)) {
    const [r, c] = key.split(",").map(Number);
    grid[r][c] = val;
  }
  return grid;
}

test("header reports outcome, shots, accuracy, and mode", () => {
  const text = buildResultText({
    win: true,
    shots: 41,
    accuracy: 44,
    mode: "Hard",
    grid: makeGrid(),
  });
  assert.ok(
    text.startsWith("BATTLESHIP — Victory in 41 shots (44% accuracy) on Hard"),
    text
  );
});

test("defeat header and singular shot wording", () => {
  const text = buildResultText({
    win: false,
    shots: 1,
    accuracy: 0,
    mode: "Easy",
    grid: makeGrid(),
  });
  assert.ok(text.startsWith("BATTLESHIP — Defeat in 1 shot (0% accuracy) on Easy"));
});

test("grid maps hit/miss/none to the right emoji, one row per board row", () => {
  const grid = makeGrid({ "0,0": "hit", "0,1": "miss" });
  const text = buildResultText({ win: true, shots: 2, accuracy: 50, grid });
  const lines = text.split("\n");
  // Line 0 = header, line 1 = blank, lines 2..11 = the 10 board rows.
  const rows = lines.slice(2, 12);
  assert.equal(rows.length, 10);
  assert.equal(rows[0], EMOJI.hit + EMOJI.miss + EMOJI.none.repeat(8));
  // Untouched rows are all the "none" square (10 per row).
  assert.equal(rows[9], EMOJI.none.repeat(10));
});

test("includes the share URL when provided", () => {
  const text = buildResultText({
    win: true,
    shots: 10,
    accuracy: 100,
    grid: makeGrid(),
    url: "https://example.com/battleship/",
  });
  assert.ok(text.endsWith("https://example.com/battleship/"));
});
