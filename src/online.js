// Online 1v1 match controller — a small state machine over the net transport.
//
// Netcode model: each client is authoritative for its OWN board (fog of war).
// When you fire, you write a `fire` command; your opponent evaluates it against
// their real fleet and writes back an `ack` with the result (revealing a ship's
// cells only once it is sunk). The defender advances the turn (single writer per
// shot), so there are no races. The host is the single writer for match start
// and is the tie-breaker for transitions driven by both players' "ready".
//
// Room shape (rooms/<CODE>):
//   meta:    { status: waiting|placing|playing|over, turn: host|guest, winner }
//   players: { host:{present,ready}, guest:{present,ready} }
//   fire:    { seq, by, r, c }                  latest shot
//   ack:     { seq, by, r, c, result, sunk, shipName, shipCells }
import { openRoom, isCloudConfigured } from "./net.js";

export class OnlineMatch {
  constructor({ code, role, getOwnBoard, on }) {
    this.code = code;
    this.role = role; // "host" | "guest"
    this.other = role === "host" ? "guest" : "host";
    this.getOwnBoard = getOwnBoard;
    this.on = on || {};
    this.room = openRoom(code);
    this.unsubs = [];
    this.fireSeen = 0; // last opponent fire seq processed (as defender)
    this.ackSeen = 0; // last opponent ack seq processed (as shooter)
    this._seq = 0;
    this.started = false;
    this.ended = false;
    this.prevOtherPresent = false;
    this._startWritten = false; // guard: host only writes meta→playing once
  }

  isCloud() {
    return isCloudConfigured();
  }

  async create() {
    await this.room.set("", {
      meta: { status: "waiting", turn: "host", winner: null, createdAt: Date.now() },
      players: {
        host: { present: true, ready: false },
        guest: { present: false, ready: false },
      },
    });
    this.room.onDisconnect("players/host/present", false);
    this._subscribe();
  }

  async join() {
    const meta = await this.room.get("meta");
    if (!meta) return false;
    // Only an open, not-yet-started room may be joined. Joining a room that is
    // already "placing"/"playing"/"over" would reset or corrupt a live match.
    if (meta.status !== "waiting") return false;
    await this.room.update({
      "players/guest/present": true,
      "meta/status": "placing",
    });
    this.room.onDisconnect("players/guest/present", false);
    this._subscribe();
    return true;
  }

  setReady() {
    this.room.update({ [`players/${this.role}/ready`]: true });
  }

  // Fire at the opponent. Only valid on your turn during play.
  fire(r, c) {
    this._seq = Math.max(this._seq + 1, Date.now());
    this.room.set("fire", { seq: this._seq, by: this.role, r, c });
  }

  leave() {
    this.room.update({ [`players/${this.role}/present`]: false });
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.room.close();
  }

  _subscribe() {
    this.unsubs.push(this.room.onValue("players", (p) => this._onPlayers(p)));
    this.unsubs.push(this.room.onValue("meta", (m) => this._onMeta(m)));
    this.unsubs.push(this.room.onValue("fire", (f) => this._onFire(f)));
    this.unsubs.push(this.room.onValue("ack", (a) => this._onAck(a)));
  }

  _onPlayers(players) {
    if (!players) return;
    const otherPresent = !!(players[this.other] && players[this.other].present);
    if (otherPresent && !this.prevOtherPresent) this.on.peerJoined?.();
    if (!otherPresent && this.prevOtherPresent && !this.ended)
      this.on.peerLeft?.();
    this.prevOtherPresent = otherPresent;

    // Host is the single writer that flips both-ready -> playing.
    if (this.role === "host" && !this.started && !this._startWritten) {
      const hostReady = players.host && players.host.ready;
      const guestReady = players.guest && players.guest.ready;
      if (hostReady && guestReady) {
        this._startWritten = true;
        this.room.update({ "meta/status": "playing", "meta/turn": "host" });
      }
    }
  }

  _onMeta(meta) {
    if (!meta) return;
    if (meta.status === "playing" && !this.started) {
      this.started = true;
      this.on.start?.(meta.turn === this.role);
    } else if (meta.status === "playing" && this.started) {
      this.on.turn?.(meta.turn === this.role);
    }
    if (meta.status === "over" && !this.ended) {
      this.ended = true;
      this.on.gameOver?.(meta.winner === this.role);
    }
  }

  // Defender path: opponent fired at me.
  _onFire(fire) {
    if (!fire || fire.by !== this.other) return;
    if (fire.seq <= this.fireSeen) return;
    this.fireSeen = fire.seq;

    const board = this.getOwnBoard();
    const res = board.receiveShot(fire.r, fire.c);
    const sunk = res.result === "hit" && res.sunk;

    this.room.set("ack", {
      seq: fire.seq,
      by: this.role,
      r: fire.r,
      c: fire.c,
      result: res.result,
      sunk: !!sunk,
      shipName: sunk ? res.ship.name : null,
      shipCells: sunk ? res.ship.cells : null,
    });

    this.on.incoming?.(fire.r, fire.c, res);

    if (board.allSunk()) {
      // Every one of my ships is down — the opponent (shooter) wins.
      this.room.update({ "meta/status": "over", "meta/winner": this.other });
    } else {
      // I defended; now it's my turn to fire.
      this.room.update({ "meta/turn": this.role });
    }
  }

  // Shooter path: opponent acked my shot.
  _onAck(ack) {
    if (!ack || ack.by !== this.other) return;
    if (ack.seq <= this.ackSeen) return;
    this.ackSeen = ack.seq;
    this.on.result?.(ack.r, ack.c, {
      result: ack.result,
      sunk: ack.sunk,
      shipName: ack.shipName,
      shipCells: ack.shipCells,
    });
  }
}
