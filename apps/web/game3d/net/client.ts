import { NET, SnapshotBuffer, type Snapshot, type ErrorCode, type LobbyPlayer, type MapId, type RoomState, type RunResult, type ServerMsg, type Slot, type ClientMsg, type HeroId } from "@kampung/protocol";
import { wsUrl } from "./endpoint";

export type LinkStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface LobbyView {
  state: RoomState;
  code: string;
  public: boolean;
  host: Slot;
  map: MapId;
  players: (LobbyPlayer | null)[];
}

export interface ClientEvents {
  onStatus(s: LinkStatus): void;
  onLobby(l: LobbyView, you: Slot): void;
  onStart(s: { map: MapId; heroes: HeroId[]; you: Slot }): void;
  onOver(run: RunResult): void;
  /** The room server stored (or failed to store) the finished team score. */
  onSaved(rank: number | null): void;
  onError(code: ErrorCode, msg: string): void;
}

const RETRY_MS = [500, 1000, 2000, 3000, 5000];
const tokenKey = (code: string) => `kpp-room-${code}`;

/** One websocket to one room. Reconnects with its token (same seat) if the connection drops mid-game. */
export class OnlineClient {
  readonly buffer = new SnapshotBuffer(100);
  you: Slot = 0;
  code = "";
  status: LinkStatus = "idle";
  /** Round-trip time of the last ping, in ms. */
  rtt = 0;
  /** Recent round trips (newest last) and snapshot arrival times, for the performance overlay. */
  readonly rtts: number[] = [];
  private readonly snapTimes: number[] = [];
  /** Called with every snapshot the moment it arrives (not delayed like the playback buffer): used to reconcile prediction. */
  onRawSnapshot: ((snap: Snapshot, atMs: number) => void) | null = null;
  /** Debug only (`?debug&lag=120`): delay everything this many ms each way, to feel a slow connection. */
  private readonly lagMs = debugLag();

  private ws: WebSocket | null = null;
  private name = "";
  private token = "";
  private wantOpen = false;
  private attempt = 0;
  private lostAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingSent = 0;
  private lastInputAt = 0;
  private seq = 0;

  constructor(private readonly ev: ClientEvents) {}

  connect(code: string, name: string): void {
    this.code = code.toUpperCase();
    this.name = name;
    try {
      this.token = sessionStorage.getItem(tokenKey(this.code)) ?? "";
    } catch {
      this.token = "";
    }
    this.wantOpen = true;
    this.attempt = 0;
    this.open("connecting");
  }

  private setStatus(s: LinkStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.ev.onStatus(s);
  }

  private open(status: LinkStatus): void {
    this.setStatus(status);
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(this.code));
    } catch {
      this.fail();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.send({ t: "hello", name: this.name, token: this.token || undefined });
      this.setStatus("open");
      this.startPing();
    };
    ws.onmessage = (e) => (this.lagMs > 0 ? void setTimeout(() => this.handle(e.data), this.lagMs) : this.handle(e.data));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      if (!this.wantOpen) return;
      this.retryOrClose();
    };
    ws.onerror = () => undefined; // onclose follows
  }

  private fail(): void {
    this.wantOpen = false;
    this.setStatus("closed");
  }

  /** Only retry if we had a seat (a token); a rejected join is final. */
  private retryOrClose(): void {
    if (!this.token) return this.fail();
    if (this.attempt === 0) this.lostAt = performance.now();
    if (performance.now() - this.lostAt > NET.reconnectGraceMs) return this.fail();
    this.setStatus("reconnecting");
    const delay = RETRY_MS[Math.min(this.attempt, RETRY_MS.length - 1)]!;
    this.attempt++;
    this.retryTimer = setTimeout(() => this.open("reconnecting"), delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.pingSent = performance.now();
      this.send({ t: "ping", n: 1 });
    }, NET.pingMs);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private handle(raw: unknown): void {
    if (typeof raw !== "string") return;
    let m: ServerMsg;
    try {
      m = JSON.parse(raw) as ServerMsg;
    } catch {
      return;
    }
    switch (m.t) {
      case "welcome":
        this.you = m.slot;
        this.token = m.token;
        try {
          sessionStorage.setItem(tokenKey(m.code), m.token);
        } catch {
          /* private mode: a refresh just will not rejoin */
        }
        return;
      case "lobby":
        this.ev.onLobby({ state: m.state, code: m.code, public: m.public, host: m.host, map: m.map, players: m.players }, this.you);
        return;
      case "start":
        this.buffer.clear();
        this.ev.onStart({ map: m.map, heroes: m.heroes, you: m.you });
        return;
      case "snap": {
        const at = performance.now();
        this.snapTimes.push(at);
        while (this.snapTimes.length > 0 && this.snapTimes[0]! < at - 1000) this.snapTimes.shift();
        this.onRawSnapshot?.(m.s, at);
        this.buffer.push(at, m.s, m.e);
        return;
      }
      case "over":
        this.ev.onOver(m.run);
        return;
      case "saved":
        this.ev.onSaved(m.rank);
        return;
      case "error":
        if (m.code === "bad_name" || m.code === "no_room" || m.code === "room_full" || m.code === "in_progress") this.token = "";
        this.ev.onError(m.code, m.msg);
        return;
      case "pong":
        this.rtt = performance.now() - this.pingSent;
        this.rtts.push(this.rtt);
        if (this.rtts.length > 8) this.rtts.shift();
        return;
    }
  }

  /** Snapshots received in the last second (the server sends 20 a second). */
  snapsPerSec(now = performance.now()): number {
    return this.snapTimes.filter((t) => t >= now - 1000).length;
  }

  send(msg: ClientMsg): void {
    const text = JSON.stringify(msg);
    const go = () => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(text);
    };
    if (this.lagMs > 0) setTimeout(go, this.lagMs);
    else go();
  }

  /** Called every frame; sends at most NET.inputHz per second. Returns the sequence number it sent, or null if it was too soon. */
  sendInput(i: { mx: number; my: number; ax?: number; ay?: number; fire: boolean; swap: boolean; taps: number; sel?: number }, nowMs: number): number | null {
    if (nowMs - this.lastInputAt < 1000 / NET.inputHz) return null;
    this.lastInputAt = nowMs;
    const seq = ++this.seq;
    const aim = i.ax || i.ay ? { ax: i.ax ?? 0, ay: i.ay ?? 0 } : {};
    this.send({ t: "input", seq, mx: i.mx, my: i.my, ...aim, fire: i.fire, swap: i.swap, taps: i.taps, ...(i.sel !== undefined ? { sel: i.sel } : {}) });
    return seq;
  }

  /** Leave on purpose: gives up the seat. */
  leave(): void {
    this.send({ t: "leave" });
    this.close();
  }

  close(): void {
    this.wantOpen = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close(1000);
    } catch {
      /* already closed */
    }
    try {
      sessionStorage.removeItem(tokenKey(this.code));
    } catch {
      /* ignore */
    }
    this.setStatus("closed");
  }
}

function debugLag(): number {
  if (typeof window === "undefined") return 0;
  const q = new URLSearchParams(window.location.search);
  if (!q.has("debug")) return 0;
  const n = Number(q.get("lag"));
  return Number.isFinite(n) && n > 0 && n <= 2000 ? n : 0;
}
