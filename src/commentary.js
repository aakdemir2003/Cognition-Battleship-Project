import { DIFFICULTY } from "./ai.js";

// --- Enemy admiral commentary ---
//
// The AI opponent has a personality that speaks in the battle log. Quips fire
// on six events — the player hits / misses / sinks, and the AI hits / misses /
// sinks — and the tone scales with difficulty:
//   EASY   → encouraging, gentle mentor
//   MEDIUM → neutral, businesslike officer
//   HARD   → smug, taunting villain
//
// Pure and DOM-free. `createCommentator()` returns a picker that avoids
// repeating the immediately-previous line for a given (difficulty, event).

export const QUIP_EVENT = {
  PLAYER_HIT: "playerHit",
  PLAYER_MISS: "playerMiss",
  PLAYER_SUNK: "playerSunk",
  AI_HIT: "aiHit",
  AI_MISS: "aiMiss",
  AI_SUNK: "aiSunk",
};

// pools[difficulty][event] = array of one-line quips (admiral's voice).
const POOLS = {
  [DIFFICULTY.EASY]: {
    playerHit: [
      "Nice shot, recruit — you're getting the hang of this.",
      "A clean hit! Keep that up.",
      "Direct strike — well aimed.",
      "You found one. Good eye, Captain.",
      "Solid gunnery. I'm impressed.",
      "That's the spirit — right on target.",
      "Beginner's luck? No, that was skill.",
    ],
    playerMiss: [
      "So close — adjust and try again.",
      "Just water that time. You'll get it.",
      "No harm done. Take another shot.",
      "Missed, but your aim is improving.",
      "Don't worry, even admirals miss.",
      "A miss — regroup and fire again.",
      "Keep at it, you're learning the seas.",
    ],
    playerSunk: [
      "You sank one! Outstanding work.",
      "A whole ship down — superb!",
      "Magnificent! That vessel is gone.",
      "You're a natural at this, Captain.",
      "Fleet's down a ship — well earned.",
      "Bravo! That's how it's done.",
    ],
    aiHit: [
      "Ah, I got one — apologies, Captain.",
      "A lucky hit on my part.",
      "I'll take that, but you're doing fine.",
      "Got you there — stay focused.",
      "A small hit. You're still in this.",
      "Don't let that rattle you.",
    ],
    aiMiss: [
      "Drat, I missed. Your turn.",
      "Just a splash from me — go ahead.",
      "Off target. You're safe this round.",
      "I'll do better — but no rush for you.",
      "Missed! The sea's tricky today.",
      "Nothing there. Take your shot.",
    ],
    aiSunk: [
      "I sank one — but you're a worthy foe.",
      "Got a ship of yours. Chin up, Captain!",
      "One down for me — keep fighting.",
      "Apologies for that one. Press on!",
      "A ship lost, but the battle's young.",
      "Don't give up — you can still win this.",
    ],
  },
  [DIFFICULTY.MEDIUM]: {
    playerHit: [
      "Hit confirmed. Noted, Captain.",
      "You struck steel. Acknowledged.",
      "Contact — damage to my fleet.",
      "A hit. The board evens out.",
      "Registered. Your aim holds.",
      "Direct hit. We continue.",
      "Reported damage. Carry on.",
    ],
    playerMiss: [
      "Miss. Coordinates logged.",
      "Splashdown — nothing there.",
      "Empty water. Recalculate.",
      "No contact on that grid.",
      "A miss. The hunt continues.",
      "Negative. Try another sector.",
      "Off the mark. My turn.",
    ],
    playerSunk: [
      "Vessel lost. A clean sinking.",
      "One of mine is down. Efficient.",
      "Ship destroyed. Tactically sound.",
      "You sank it. Fair play.",
      "Confirmed kill. The fleet thins.",
      "A ship struck from the roster.",
    ],
    aiHit: [
      "Hit. Your hull is breached.",
      "Contact on your fleet. Logged.",
      "I've found steel. Adjusting fire.",
      "Damage dealt. Holding the line.",
      "A hit. Closing the gap.",
      "Target struck. Continuing.",
    ],
    aiMiss: [
      "Miss. Resetting my solution.",
      "Empty water on my end.",
      "No contact. Your move.",
      "Off target. The duel goes on.",
      "A miss. Recalibrating.",
      "Nothing there. Proceed.",
    ],
    aiSunk: [
      "I've sunk one of yours. Noted.",
      "Your vessel is down. Efficient.",
      "Ship destroyed. The tide shifts.",
      "One of your hulls, eliminated.",
      "Confirmed kill on your fleet.",
      "Another ship off your board.",
    ],
  },
  [DIFFICULTY.HARD]: {
    playerHit: [
      "A scratch. You'll regret waking me.",
      "Lucky. It won't save your fleet.",
      "Enjoy it — your hull is next.",
      "One hit? I've already won the math.",
      "Cute. I've sunk better captains.",
      "You hit steel. I have plenty more.",
      "A pinprick. Sink or be sunk.",
    ],
    playerMiss: [
      "Pathetic. Were you even aiming?",
      "Splash. The fish thank you.",
      "Wasted shot. As expected.",
      "You missed. I never do.",
      "Empty water — like your strategy.",
      "Try harder. Or don't. I'll win regardless.",
      "Another miss. This is almost too easy.",
    ],
    playerSunk: [
      "One ship. You'll need a miracle for the rest.",
      "Fine — take it. I'm just warming up.",
      "A single kill won't stop me.",
      "Savor it. It's your last good moment.",
      "Impressive, for an amateur. Now watch.",
      "You sank one. I'll sink your whole fleet.",
    ],
    aiHit: [
      "Found you. Squirm all you like.",
      "Hit. I can see your fleet bleeding.",
      "Of course I hit. I always do.",
      "Your hull cracks. Music to my ears.",
      "Another strike. You can't hide.",
      "Boom. Did that hurt, Captain?",
    ],
    aiMiss: [
      "A rare miss. Don't get comfortable.",
      "Hmph. I'll correct that immediately.",
      "Water — for now. You're already marked.",
      "Even I allow you one breath.",
      "A miss. Savor this small mercy.",
      "Adjusting. Your luck ends here.",
    ],
    aiSunk: [
      "Down she goes. Who's next?",
      "Another of yours, gone. Predictable.",
      "Sunk. Your fleet is a memory.",
      "One less ship for you to hide behind.",
      "Destroyed. I told you how this ends.",
      "Scratch another. This is a massacre.",
    ],
  },
};

// Returns the pool for a (difficulty, event), falling back to MEDIUM.
function poolFor(difficulty, event) {
  const byDiff = POOLS[difficulty] || POOLS[DIFFICULTY.MEDIUM];
  return byDiff[event] || [];
}

export function createCommentator(rng = Math.random) {
  // Remember the last index used per "difficulty:event" so we never repeat the
  // immediately-previous line for that key.
  const last = new Map();

  return {
    quip(difficulty, event) {
      const pool = poolFor(difficulty, event);
      if (pool.length === 0) return "";
      if (pool.length === 1) return pool[0];
      const key = `${difficulty}:${event}`;
      const prev = last.has(key) ? last.get(key) : -1;
      let idx;
      do {
        idx = Math.floor(rng() * pool.length);
      } while (idx === prev);
      last.set(key, idx);
      return pool[idx];
    },
  };
}

// Maps a shot result + who fired into the corresponding quip event.
export function eventFor(who, res) {
  const mine = who === "You";
  if (res.result === "hit") {
    if (res.sunk) return mine ? QUIP_EVENT.PLAYER_SUNK : QUIP_EVENT.AI_SUNK;
    return mine ? QUIP_EVENT.PLAYER_HIT : QUIP_EVENT.AI_HIT;
  }
  return mine ? QUIP_EVENT.PLAYER_MISS : QUIP_EVENT.AI_MISS;
}
