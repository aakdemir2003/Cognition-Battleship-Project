import { Board, randomFleet } from "./board.js";
import { RandomAI } from "./ai.js";

export const PHASE = {
  PLACEMENT: "placement",
  PLAYER_TURN: "player_turn",
  AI_TURN: "ai_turn",
  OVER: "over",
};

// Game ties together the two boards, the AI, and whose turn it is. It is UI
// agnostic so it can be driven by the DOM or by tests.
export class Game {
  constructor({ rng = Math.random, AIClass = RandomAI } = {}) {
    this.rng = rng;
    this.AIClass = AIClass;
    this.reset();
  }

  reset() {
    this.playerBoard = new Board();
    this.aiBoard = new Board();
    randomFleet(this.aiBoard, this.rng);
    this.ai = new this.AIClass(this.aiBoard.size, this.rng);
    this.phase = PHASE.PLACEMENT;
    this.winner = null;
  }

  randomizePlayerFleet() {
    randomFleet(this.playerBoard, this.rng);
  }

  startBattle() {
    if (!this.playerBoard.allShipsPlaced()) {
      throw new Error("All ships must be placed before starting.");
    }
    this.phase = PHASE.PLAYER_TURN;
  }

  // Player fires at the AI board. Returns the shot result, or null if the move
  // was not allowed (wrong phase or repeat shot).
  playerFire(row, col) {
    if (this.phase !== PHASE.PLAYER_TURN) return null;
    const key = `${row},${col}`;
    if (this.aiBoard.shots.has(key)) return null;
    const res = this.aiBoard.receiveShot(row, col);
    if (this.aiBoard.allSunk()) {
      this.phase = PHASE.OVER;
      this.winner = "player";
    } else {
      this.phase = PHASE.AI_TURN;
    }
    return res;
  }

  // AI fires at the player board. Returns { row, col, ...result } or null.
  aiFire() {
    if (this.phase !== PHASE.AI_TURN) return null;
    const shot = this.ai.nextShot();
    if (!shot) return null;
    const [row, col] = shot;
    const res = this.playerBoard.receiveShot(row, col);
    this.ai.registerResult(row, col, res);
    if (this.playerBoard.allSunk()) {
      this.phase = PHASE.OVER;
      this.winner = "ai";
    } else {
      this.phase = PHASE.PLAYER_TURN;
    }
    return { row, col, ...res };
  }
}
