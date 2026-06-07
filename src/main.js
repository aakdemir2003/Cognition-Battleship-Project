import { BOARD_SIZE, SHIPS, ORIENTATION } from "./constants.js";
import { shipCells } from "./board.js";
import { Game, PHASE } from "./game.js";
import { DIFFICULTY } from "./ai.js";
import { launchStrike, launchConfetti } from "./effects.js";
import { OnlineMatch } from "./online.js";
import { isCloudConfigured } from "./net.js";
import { buildResultText } from "./share.js";
import { createCommentator, eventFor } from "./commentary.js";
import { computeHeatmap } from "./heatmap.js";

const DIFFICULTY_DESC = {
  [DIFFICULTY.EASY]: "Fires at random — never repeats a shot.",
  [DIFFICULTY.MEDIUM]: "Hunts, then targets adjacent cells after a hit.",
  [DIFFICULTY.HARD]: "Checkerboard hunt + tracks ship orientation. Brutal.",
};

const game = new Game({ difficulty: DIFFICULTY.MEDIUM });

// --- DOM references ---
const els = {
  status: document.getElementById("status"),
  setup: document.getElementById("setup"),
  difficultyGroup: document.getElementById("difficulty-group"),
  difficultyDesc: document.getElementById("difficulty-desc"),
  shipTray: document.getElementById("ship-tray"),
  rotateBtn: document.getElementById("rotate-btn"),
  randomizeBtn: document.getElementById("randomize-btn"),
  resetPlacementBtn: document.getElementById("reset-placement-btn"),
  startBtn: document.getElementById("start-btn"),
  playerBoard: document.getElementById("player-board"),
  aiBoard: document.getElementById("ai-board"),
  endScreen: document.getElementById("end-screen"),
  endTitle: document.getElementById("end-title"),
  endMessage: document.getElementById("end-message"),
  statShots: document.getElementById("stat-shots"),
  statAccuracy: document.getElementById("stat-accuracy"),
  playAgainBtn: document.getElementById("play-again-btn"),
  copyResultBtn: document.getElementById("copy-result-btn"),
  copyFeedback: document.getElementById("copy-feedback"),
  tacticalBtn: document.getElementById("tactical-btn"),
  battleLog: document.getElementById("battle-log"),
  playerColLabels: document.getElementById("player-col-labels"),
  playerRowLabels: document.getElementById("player-row-labels"),
  aiColLabels: document.getElementById("ai-col-labels"),
  aiRowLabels: document.getElementById("ai-row-labels"),
  playerPad: document.getElementById("player-pad"),
  enemyPad: document.getElementById("enemy-pad"),
  playerRoster: document.getElementById("player-roster"),
  enemyRoster: document.getElementById("enemy-roster"),
  modeGroup: document.getElementById("mode-group"),
  difficultyWrap: document.getElementById("difficulty-wrap"),
  onlinePanel: document.getElementById("online-panel"),
  createGameBtn: document.getElementById("create-game-btn"),
  joinCodeInput: document.getElementById("join-code-input"),
  joinGameBtn: document.getElementById("join-game-btn"),
  cancelRoomBtn: document.getElementById("cancel-room-btn"),
  onlineStatus: document.getElementById("online-status"),
};

// True while a strike animation is in flight, to block further input until the
// player's turn comes back around.
let busy = false;

// Placement UI state.
let orientation = ORIENTATION.HORIZONTAL;
let draggingShip = null; // { name, size }

// --- Online multiplayer state ---
// mode is "ai" (vs computer) or "online" (1v1 over the network).
let mode = "ai";
let online = null; // OnlineMatch instance while in online mode
let onlineMyTurn = false;
// Fog-of-war view of the opponent's board: only what their acks have revealed.
let enemyView = { shots: new Map(), sunkShips: new Set(), sunkCells: new Map() };

function resetEnemyView() {
  enemyView = { shots: new Map(), sunkShips: new Set(), sunkCells: new Map() };
}

// Player shot accuracy tally for the end-game summary.
let stats = { shots: 0, hits: 0 };

// Whether the player won the last finished game (for the shareable result card).
let lastWin = false;

// Tactical heatmap overlay toggle (a pure presentation aid on the targeting grid).
let tacticalView = false;

function setStatus(text) {
  els.status.textContent = text;
}

// Grid coordinate for a cell, e.g. (0,0) -> "A1", (9,4) -> "J5".
// Rows are letters A–J, columns are numbers 1–10.
function coord(row, col) {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

// Builds the A–J row labels and 1–10 column labels around a board. Each label
// strip is a grid that mirrors the board's track sizing so labels line up with
// their cells at every responsive cell size.
function buildAxisLabels(colEl, rowEl) {
  colEl.innerHTML = "";
  rowEl.innerHTML = "";
  for (let c = 0; c < BOARD_SIZE; c++) {
    const s = document.createElement("span");
    s.className = "axis-label";
    s.textContent = c + 1;
    colEl.appendChild(s);
  }
  for (let r = 0; r < BOARD_SIZE; r++) {
    const s = document.createElement("span");
    s.className = "axis-label";
    s.textContent = String.fromCharCode(65 + r);
    rowEl.appendChild(s);
  }
}

// --- Battle log: a scrolling record of every shot with its coordinate. ---
function logShot(who, row, col, res) {
  const li = document.createElement("li");
  const mine = who === "You";
  li.className = `log-entry ${mine ? "log-you" : "log-enemy"}`;
  let outcome;
  if (res.result === "hit") {
    const name = res.sunk ? res.ship?.name || res.shipName : null;
    outcome = res.sunk ? `Sunk ${name}!` : "Hit";
  } else {
    outcome = "Miss";
  }
  li.innerHTML =
    `<span class="log-who">${who}</span>` +
    `<span class="log-coord">${coord(row, col)}</span>` +
    `<span class="log-outcome log-${res.result}${
      res.sunk ? " log-sunk" : ""
    }">${outcome}</span>`;
  els.battleLog.appendChild(li);
  els.battleLog.scrollTop = els.battleLog.scrollHeight;
}

function clearBattleLog() {
  els.battleLog.innerHTML = "";
}

// The enemy admiral's running commentary. Quips are styled distinctly from the
// shot history so they don't clutter it. Only used in vs-Computer mode.
const commentator = createCommentator();

function logQuip(who, res) {
  const event = eventFor(who, res);
  const line = commentator.quip(game.difficulty, event);
  if (!line) return;
  const li = document.createElement("li");
  li.className = "log-quip";
  li.innerHTML =
    `<span class="quip-admiral" aria-hidden="true">\u2693</span>` +
    `<span class="quip-text">${line}</span>`;
  els.battleLog.appendChild(li);
  els.battleLog.scrollTop = els.battleLog.scrollHeight;
}

// --- Board rendering ---
function buildGrid(container) {
  container.innerHTML = "";
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      container.appendChild(cell);
    }
  }
}

function cellAt(container, row, col) {
  return container.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

// Tags a ship's cells so CSS can draw a continuous hull: orientation plus which
// segment this cell is (bow/mid/stern), based on its index along the ship.
function applyHullClasses(container, ship) {
  const horiz = ship.orientation === ORIENTATION.HORIZONTAL;
  ship.cells.forEach(([r, c], i) => {
    const cell = cellAt(container, r, c);
    if (!cell) return;
    cell.classList.add("ship", horiz ? "ship-h" : "ship-v");
    const seg =
      i === 0 ? "ship-bow" : i === ship.cells.length - 1 ? "ship-stern" : "ship-mid";
    cell.classList.add(seg);
  });
}

// Returns (creating if needed) the absolute overlay layer a board draws its
// ship sprites into. `over` lifts the layer above the hit/miss markers so a
// revealed sunk silhouette sits on top of its red hit cells (targeting grid);
// otherwise it sits below so hit markers stay visible (player's own board).
function getShipLayer(boardEl, over) {
  let layer = boardEl.querySelector(":scope > .ship-layer");
  if (!layer) {
    layer = document.createElement("div");
    boardEl.appendChild(layer);
  }
  layer.className = `ship-layer${over ? " over" : ""}`;
  return layer;
}

// Draws one ship sprite spanning the given [r,c] cells. Geometry is read from
// the live cell offsets so it stays correct at every responsive cell size; the
// sprite is sized to the long axis and rotated 90° for vertical ships.
function drawShipSprite(boardEl, layer, cells, sunk) {
  const first = cellAt(boardEl, cells[0][0], cells[0][1]);
  const last = cellAt(boardEl, cells[cells.length - 1][0], cells[cells.length - 1][1]);
  if (!first || !last) return;
  const horiz = cells.length < 2 || cells[0][0] === cells[1][0];
  const left = Math.min(first.offsetLeft, last.offsetLeft);
  const top = Math.min(first.offsetTop, last.offsetTop);
  const right = Math.max(first.offsetLeft + first.offsetWidth, last.offsetLeft + last.offsetWidth);
  const bottom = Math.max(first.offsetTop + first.offsetHeight, last.offsetTop + last.offsetHeight);
  const boxW = right - left;
  const boxH = bottom - top;
  const long = Math.max(boxW, boxH);
  const thick = Math.min(boxW, boxH);
  const sprite = document.createElement("div");
  sprite.className = `ship-sprite${sunk ? " sunk" : ""}`;
  sprite.style.width = `${long}px`;
  sprite.style.height = `${thick}px`;
  sprite.style.left = `${left + boxW / 2 - long / 2}px`;
  sprite.style.top = `${top + boxH / 2 - thick / 2}px`;
  if (!horiz) sprite.style.transform = "rotate(90deg)";
  layer.appendChild(sprite);
}

// Re-renders all ship sprites for a board. `ships` is a list of { cells } and
// `over`/`sunk` control layering and styling.
function renderShipSprites(boardEl, ships, { over = false, sunk = false } = {}) {
  const layer = getShipLayer(boardEl, over);
  layer.innerHTML = "";
  for (const ship of ships) drawShipSprite(boardEl, layer, ship.cells, sunk);
}

// Renders the player's own board, showing ships and any shots taken against it.
function renderPlayerBoard() {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      cellAt(els.playerBoard, r, c).className = "cell";
    }
  }
  for (const ship of game.playerBoard.ships) {
    applyHullClasses(els.playerBoard, ship);
  }
  for (const key of game.playerBoard.shots) {
    const [r, c] = key.split(",").map(Number);
    const cell = cellAt(els.playerBoard, r, c);
    const ship = game.playerBoard.shipAt(r, c);
    if (ship) {
      cell.classList.add("hit");
      if (game.playerBoard.isShipSunk(ship)) cell.classList.add("sunk");
    } else {
      cell.classList.add("miss");
    }
  }
  // Ship sprites sit below the hit/miss markers so strikes stay visible.
  renderShipSprites(els.playerBoard, game.playerBoard.ships);
  updateRosters();
}

// Renders the targeting grid: only shots are visible, and an enemy ship's full
// silhouette is revealed only once it is fully sunk.
function renderAiBoard() {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      cellAt(els.aiBoard, r, c).className = "cell";
    }
  }
  for (const key of game.aiBoard.shots) {
    const [r, c] = key.split(",").map(Number);
    const cell = cellAt(els.aiBoard, r, c);
    const ship = game.aiBoard.shipAt(r, c);
    if (ship) {
      cell.classList.add("hit");
    } else {
      cell.classList.add("miss");
    }
  }
  const sunkShips = [];
  for (const ship of game.aiBoard.ships) {
    if (game.aiBoard.isShipSunk(ship)) {
      for (const [r, c] of ship.cells) {
        cellAt(els.aiBoard, r, c).classList.add("hit", "sunk");
      }
      sunkShips.push(ship);
    }
  }
  // Reveal the full ship silhouette (above the red hit cells) for sunk ships.
  renderShipSprites(els.aiBoard, sunkShips, { over: true, sunk: true });
  updateRosters();
  renderHeatmap();
}

// --- Fleet rosters: a ship silhouette per vessel on each side, dimmed when sunk.
function buildRosters() {
  for (const el of [els.playerRoster, els.enemyRoster]) {
    el.innerHTML = "";
    for (const { name, size } of SHIPS) {
      const row = document.createElement("div");
      row.className = "roster-ship";
      row.dataset.name = name;

      const silo = document.createElement("div");
      silo.className = `silo silo-${size}`;
      for (let i = 0; i < size; i++) {
        const seg = document.createElement("span");
        seg.className = "silo-seg";
        silo.appendChild(seg);
      }

      const label = document.createElement("span");
      label.className = "roster-label";
      label.textContent = name;

      row.append(silo, label);
      el.appendChild(row);
    }
  }
  updateRosters();
}

function updateRosters() {
  const mark = (rosterEl, board) => {
    rosterEl.querySelectorAll(".roster-ship").forEach((row) => {
      const ship = board.ships.find((s) => s.name === row.dataset.name);
      row.classList.toggle("sunk", !!ship && board.isShipSunk(ship));
    });
  };
  mark(els.playerRoster, game.playerBoard);
  if (mode === "online") {
    // Enemy ships are hidden; mark sunk only from acked sinkings.
    els.enemyRoster.querySelectorAll(".roster-ship").forEach((row) => {
      row.classList.toggle("sunk", enemyView.sunkShips.has(row.dataset.name));
    });
  } else {
    mark(els.enemyRoster, game.aiBoard);
  }
}

// Renders the targeting grid in online mode from the fog-of-war enemy view:
// hits/misses we've been told about, plus a revealed hull for any sunk ship.
function renderEnemyView() {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      cellAt(els.aiBoard, r, c).className = "cell";
    }
  }
  for (const [key, info] of enemyView.shots) {
    const [r, c] = key.split(",").map(Number);
    const cell = cellAt(els.aiBoard, r, c);
    cell.classList.add(info.result === "hit" ? "hit" : "miss");
  }
  for (const [, cells] of enemyView.sunkCells) {
    cells.forEach(([r, c]) => {
      cellAt(els.aiBoard, r, c).classList.add("hit", "sunk");
    });
  }
  const sunk = [...enemyView.sunkCells.values()].map((cells) => ({ cells }));
  renderShipSprites(els.aiBoard, sunk, { over: true, sunk: true });
  updateRosters();
  renderHeatmap();
}

// --- Tactical heatmap overlay ---
//
// A pure presentation layer over the targeting grid. It shades each unfired
// cell by how many ways the enemy's remaining unsunk ships could still legally
// occupy it (see heatmap.js). It reads only player-known information (struck
// cells, sunk ships, and the public fleet composition) — never hidden ship
// positions — so it cannot affect the AI or game state.

// Gathers the known-board info the heatmap needs, from whichever mode is active.
function knownBoardInfo() {
  const hits = [];
  const misses = [];
  const sunkCells = [];
  let remainingSizes = [];

  if (mode === "online") {
    for (const [key, info] of enemyView.shots) {
      const [r, c] = key.split(",").map(Number);
      (info.result === "hit" ? hits : misses).push([r, c]);
    }
    for (const cells of enemyView.sunkCells.values()) {
      for (const [r, c] of cells) sunkCells.push([r, c]);
    }
    remainingSizes = SHIPS.filter((s) => !enemyView.sunkShips.has(s.name)).map(
      (s) => s.size
    );
  } else {
    for (const key of game.aiBoard.shots) {
      const [r, c] = key.split(",").map(Number);
      (game.aiBoard.shipAt(r, c) ? hits : misses).push([r, c]);
    }
    for (const ship of game.aiBoard.ships) {
      if (game.aiBoard.isShipSunk(ship)) {
        for (const [r, c] of ship.cells) sunkCells.push([r, c]);
      } else {
        remainingSizes.push(ship.size);
      }
    }
  }
  return { hits, misses, sunkCells, remainingSizes };
}

function getHeatLayer() {
  let layer = els.aiBoard.querySelector(":scope > .heat-layer");
  if (!layer) {
    layer = document.createElement("div");
    els.aiBoard.appendChild(layer);
  }
  layer.className = "heat-layer";
  return layer;
}

// Redraws the overlay from the current known board. No-op (and clears) when the
// toggle is off, so flipping it off restores the normal targeting view.
function renderHeatmap() {
  const layer = getHeatLayer();
  layer.innerHTML = "";
  if (!tacticalView) return;

  const { hits, misses, sunkCells, remainingSizes } = knownBoardInfo();
  const scores = computeHeatmap({
    size: BOARD_SIZE,
    hits,
    misses,
    sunkCells,
    remainingSizes,
  });
  let max = 0;
  for (const row of scores) for (const v of row) if (v > max) max = v;
  if (max <= 0) return;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const v = scores[r][c];
      if (v <= 0) continue;
      const cell = cellAt(els.aiBoard, r, c);
      const tile = document.createElement("div");
      tile.className = "heat-cell";
      // Subtle floor so even low-probability cells read; ramp warm to the peak.
      const alpha = 0.1 + 0.62 * (v / max);
      tile.style.left = `${cell.offsetLeft}px`;
      tile.style.top = `${cell.offsetTop}px`;
      tile.style.width = `${cell.offsetWidth}px`;
      tile.style.height = `${cell.offsetHeight}px`;
      tile.style.background = `rgba(255, 159, 67, ${alpha.toFixed(3)})`;
      layer.appendChild(tile);
    }
  }
}

function setTacticalView(on) {
  tacticalView = on;
  els.aiBoard.classList.toggle("tactical", on);
  els.tacticalBtn.classList.toggle("active", on);
  els.tacticalBtn.setAttribute("aria-pressed", on ? "true" : "false");
  renderHeatmap();
}

// --- Dynamic background: tint by who's ahead + late-game "overtime" pulse ---
function shipsRemaining(board) {
  return board.ships.filter((s) => !board.isShipSunk(s)).length;
}

// Shifts the backdrop glow green/red depending on the score, and switches on the
// pulsing "overtime" atmosphere once either fleet is nearly destroyed.
function updateAtmosphere() {
  const inBattle =
    mode === "online"
      ? !!(online && online.started && !online.ended)
      : game.phase === PHASE.PLAYER_TURN || game.phase === PHASE.AI_TURN;

  if (!inBattle) {
    document.body.style.setProperty("--win-a", "0");
    document.body.style.setProperty("--lose-a", "0");
    document.body.classList.remove("overtime");
    return;
  }

  const playerLeft = shipsRemaining(game.playerBoard);
  const enemyLeft =
    mode === "online"
      ? SHIPS.length - enemyView.sunkShips.size
      : shipsRemaining(game.aiBoard);
  // Positive when the player is ahead (has sunk more enemy ships than lost).
  const lead = playerLeft - enemyLeft;
  const intensity = Math.min(0.12 + Math.abs(lead) * 0.11, 0.5);

  document.body.style.setProperty("--win-a", lead > 0 ? `${intensity}` : "0");
  document.body.style.setProperty("--lose-a", lead < 0 ? `${intensity}` : "0");

  // Overtime: tension ramps up once a fleet is down to its last two ships.
  const overtime = Math.min(playerLeft, enemyLeft) <= 2;
  document.body.classList.toggle("overtime", overtime);
}

// --- Placement: ship tray ---
function buildTray() {
  els.shipTray.innerHTML = "";
  for (const { name, size } of SHIPS) {
    const el = document.createElement("div");
    el.className = "tray-ship";
    el.dataset.name = name;
    el.dataset.size = size;
    el.title = `${name} (${size})`;
    for (let i = 0; i < size; i++) {
      const seg = document.createElement("div");
      seg.className = "seg";
      el.appendChild(seg);
    }
    el.addEventListener("pointerdown", (e) => startDrag(e, name, size));
    els.shipTray.appendChild(el);
  }
  refreshTrayOrientation();
}

function refreshTrayOrientation() {
  els.shipTray.querySelectorAll(".tray-ship").forEach((el) => {
    el.classList.toggle("vertical", orientation === ORIENTATION.VERTICAL);
  });
}

function markTrayPlaced() {
  els.shipTray.querySelectorAll(".tray-ship").forEach((el) => {
    const placed = game.playerBoard.ships.some(
      (s) => s.name === el.dataset.name
    );
    el.dataset.placed = placed ? "true" : "false";
  });
  updateStartEnabled();
}

// In AI mode, Start needs a full fleet. In online mode it also needs an active
// room (created or joined) so there is an opponent channel to be "ready" on.
function updateStartEnabled() {
  const fleetReady = game.playerBoard.allShipsPlaced();
  els.startBtn.disabled = !fleetReady || (mode === "online" && !online);
}

// --- Placement: pointer-based drag & drop onto player board ---
// Native HTML5 drag-and-drop is fragile (and untestable via synthetic input),
// so placement uses pointer events: press a tray ship, drag over the board to
// preview, release to drop. Works for mouse and touch.
let dragGhost = null;

function clearPreview() {
  els.playerBoard
    .querySelectorAll(".preview-ok, .preview-bad")
    .forEach((c) => c.classList.remove("preview-ok", "preview-bad"));
}

function previewPlacement(row, col, size) {
  clearPreview();
  const ok = game.playerBoard.canPlace(row, col, size, orientation);
  const cells = shipCells(row, col, size, orientation);
  for (const [r, c] of cells) {
    const cell = cellAt(els.playerBoard, r, c);
    if (cell) cell.classList.add(ok ? "preview-ok" : "preview-bad");
  }
}

// Maps a screen point to a board cell using elementFromPoint.
function cellFromPoint(x, y) {
  const target = document.elementFromPoint(x, y);
  if (!target) return null;
  const cell = target.closest(".cell");
  if (!cell || !els.playerBoard.contains(cell)) return null;
  return { row: +cell.dataset.row, col: +cell.dataset.col };
}

function startDrag(e, name, size) {
  if (game.phase !== PHASE.PLACEMENT) return;
  e.preventDefault();
  draggingShip = { name, size };

  dragGhost = document.createElement("div");
  dragGhost.className = "drag-ghost";
  dragGhost.textContent = `${name} (${size})`;
  document.body.appendChild(dragGhost);
  moveGhost(e.clientX, e.clientY);

  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
}

function moveGhost(x, y) {
  if (!dragGhost) return;
  dragGhost.style.left = `${x + 12}px`;
  dragGhost.style.top = `${y + 12}px`;
}

function onDragMove(e) {
  if (!draggingShip) return;
  moveGhost(e.clientX, e.clientY);
  const hit = cellFromPoint(e.clientX, e.clientY);
  if (hit) previewPlacement(hit.row, hit.col, draggingShip.size);
  else clearPreview();
}

function onDragEnd(e) {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  if (dragGhost) {
    dragGhost.remove();
    dragGhost = null;
  }
  const hit = draggingShip && cellFromPoint(e.clientX, e.clientY);
  if (
    hit &&
    game.playerBoard.canPlace(hit.row, hit.col, draggingShip.size, orientation)
  ) {
    game.playerBoard.remove(draggingShip.name);
    game.playerBoard.place(
      draggingShip.name,
      hit.row,
      hit.col,
      draggingShip.size,
      orientation
    );
    renderPlayerBoard();
    markTrayPlaced();
  }
  clearPreview();
  draggingShip = null;
}

// --- Firing ---
function handlePlayerShot(e) {
  if (mode === "online") return handleOnlineShot(e);
  if (game.phase !== PHASE.PLAYER_TURN || busy) return;
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const row = +cell.dataset.row;
  const col = +cell.dataset.col;
  const res = game.playerFire(row, col);
  if (!res) return;

  busy = true;
  els.aiBoard.classList.remove("targetable");
  setStatus("Firing\u2026");
  launchStrike({
    targetCell: cellAt(els.aiBoard, row, col),
    originEl: els.playerPad,
    side: "player",
    hit: res.result === "hit",
  }).then(() => {
    renderAiBoard();
    updateAtmosphere();
    stats.shots++;
    if (res.result === "hit") stats.hits++;
    logShot("You", row, col, res);
    logQuip("You", res);
    announceShot(res, "You");
    if (game.phase === PHASE.OVER) {
      busy = false;
      return endGame();
    }
    updateTurnUi();
    // Let the player see their result before the AI responds.
    setTimeout(aiTurn, 450);
  });
}

function aiTurn() {
  if (game.phase !== PHASE.AI_TURN) {
    busy = false;
    return;
  }
  const res = game.aiFire();
  if (!res) {
    busy = false;
    return;
  }
  setStatus("Incoming fire\u2026");
  launchStrike({
    targetCell: cellAt(els.playerBoard, res.row, res.col),
    originEl: els.enemyPad,
    side: "enemy",
    hit: res.result === "hit",
  }).then(() => {
    renderPlayerBoard();
    updateAtmosphere();
    logShot("Enemy", res.row, res.col, res);
    logQuip("Enemy", res);
    announceShot(res, "Enemy");
    if (game.phase === PHASE.OVER) {
      busy = false;
      return endGame();
    }
    updateTurnUi();
    busy = false;
  });
}

function announceShot(res, who) {
  if (res.result === "hit") {
    if (res.sunk) {
      setStatus(`${who} sunk the ${res.ship.name}!`);
    } else {
      setStatus(`${who} scored a hit!`);
    }
  } else if (res.result === "miss") {
    setStatus(`${who} missed.`);
  }
}

function updateTurnUi() {
  if (game.phase === PHASE.PLAYER_TURN) {
    els.aiBoard.classList.add("targetable");
    if (els.status.textContent.indexOf("sunk") === -1) {
      // keep last announcement but hint whose turn it is
    }
  } else {
    els.aiBoard.classList.remove("targetable");
  }
}

// --- Online firing ---
function handleOnlineShot(e) {
  if (!online || !onlineMyTurn || busy) return;
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const row = +cell.dataset.row;
  const col = +cell.dataset.col;
  if (enemyView.shots.has(`${row},${col}`)) return; // never fire twice

  busy = true;
  onlineMyTurn = false;
  els.aiBoard.classList.remove("targetable");
  setStatus("Firing\u2026");
  online.fire(row, col); // result arrives via the match's `result` handler
}

// Builds the OnlineMatch event handlers that drive the DOM.
function makeOnlineHandlers() {
  return {
    peerJoined() {
      setOnlineStatus("Opponent connected. Place your fleet and press Start Battle.");
    },
    peerLeft() {
      if (!online || online.ended) return;
      setStatus("Opponent disconnected.");
      setOnlineStatus("Opponent left the game.");
    },
    start(myTurn) {
      onlineMyTurn = myTurn;
      stats = { shots: 0, hits: 0 };
      clearBattleLog();
      els.setup.classList.add("hidden");
      els.endScreen.classList.add("hidden");
      renderPlayerBoard();
      renderEnemyView();
      updateAtmosphere();
      setStatus(
        myTurn ? "Your turn — fire at the targeting grid!" : "Opponent's turn\u2026"
      );
      els.aiBoard.classList.toggle("targetable", myTurn);
    },
    // It's my turn to fire (true) or the opponent's (false).
    turn(myTurn) {
      onlineMyTurn = myTurn;
      if (busy) return; // a strike is mid-flight; status updates after it lands
      els.aiBoard.classList.toggle("targetable", myTurn);
      setStatus(myTurn ? "Your turn — fire!" : "Opponent's turn\u2026");
    },
    // Opponent fired at me (defender): render the incoming strike on my fleet.
    incoming(row, col, res) {
      launchStrike({
        targetCell: cellAt(els.playerBoard, row, col),
        originEl: els.enemyPad,
        side: "enemy",
        hit: res.result === "hit",
      }).then(() => {
        renderPlayerBoard();
        updateAtmosphere();
        logShot("Enemy", row, col, res);
        announceShot(res, "Enemy");
      });
    },
    // Opponent acked my shot (shooter): render the result on the targeting grid.
    result(row, col, res) {
      enemyView.shots.set(`${row},${col}`, { result: res.result });
      if (res.sunk && res.shipName) {
        enemyView.sunkShips.add(res.shipName);
        if (res.shipCells) enemyView.sunkCells.set(res.shipName, res.shipCells);
      }
      launchStrike({
        targetCell: cellAt(els.aiBoard, row, col),
        originEl: els.playerPad,
        side: "player",
        hit: res.result === "hit",
      }).then(() => {
        renderEnemyView();
        updateAtmosphere();
        stats.shots++;
        if (res.result === "hit") stats.hits++;
        logShot("You", row, col, res);
        announceShot(
          { result: res.result, sunk: res.sunk, ship: { name: res.shipName } },
          "You"
        );
        busy = false;
        if (online && !online.ended) {
          els.aiBoard.classList.toggle("targetable", onlineMyTurn);
          if (!onlineMyTurn) setStatus("Opponent's turn\u2026");
        }
      });
    },
    gameOver(iWon) {
      busy = false;
      onlineMyTurn = false;
      els.aiBoard.classList.remove("targetable");
      updateAtmosphere();
      showEndScreen(iWon);
    },
  };
}

function setOnlineStatus(text) {
  els.onlineStatus.textContent = text;
}

// Toggle the room-setup controls: while a room is active the create/join inputs
// are disabled and a Cancel button is shown so the player can tear it down
// without reloading the page.
function showRoomControls(roomActive) {
  els.createGameBtn.disabled = roomActive;
  els.joinGameBtn.disabled = roomActive;
  els.joinCodeInput.disabled = roomActive;
  els.cancelRoomBtn.classList.toggle("hidden", !roomActive);
}

// Leave/cancel the current room and return to the online setup screen without
// reloading. Removes the room from the backend (host) or drops presence
// (guest), detaches listeners, and re-enables the create/join controls.
function cancelRoom() {
  if (!online) return;
  online.cancel();
  online = null;
  onlineMyTurn = false;
  els.joinCodeInput.value = "";
  showRoomControls(false);
  setOnlineStatus(
    isCloudConfigured()
      ? "Room cancelled. Create a game and share the code, or join with a friend's code."
      : "Room cancelled. Create a game and share the code, or join with a friend's code. " +
          "(Cloud not configured yet — currently same-device only.)"
  );
  updateStartEnabled();
}

function genRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 4; i++)
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

async function createOnlineGame() {
  const code = genRoomCode();
  online = new OnlineMatch({
    code,
    role: "host",
    getOwnBoard: () => game.playerBoard,
    on: makeOnlineHandlers(),
  });
  await online.create();
  setOnlineStatus(
    `Game code: ${code} — share it with your opponent. ` +
      (online.isCloud()
        ? "Waiting for them to join\u2026"
        : "(Local mode: open a second tab on this machine and join with this code.)")
  );
  showRoomControls(true);
  updateStartEnabled();
}

async function joinOnlineGame() {
  const code = (els.joinCodeInput.value || "").trim().toUpperCase();
  if (code.length < 4) {
    setOnlineStatus("Enter the 4-character game code.");
    return;
  }
  online = new OnlineMatch({
    code,
    role: "guest",
    getOwnBoard: () => game.playerBoard,
    on: makeOnlineHandlers(),
  });
  const ok = await online.join();
  if (!ok) {
    online.room.close(); // release the transport's listeners before discarding
    online = null;
    setOnlineStatus("No open game found with that code.");
    return;
  }
  setOnlineStatus("Connected! Place your fleet and press Start Battle.");
  showRoomControls(true);
  updateStartEnabled();
}

// --- Game start / end / reset ---
function startBattle() {
  if (mode === "online") {
    if (!online || !game.playerBoard.allShipsPlaced()) return;
    online.setReady();
    els.setup.classList.add("hidden");
    setStatus("Waiting for opponent to be ready\u2026");
    return;
  }
  game.startBattle();
  stats = { shots: 0, hits: 0 };
  clearBattleLog();
  els.setup.classList.add("hidden");
  els.aiBoard.classList.add("targetable");
  setStatus("Your turn — fire at the targeting grid!");
  updateAtmosphere();
}

function endGame() {
  els.aiBoard.classList.remove("targetable");
  // Battle's over: clear the mood glow and stop the overtime pulse.
  updateAtmosphere();
  showEndScreen(game.winner === "player");
}

// Shows the WIN / DEFEAT end screen with the player's shot count and accuracy.
function showEndScreen(win) {
  lastWin = win;
  els.copyFeedback.textContent = "";
  els.endTitle.textContent = win ? "Victory" : "Defeat";
  els.endTitle.classList.toggle("win", win);
  els.endTitle.classList.toggle("lose", !win);
  els.endMessage.textContent = win
    ? "You destroyed the enemy fleet."
    : "Your fleet was sunk.";
  const accuracy = stats.shots
    ? Math.round((stats.hits / stats.shots) * 100)
    : 0;
  els.statShots.textContent = `${stats.shots}`;
  els.statAccuracy.textContent = `${accuracy}%`;
  els.endScreen.classList.remove("hidden");
  setStatus(win ? "You win!" : "You lose.");
  if (win) launchConfetti();
}

// --- Shareable result card ---
// Reads the player's targeting grid into a row-major array of
// "hit" | "miss" | null using only what the player can see (struck cells in
// vs-AI mode, acked shots in online mode) — never the hidden enemy layout.
function targetingGridState() {
  const grid = Array.from({ length: BOARD_SIZE }, () =>
    new Array(BOARD_SIZE).fill(null)
  );
  if (mode === "online") {
    for (const [key, info] of enemyView.shots) {
      const [r, c] = key.split(",").map(Number);
      grid[r][c] = info.result === "hit" ? "hit" : "miss";
    }
  } else {
    for (const key of game.aiBoard.shots) {
      const [r, c] = key.split(",").map(Number);
      grid[r][c] = game.aiBoard.shipAt(r, c) ? "hit" : "miss";
    }
  }
  return grid;
}

function resultText() {
  const accuracy = stats.shots
    ? Math.round((stats.hits / stats.shots) * 100)
    : 0;
  const modeLabel =
    mode === "online"
      ? "Online"
      : game.difficulty.charAt(0).toUpperCase() + game.difficulty.slice(1);
  return buildResultText({
    win: lastWin,
    shots: stats.shots,
    accuracy,
    mode: modeLabel,
    grid: targetingGridState(),
    url: location.origin && location.origin !== "null" ? location.href : "",
  });
}

// Copies the result summary to the clipboard, using the async Clipboard API
// where available and falling back to a hidden textarea + execCommand("copy")
// (older browsers, or non-secure contexts where navigator.clipboard is absent).
async function copyResult() {
  const text = resultText();
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch {
    ok = false;
  }
  if (!ok) ok = legacyCopy(text);
  showCopyFeedback(ok);
}

function legacyCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

let copyFeedbackTimer = null;
function showCopyFeedback(ok) {
  els.copyFeedback.textContent = ok ? "Copied!" : "Press Ctrl+C to copy";
  els.copyFeedback.classList.toggle("ok", ok);
  clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = setTimeout(() => {
    els.copyFeedback.textContent = "";
  }, 2200);
}

function resetAll() {
  if (online) {
    online.leave();
    online = null;
  }
  onlineMyTurn = false;
  resetEnemyView();
  stats = { shots: 0, hits: 0 };
  clearBattleLog();
  game.reset();
  orientation = ORIENTATION.HORIZONTAL;
  draggingShip = null;
  busy = false;
  els.endScreen.classList.add("hidden");
  els.setup.classList.remove("hidden");
  els.aiBoard.classList.remove("targetable");
  // Start each new game with the tactical overlay off.
  setTacticalView(false);
  // Return to single-player by default after a match.
  setMode("ai");
  updateAtmosphere();
  buildTray();
  buildRosters();
  applyDifficultyUi(game.difficulty);
  renderPlayerBoard();
  renderAiBoard();
  markTrayPlaced();
  setStatus("Place your fleet to begin.");
}

// Switches between vs-Computer and online modes, toggling the relevant panels.
function setMode(next) {
  mode = next;
  els.modeGroup.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === next);
  });
  const isOnline = next === "online";
  els.difficultyWrap.classList.toggle("hidden", isOnline);
  els.onlinePanel.classList.toggle("hidden", !isOnline);
  showRoomControls(false);
  if (isOnline) {
    els.joinCodeInput.value = "";
    setOnlineStatus(
      isCloudConfigured()
        ? "Create a game and share the code, or join with a friend's code."
        : "Create a game and share the code, or join with a friend's code. " +
            "(Cloud not configured yet — currently same-device only.)"
    );
  } else {
    setOnlineStatus("");
  }
  updateStartEnabled();
}

// Highlights the active difficulty button and updates the description.
function applyDifficultyUi(difficulty) {
  els.difficultyGroup.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.difficulty === difficulty);
  });
  els.difficultyDesc.textContent = DIFFICULTY_DESC[difficulty];
  // Tint the backdrop to match the chosen difficulty.
  document.body.classList.remove("diff-easy", "diff-medium", "diff-hard");
  document.body.classList.add(`diff-${difficulty}`);
}

// --- Wiring ---
function init() {
  buildGrid(els.playerBoard);
  buildGrid(els.aiBoard);
  buildAxisLabels(els.playerColLabels, els.playerRowLabels);
  buildAxisLabels(els.aiColLabels, els.aiRowLabels);
  buildTray();
  buildRosters();
  applyDifficultyUi(game.difficulty);

  els.difficultyGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".diff-btn");
    if (!btn || game.phase !== PHASE.PLACEMENT) return;
    game.setDifficulty(btn.dataset.difficulty);
    applyDifficultyUi(game.difficulty);
  });

  els.modeGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (!btn || online) return; // can't switch mode mid-room
    setMode(btn.dataset.mode);
  });

  els.createGameBtn.addEventListener("click", () => {
    createOnlineGame().catch(() => setOnlineStatus("Could not create game."));
  });
  els.joinGameBtn.addEventListener("click", () => {
    joinOnlineGame().catch(() => setOnlineStatus("Could not join game."));
  });
  els.cancelRoomBtn.addEventListener("click", cancelRoom);

  els.rotateBtn.addEventListener("click", () => {
    orientation =
      orientation === ORIENTATION.HORIZONTAL
        ? ORIENTATION.VERTICAL
        : ORIENTATION.HORIZONTAL;
    refreshTrayOrientation();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") els.rotateBtn.click();
  });

  els.randomizeBtn.addEventListener("click", () => {
    game.randomizePlayerFleet();
    renderPlayerBoard();
    markTrayPlaced();
  });

  els.resetPlacementBtn.addEventListener("click", () => {
    game.playerBoard.ships = [];
    renderPlayerBoard();
    markTrayPlaced();
  });

  els.startBtn.addEventListener("click", startBattle);
  els.aiBoard.addEventListener("click", handlePlayerShot);
  els.playAgainBtn.addEventListener("click", resetAll);
  els.copyResultBtn.addEventListener("click", copyResult);
  els.tacticalBtn.addEventListener("click", () => setTacticalView(!tacticalView));

  markTrayPlaced();
}

init();
