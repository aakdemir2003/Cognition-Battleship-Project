import { BOARD_SIZE, SHIPS, ORIENTATION } from "./constants.js";
import { shipCells } from "./board.js";
import { Game, PHASE } from "./game.js";
import { DIFFICULTY } from "./ai.js";

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
  playAgainBtn: document.getElementById("play-again-btn"),
};

// Placement UI state.
let orientation = ORIENTATION.HORIZONTAL;
let draggingShip = null; // { name, size }

function setStatus(text) {
  els.status.textContent = text;
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

// Renders the player's own board, showing ships and any shots taken against it.
function renderPlayerBoard() {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = cellAt(els.playerBoard, r, c);
      cell.className = "cell";
      const ship = game.playerBoard.shipAt(r, c);
      if (ship) cell.classList.add("ship");
      const key = `${r},${c}`;
      if (game.playerBoard.shots.has(key)) {
        if (ship) {
          cell.classList.add("hit");
          if (game.playerBoard.isShipSunk(ship)) cell.classList.add("sunk");
        } else {
          cell.classList.add("miss");
        }
      }
    }
  }
}

// Renders the targeting grid: only shots are visible (enemy ships hidden until
// sunk).
function renderAiBoard() {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = cellAt(els.aiBoard, r, c);
      cell.className = "cell";
      const key = `${r},${c}`;
      if (game.aiBoard.shots.has(key)) {
        const ship = game.aiBoard.shipAt(r, c);
        if (ship) {
          cell.classList.add("hit");
          if (game.aiBoard.isShipSunk(ship)) cell.classList.add("sunk");
        } else {
          cell.classList.add("miss");
        }
      }
    }
  }
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
  els.startBtn.disabled = !game.playerBoard.allShipsPlaced();
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
  if (game.phase !== PHASE.PLAYER_TURN) return;
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const row = +cell.dataset.row;
  const col = +cell.dataset.col;
  const res = game.playerFire(row, col);
  if (!res) return;

  renderAiBoard();
  announceShot(res, "You");
  if (game.phase === PHASE.OVER) return endGame();

  updateTurnUi();
  // Let the player see their result before the AI responds.
  setTimeout(aiTurn, 650);
}

function aiTurn() {
  if (game.phase !== PHASE.AI_TURN) return;
  const res = game.aiFire();
  renderPlayerBoard();
  if (res) announceShot(res, "Enemy");
  if (game.phase === PHASE.OVER) return endGame();
  updateTurnUi();
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

// --- Game start / end / reset ---
function startBattle() {
  game.startBattle();
  els.setup.classList.add("hidden");
  els.aiBoard.classList.add("targetable");
  setStatus("Your turn — fire at the targeting grid!");
}

function endGame() {
  els.aiBoard.classList.remove("targetable");
  const win = game.winner === "player";
  els.endTitle.textContent = win ? "Victory!" : "Defeat";
  els.endMessage.textContent = win
    ? "You destroyed the enemy fleet."
    : "Your fleet was sunk.";
  els.endScreen.classList.remove("hidden");
  setStatus(win ? "You win!" : "You lose.");
}

function resetAll() {
  game.reset();
  orientation = ORIENTATION.HORIZONTAL;
  draggingShip = null;
  els.endScreen.classList.add("hidden");
  els.setup.classList.remove("hidden");
  els.aiBoard.classList.remove("targetable");
  buildTray();
  applyDifficultyUi(game.difficulty);
  renderPlayerBoard();
  renderAiBoard();
  markTrayPlaced();
  setStatus("Place your fleet to begin.");
}

// Highlights the active difficulty button and updates the description.
function applyDifficultyUi(difficulty) {
  els.difficultyGroup.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.difficulty === difficulty);
  });
  els.difficultyDesc.textContent = DIFFICULTY_DESC[difficulty];
}

// --- Wiring ---
function init() {
  buildGrid(els.playerBoard);
  buildGrid(els.aiBoard);
  buildTray();
  applyDifficultyUi(game.difficulty);

  els.difficultyGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".diff-btn");
    if (!btn || game.phase !== PHASE.PLACEMENT) return;
    game.setDifficulty(btn.dataset.difficulty);
    applyDifficultyUi(game.difficulty);
  });

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

  markTrayPlaced();
}

init();
