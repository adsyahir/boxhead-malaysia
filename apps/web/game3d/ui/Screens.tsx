"use client";

import { UPGRADE_LIST, WEAPONS, WEAPON_IDS } from "@kampung/game-core";
import { CHARACTERS, HEROES, characterName, hex, type Character } from "../../game/characters";
import type { RunSummary } from "../../game/constants";
import { MAPS } from "../../game/maps";
import { upgradeName, weaponName } from "../../i18n";
import type { Key } from "../../i18n";
import { resetSettings, updateSettings, type Quality } from "../../settings/store";
import { useAudioReady } from "../../game/audio/use-audio-ready";
import { useSettings, useT } from "../../settings/react";
import LangSwitch from "./LangSwitch";

const MAP_BLURBS: Record<string, Key> = {
  "kampung-pisang": "mapKampungBlurb",
  "kebun-getah": "mapGetahBlurb",
  "tanah-perkuburan": "mapKuburBlurb",
};

function Back({ onBack }: { onBack(): void }) {
  const t = useT();
  return (
    <button type="button" className="g3d-back" onClick={onBack}>
      {t("back")}
    </button>
  );
}

export function Menu(props: {
  touch: boolean;
  onStart(): void;
  onHelp(): void;
  onSettings(): void;
  onBoard(): void;
  onCredits(): void;
}) {
  const t = useT();
  const soundReady = useAudioReady();
  const { muted } = useSettings();
  const items: { key: Key; run(): void; primary?: boolean }[] = [
    { key: "start", run: props.onStart, primary: true },
    { key: "howToPlay", run: props.onHelp },
    { key: "settings", run: props.onSettings },
    { key: "leaderboard", run: props.onBoard },
    { key: "credits", run: props.onCredits },
  ];
  return (
    <div className="g3d-screen g3d-menu">
      <h1 className="g3d-title">
        HANTU
        <br />
        KAMPUNG PISANG
      </h1>
      <p className="g3d-sub">{t("tagline")}</p>
      <div className="g3d-buttons">
        {items.map((it, i) => (
          <button type="button" key={it.key} className={`g3d-btn${it.primary ? " primary" : ""}`} onClick={it.run}>
            {!props.touch && <span className="g3d-keycap">{i + 1}</span>}
            {t(it.key)}
          </button>
        ))}
      </div>
      {!soundReady && !muted && <p className="g3d-note g3d-soundhint">{t("soundHint")}</p>}
      <div className="g3d-menu-foot">
        <LangSwitch />
        <a className="g3d-link" href="/play2d">
          {t("version2d")}
        </a>
      </div>
    </div>
  );
}

export function ModeSelect({ touch, onPick, onOnline, onBack }: { touch: boolean; onPick(n: 1 | 2): void; onOnline(): void; onBack(): void }) {
  const t = useT();
  return (
    <div className="g3d-screen">
      <Back onBack={onBack} />
      <h2 className="g3d-h2">{t("chooseMode")}</h2>
      <div className="g3d-buttons">
        <button type="button" className="g3d-btn primary" onClick={() => onPick(1)}>
          {!touch && <span className="g3d-keycap">1</span>}
          {t("onePlayer")}
        </button>
        {!touch && (
          <button type="button" className="g3d-btn" onClick={() => onPick(2)}>
            <span className="g3d-keycap">2</span>
            {t("twoPlayers")} <small>({t("twoPlayersHint")})</small>
          </button>
        )}
        <button type="button" className="g3d-btn" onClick={onOnline}>
          {!touch && <span className="g3d-keycap">{3}</span>}
          {t("online")}
        </button>
      </div>
      {!touch && <p className="g3d-help">{t("modeHint")}</p>}
    </div>
  );
}

const HERO_DESC: Record<Character, Key> = {
  abu: "descAbu",
  siti: "descSiti",
  ahmeng: "descAhmeng",
  meiling: "descMeiling",
  muthu: "descMuthu",
  kavitha: "descKavitha",
  hamid: "descHamid",
  kiah: "descKiah",
};

/** Heroes whose head is wrapped (tudung), drawn with a full frame instead of a hair band. */
const COVERED: Character[] = ["siti", "kiah"];

export function CharacterSelect({
  touch,
  players,
  slot,
  taken,
  onPick,
  onBack,
}: {
  touch: boolean;
  players: 1 | 2;
  slot: 0 | 1;
  taken: Character | null;
  onPick(c: Character): void;
  onBack(): void;
}) {
  const t = useT();
  const title = players === 1 ? t("chooseCharacter") : t(slot === 0 ? "pickPlayer1" : "pickPlayer2");
  return (
    <div className="g3d-screen g3d-scroll">
      <Back onBack={onBack} />
      <h2 className="g3d-h2">{title}</h2>
      <div className="g3d-cards g3d-heroes">
        {CHARACTERS.map((c, i) => {
          const look = HEROES[c].look;
          const isTaken = taken === c;
          return (
            <button
              type="button"
              key={c}
              className={`g3d-card g3d-char${isTaken ? " taken" : ""}`}
              disabled={isTaken}
              onClick={() => onPick(c)}
              style={{ ["--accent-hero" as string]: hex(HEROES[c].accent) }}
            >
              <span className="g3d-card-num">{i + 1}</span>
              <span
                className={`g3d-figure${COVERED.includes(c) ? " covered" : ""}`}
                aria-hidden="true"
                style={{ ["--skin" as string]: hex(look.skin), ["--top" as string]: hex(look.top), ["--bottom" as string]: hex(look.bottom), ["--hair" as string]: hex(look.hair) }}
              >
                <i className="head" />
                <i className="body" />
              </span>
              <span className="g3d-card-name">{characterName(c)}</span>
              <span className="g3d-card-blurb">{isTaken ? t("heroTaken") : t(HERO_DESC[c])}</span>
            </button>
          );
        })}
      </div>
      <p className="g3d-help">
        {t("sameStats")}
        {!touch && (
          <>
            <br />
            {t("characterHint")}
          </>
        )}
      </p>
    </div>
  );
}

export function MapSelect({
  touch,
  onPick,
  onBack,
  onPreview,
}: {
  touch: boolean;
  onPick(key: string): void;
  onBack(): void;
  onPreview(key: string): void;
}) {
  const t = useT();
  return (
    <div className="g3d-screen g3d-maps">
      <Back onBack={onBack} />
      <h2 className="g3d-h2">{t("chooseMap")}</h2>
      <div className="g3d-cards">
        {MAPS.map((m, i) => (
          <button
            type="button"
            key={m.key}
            className="g3d-card"
            onClick={() => onPick(m.key)}
            onPointerEnter={() => onPreview(m.key)}
            onFocus={() => onPreview(m.key)}
          >
            <span className="g3d-card-num">{i + 1}</span>
            <span className="g3d-card-name">{m.name}</span>
            <span className="g3d-card-blurb">{t(MAP_BLURBS[m.key] ?? "mapKampungBlurb")}</span>
          </button>
        ))}
      </div>
      {!touch && <p className="g3d-help">{t("mapHint")}</p>}
    </div>
  );
}

export function SettingsScreen({ onBack, inGame = false }: { onBack(): void; inGame?: boolean }) {
  const t = useT();
  const s = useSettings();
  return (
    <div className="g3d-screen">
      <Back onBack={onBack} />
      <h2 className="g3d-h2">{t("settings")}</h2>
      <div className="g3d-panel g3d-settings">
        <div className="g3d-row">
          <span>{t("language")}</span>
          <LangSwitch />
        </div>
        <div className="g3d-row">
          <label htmlFor="set-volume">{t("volume")}</label>
          <input
            id="set-volume"
            type="range"
            min={0}
            max={100}
            value={Math.round(s.volume * 100)}
            onChange={(e) => updateSettings({ volume: Number(e.target.value) / 100 })}
          />
          <output>{Math.round(s.volume * 100)}%</output>
        </div>
        <div className="g3d-row">
          <span>{t("sound")}</span>
          <button type="button" className={`g3d-chip${s.muted ? "" : " on"}`} onClick={() => updateSettings({ muted: !s.muted })} aria-pressed={!s.muted}>
            {s.muted ? t("soundOff") : t("soundOn")}
          </button>
        </div>
        <div className="g3d-row">
          <label htmlFor="set-quality">{t("quality")}</label>
          <select id="set-quality" value={s.quality} onChange={(e) => updateSettings({ quality: e.target.value as Quality })}>
            <option value="high">{t("qualityHigh")}</option>
            <option value="low">{t("qualityLow")}</option>
          </select>
        </div>
        <p className="g3d-note">{t("qualityNote")}</p>
        {inGame && <p className="g3d-note">{t("qualityInGame")}</p>}
        <div className="g3d-row end">
          <button type="button" className="g3d-chip" onClick={resetSettings}>
            {t("resetDefaults")}
          </button>
          <button type="button" className="g3d-btn primary slim" onClick={onBack}>
            {t("done")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HowToPlay({ touch, onBack, onUpgrades }: { touch: boolean; onBack(): void; onUpgrades(): void }) {
  const t = useT();
  return (
    <div className="g3d-screen g3d-scroll">
      <Back onBack={onBack} />
      <h2 className="g3d-h2">{t("howToPlay")}</h2>
      <div className="g3d-panel g3d-doc">
        <h3>{t("helpGoal")}</h3>
        <p>{t("helpGoalText")}</p>

        <h3>{t("helpControls")}</h3>
        {touch ? (
          <p>{t("helpTouch")}</p>
        ) : (
          <table className="g3d-keys">
            <thead>
              <tr>
                <th />
                <th>{t("helpP1")}</th>
                <th>{t("helpP2")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("helpMove")}</td>
                <td>WASD / ↑←↓→</td>
                <td>↑←↓→</td>
              </tr>
              <tr>
                <td>{t("helpFire")}</td>
                <td>F / Space / J / Enter</td>
                <td>Enter</td>
              </tr>
              <tr>
                <td>{t("helpSwap")}</td>
                <td>G / Q / K / Shift ›</td>
                <td>Shift ›</td>
              </tr>
              <tr>
                <td>{t("helpPauseMute")}</td>
                <td colSpan={2}>P / Esc · M</td>
              </tr>
            </tbody>
          </table>
        )}
        {!touch && <p className="g3d-note">{t("help2pNote")}</p>}

        <h3>{t("helpEnemies")}</h3>
        <ul>
          <li>{t("helpPocong")}</li>
          <li>{t("helpToyol")}</li>
          <li>{t("helpPontianak")}</li>
        </ul>

        <h3>{t("helpWeapons")}</h3>
        <ol className="g3d-weapons">
          {WEAPON_IDS.map((id) => (
            <li key={id}>
              <span>{weaponName(id)}</span>
              <span>{WEAPONS[id].unlockLevel <= 1 ? t("startFrom") : t("levelShort", { n: WEAPONS[id].unlockLevel })}</span>
            </li>
          ))}
        </ol>

        <h3>{t("helpLevels")}</h3>
        <p>{t("helpLevelsText")}</p>
        {!touch && <p>{t("helpPickKeys")}</p>}
        <button type="button" className="g3d-chip" onClick={onUpgrades}>
          {t("viewUpgrades")}
        </button>

        <h3>{t("helpTips")}</h3>
        <ul>
          <li>{t("helpTip1")}</li>
          <li>{t("helpTip2")}</li>
          <li>{t("helpTip3")}</li>
          <li>{t("helpTip4")}</li>
        </ul>
      </div>
    </div>
  );
}

/** Every level that gives something, like Boxhead's upgrade list. Rows you have reached are bright. */
export function UpgradeList({ currentLevel, onBack }: { currentLevel?: number; onBack(): void }) {
  const t = useT();
  return (
    <div className="g3d-screen g3d-scroll">
      <Back onBack={onBack} />
      <h2 className="g3d-h2">{t("upgradeList")}</h2>
      <p className="g3d-note">
        {t("upgradeListHint")}
        {currentLevel !== undefined && <strong> {t("levelShort", { n: currentLevel })}</strong>}
      </p>
      <ol className="g3d-upgrades" aria-label={t("upgradeList")}>
        {UPGRADE_LIST.map((e) => {
          const isWeapon = e.reward.kind === "weapon";
          const key = (WEAPON_IDS.indexOf(e.reward.weapon) + 1) % 10;
          const text = e.reward.kind === "weapon" ? t("toastNewWeapon", { w: weaponName(e.reward.weapon), k: key }) : `${weaponName(e.reward.weapon)}+: ${upgradeName(e.reward.upgrade)}`;
          const reached = currentLevel !== undefined && e.level <= currentLevel;
          return (
            <li key={e.level} className={`${isWeapon ? "weapon" : ""}${reached ? " reached" : ""}`}>
              <span className="lv">{e.level}</span>
              <span className="tx">{text}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Credits({ onBack }: { onBack(): void }) {
  const t = useT();
  return (
    <div className="g3d-screen">
      <Back onBack={onBack} />
      <h2 className="g3d-h2">{t("credits")}</h2>
      <div className="g3d-panel g3d-doc center">
        <p>
          {t("creditsMadeBy")} <strong>adsyahir</strong>
        </p>
        <p>
          {t("creditsBuiltWith")}
          <br />
          Three.js · Next.js · TypeScript · Cloudflare
        </p>
        <p>{t("creditsThanks")}</p>
      </div>
    </div>
  );
}

export function GameOver({ run, onAgain, onMenu, onBoard }: { run: RunSummary; onAgain(): void; onMenu(): void; onBoard(): void }) {
  const online = run.mode === "online";
  const t = useT();
  const secs = Math.round(run.durationMs / 1000);
  return (
    <div className="g3d-screen g3d-over">
      <h2 className="g3d-dead">{t("gameOver")}</h2>
      <dl className="g3d-stats">
        <dt>{t("statScore")}</dt>
        <dd>{run.score}</dd>
        <dt>{t("statWave")}</dt>
        <dd>{run.wave}</dd>
        {run.level !== undefined && (
          <>
            <dt>{t("statLevel")}</dt>
            <dd>{run.level}</dd>
          </>
        )}
        <dt>{t("statKills")}</dt>
        <dd>{run.kills}</dd>
        <dt>{t("statTime")}</dt>
        <dd>
          {Math.floor(secs / 60)}m {secs % 60}s
        </dd>
      </dl>
      <div className="g3d-buttons">
        <button type="button" className="g3d-btn primary" onClick={onAgain}>
          {online ? t("backToRoom") : t("playAgain")}
        </button>
        <button type="button" className="g3d-btn" onClick={onMenu}>
          {t("menu")}
        </button>
        {!online && (
          <button type="button" className="g3d-btn" onClick={onBoard}>
            {t("leaderboard")}
          </button>
        )}
      </div>
    </div>
  );
}
