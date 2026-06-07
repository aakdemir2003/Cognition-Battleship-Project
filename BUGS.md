# Bug Log

A genuine debugging trail kept while building this game. Each entry: symptom,
root cause, fix.

---

## 1. Dragging a ship from the tray did nothing (Phase 1)

- **Symptom:** Pressing and dragging a ship from the tray onto the player board
  never placed a ship. No preview highlight appeared and no errors logged.
- **Root cause:** Placement was implemented with the native HTML5 Drag-and-Drop
  API (`draggable`, `dragstart`/`dragover`/`drop`). Native HTML5 DnD requires a
  real OS drag gesture and silently does nothing for programmatic/synthetic
  pointer input; it's also inconsistent across touch devices and easy to break
  (e.g. forgetting `e.preventDefault()` on `dragover`).
- **Fix:** Replaced native DnD with a custom pointer-event drag: `pointerdown`
  on a tray ship starts a drag, a floating ghost follows the cursor, the cell
  under the pointer is resolved via `document.elementFromPoint` to show a
  valid/invalid placement preview, and `pointerup` commits the placement if
  legal. Works for mouse and touch, and is deterministically testable.
  See `src/main.js` `startDrag`/`onDragMove`/`onDragEnd`.

---

## 2. Ship sprites hid the hit/miss markers on the player's board (design polish)

- **Symptom:** After rendering the new ship sprites across the player's cells,
  incoming enemy hits/splashes were no longer visible — the sprite overlay
  painted on top of the struck cells.
- **Root cause:** The `.ship-layer` overlay is absolutely positioned inside the
  board (`z-index: 1`), while the `.cell` markers default to the auto stacking
  level, so the layer rendered above them.
- **Fix:** Lifted struck cells with `.cell.hit, .cell.miss { z-index: 2; }` so
  explosions/splashes sit above the player's own ship sprites, while a separate
  `.ship-layer.over` (`z-index: 3`) is used only on the targeting grid to reveal
  a sunk enemy ship's full silhouette *above* its red hit cells.

## 3. Ship sprite geometry was offset from the cells

- **Symptom:** Early sprite placement was shifted relative to the underlying
  ship cells.
- **Root cause:** `offsetLeft`/`offsetTop` are measured from the nearest
  positioned ancestor; `.board` wasn't positioned, so offsets resolved against
  `.board-wrap` instead of the grid the overlay lives in.
- **Fix:** Added `position: relative` to `.board` so both the cells and the
  `.ship-layer` share the same coordinate origin; sprite geometry is then read
  from live cell offsets and stays correct at every responsive `--cell` size.
