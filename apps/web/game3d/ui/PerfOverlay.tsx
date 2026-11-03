"use client";

import { useT } from "../../settings/react";
import { pingBand, type PerfStats } from "../engine/perf";

const r = (n: number) => Math.round(n);

/** Small read-only panel (Settings: Performance display): frame rate always, network numbers in online games. */
export default function PerfOverlay({ stats }: { stats: PerfStats }) {
  const t = useT();
  const net = stats.online;
  return (
    <div className="g3d-perf" aria-label={t("perfDisplay")} data-testid="perf">
      <div>
        <span>FPS</span>
        <b>{r(stats.fps)}</b>
      </div>
      <div>
        <span>{t("perfFrame")}</span>
        <b>
          {stats.frameMs.toFixed(1)} ms
        </b>
      </div>
      <div>
        <span>{t("perfWorst")}</span>
        <b>{r(stats.worstMs)} ms</b>
      </div>
      <div>
        <span>CPU</span>
        <b>{stats.cpuMs.toFixed(1)} ms</b>
      </div>
      {net && (
        <>
          <div className={`ping ${net.pingMs > 0 ? pingBand(net.pingMs) : ""}`}>
            <span>Ping</span>
            <b data-testid="perf-ping">{net.pingMs > 0 ? `${r(net.pingMs)} ms` : "..."}</b>
          </div>
          <div>
            <span>Jitter</span>
            <b>{r(net.jitterMs)} ms</b>
          </div>
          <div>
            <span>{t("perfUpdates")}</span>
            <b>{net.snapsPerSec}/s</b>
          </div>
          {net.predictErrPx !== null && (
            <div>
              <span>{t("perfPredict")}</span>
              <b>{net.predictErrPx.toFixed(1)} px</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}
