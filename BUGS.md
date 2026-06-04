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
