import { BOARD_SIZE, SHIPS, ORIENTATION } from "./constants.js";

// Returns the list of [row, col] cells a ship would occupy.
export function shipCells(row, col, size, orientation) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const r = orientation === ORIENTATION.VERTICAL ? row + i : row;
    const c = orientation === ORIENTATION.HORIZONTAL ? col + i : col;
    cells.push([r, c]);
  }
  return cells;
}

export function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

// A Board holds a fleet of ships and tracks shots fired against it.
export class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.ships = []; // { name, size, cells: [[r,c]], hits: Set("r,c") }
    this.shots = new Set(); // "r,c" of every cell fired at
  }

  // Returns the ship occupying [row, col], or null.
  shipAt(row, col) {
    return (
      this.ships.find((ship) =>
        ship.cells.some(([r, c]) => r === row && c === col)
      ) || null
    );
  }

  // Validates that a ship of `size` at (row,col)/orientation fits and does not
  // overlap an existing ship. Returns true if placement is legal.
  canPlace(row, col, size, orientation) {
    const cells = shipCells(row, col, size, orientation);
    return cells.every(
      ([r, c]) => inBounds(r, c) && this.shipAt(r, c) === null
    );
  }

  // Places a ship. Throws if placement is illegal.
  place(name, row, col, size, orientation) {
    if (!this.canPlace(row, col, size, orientation)) {
      throw new Error(`Illegal placement for ${name} at ${row},${col}`);
    }
    const cells = shipCells(row, col, size, orientation);
    const ship = { name, size, cells, orientation, hits: new Set() };
    this.ships.push(ship);
    return ship;
  }

  // Removes a ship by name (used when re-placing during setup).
  remove(name) {
    this.ships = this.ships.filter((s) => s.name !== name);
  }

  allShipsPlaced() {
    return this.ships.length === SHIPS.length;
  }

  // Fires at a cell. Returns { result: 'hit'|'miss'|'repeat', ship, sunk }.
  receiveShot(row, col) {
    const key = `${row},${col}`;
    if (this.shots.has(key)) {
      return { result: "repeat", ship: null, sunk: false };
    }
    this.shots.add(key);
    const ship = this.shipAt(row, col);
    if (!ship) {
      return { result: "miss", ship: null, sunk: false };
    }
    ship.hits.add(key);
    const sunk = ship.hits.size === ship.size;
    return { result: "hit", ship, sunk };
  }

  isShipSunk(ship) {
    return ship.hits.size === ship.size;
  }

  allSunk() {
    return (
      this.ships.length === SHIPS.length &&
      this.ships.every((ship) => this.isShipSunk(ship))
    );
  }
}

// Places the full fleet at random legal positions on a fresh board.
export function randomFleet(board, rng = Math.random) {
  board.ships = [];
  for (const { name, size } of SHIPS) {
    let placed = false;
    while (!placed) {
      const orientation =
        rng() < 0.5 ? ORIENTATION.HORIZONTAL : ORIENTATION.VERTICAL;
      const row = Math.floor(rng() * board.size);
      const col = Math.floor(rng() * board.size);
      if (board.canPlace(row, col, size, orientation)) {
        board.place(name, row, col, size, orientation);
        placed = true;
      }
    }
  }
  return board;
}
