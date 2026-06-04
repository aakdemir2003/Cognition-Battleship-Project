import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, PHASE } from "../src/game.js";
import { randomFleet } from "../src/board.js";
import { DIFFICULTY } from "../src/ai.js";
import { mulberry32 } from "./helpers.js";

test("game starts in placement phase and cannot begin until the fleet is placed", () => {
  const game = new Game({ rng: mulberry32(1) });
  assert.equal(game.phase, PHASE.PLACEMENT);
  assert.throws(() => game.startBattle(), /All ships must be placed/);
});

test("startBattle moves to the player's turn once the fleet is placed", () => {
  const game = new Game({ rng: mulberry32(1) });
  game.randomizePlayerFleet();
  game.startBattle();
  assert.equal(game.phase, PHASE.PLAYER_TURN);
});

test("player firing is ignored outside the player's turn and for repeats", () => {
  const game = new Game({ rng: mulberry32(1) });
  game.randomizePlayerFleet();
  assert.equal(game.playerFire(0, 0), null, "cannot fire during placement");
  game.startBattle();
  const first = game.playerFire(0, 0);
  assert.ok(first);
  assert.equal(game.phase, PHASE.AI_TURN);
  // Firing again while it's the AI's turn is rejected.
  assert.equal(game.playerFire(1, 1), null);
});

test("setDifficulty swaps the AI strategy", () => {
  const game = new Game({ rng: mulberry32(1) });
  game.setDifficulty(DIFFICULTY.HARD);
  assert.equal(game.difficulty, DIFFICULTY.HARD);
  assert.equal(game.ai.difficulty, DIFFICULTY.HARD);
});

test("player wins when every enemy ship is sunk", () => {
  const game = new Game({ rng: mulberry32(5) });
  game.randomizePlayerFleet();
  game.startBattle();
  // Fire at every cell occupied by an enemy ship. Between player shots the AI
  // takes its turn, so we re-assert the player's turn before each shot.
  const targets = game.aiBoard.ships.flatMap((s) => s.cells);
  for (const [r, c] of targets) {
    if (game.phase === PHASE.AI_TURN) game.aiFire();
    if (game.phase === PHASE.PLAYER_TURN) game.playerFire(r, c);
    if (game.phase === PHASE.OVER) break;
  }
  assert.equal(game.phase, PHASE.OVER);
  assert.equal(game.winner, "player");
});

test("a full auto-played game always terminates with a winner", () => {
  for (const difficulty of [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD]) {
    const game = new Game({ rng: mulberry32(11), difficulty });
    game.randomizePlayerFleet();
    game.startBattle();
    let guard = 0;
    while (game.phase !== PHASE.OVER) {
      if (game.phase === PHASE.PLAYER_TURN) {
        // Player also fires at enemy ship cells so the game converges quickly.
        const target = game.aiBoard.ships
          .flatMap((s) => s.cells)
          .find(([r, c]) => !game.aiBoard.shots.has(`${r},${c}`));
        game.playerFire(target[0], target[1]);
      } else if (game.phase === PHASE.AI_TURN) {
        game.aiFire();
      }
      assert.ok(++guard < 1000, "game failed to terminate");
    }
    assert.ok(["player", "ai"].includes(game.winner));
  }
});
