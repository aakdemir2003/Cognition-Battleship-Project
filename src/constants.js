// Shared game constants.
export const BOARD_SIZE = 10;

// Fleet definition: name -> length. Order matters for placement UI.
export const SHIPS = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];

export const CELL = {
  EMPTY: "empty",
  SHIP: "ship",
  HIT: "hit",
  MISS: "miss",
};

export const ORIENTATION = {
  HORIZONTAL: "horizontal",
  VERTICAL: "vertical",
};
