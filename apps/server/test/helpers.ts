import { createBoxMap } from "@kampung/game-core";
import type { ClientMsg, ServerMsg } from "@kampung/protocol";
import type { Conn, RoomLogic } from "../src/room-logic";
import { RoomLogic as Room } from "../src/room-logic";

export class FakeConn implements Conn {
  sent: ServerMsg[] = [];
  closed = false;
  send(msg: ServerMsg): void {
    this.sent.push(msg);
  }
  close(): void {
    this.closed = true;
  }
  of<T extends ServerMsg["t"]>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.sent.filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t);
  }
  last<T extends ServerMsg["t"]>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return this.of(t).at(-1);
  }
}

export interface Rig {
  room: RoomLogic;
  clock: { ms: number };
  changes: number;
}

export function makeRoom(isPublic = true): Rig {
  const clock = { ms: 1_000 };
  let n = 0;
  const rig: Rig = { clock, changes: 0, room: null as unknown as RoomLogic };
  rig.room = new Room({
    code: "ABCD",
    public: isPublic,
    now: () => clock.ms,
    loadMap: () => createBoxMap(60, 40),
    seed: () => 12345,
    token: () => `tok${++n}`,
    onChange: () => void rig.changes++,
  });
  return rig;
}

/** Two players seated, both ready, host started: a running game. */
export function startedGame(): { rig: Rig; a: FakeConn; b: FakeConn } {
  const rig = makeRoom();
  const a = new FakeConn();
  const b = new FakeConn();
  rig.room.join(a, "Abu");
  const slotB = rig.room.join(b, "Siti")!;
  rig.room.message(slotB, { t: "ready", ready: true });
  rig.room.message(0, { t: "start" });
  return { rig, a, b };
}

/** Advance the clock and tick the room like the Durable Object's 16 ms timer would. */
export function runFor(rig: Rig, ms: number, stepMs = 16): void {
  for (let t = 0; t < ms; t += stepMs) {
    rig.clock.ms += stepMs;
    rig.room.tick();
  }
}

export const input = (over: Partial<Extract<ClientMsg, { t: "input" }>> = {}): ClientMsg => ({
  t: "input", seq: 1, mx: 0, my: 0, fire: false, swap: false, taps: 0, ...over,
});
