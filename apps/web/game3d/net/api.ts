import { ROOM_CODE_RE, type RoomListing } from "@kampung/protocol";
import { httpBase } from "./endpoint";

export type ApiError = "rate_limited" | "busy" | "offline";

async function request(path: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    return await fetch(`${httpBase()}${path}`, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function createRoom(isPublic: boolean): Promise<{ ok: true; code: string } | { ok: false; error: ApiError }> {
  try {
    const res = await request("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ public: isPublic }) });
    if (res.status === 429) return { ok: false, error: "rate_limited" };
    if (!res.ok) return { ok: false, error: "busy" };
    const body = (await res.json()) as { code?: string };
    return body.code && ROOM_CODE_RE.test(body.code) ? { ok: true, code: body.code } : { ok: false, error: "busy" };
  } catch {
    return { ok: false, error: "offline" };
  }
}

export async function listRooms(): Promise<RoomListing[] | null> {
  try {
    const res = await request("/api/rooms");
    return res.ok ? ((await res.json()) as RoomListing[]) : null;
  } catch {
    return null;
  }
}
