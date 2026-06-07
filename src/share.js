import { BOARD_SIZE } from "./constants.js";

// --- Shareable result card ---
//
// Builds a Wordle-style text summary of a finished game from the player's
// targeting grid. Pure and DOM-free so it can be unit tested.
//
//   🔥 = a hit, 🟦 = a miss, ⬛ = a cell never fired at
//
// `grid` is a BOARD_SIZE×BOARD_SIZE array of "hit" | "miss" | null (row-major,
// row 0 = A). The header reads e.g.
//   BATTLESHIP — Victory in 41 shots (44% accuracy) on Hard

export const EMOJI = { hit: "🔥", miss: "🟦", none: "⬛" };

export function buildResultText({
  win,
  shots,
  accuracy,
  mode = "Medium",
  grid = [],
  size = BOARD_SIZE,
  url = "",
}) {
  const outcome = win ? "Victory" : "Defeat";
  const shotWord = shots === 1 ? "shot" : "shots";
  const header = `BATTLESHIP — ${outcome} in ${shots} ${shotWord} (${accuracy}% accuracy) on ${mode}`;

  const rows = [];
  for (let r = 0; r < size; r++) {
    let line = "";
    for (let c = 0; c < size; c++) {
      const v = grid[r] && grid[r][c];
      line += v === "hit" ? EMOJI.hit : v === "miss" ? EMOJI.miss : EMOJI.none;
    }
    rows.push(line);
  }

  const parts = [header, "", ...rows];
  if (url) parts.push("", url);
  return parts.join("\n");
}
