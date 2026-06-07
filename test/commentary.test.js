import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCommentator,
  eventFor,
  QUIP_EVENT,
} from "../src/commentary.js";
import { DIFFICULTY } from "../src/ai.js";
import { mulberry32 } from "./helpers.js";

test("eventFor maps who + result to the right quip event", () => {
  assert.equal(eventFor("You", { result: "hit", sunk: false }), QUIP_EVENT.PLAYER_HIT);
  assert.equal(eventFor("You", { result: "hit", sunk: true }), QUIP_EVENT.PLAYER_SUNK);
  assert.equal(eventFor("You", { result: "miss" }), QUIP_EVENT.PLAYER_MISS);
  assert.equal(eventFor("Enemy", { result: "hit", sunk: false }), QUIP_EVENT.AI_HIT);
  assert.equal(eventFor("Enemy", { result: "hit", sunk: true }), QUIP_EVENT.AI_SUNK);
  assert.equal(eventFor("Enemy", { result: "miss" }), QUIP_EVENT.AI_MISS);
});

test("quip returns a non-empty line for every difficulty and event", () => {
  const c = createCommentator(mulberry32(1));
  for (const d of Object.values(DIFFICULTY)) {
    for (const e of Object.values(QUIP_EVENT)) {
      const line = c.quip(d, e);
      assert.equal(typeof line, "string");
      assert.ok(line.length > 0, `empty quip for ${d}/${e}`);
    }
  }
});

test("never repeats the immediately-previous line for a key", () => {
  const c = createCommentator(mulberry32(42));
  let prev = null;
  for (let i = 0; i < 200; i++) {
    const line = c.quip(DIFFICULTY.HARD, QUIP_EVENT.PLAYER_MISS);
    assert.notEqual(line, prev, "consecutive quips must differ");
    prev = line;
  }
});

test("difficulty selects distinct tone pools (no overlap of lines)", () => {
  // Collect every line a difficulty can produce for one event and confirm the
  // three difficulties draw from disjoint sets.
  const collect = (d) => {
    const c = createCommentator(mulberry32(7));
    const seen = new Set();
    for (let i = 0; i < 300; i++) seen.add(c.quip(d, QUIP_EVENT.AI_SUNK));
    return seen;
  };
  const easy = collect(DIFFICULTY.EASY);
  const hard = collect(DIFFICULTY.HARD);
  for (const line of easy) {
    assert.ok(!hard.has(line), `line shared between Easy and Hard: ${line}`);
  }
});
