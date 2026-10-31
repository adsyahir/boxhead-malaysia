"use client";

import { WEAPON_IDS } from "@kampung/game-core";
import { waveLabel, type HudState } from "../../game/hud-state";
import { HEROES, hex } from "../../game/characters";
import { weaponName } from "../../i18n";
import { useT } from "../../settings/react";
import Dialog from "./Dialog";
import { PauseIcon, SoundOffIcon, SoundOnIcon } from "./Icons";

interface Props {
  hud: HudState;
  touch: boolean;
  toast: { id: number; text: string } | null;
  muted: boolean;
  onMute(): void;
  onPause(): void;
  onExit(): void;
  onHelp(): void;
  onSettings(): void;
  onUpgrades(): void;
  confirmExit: boolean;
  /** A shared room: the menu cannot pause the game. */
  online?: boolean;
  onCancelExit(): void;
  onConfirmExit(): void;
}

function PlayerCard({ p, side, index }: { p: HudState["players"][number]; side: "left" | "right"; index: number }) {
  const t = useT();
  const frac = Math.max(0, Math.min(1, p.hp / p.maxHp));
  const ammo = Number.isFinite(p.ammo) ? String(p.ammo) : "∞";
  return (
    <div className={`g3d-pcard ${side} p${index}${p.alive ? "" : " down"}`} style={p.alive ? { borderLeftColor: hex(HEROES[p.character].accent) } : undefined}>
      <div className="g3d-pname">
        {p.name}
        {p.alive ? "" : ` ${t("down")}`}
      </div>
      <div className="g3d-hp">
        <div className={`g3d-hpfill${frac > 0.35 ? "" : " low"}`} style={{ width: `${frac * 100}%` }} />
      </div>
      <div className="g3d-weapon">
        {weaponName(p.weapon)} <span className="g3d-ammo">{ammo}</span>
      </div>
    </div>
  );
}

export default function Hud({ hud, touch, toast, muted, onMute, onPause, onExit, onHelp, onSettings, onUpgrades, confirmExit, online = false, onCancelExit, onConfirmExit }: Props) {
  const t = useT();
  return (
    <div className="g3d-hud">
      {hud.players.map((p, i) => (
        <PlayerCard key={i} p={p} index={i} side={i === 1 ? "right" : "left"} />
      ))}
      <div className="g3d-center">
        <div className="g3d-score">{t("score")} {hud.score}</div>
        <div className="g3d-level" key={`level-${hud.level}`}>
          <span>{t("levelShort", { n: hud.level })}</span>
          <div
            className="g3d-xp"
            role="progressbar"
            aria-label={hud.xpNeed > 1 ? t("levelProgress", { have: hud.xpHave, need: hud.xpNeed }) : t("levelMax")}
            aria-valuemin={0}
            aria-valuemax={hud.xpNeed}
            aria-valuenow={hud.xpHave}
          >
            <div className="g3d-xpfill" style={{ width: `${Math.min(100, (hud.xpHave / Math.max(1, hud.xpNeed)) * 100)}%` }} />
          </div>
        </div>
        <div className="g3d-wave">{waveLabel(hud)}</div>
        {hud.combo > 1 && (
          <div className="g3d-combo" key={`combo-${hud.combo}`}>
            {t("combo", { n: hud.combo })}
          </div>
        )}
      </div>
      <div className="g3d-corner">
        <button type="button" className="g3d-icon" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={onPause} aria-label={t("pause")}>
          <PauseIcon />
        </button>
        <button type="button" className="g3d-icon" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={onMute} aria-label={muted ? t("unmute") : t("mute")}>
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </button>
      </div>
      {!touch && (
        <div className="g3d-unlocks">
          {WEAPON_IDS.map((id, i) => (
            <span key={id} className={`${hud.unlocked.includes(id) ? "on" : ""}${hud.players[0]?.weapon === id ? " cur" : ""}`}>
              {(i + 1) % 10}.{hud.unlocked.includes(id) ? weaponName(id) : "---"}
            </span>
          ))}
        </div>
      )}
      {toast && (
        <div className="g3d-toast" key={toast.id}>
          {toast.text}
        </div>
      )}
      {hud.paused && !confirmExit && (
        <Dialog className="g3d-pause" label={t("paused")}>
          <div className="g3d-pause-title">{online ? t("onlineMenuTitle") : t("paused")}</div>
          {online && <div className="g3d-pause-hint">{t("onlineMenuNote")}</div>}
          <div className="g3d-pause-actions">
            <button type="button" className="g3d-btn primary" onClick={onPause}>
              {t("resume")}
            </button>
            <button type="button" className="g3d-btn" onClick={onHelp}>
              {t("howToPlay")}
            </button>
            <button type="button" className="g3d-btn" onClick={onUpgrades}>
              {t("upgradeList")}
            </button>
            <button type="button" className="g3d-btn" onClick={onSettings}>
              {t("settings")}
            </button>
            <button type="button" className="g3d-btn" onClick={onExit}>
              {t("exitToMenu")}
            </button>
          </div>
          {!touch && <div className="g3d-pause-hint">{t("resumeKeys")}</div>}
        </Dialog>
      )}
      {confirmExit && (
        <div className="g3d-pause g3d-confirm" role="alertdialog" aria-labelledby="leave-title" aria-describedby="leave-body">
          <div className="g3d-confirm-box">
            <h2 id="leave-title">{t("leaveTitle")}</h2>
            <p id="leave-body">{online ? t("leaveBodyOnline") : t("leaveBody")}</p>
            <div className="g3d-confirm-actions">
              <button type="button" className="g3d-btn primary" onClick={onCancelExit} autoFocus>
                {t("leaveCancel")}
              </button>
              <button type="button" className="g3d-btn danger" onClick={onConfirmExit}>
                {t("leaveConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
