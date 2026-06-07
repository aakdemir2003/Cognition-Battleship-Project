import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHeatmap } from "../src/heatmap.js";

// Sum of a score grid, for sanity checks.
function total(grid) {
  return grid.flat().reduce((a, b) => a + b, 0);
}

// Max cell and its [r,c] location.
function argmax(grid) {
  let best = -1;
  let at = null;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] > best) {
        best = grid[r][c];
        at = [r, c];
      }
    }
  }
  return { best, at };
}

test("empty board: corners are coldest, center is hottest (hunt mode)", () => {
  const grid = computeHeatmap({ size: 10, remainingSizes: [5, 4, 3, 3, 2] });
  // Every cell can host at least one ship, so all are positive.
  assert.ok(grid.flat().every((v) => v > 0), "no zero cells on an open board");
  // Center cells admit more placements than corners.
  assert.ok(grid[4][4] > grid[0][0], "center beats corner");
  assert.ok(grid[4][4] > grid[0][9], "center beats other corner");
});

test("a known hit makes its orthogonal neighbors the hottest cells", () => {
  const grid = computeHeatmap({
    size: 10,
    hits: [[5, 5]],
    remainingSizes: [3],
  });
  const neighbors = [
    [4, 5],
    [6, 5],
    [5, 4],
    [5, 6],
  ];
  // The hottest cell overall must be one of the hit's four neighbors.
  const { at } = argmax(grid);
  assert.ok(
    neighbors.some(([r, c]) => r === at[0] && c === at[1]),
    `hottest cell ${at} should be adjacent to the hit`
  );
  // Each orthogonal neighbor outscores a far-away cell.
  for (const [r, c] of neighbors) {
    assert.ok(grid[r][c] > grid[0][0], `neighbor ${r},${c} beats far corner`);
  }
});

test("target mode: only cells reachable from an outstanding hit score; the rest are zero", () => {
  const grid = computeHeatmap({
    size: 10,
    hits: [[5, 5]],
    remainingSizes: [3],
  });
  // A cell far from the only hit cannot be reached by any ship covering it.
  assert.equal(grid[0][0], 0, "far cell scores zero in target mode");
  assert.equal(grid[9][9], 0, "far cell scores zero in target mode");
  // Diagonal neighbor is unreachable by a straight ship through the hit.
  assert.equal(grid[4][4], 0, "diagonal-of-hit scores zero");
  // The struck cell itself is never shaded.
  assert.equal(grid[5][5], 0, "the hit cell is not shaded");
});

test("a cell where no remaining ship fits scores zero", () => {
  // Box (0,0) in by misses; smallest remaining ship is length 2, so nothing
  // can be placed covering (0,0).
  const grid = computeHeatmap({
    size: 10,
    misses: [
      [0, 1],
      [1, 0],
    ],
    remainingSizes: [2],
  });
  assert.equal(grid[0][0], 0, "boxed-in corner admits no placement");
  // A normal open cell elsewhere still scores positive.
  assert.ok(grid[5][5] > 0, "open water still scores");
});

test("misses block placements that would cross them", () => {
  const open = computeHeatmap({ size: 10, remainingSizes: [4] });
  const blocked = computeHeatmap({
    size: 10,
    misses: [[0, 2]],
    remainingSizes: [4],
  });
  // Adding a miss can only remove placements, never add them.
  assert.ok(total(blocked) < total(open), "a miss reduces total placements");
  // (0,0) loses the horizontal length-4 placement (0,0)-(0,3) that crosses (0,2).
  assert.ok(blocked[0][0] < open[0][0], "miss reduces a crossing cell's score");
});

test("sunk ship cells are unavailable and never shaded", () => {
  const grid = computeHeatmap({
    size: 10,
    hits: [
      [0, 0],
      [0, 1],
    ],
    sunkCells: [
      [0, 0],
      [0, 1],
    ],
    remainingSizes: [3],
  });
  // With no *outstanding* hits (both are sunk), this is hunt mode again.
  assert.equal(grid[0][0], 0, "sunk cell is not shaded");
  assert.equal(grid[0][1], 0, "sunk cell is not shaded");
  // Open water away from the wreck still scores.
  assert.ok(grid[5][5] > 0, "open water still scores in hunt mode");
});

test("two collinear hits keep scoring the line extensions while far water stays cold", () => {
  // Hits at (5,5) and (5,6); a length-3 ship can extend to (5,4) or (5,7).
  const grid = computeHeatmap({
    size: 10,
    hits: [
      [5, 5],
      [5, 6],
    ],
    remainingSizes: [3],
  });
  // The line-extending cells are reachable from a hit, so they score.
  assert.ok(grid[5][4] > 0, "left extension scores");
  assert.ok(grid[5][7] > 0, "right extension scores");
  // Cells too far from either hit to be covered by a length-3 ship stay zero.
  assert.equal(grid[0][0], 0, "far corner cannot reach a hit");
  assert.equal(grid[5][2], 0, "three cells left of the hits is out of reach");
  // The struck cells themselves are never shaded.
  assert.equal(grid[5][5], 0, "hit cell unshaded");
  assert.equal(grid[5][6], 0, "hit cell unshaded");
});

test("no remaining ships yields an all-zero map", () => {
  const grid = computeHeatmap({ size: 10, remainingSizes: [] });
  assert.equal(total(grid), 0);
});
