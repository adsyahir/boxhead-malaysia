"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MAP_IDS, type MapId } from "@kampung/protocol";
import LangSwitch from "../../game3d/ui/LangSwitch";
import { MAPS } from "../../game/maps";
import { fetchScores, type BoardMode, type BoardRow } from "../../game3d/net/scores";
import type { Key } from "../../i18n";
import { useT } from "../../settings/react";

const MODES: { id: BoardMode; label: Key }[] = [
  { id: "1p", label: "onePlayer" },
  { id: "2p", label: "twoPlayers" },
  { id: "online", label: "online" },
];

const MAP_NAME: Record<MapId, string> = Object.fromEntries(MAPS.map((m) => [m.key, m.name])) as Record<MapId, string>;

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ok"; rows: BoardRow[] };

export default function LeaderboardView() {
  const t = useT();
  const [map, setMap] = useState<MapId>("kampung-pisang");
  const [mode, setMode] = useState<BoardMode>("1p");
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  const refresh = useCallback(async () => {
    setLoad({ kind: "loading" });
    const rows = await fetchScores(map, mode, 50);
    setLoad(rows ? { kind: "ok", rows } : { kind: "error" });
  }, [map, mode]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const rows = await fetchScores(map, mode, 50);
      if (alive) setLoad(rows ? { kind: "ok", rows } : { kind: "error" });
    })();
    setLoad({ kind: "loading" });
    return () => {
      alive = false;
    };
  }, [map, mode]);

  return (
    <main className="page board-page">
      <LangSwitch className="page-lang" />
      <h1>{t("leaderboard")}</h1>

      <div className="board-filters">
        <div className="g3d-row" role="group" aria-label={t("boardMode")}>
          {MODES.map((m) => (
            <button type="button" key={m.id} className={`g3d-chip${mode === m.id ? " on" : ""}`} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {t(m.label)}
            </button>
          ))}
        </div>
        <div className="g3d-row" role="group" aria-label={t("mapLabel")}>
          {MAP_IDS.map((id) => (
            <button type="button" key={id} className={`g3d-chip${map === id ? " on" : ""}`} aria-pressed={map === id} onClick={() => setMap(id)}>
              {MAP_NAME[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="g3d-panel board" aria-busy={load.kind === "loading"}>
        {load.kind === "loading" && <p className="g3d-note" role="status">{t("boardLoading")}</p>}
        {load.kind === "error" && (
          <div role="alert">
            <p className="g3d-error">{t("boardError")}</p>
            <button type="button" className="g3d-chip" onClick={() => void refresh()}>
              {t("boardRetry")}
            </button>
          </div>
        )}
        {load.kind === "ok" && load.rows.length === 0 && <p className="g3d-note">{t("boardEmpty")}</p>}
        {load.kind === "ok" && load.rows.length > 0 && (
          <table className="board-table">
            <caption className="sr-only">
              {t("leaderboard")}: {MAP_NAME[map]}, {t(MODES.find((m) => m.id === mode)!.label)}
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{t("boardColName")}</th>
                <th scope="col" className="num">{t("boardColScore")}</th>
                <th scope="col" className="num">{t("boardColWave")}</th>
                <th scope="col" className="num">{t("boardColLevel")}</th>
              </tr>
            </thead>
            <tbody>
              {load.rows.map((r) => (
                <tr key={`${r.rank}-${r.createdAt}-${r.nickname}`}>
                  <td className="rank">{r.rank}</td>
                  <td className="name">{r.nickname}</td>
                  <td className="num">{r.score.toLocaleString()}</td>
                  <td className="num">{r.wave}</td>
                  <td className="num">{r.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="g3d-note">{t("boardNote")}</p>
      <Link className="btn" href="/">
        {t("home")}
      </Link>
    </main>
  );
}
