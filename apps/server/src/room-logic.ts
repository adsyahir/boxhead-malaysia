import {
  BALANCE,
  createWorld,
  setPlayerAway,
  step,
  validateNickname,
  type GameEvent,
  type MapData,
  type PlayerInput,
  type World,
} from "@kampung/game-core";
import {
  HERO_IDS,
  NET,
  ROOM_SLOTS,
  snapshotWorld,
  type ClientMsg,
  type ErrorCode,
  type HeroId,
  type LobbyPlayer,
  type MapId,
  type RoomState,
  type ServerMsg,
  type Slot,
} from "@kampung/protocol";

/** What the room needs from a websocket. The Durable Object supplies the real one; tests supply fakes. */
export interface Conn {
  send(msg: ServerMsg): void;
  close(): void;
}

export interface RoomSummary {
  code: string;
  public: boolean;
  state: RoomState;
  hostName: string;
  map: MapId;
  players: number;
}

export interface RoomDeps {
  code: string;
  public: boolean;
  now(): number;
  loadMap(id: MapId): MapData;
  /** 32-bit seed for a new run. */
  seed(): number;
  token(): string;
  /** The lobby registry wants to know when the room changes. */
  onChange(summary: RoomSummary): void;
}

interface Seat {
  name: string;
  hero: HeroId;
  ready: boolean;
  token: string;
  conn: Conn | null;
  /** When the connection dropped (ms), or null while connected. */
  lostAt: number | null;
  mx: number;
  my: number;
  fire: boolean;
  swap: boolean;
  taps: number;
  tapsDone: number;
  lastSwitch: boolean;
  /** Message budget, refilled over time, so a flooding client is dropped. */
  bucket: number;
  bucketAt: number;
}

const BUCKET_MAX = 120;
const BUCKET_REFILL_PER_S = 90;
const MAX_STEPS_PER_TICK = 5;

export class RoomLogic {
  private seats: (Seat | null)[] = new Array<Seat | null>(ROOM_SLOTS).fill(null);
  private state: RoomState = "lobby";
  private map: MapId = "kampung-pisang";
  private host: Slot = 0;
  private world: World | null = null;
  private acc = 0;
  private lastTickAt = 0;
  private pendingEvents: GameEvent[] = [];
  private startedAt = 0;

  constructor(private readonly d: RoomDeps) {}

  // ---------- queries ----------
  get code(): string {
    return this.d.code;
  }
  get phase(): RoomState {
    return this.state;
  }
  get connectedCount(): number {
    return this.seats.filter((s) => s?.conn).length;
  }
  /** Nobody connected, and (if a run is on) nobody still inside their reconnect window. */
  isDead(): boolean {
    if (this.connectedCount > 0) return false;
    if (this.state !== "playing") return true;
    const now = this.d.now();
    return this.seats.every((s) => !s || (s.lostAt !== null && now - s.lostAt > NET.reconnectGraceMs));
  }
  summary(): RoomSummary {
    const host = this.seats[this.host];
    return {
      code: this.d.code,
      public: this.d.public,
      state: this.state,
      hostName: host?.name ?? "",
      map: this.map,
      players: this.seats.filter((s) => s !== null).length,
    };
  }

  // ---------- connections ----------
  /** Seat a new connection. Returns its slot, or null after sending an error. */
  join(conn: Conn, name: string, token?: string): Slot | null {
    const trimmed = name.trim();
    const slot = token ? this.seats.findIndex((s) => s?.token === token) : -1;

    if (slot >= 0) return this.reconnect(slot as Slot, conn);

    if (this.state !== "lobby" && this.state !== "over") return this.reject(conn, "in_progress", "Permainan sudah bermula.");
    const nick = validateNickname(trimmed);
    if (!nick.ok) return this.reject(conn, "bad_name", nick.reason);
    const free = this.seats.findIndex((s) => s === null);
    if (free < 0) return this.reject(conn, "room_full", "Bilik penuh.");

    if (this.state === "over") this.backToLobby();
    const taken = new Set(this.seats.filter((s): s is Seat => s !== null).map((s) => s.hero));
    const hero = HERO_IDS.find((h) => !taken.has(h)) ?? "abu";
    const seat: Seat = {
      name: trimmed, hero, ready: false, token: this.d.token(), conn, lostAt: null,
      mx: 0, my: 0, fire: false, swap: false, taps: 0, tapsDone: 0, lastSwitch: false,
      bucket: BUCKET_MAX, bucketAt: this.d.now(),
    };
    this.seats[free] = seat;
    if (this.connectedCount === 1) this.host = free as Slot;
    conn.send({ t: "welcome", slot: free as Slot, code: this.d.code, token: seat.token });
    this.broadcastLobby();
    return free as Slot;
  }

  private reconnect(slot: Slot, conn: Conn): Slot {
    const seat = this.seats[slot]!;
    seat.conn?.close();
    seat.conn = conn;
    seat.lostAt = null;
    seat.bucket = BUCKET_MAX;
    conn.send({ t: "welcome", slot, code: this.d.code, token: seat.token });
    this.sendLobby(conn);
    if (this.state === "playing" && this.world) {
      setPlayerAway(this.world, slot, false); // back in at the next wave
      conn.send({ t: "start", map: this.map, seed: 0, heroes: this.heroes(), you: slot });
      conn.send({ t: "snap", s: snapshotWorld(this.world), e: [] });
    }
    this.notify();
    return slot;
  }

  disconnect(slot: Slot, conn: Conn): void {
    const seat = this.seats[slot];
    if (!seat || seat.conn !== conn) return; // an old socket that was already replaced
    seat.conn = null;
    seat.lostAt = this.d.now();
    if (this.state === "playing" && this.world) {
      setPlayerAway(this.world, slot, true);
    } else {
      this.seats[slot] = null; // lobby: nothing to come back to
      this.reassignHost();
    }
    this.broadcastLobby();
  }

  /** Player chose to leave for good. */
  leave(slot: Slot): void {
    const seat = this.seats[slot];
    if (!seat) return;
    const conn = seat.conn;
    seat.conn = null;
    if (this.state === "playing" && this.world) setPlayerAway(this.world, slot, true);
    this.seats[slot] = null;
    this.reassignHost();
    this.broadcastLobby();
    conn?.close();
  }

  private reassignHost(): void {
    const next = this.seats.findIndex((s) => s?.conn);
    if (next >= 0) this.host = next as Slot;
  }

  // ---------- messages ----------
  message(slot: Slot, msg: ClientMsg): void {
    const seat = this.seats[slot];
    if (!seat?.conn) return;
    if (!this.spend(seat)) return;

    switch (msg.t) {
      case "ping":
        seat.conn.send({ t: "pong", n: msg.n });
        return;
      case "input":
        seat.mx = msg.mx;
        seat.my = msg.my;
        seat.fire = msg.fire;
        seat.swap = msg.swap;
        if (msg.taps > seat.taps) seat.taps = msg.taps;
        return;
      case "leave":
        this.leave(slot);
        return;
      case "hero":
      case "ready":
      case "map":
      case "start":
        this.lobbyMessage(slot, seat, msg);
        return;
      case "hello":
        return; // only meaningful as the first message
    }
  }

  private lobbyMessage(slot: Slot, seat: Seat, msg: Extract<ClientMsg, { t: "hero" | "ready" | "map" | "start" }>): void {
    if (this.state === "over") this.backToLobby();
    if (this.state !== "lobby") return this.error(seat, "in_progress", "Permainan sedang berjalan.");

    if (msg.t === "hero") {
      const clash = this.seats.some((s, i) => i !== slot && s?.hero === msg.hero);
      if (!clash) seat.hero = msg.hero;
    } else if (msg.t === "ready") {
      seat.ready = msg.ready;
    } else if (msg.t === "map") {
      if (slot !== this.host) return this.error(seat, "not_host", "Hanya hos boleh pilih peta.");
      this.map = msg.map;
    } else if (msg.t === "start") {
      if (slot !== this.host) return this.error(seat, "not_host", "Hanya hos boleh mula.");
      const players = this.seats.filter((s): s is Seat => s !== null && s.conn !== null);
      const everyoneReady = this.seats.every((s, i) => s === null || i === this.host || s.ready);
      if (players.length < ROOM_SLOTS || !everyoneReady) return this.error(seat, "not_ready", "Tunggu pemain lain bersedia.");
      this.begin();
      return;
    }
    this.broadcastLobby();
  }

  private spend(seat: Seat): boolean {
    const now = this.d.now();
    seat.bucket = Math.min(BUCKET_MAX, seat.bucket + ((now - seat.bucketAt) / 1000) * BUCKET_REFILL_PER_S);
    seat.bucketAt = now;
    if (seat.bucket < 1) return false;
    seat.bucket -= 1;
    return true;
  }

  // ---------- game ----------
  private begin(): void {
    const world = createWorld({ seed: this.d.seed(), map: this.d.loadMap(this.map), playerCount: 2 });
    this.world = world;
    this.state = "playing";
    this.acc = 0;
    this.lastTickAt = this.d.now();
    this.startedAt = this.lastTickAt;
    this.pendingEvents = [];
    for (const s of this.seats) {
      if (!s) continue;
      s.ready = false;
      s.taps = s.tapsDone = 0;
      s.lastSwitch = false;
      s.mx = s.my = 0;
      s.fire = s.swap = false;
    }
    this.seats.forEach((s, i) => s?.conn?.send({ t: "start", map: this.map, seed: 0, heroes: this.heroes(), you: i as Slot }));
    this.notify();
    this.broadcastLobby();
  }

  private heroes(): HeroId[] {
    return this.seats.map((s) => s?.hero ?? "abu");
  }

  private inputs(): PlayerInput[] {
    return this.seats.map((s) => {
      if (!s) return { moveX: 0, moveY: 0, fire: false, switchWeapon: false };
      // A tap can be shorter than an input interval; replay it as a true/false pulse so the core sees one edge per tap.
      let sw = s.swap;
      if (!s.lastSwitch && s.tapsDone < s.taps) {
        s.tapsDone += 1;
        sw = true;
      }
      s.lastSwitch = sw;
      return { moveX: s.mx, moveY: s.my, fire: s.fire, switchWeapon: sw };
    });
  }

  /** Call often (about 60 Hz). Advances the simulation by real elapsed time and broadcasts snapshots. */
  tick(): void {
    const now = this.d.now();
    if (this.state !== "playing" || !this.world) return;
    const dtReal = Math.min((now - this.lastTickAt) / 1000, 0.25);
    this.lastTickAt = now;
    this.acc += dtReal;
    let steps = 0;
    while (this.acc >= BALANCE.dt && steps < MAX_STEPS_PER_TICK) {
      const events = step(this.world, this.inputs(), BALANCE.dt);
      this.pendingEvents.push(...events);
      this.acc -= BALANCE.dt;
      steps++;
      if (this.world.tick % NET.snapshotEveryTicks === 0 || this.world.over) this.broadcastSnapshot();
      if (this.world.over) {
        this.finish();
        return;
      }
    }
    if (steps === MAX_STEPS_PER_TICK) this.acc = 0; // drop the backlog instead of spiralling
    if (this.allGone(now)) this.finish();
  }

  private allGone(now: number): boolean {
    return this.seats.every((s) => !s || (!s.conn && s.lostAt !== null && now - s.lostAt > NET.reconnectGraceMs));
  }

  private broadcastSnapshot(): void {
    if (!this.world) return;
    const msg: ServerMsg = { t: "snap", s: snapshotWorld(this.world), e: this.pendingEvents };
    this.pendingEvents = [];
    for (const s of this.seats) s?.conn?.send(msg);
  }

  private finish(): void {
    const w = this.world;
    if (!w) return;
    this.state = "over";
    const run = { score: w.score, wave: Math.max(1, w.wave), kills: w.kills, durationMs: Math.round((this.d.now() - this.startedAt)), map: this.map };
    for (const s of this.seats) s?.conn?.send({ t: "over", run });
    this.world = null;
    this.notify();
  }

  private backToLobby(): void {
    this.state = "lobby";
    this.world = null;
    // Seats that vanished during the run are gone now.
    this.seats = this.seats.map((s) => (s && (s.conn ? s : null)));
    for (const s of this.seats) if (s) s.ready = false;
    this.reassignHost();
    this.notify();
    this.broadcastLobby();
  }

  // ---------- output ----------
  private lobbyMsg(): ServerMsg {
    const players: (LobbyPlayer | null)[] = this.seats.map((s, i) =>
      s ? { slot: i as Slot, name: s.name, hero: s.hero, ready: s.ready, connected: s.conn !== null } : null,
    );
    return { t: "lobby", state: this.state, code: this.d.code, public: this.d.public, host: this.host, map: this.map, players };
  }

  private sendLobby(conn: Conn): void {
    conn.send(this.lobbyMsg());
  }

  private broadcastLobby(): void {
    const msg = this.lobbyMsg();
    for (const s of this.seats) s?.conn?.send(msg);
    this.notify();
  }

  private notify(): void {
    this.d.onChange(this.summary());
  }

  private error(seat: Seat, code: ErrorCode, msg: string): void {
    seat.conn?.send({ t: "error", code, msg });
  }

  private reject(conn: Conn, code: ErrorCode, msg: string): null {
    conn.send({ t: "error", code, msg });
    conn.close();
    return null;
  }
}
