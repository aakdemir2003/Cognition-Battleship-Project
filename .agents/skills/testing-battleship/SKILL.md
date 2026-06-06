---
name: testing-battleship
description: End-to-end test the browser Battleship vs. AI game (placement, firing, 3-tier AI, win/lose, reset). Use when verifying gameplay or AI-difficulty changes in this repo.
---

# Testing Battleship vs. AI

Plain HTML/CSS/JS static game. No backend. Deployed copy lives on a devinapps preview URL; the same code runs from `index.html` locally (open via a static server or the deployed URL).

## Golden-path tests
1. **Placement**: drag a ship from the tray onto Your Fleet board; press R / click Rotate to flip orientation; drop a ship overlapping another or off-board and confirm it is rejected.
2. **Randomize + gating**: Randomize fills all 5 ships (17 cells); Start Battle is disabled until the fleet is complete.
3. **Firing feedback**: click the Targeting Grid — hits go red, misses pale; sinking a ship shows a "sunk" announcement; turns alternate player ↔ AI.
4. **(CORE) Hard AI target mode**: select Hard before Start Battle. After the AI's first hit on Your Fleet, its next shots are orthogonally adjacent and follow the inferred ship line until the ship sinks, then it returns to a parity hunt cell far away. This is the key differentiator vs. random firing.
5. **Win/Lose + Play Again**: reach game over; Play Again clears both boards and returns to placement.

## Synthetic drag-and-drop (important gotcha)
Placement uses custom pointer events (pointerdown/move/up), NOT native HTML5 DnD. To drive it with the computer tool:
- Sequence: `mouse_move` to a tray ship segment → `left_mouse_down` → several `mouse_move` steps (small increments) toward the target cell → `left_mouse_up`.
- Use MANY intermediate move steps; too few/large jumps can fail to register the drop. Take a mid-drag screenshot to confirm the ghost label (e.g. "Battleship (4)") and the green/red preview appear before releasing.
- **Layout shift**: when orientation is vertical, the ship tray gets taller and pushes BOTH boards down. Re-screenshot and recompute board coordinates after rotating — coordinates that worked horizontally will miss the board vertically.
- If manual placement is flaky, the **Randomize** button is a reliable way to fill the fleet and proceed (it's also a required feature to test).

## Verifying board state via console
The dark theme makes ship-gray vs. red-preview hard to distinguish visually. Confirm ground truth by reading cell classes (use these as backup to visual evidence, not a replacement):
```js
const b = document.getElementById('player-board'); // or 'ai-board'
let ship=0,hit=0,miss=0,bad=0;
b.querySelectorAll('.cell').forEach(c=>{
  if(c.classList.contains('ship'))ship++;
  if(c.classList.contains('hit'))hit++;
  if(c.classList.contains('miss'))miss++;
  if(c.classList.contains('preview-bad'))bad++;
});
console.log({ship,hit,miss,bad});
```
- Full fleet = 17 ship cells (5+4+3+3+2). Overlap rejection ⇒ ship count does NOT increase.
- `#start-btn`.disabled is true until a full fleet is placed and again after Play Again.
- The `game`/`AI` instances are module-scoped and NOT on `window`, so you cannot read shot ORDER from the console. Prove "next shot after a hit is adjacent" by firing ONE shot at a time and screenshotting the single new AI mark each turn.

## Driving to an end screen
Letting the Hard AI win is the fastest way to reach a game-over screen (you don't know the AI's ship layout, so winning by hand means searching all 17 cells). Fire your own shots in batches to advance turns; check remaining cells with the console snippet above (REMAINING = ship - hit). Win and lose screens share the same end/reset path, so testing one reset path covers both.

## Recording
Maximize the window first (`wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`). Annotate: test_start per golden-path test, assertion (passed/failed) after each verification. Test 4 is stochastic — play enough turns to capture one hit→adjacent-probe→sink→return-to-hunt sequence.

## Devin Secrets Needed
None — the game is a static site with no auth or external services.
