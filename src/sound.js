// Lightweight sound system built entirely on the Web Audio API — no asset
// files, so nothing large ships with the game. Every effect is synthesized on
// the fly from oscillators and filtered noise.
//
// Design notes that satisfy the gameplay requirements:
//   * The AudioContext is created/resumed only after the first user gesture
//     (see `unlock`), so browser autoplay policies never block or warn.
//   * `muted` is a plain module-level variable — the choice persists for the
//     page session (a refresh starts unmuted again), as specified.
//   * A short global cooldown (THROTTLE_MS) plus a hard cap on simultaneous
//     voices keeps fast turn exchanges from piling sounds into noise.
//   * When muted, play calls return immediately and schedule nothing.

let ctx = null;
let master = null;
let muted = false;
let unlocked = false;

// Throttling: ignore a *new* sound if one started within this window, and never
// let more than MAX_VOICES ring out at once.
const THROTTLE_MS = 55;
const MAX_VOICES = 5;
let lastStart = 0;
let activeVoices = 0;

function now() {
  return ctx ? ctx.currentTime : 0;
}

// Create the context lazily. Safe to call repeatedly.
function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5; // balanced headroom so nothing clips
  master.connect(ctx.destination);
  return ctx;
}

// Should be called from a user-gesture handler (pointerdown/keydown/click).
// Creates and resumes the context so later programmatic plays are allowed.
export function unlock() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  unlocked = true;
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = !!value;
  return muted;
}

export function toggleMute() {
  muted = !muted;
  return muted;
}

// Gate shared by every effect: respects mute, lazy-unlock, throttle and the
// concurrent-voice cap. Returns the AudioContext when a sound may play.
function gate() {
  if (muted) return null;
  const c = ensureCtx();
  if (!c) return null;
  if (c.state === "suspended") c.resume();
  if (!unlocked && c.state !== "running") return null;
  const t = performance.now();
  if (t - lastStart < THROTTLE_MS) return null;
  if (activeVoices >= MAX_VOICES) return null;
  lastStart = t;
  return c;
}

function trackVoice(ms) {
  activeVoices++;
  setTimeout(() => {
    activeVoices = Math.max(0, activeVoices - 1);
  }, ms);
}

// --- Primitive synth helpers -------------------------------------------------

// A pitched tone with an attack/decay envelope. `slideTo` bends the pitch over
// the note (used for whooshes and groans).
function tone({ freq, dur, type = "sine", gain = 0.3, slideTo = null, delay = 0 }) {
  const t0 = now() + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A burst of filtered white noise — the basis for splashes and explosions.
function noise({ dur, gain = 0.4, type = "lowpass", freq = 1200, slideTo = null, delay = 0 }) {
  const t0 = now() + delay;
  const frames = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// --- Public sound effects ----------------------------------------------------

// Subtle UI tick for button presses and ship placement.
export function ui() {
  if (!gate()) return;
  tone({ freq: 660, dur: 0.05, type: "square", gain: 0.12 });
  trackVoice(80);
}

// Rocket/missile launch when a shot is fired (player or enemy): a rising
// pitched whoosh layered over hissing noise.
export function fire() {
  if (!gate()) return;
  tone({ freq: 180, dur: 0.28, type: "sawtooth", gain: 0.18, slideTo: 720 });
  noise({ dur: 0.28, gain: 0.16, type: "bandpass", freq: 700, slideTo: 2200 });
  trackVoice(300);
}

// Water splash on a miss: a short filtered noise plop that closes down quickly.
export function miss() {
  if (!gate()) return;
  noise({ dur: 0.3, gain: 0.32, type: "lowpass", freq: 1600, slideTo: 300 });
  tone({ freq: 300, dur: 0.16, type: "sine", gain: 0.1, slideTo: 140 });
  trackVoice(320);
}

// Explosion on a regular hit: a punchy noise burst plus a low thump.
export function hit() {
  if (!gate()) return;
  noise({ dur: 0.34, gain: 0.45, type: "lowpass", freq: 900, slideTo: 160 });
  tone({ freq: 140, dur: 0.3, type: "square", gain: 0.28, slideTo: 60 });
  trackVoice(360);
}

// A bigger, distinct explosion + sinking groan when a ship is SUNK. Longer and
// lower than a regular hit so it reads as clearly more catastrophic.
export function sink() {
  if (!gate()) return;
  // Bigger blast.
  noise({ dur: 0.6, gain: 0.5, type: "lowpass", freq: 1100, slideTo: 120 });
  tone({ freq: 110, dur: 0.5, type: "square", gain: 0.32, slideTo: 45 });
  // Metallic sinking groan that descends after the blast.
  tone({ freq: 220, dur: 0.85, type: "sawtooth", gain: 0.2, slideTo: 70, delay: 0.18 });
  trackVoice(900);
}

// Short victory fanfare: a bright rising arpeggio.
export function win() {
  if (!gate()) return;
  const seq = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  seq.forEach((f, i) =>
    tone({ freq: f, dur: 0.22, type: "triangle", gain: 0.26, delay: i * 0.13 })
  );
  trackVoice(800);
}

// Defeat sting: a low descending two-note minor figure.
export function lose() {
  if (!gate()) return;
  tone({ freq: 311.13, dur: 0.34, type: "sawtooth", gain: 0.24 }); // Eb4
  tone({ freq: 207.65, dur: 0.6, type: "sawtooth", gain: 0.24, slideTo: 140, delay: 0.26 }); // G#3 down
  trackVoice(900);
}

export const sfx = { ui, fire, miss, hit, sink, win, lose, unlock, isMuted, setMuted, toggleMute };
export default sfx;
