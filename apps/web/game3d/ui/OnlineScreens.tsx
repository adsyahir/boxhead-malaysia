"use client";

import { useState } from "react";
import { MAP_IDS, ROOM_CODE_RE, type MapId, type RoomListing } from "@kampung/protocol";
import { validateNickname } from "@kampung/game-core";
import { CHARACTERS, HEROES, characterName, hex } from "../../game/characters";
import { MAPS } from "../../game/maps";
import type { Key } from "../../i18n";
import { useT } from "../../settings/react";
import type { LobbyView } from "../net/client";

const MAP_NAME: Record<MapId, string> = Object.fromEntries(MAPS.map((m) => [m.key, m.name])) as Record<MapId, string>;

export function nameIsValid(name: string): boolean {
  return validateNickname(name.trim()).ok;
}

export function OnlineMenu(props: {
  name: string;
  onName(n: string): void;
  busy: boolean;
  error: Key | null;
  /** undefined = still loading, null = server unreachable */
  rooms: RoomListing[] | null | undefined;
  prefillCode: string;
  onCreate(isPublic: boolean): void;
  onJoin(code: string): void;
  onRefresh(): void;
  onBack(): void;
}) {
  const t = useT();
  const [code, setCode] = useState(props.prefillCode);
  const nameOk = nameIsValid(props.name);
  const codeOk = ROOM_CODE_RE.test(code.toUpperCase());
  const off = props.busy || !nameOk;

  return (
    <div className="g3d-screen g3d-scroll">
      <button type="button" className="g3d-back" onClick={props.onBack}>
        {t("back")}
      </button>
      <h2 className="g3d-h2">{t("onlineTitle")}</h2>
      <div className="g3d-panel g3d-online">
        <label className="g3d-field">
          <span>{t("yourName")}</span>
          <input
            type="text"
            value={props.name}
            maxLength={16}
            autoComplete="nickname"
            spellCheck={false}
            onChange={(e) => props.onName(e.target.value)}
            aria-invalid={!nameOk && props.name.length > 0}
          />
        </label>
        <p className={`g3d-note${!nameOk && props.name.length > 0 ? " bad" : ""}`}>{t("nameHint")}</p>

        <div className="g3d-row">
          <button type="button" className="g3d-btn primary slim" disabled={off} onClick={() => props.onCreate(true)}>
            {t("createPublic")}
          </button>
          <button type="button" className="g3d-btn slim" disabled={off} onClick={() => props.onCreate(false)}>
            {t("createPrivate")}
          </button>
        </div>

        <form
          className="g3d-row g3d-join"
          onSubmit={(e) => {
            e.preventDefault();
            if (!off && codeOk) props.onJoin(code.toUpperCase());
          }}
        >
          <label className="g3d-field inline">
            <span>{t("joinByCode")}</span>
            <input
              type="text"
              className="g3d-code"
              value={code}
              maxLength={4}
              placeholder={t("codePlaceholder")}
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            />
          </label>
          <button type="submit" className="g3d-btn slim" disabled={off || !codeOk}>
            {t("join")}
          </button>
        </form>

        {props.busy && <p className="g3d-note" role="status">{t("connecting")}</p>}
        {props.error && <p className="g3d-error" role="alert">{t(props.error)}</p>}

        <div className="g3d-rooms">
          <div className="g3d-row">
            <h3>{t("openRooms")}</h3>
            <button type="button" className="g3d-chip" onClick={props.onRefresh}>
              {t("refresh")}
            </button>
          </div>
          {props.rooms === undefined && <p className="g3d-note">{t("connecting")}</p>}
          {props.rooms === null && <p className="g3d-note bad">{t("roomsOffline")}</p>}
          {props.rooms && props.rooms.length === 0 && <p className="g3d-note">{t("noRooms")}</p>}
          {props.rooms?.map((r) => (
            <div className="g3d-roomrow" key={r.code}>
              <span className="g3d-roomcode">{r.code}</span>
              <span className="g3d-roominfo">
                {t("hostOf", { name: r.host })} · {MAP_NAME[r.map] ?? r.map} · {r.players}/2
              </span>
              <button type="button" className="g3d-chip" disabled={off} onClick={() => props.onJoin(r.code)}>
                {t("join")}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Lobby(props: {
  view: LobbyView;
  you: 0 | 1;
  error: Key | null;
  onHero(h: (typeof CHARACTERS)[number]): void;
  onReady(r: boolean): void;
  onMap(m: MapId): void;
  onStart(): void;
  onLeave(): void;
}) {
  const t = useT();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const { view, you } = props;
  const me = view.players[you];
  const other = view.players[you === 0 ? 1 : 0];
  const isHost = view.host === you;
  const full = !!me && !!other && other.connected;
  const canStart = isHost && full && other.ready;

  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? view.code : `${window.location.origin}/?room=${view.code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked: the code is on screen anyway */
    }
  };

  return (
    <div className="g3d-screen g3d-scroll">
      <button type="button" className="g3d-back" onClick={props.onLeave}>
        {t("leaveRoom")}
      </button>
      <div className="g3d-panel g3d-lobby">
        <div className="g3d-codebox">
          <span className="g3d-note">{t("roomCode")}</span>
          <strong className="g3d-bigcode" data-testid="room-code">{view.code}</strong>
          <span className="g3d-note">{view.public ? t("publicRoom") : t("privateRoom")}</span>
          <div className="g3d-row center">
            <button type="button" className="g3d-chip" onClick={() => void copy("code")}>
              {copied === "code" ? t("copied") : t("copyCode")}
            </button>
            <button type="button" className="g3d-chip" onClick={() => void copy("link")}>
              {copied === "link" ? t("copied") : t("copyLink")}
            </button>
          </div>
        </div>

        <h3>{t("lobbyPlayers")}</h3>
        <ul className="g3d-seats">
          {[0, 1].map((i) => {
            const p = view.players[i];
            return (
              <li key={i} className={p ? "" : "empty"} data-testid={`seat-${i}`}>
                {p ? (
                  <>
                    <span className="g3d-seatdot" style={{ background: hex(HEROES[p.hero].accent) }} />
                    <span className="g3d-seatname">
                      {p.name} {i === you && t("youTag")}
                    </span>
                    <span className="g3d-seathero">{characterName(p.hero)}</span>
                    <span className="g3d-seattag">{i === view.host ? t("hostTag") : p.ready ? t("readyTag") : t("notReadyTag")}</span>
                  </>
                ) : (
                  <span className="g3d-note">{t("waitingPlayer")}</span>
                )}
              </li>
            );
          })}
        </ul>

        <h3>{t("yourHero")}</h3>
        <div className="g3d-heropick">
          {CHARACTERS.map((c) => {
            const look = HEROES[c].look;
            const taken = other?.hero === c;
            return (
              <button
                type="button"
                key={c}
                className={`g3d-heroopt${me?.hero === c ? " on" : ""}`}
                disabled={taken}
                aria-pressed={me?.hero === c}
                onClick={() => props.onHero(c)}
                title={characterName(c)}
                style={{ ["--accent-hero" as string]: hex(HEROES[c].accent) }}
              >
                <span
                  className={`g3d-figure sm${c === "siti" || c === "kiah" ? " covered" : ""}`}
                  aria-hidden="true"
                  style={{ ["--skin" as string]: hex(look.skin), ["--top" as string]: hex(look.top), ["--bottom" as string]: hex(look.bottom), ["--hair" as string]: hex(look.hair) }}
                >
                  <i className="head" />
                  <i className="body" />
                </span>
                <span>{characterName(c)}</span>
              </button>
            );
          })}
        </div>

        <h3>{t("mapLabel")}</h3>
        <div className="g3d-row center">
          {MAP_IDS.map((m) => (
            <button type="button" key={m} className={`g3d-chip${view.map === m ? " on" : ""}`} disabled={!isHost} aria-pressed={view.map === m} onClick={() => props.onMap(m)}>
              {MAP_NAME[m]}
            </button>
          ))}
        </div>
        {!isHost && <p className="g3d-note">{t("onlyHostMap")}</p>}

        {props.error && <p className="g3d-error" role="alert">{t(props.error)}</p>}

        <div className="g3d-row end">
          {isHost ? (
            <button type="button" className="g3d-btn primary" disabled={!canStart} onClick={props.onStart}>
              {!full ? t("needTwo") : !other.ready ? t("waitForReady") : t("startGame")}
            </button>
          ) : (
            <button type="button" className={`g3d-btn${me?.ready ? "" : " primary"}`} onClick={() => props.onReady(!me?.ready)}>
              {me?.ready ? t("iAmNotReady") : t("iAmReady")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
