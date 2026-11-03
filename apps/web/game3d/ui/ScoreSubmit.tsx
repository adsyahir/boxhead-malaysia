"use client";

import { useState } from "react";
import { hasBadWord } from "@kampung/game-core";
import { NICK_KEY, type RunSummary } from "../../game/constants";
import { useT } from "../../settings/react";
import { submitScore } from "../net/scores";
import { nameIsValid } from "./OnlineScreens";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done"; rank: number } | { kind: "error"; message: "submitFail" | "submitRate" | "submitInvalid" };

/**
 * Nickname + Submit for a finished 1P or 2P run. The run stays in memory (it is a prop) until it is sent or the
 * player leaves, so a failed send can be retried without losing it.
 */
export default function ScoreSubmit({ run }: { run: RunSummary }) {
  const t = useT();
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NICK_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const ok = nameIsValid(name);
  const mode = run.mode === "2p" ? "2p" : "1p";

  const send = async () => {
    if (!ok || status.kind === "sending") return;
    try {
      localStorage.setItem(NICK_KEY, name.trim());
    } catch {
      /* not remembered */
    }
    setStatus({ kind: "sending" });
    const ticket = run.ticket ? await run.ticket : null;
    if (!ticket) {
      setStatus({ kind: "error", message: "submitFail" });
      return;
    }
    const r = await submitScore({ nickname: name.trim(), score: run.score, wave: run.wave, kills: run.kills, level: run.level, map: run.map, mode, durationMs: run.durationMs, ticket });
    if (r.ok) setStatus({ kind: "done", rank: r.rank });
    else setStatus({ kind: "error", message: r.reason === "rate_limited" ? "submitRate" : r.reason === "invalid" ? "submitInvalid" : "submitFail" });
  };

  if (status.kind === "done") {
    return (
      <div className="g3d-submit" role="status">
        <p className="g3d-submitted">{t("submitDone", { rank: status.rank })}</p>
        <a className="g3d-chip" href="/leaderboard">
          {t("viewBoard")}
        </a>
      </div>
    );
  }

  return (
    <form
      className="g3d-submit"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <h3>{t("submitTitle")}</h3>
      <div className="g3d-row center">
        <label className="g3d-field inline">
          <span>{t("yourName")}</span>
          <input type="text" value={name} maxLength={16} autoComplete="nickname" spellCheck={false} onChange={(e) => setName(e.target.value)} aria-invalid={!ok && name.length > 0} />
        </label>
        <button type="submit" className="g3d-btn primary slim" disabled={!ok || status.kind === "sending"}>
          {status.kind === "sending" ? t("submitting") : status.kind === "error" ? t("boardRetry") : t("submitButton")}
        </button>
      </div>
      {!ok && name.length > 0 && <p className="g3d-note bad">{hasBadWord(name) ? t("nameNotAllowed") : t("nameHint")}</p>}
      {status.kind === "error" && (
        <p className="g3d-error" role="alert">
          {t(status.message)}
        </p>
      )}
    </form>
  );
}
