"use client";

import { WEAPONS, WEAPON_IDS } from "@kampung/game-core";
import { waveLabel, type HudState } from "../../game/hud-state";

interface Props {
  hud: HudState;
  touch: boolean;
  toast: { id: number; text: string } | null;
  muted: boolean;
  onMute(): void;
  onPause(): void;
}

function PlayerCard({ p, side, index }: { p: HudState["players"][number]; side: "left" | "right"; index: number }) {
  const frac = Math.max(0, Math.min(1, p.hp / p.maxHp));
  const ammo = Number.isFinite(p.ammo) ? String(p.ammo) : "∞";
  return (
    <div className={`g3d-pcard ${side} p${index}${p.alive ? "" : " down"}`}>
      <div className="g3d-pname">
        {p.name}
        {p.alive ? "" : " (tumbang)"}
      </div>
      <div className="g3d-hp">
        <div className={`g3d-hpfill${frac > 0.35 ? "" : " low"}`} style={{ width: `${frac * 100}%` }} />
      </div>
      <div className="g3d-weapon">
        {WEAPONS[p.weapon].name} <span className="g3d-ammo">{ammo}</span>
      </div>
    </div>
  );
}

export default function Hud({ hud, touch, toast, muted, onMute, onPause }: Props) {
  return (
    <div className="g3d-hud">
      {hud.players.map((p, i) => (
        <PlayerCard key={i} p={p} index={i} side={i === 1 ? "right" : "left"} />
      ))}
      <div className="g3d-center">
        <div className="g3d-score">Markah {hud.score}</div>
        <div className="g3d-wave">{waveLabel(hud)}</div>
        {hud.combo > 1 && (
          <div className="g3d-combo" key={hud.combo}>
            Kombo x{hud.combo}
          </div>
        )}
      </div>
      <div className="g3d-corner">
        <button type="button" className="g3d-icon" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={onPause} aria-label="Jeda">
          ❚❚
        </button>
        <button type="button" className="g3d-icon" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={onMute} aria-label={muted ? "Bunyi" : "Senyap"}>
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      {!touch && (
        <div className="g3d-unlocks">
          {WEAPON_IDS.map((id, i) => (
            <span key={id} className={hud.unlocked.includes(id) ? "on" : ""}>
              {i + 1}.{hud.unlocked.includes(id) ? WEAPONS[id].name : "---"}
            </span>
          ))}
        </div>
      )}
      {toast && (
        <div className="g3d-toast" key={toast.id}>
          {toast.text}
        </div>
      )}
      {hud.paused && (
        <div className="g3d-pause" onClick={touch ? onPause : undefined}>
          <div className="g3d-pause-title">JEDA</div>
          <div>{touch ? "Ketik untuk sambung" : "P atau Esc untuk sambung"}</div>
        </div>
      )}
    </div>
  );
}
