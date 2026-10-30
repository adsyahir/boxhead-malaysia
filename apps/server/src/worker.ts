import { CreateRoomSchema, ROOM_CODE_RE, parseClientMsg, type ServerMsg, type Slot } from "@kampung/protocol";
import { LobbyLogic } from "./lobby-logic";
import { loadMap } from "./maps";
import { RoomLogic, type Conn, type RoomSummary } from "./room-logic";

interface Env {
  ROOM: DurableObjectNamespace;
  LOBBY: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const json = (body: unknown, status = 200, extra: HeadersInit = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

/** Same-site pages and local dev (any localhost port) may talk to the API; other sites may not. */
function allowedOrigin(req: Request, url: URL): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return "";
  try {
    const o = new URL(origin);
    if (o.host === url.host) return origin;
    if (o.hostname === "localhost" || o.hostname === "127.0.0.1") return origin;
  } catch {
    /* fall through */
  }
  return null;
}

function cors(origin: string): HeadersInit {
  return origin ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" } : {};
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/ws") return handleSocket(req, env, url);
    if (url.pathname === "/api/rooms") return handleRooms(req, env, url);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

async function handleRooms(req: Request, env: Env, url: URL): Promise<Response> {
  const origin = allowedOrigin(req, url);
  if (origin === null) return json({ error: "forbidden" }, 403);
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  const lobby = env.LOBBY.get(env.LOBBY.idFromName("main"));
  if (req.method === "GET") {
    const res = await lobby.fetch("https://lobby/list");
    return json(await res.json(), 200, headers);
  }
  if (req.method !== "POST") return json({ error: "method" }, 405, headers);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400, headers);
  }
  const parsed = CreateRoomSchema.safeParse(body);
  if (!parsed.success) return json({ error: "bad_request" }, 400, headers);

  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await lobby.fetch("https://lobby/create", { method: "POST", body: JSON.stringify({ public: parsed.data.public, ip }) });
    if (res.status === 429) return json({ error: "rate_limited" }, 429, headers);
    if (!res.ok) return json({ error: "busy" }, 503, headers);
    const { code } = (await res.json()) as { code: string };
    const room = env.ROOM.get(env.ROOM.idFromName(code));
    const init = await room.fetch("https://room/init", { method: "POST", body: JSON.stringify({ code, public: parsed.data.public }) });
    if (init.ok) return json({ code }, 201, headers);
    await lobby.fetch("https://lobby/remove", { method: "POST", body: JSON.stringify({ code }) }); // code clash with a live room: try another
  }
  return json({ error: "busy" }, 503, headers);
}

async function handleSocket(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a websocket", { status: 426 });
  if (allowedOrigin(req, url) === null) return new Response("Forbidden", { status: 403 });
  const code = (url.searchParams.get("room") ?? "").toUpperCase();
  if (!ROOM_CODE_RE.test(code)) return new Response("Bad room code", { status: 400 });
  return env.ROOM.get(env.ROOM.idFromName(code)).fetch(req);
}

// ---------------------------------------------------------------------------------------------

const HELLO_TIMEOUT_MS = 10_000;
const MAX_BAD_MESSAGES = 5;
const TICK_MS = 16;

/** One Durable Object per room: owns the authoritative World and its 60 Hz loop while players are connected. */
export class RoomDO {
  private logic: RoomLogic | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    void this.state.blockConcurrencyWhile(async () => {
      const init = await this.state.storage.get<{ code: string; public: boolean }>("init");
      if (init) this.setup(init.code, init.public);
    });
  }

  private setup(code: string, isPublic: boolean): void {
    this.logic = new RoomLogic({
      code,
      public: isPublic,
      now: () => Date.now(),
      loadMap,
      seed: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
      token: () => crypto.randomUUID(),
      onChange: (s) => this.report(s),
    });
  }

  private lobby(): DurableObjectStub {
    return this.env.LOBBY.get(this.env.LOBBY.idFromName("main"));
  }

  private report(s: RoomSummary): void {
    this.state.waitUntil(this.lobby().fetch("https://lobby/update", { method: "POST", body: JSON.stringify(s) }).catch(() => undefined));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/init" && req.method === "POST") {
      if (this.logic && !this.logic.isDead()) return new Response("exists", { status: 409 });
      const init = (await req.json()) as { code: string; public: boolean };
      await this.state.storage.put("init", init);
      this.setup(init.code, init.public);
      return new Response("ok");
    }

    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.wire(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private wire(ws: WebSocket): void {
    const conn: Conn = {
      send: (m: ServerMsg) => {
        try {
          ws.send(JSON.stringify(m));
        } catch {
          /* socket already closing */
        }
      },
      close: () => {
        try {
          ws.close(1000, "bye");
        } catch {
          /* already closed */
        }
      },
    };
    const logic = this.logic;
    if (!logic) {
      conn.send({ t: "error", code: "no_room", msg: "Bilik tidak wujud." });
      conn.close();
      return;
    }

    let slot: Slot | null = null;
    let bad = 0;
    const helloTimer = setTimeout(() => {
      if (slot === null) conn.close();
    }, HELLO_TIMEOUT_MS);

    ws.addEventListener("message", (ev) => {
      const msg = parseClientMsg(ev.data);
      if (!msg) {
        if (++bad > MAX_BAD_MESSAGES) conn.close();
        else conn.send({ t: "error", code: "bad_message", msg: "Mesej tidak sah." });
        return;
      }
      if (slot === null) {
        if (msg.t !== "hello") return conn.close();
        slot = logic.join(conn, msg.name, msg.token);
        if (slot !== null) this.ensureLoop();
        return;
      }
      logic.message(slot, msg);
    });

    const gone = () => {
      clearTimeout(helloTimer);
      if (slot !== null) logic.disconnect(slot, conn);
      slot = null;
    };
    ws.addEventListener("close", gone);
    ws.addEventListener("error", gone);
  }

  private ensureLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const logic = this.logic;
      if (!logic) return;
      logic.tick();
      if (logic.isDead()) {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.state.waitUntil(this.lobby().fetch("https://lobby/remove", { method: "POST", body: JSON.stringify({ code: logic.code }) }).catch(() => undefined));
      }
    }, TICK_MS);
  }
}

/** Single registry object: hands out room codes and lists open public rooms. */
export class LobbyDO {
  private readonly logic = new LobbyLogic(
    () => Date.now(),
    () => crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296,
  );

  constructor(private readonly state: DurableObjectState) {
    void this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get<ReturnType<LobbyLogic["snapshot"]>>("rooms");
      if (saved) this.logic.restore(saved);
    });
  }

  private save(): void {
    this.state.waitUntil(this.state.storage.put("rooms", this.logic.snapshot()));
  }

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path === "/list") return json(this.logic.list());
    if (req.method !== "POST") return new Response("method", { status: 405 });
    const body = (await req.json()) as Record<string, unknown>;
    if (path === "/create") {
      const r = this.logic.create(body.public === true, String(body.ip ?? "local"));
      if (!r.ok) return json({ error: r.reason }, r.reason === "rate_limited" ? 429 : 503);
      this.save();
      return json({ code: r.code });
    }
    if (path === "/update") this.logic.update(body as unknown as RoomSummary);
    else if (path === "/remove") this.logic.remove(String(body.code));
    else return new Response("not found", { status: 404 });
    this.save();
    return new Response("ok");
  }
}

