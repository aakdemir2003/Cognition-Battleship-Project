// Transport layer for online multiplayer.
//
// Exposes a single `openRoom(code)` that returns a `Room` with a small, uniform
// API regardless of backend:
//   room.update(map)            multi-path update, keys may be deep ("a/b")
//   room.set(path, value)
//   room.get(path) -> Promise
//   room.onValue(path, cb) -> unsubscribe
//   room.onDisconnect(path, value)   best-effort cleanup when a peer drops
//   room.close()
//
// Two backends share that API:
//   * Firebase Realtime Database — real cross-device play. Used when a
//     `firebaseConfig` is provided in firebase-config.js.
//   * localStorage — same-origin, cross-tab sync on one machine. Used as a
//     fallback so the feature works/tests without any cloud setup. The netcode
//     above it is identical, so behaviour matches the Firebase path.
import { firebaseConfig } from "./firebase-config.js";

const FB_VERSION = "10.12.2";

// ---- helpers for deep get/set on plain objects (used by both backends) ----
function deepGet(obj, path) {
  if (!path) return obj;
  return path.split("/").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function deepSet(obj, path, value) {
  const keys = path.split("/");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== "object") o[keys[i]] = {};
    o = o[keys[i]];
  }
  if (value === null) delete o[keys[keys.length - 1]];
  else o[keys[keys.length - 1]] = value;
}

// ---------------------- Firebase backend ----------------------
async function loadFirebase() {
  const [{ initializeApp, getApps }, dbMod] = await Promise.all([
    import(
      /* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-app.js`
    ),
    import(
      /* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-database.js`
    ),
  ]);
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = dbMod.getDatabase(app);
  return { db, dbMod };
}

function firebaseRoom(code) {
  const ready = loadFirebase();
  const base = (mod, db) => mod.ref(db, `rooms/${code}`);
  const childRef = (mod, db, path) =>
    path ? mod.child(base(mod, db), path) : base(mod, db);

  return {
    backend: "firebase",
    async update(map) {
      const { db, dbMod } = await ready;
      await dbMod.update(base(dbMod, db), map);
    },
    async set(path, value) {
      const { db, dbMod } = await ready;
      await dbMod.set(childRef(dbMod, db, path), value);
    },
    async get(path) {
      const { db, dbMod } = await ready;
      const snap = await dbMod.get(childRef(dbMod, db, path));
      return snap.exists() ? snap.val() : null;
    },
    onValue(path, cb) {
      let off = () => {};
      ready.then(({ db, dbMod }) => {
        off = dbMod.onValue(childRef(dbMod, db, path), (snap) =>
          cb(snap.exists() ? snap.val() : null)
        );
      });
      return () => off();
    },
    async onDisconnect(path, value) {
      const { db, dbMod } = await ready;
      dbMod.onDisconnect(childRef(dbMod, db, path)).set(value);
    },
    close() {},
  };
}

// ---------------------- localStorage backend ----------------------
// Cross-tab sync on a single origin. `storage` events fire in *other* tabs;
// same-tab writers are notified via a shared in-memory listener registry.
const localListeners = new Set();

function localRoom(code) {
  const KEY = `bs_room_${code}`;
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return null;
    }
  };
  const write = (room) => {
    localStorage.setItem(KEY, JSON.stringify(room));
    // Notify same-tab subscribers (storage events only reach other tabs).
    localListeners.forEach((fn) => fn(KEY));
  };

  const subs = []; // { path, cb, last }
  // Emit a subscription only when the value at its path actually changes, so
  // local behaviour matches Firebase's per-path onValue (and so redundant or
  // re-entrant writes don't trigger spurious callbacks or feedback loops).
  const fire = () => {
    const room = read() || {};
    // Snapshot the list: callbacks may write and thus mutate `subs`.
    subs.slice().forEach((entry) => {
      const value = deepGet(room, entry.path) ?? null;
      const json = JSON.stringify(value);
      if (json === entry.last) return;
      entry.last = json;
      entry.cb(value);
    });
  };
  const onStorage = (e) => {
    const key = e && e.key ? e.key : e; // DOM event or same-tab string
    if (key === KEY) fire();
  };
  window.addEventListener("storage", onStorage);
  localListeners.add(onStorage);

  return {
    backend: "local",
    async update(map) {
      const room = read() || {};
      for (const [path, value] of Object.entries(map)) deepSet(room, path, value);
      write(room);
    },
    async set(path, value) {
      if (!path) {
        write(value); // empty path = replace the entire room
        return;
      }
      const room = read() || {};
      deepSet(room, path, value);
      write(room);
    },
    async get(path) {
      return deepGet(read() || {}, path) ?? null;
    },
    onValue(path, cb) {
      const value = deepGet(read() || {}, path) ?? null;
      const entry = { path, cb, last: JSON.stringify(value) };
      subs.push(entry);
      // Emit current value asynchronously to match Firebase's initial callback.
      Promise.resolve().then(() => cb(value));
      return () => {
        const i = subs.indexOf(entry);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    async onDisconnect(path, value) {
      // Best effort: clear presence when this tab unloads.
      window.addEventListener("beforeunload", () => {
        const room = read() || {};
        deepSet(room, path, value);
        write(room);
      });
    },
    close() {
      window.removeEventListener("storage", onStorage);
      localListeners.delete(onStorage);
    },
  };
}

export function isCloudConfigured() {
  return !!(firebaseConfig && firebaseConfig.databaseURL);
}

export function openRoom(code) {
  return isCloudConfigured() ? firebaseRoom(code) : localRoom(code);
}
