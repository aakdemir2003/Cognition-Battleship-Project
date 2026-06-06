// Visual effects for firing: a missile launches from the firing side's battery,
// arcs to the struck cell, and detonates (a fiery burst on a hit, a water splash
// on a miss). Pure DOM/CSS — no dependencies, and fully decoupled from game logic.

const FLIGHT_MS = 520;
const HIT_FX_MS = 750;
const MISS_FX_MS = 520;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Detonation at the target cell: an expanding shockwave plus either a fireball
// (hit) or a splash (miss).
function spawnImpact(targetCell, hit) {
  const { x, y } = centerOf(targetCell);
  const fx = document.createElement("div");
  fx.className = `impact ${hit ? "impact-hit" : "impact-miss"}`;
  fx.style.left = `${x}px`;
  fx.style.top = `${y}px`;

  if (hit) {
    // A few shrapnel sparks flung outward for extra punch.
    for (let i = 0; i < 6; i++) {
      const spark = document.createElement("span");
      spark.className = "spark";
      spark.style.setProperty("--a", `${i * 60 + Math.random() * 30}deg`);
      spark.style.setProperty("--d", `${16 + Math.random() * 14}px`);
      fx.appendChild(spark);
    }
  }

  document.body.appendChild(fx);
  setTimeout(() => fx.remove(), hit ? HIT_FX_MS : MISS_FX_MS);
}

// Brief muzzle flash at the battery as the missile leaves.
function spawnFlash(x, y) {
  const flash = document.createElement("div");
  flash.className = "muzzle-flash";
  flash.style.left = `${x}px`;
  flash.style.top = `${y}px`;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 260);
}

// Launches a missile from `originEl` to `targetCell`, resolving the returned
// promise at the moment of impact (so the caller can reveal the hit/miss and
// advance the turn in sync with the explosion).
export function launchStrike({ targetCell, originEl, side, hit }) {
  return new Promise((resolve) => {
    if (!targetCell) {
      resolve();
      return;
    }

    // Respect reduced-motion: skip the flight, just flash the result.
    if (prefersReducedMotion() || typeof document === "undefined") {
      spawnImpact(targetCell, hit);
      resolve();
      return;
    }

    const target = centerOf(targetCell);
    const origin = originEl
      ? centerOf(originEl)
      : { x: target.x, y: target.y + 140 };

    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    spawnFlash(origin.x, origin.y);

    const rocket = document.createElement("div");
    rocket.className = `rocket rocket-${side}`;
    rocket.style.left = `${origin.x}px`;
    rocket.style.top = `${origin.y}px`;
    rocket.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    document.body.appendChild(rocket);

    // Force a reflow so the starting transform is committed before we animate.
    void rocket.offsetWidth;
    rocket.style.transition = `transform ${FLIGHT_MS}ms cubic-bezier(0.45, 0.05, 0.55, 0.95)`;
    rocket.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${angle}deg)`;

    setTimeout(() => {
      rocket.remove();
      spawnImpact(targetCell, hit);
      resolve();
    }, FLIGHT_MS);
  });
}
