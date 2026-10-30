"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audio } from "../game/audio/audio";
import { CHARACTERS, DEFAULT_CHARACTERS, type Character } from "../game/characters";
import type { RunSummary } from "../game/constants";
import type { HudState } from "../game/hud-state";
import { isTouchDevice } from "../game/input/touch-state";
import { MAPS } from "../game/maps";
import type { Engine, SceneName } from "./engine/engine";
import { useSettings, useT } from "../settings/react";
import Hud from "./ui/Hud";
import { CharacterSelect, Credits, GameOver, HowToPlay, MapSelect, Menu, ModeSelect, SettingsScreen } from "./ui/Screens";
import TouchControls from "./ui/TouchControls";

const TOAST_MS = 1600;

/** UI screens. Only MapSelect, Game and GameOver have their own engine scene; the rest sit over the menu backdrop. */
type Screen = "Menu" | "Mode" | "Character" | "MapSelect" | "Settings" | "Help" | "Credits" | "Game" | "GameOver";

function engineScene(s: Screen): SceneName {
  return s === "MapSelect" || s === "Game" || s === "GameOver" ? s : "Menu";
}

/**
 * Client-only 3D game. Three.js is imported inside the effect so it never runs during SSR, and the
 * cancelled flag handles React StrictMode's mount -> unmount -> mount.
 * React owns menus and HUD (DOM overlays); the Engine owns the canvas and the simulation loop.
 */
export default function Game3D() {
  const host = useRef<HTMLDivElement>(null);
  const floatLayer = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const pendingStart = useRef<{ key: string; players: 1 | 2; characters: Character[] } | null>(null);
  const t = useT();
  const { muted, quality } = useSettings();
  /** Graphics quality is applied by rebuilding the engine, so it waits until you are out of a run. */
  const [engineQuality, setEngineQuality] = useState(quality);
  /** Help and Settings can be opened over a paused run without ending it. */
  const [overlay, setOverlay] = useState<"Help" | "Settings" | null>(null);
  const overlayRef = useRef<"Help" | "Settings" | null>(null);
  overlayRef.current = overlay;
  const [screen, setScreen] = useState<Screen>("Menu");
  const screenRef = useRef<Screen>("Menu");
  const [players, setPlayers] = useState<1 | 2>(1);
  const playersRef = useRef<1 | 2>(1);
  playersRef.current = players;
  const [characters, setCharacters] = useState<Character[]>(DEFAULT_CHARACTERS);
  const charactersRef = useRef<Character[]>(DEFAULT_CHARACTERS);
  charactersRef.current = characters;
  /** In 2P the heroes are picked one after the other: slot 0 = player 1, slot 1 = player 2. */
  const [slot, setSlot] = useState<0 | 1>(0);
  const slotRef = useRef<0 | 1>(0);
  slotRef.current = slot;
  const [firstPick, setFirstPick] = useState<Character | null>(null);
  const firstRef = useRef<Character | null>(null);
  firstRef.current = firstPick;
  const [hud, setHud] = useState<HudState | null>(null);
  const hudRef = useRef<HudState | null>(null);
  hudRef.current = hud;
  const [confirmExit, setConfirmExit] = useState(false);
  const confirmRef = useRef(false);
  confirmRef.current = confirmExit;
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastQueue = useRef<string[]>([]);
  const toastBusy = useRef(false);
  const toastId = useRef(0);
  const [ending, setEnding] = useState(false);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [touch, setTouch] = useState(false);

  const go = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreen(s);
    if (s !== "Game") engine.current?.setSceneName(engineScene(s));
  }, []);

  const nextToast = useCallback(() => {
    const text = toastQueue.current.shift();
    if (text === undefined) {
      toastBusy.current = false;
      setToast(null);
      return;
    }
    toastBusy.current = true;
    setToast({ id: ++toastId.current, text });
    setTimeout(nextToast, TOAST_MS);
  }, []);

  const pushToast = useCallback(
    (text: string) => {
      toastQueue.current.push(text);
      if (!toastBusy.current) nextToast();
    },
    [nextToast],
  );

  const startGame = useCallback(
    (key: string, n: 1 | 2, chars: Character[]) => {
      toastQueue.current = [];
      setToast(null);
      setConfirmExit(false);
      setOverlay(null);
      setEnding(false);
      setRun(null);
      setHud(null);
      go("Game");
      const e = engine.current;
      if (!e) {
        pendingStart.current = { key, players: n, characters: chars };
        return;
      }
      void e.startGame(key, n, chars).then(() => {
        if (screenRef.current === "Game") e.setSceneName("Game");
      });
    },
    [go],
  );

  const toMenu = useCallback(() => {
    setConfirmExit(false);
    setOverlay(null);
    setHud(null);
    setRun(null);
    setEnding(false);
    go("Menu");
    void engine.current?.showBackdrop(engine.current.currentMap ?? MAPS[0]!.key);
  }, [go]);

  /** Pause the run and ask before throwing it away. */
  const requestExit = useCallback(() => {
    if (screenRef.current !== "Game") return;
    if (hudRef.current && !hudRef.current.paused) engine.current?.togglePause();
    setConfirmExit(true);
  }, []);

  const toBoard = useCallback(() => {
    window.location.href = "/leaderboard";
  }, []);

  const toggleMute = useCallback(() => {
    audio.unlock();
    audio.toggleMute();
  }, []);

  // engine lifecycle
  useEffect(() => {
    setTouch(isTouchDevice());
    let cancelled = false;
    let instance: Engine | null = null;
    const el = host.current;
    const layer = floatLayer.current;
    if (!el || !layer) return;

    void import("./engine/engine").then(({ Engine }) => {
      if (cancelled) return;
      instance = new Engine(el, layer, {
        onHud: (s) => setHud(s),
        onToast: pushToast,
        onEnding: () => setEnding(true),
        onGameOver: (r) => {
          setRun(r);
          setEnding(false);
          go("GameOver");
        },
      });
      engine.current = instance;
      instance.setSceneName(screenRef.current === "Game" ? "MapSelect" : engineScene(screenRef.current));
      const p = pendingStart.current;
      pendingStart.current = null;
      if (p) {
        void instance.startGame(p.key, p.players, p.characters).then(() => {
          if (screenRef.current === "Game") instance?.setSceneName("Game");
        });
      } else void instance.showBackdrop(MAPS[0]!.key);
    });

    return () => {
      cancelled = true;
      instance?.dispose();
      instance = null;
      engine.current = null;
    };
  }, [go, pushToast, engineQuality]);

  useEffect(() => {
    if (screen !== "Game" && quality !== engineQuality) setEngineQuality(quality);
  }, [screen, quality, engineQuality]);

  const pickMode = useCallback(
    (n: 1 | 2) => {
      setPlayers(n);
      setSlot(0);
      setFirstPick(null);
      go("Character");
    },
    [go],
  );

  const pickCharacter = useCallback(
    (c: Character) => {
      if (playersRef.current === 1) {
        setCharacters([c]);
        go("MapSelect");
      } else if (slotRef.current === 0) {
        setFirstPick(c);
        setSlot(1);
      } else if (firstRef.current && firstRef.current !== c) {
        setCharacters([firstRef.current, c]);
        go("MapSelect");
      }
    },
    [go],
  );

  /** Back from hero select: undo player 1's pick first, then leave the screen. */
  const backFromCharacter = useCallback(() => {
    if (slotRef.current === 1) {
      setSlot(0);
      setFirstPick(null);
    } else go("Mode");
  }, [go]);

  // keyboard shortcuts for the menus and pause/mute
  useEffect(() => {
    const digit = (code: string): number => {
      const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
      return m ? Number(m[1]) : -1;
    };
    const onKey = (ev: KeyboardEvent) => {
      audio.unlock();
      if (ev.repeat) return;
      const typing = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement || ev.target instanceof HTMLTextAreaElement;
      const s = screenRef.current;
      if (ev.code === "Escape") {
        if (overlayRef.current) {
          setOverlay(null);
          return;
        }
        const back: Partial<Record<Screen, Screen>> = { Mode: "Menu", MapSelect: "Character", Settings: "Menu", Help: "Menu", Credits: "Menu" };
        const to = back[s];
        if (s === "Character") backFromCharacter();
        else if (to) go(to);
        else if (s === "Game") {
          if (confirmRef.current) setConfirmExit(false); // Esc on the warning keeps you in the game, still paused
          else engine.current?.togglePause();
        }
        return;
      }
      if (typing || overlayRef.current) return;
      const d = digit(ev.code);
      if (ev.code === "KeyM") {
        toggleMute();
      } else if (s === "Menu") {
        if (d === 1) go("Mode");
        else if (d === 2) go("Help");
        else if (d === 3) go("Settings");
        else if (d === 4) window.location.href = "/leaderboard";
        else if (d === 5) go("Credits");
      } else if (s === "Mode") {
        if (d === 1) pickMode(1);
        else if (d === 2 && !isTouchDevice()) pickMode(2);
      } else if (s === "Character") {
        const hero = CHARACTERS[d - 1];
        if (hero) pickCharacter(hero);
      } else if (s === "MapSelect") {
        if (d >= 1 && MAPS[d - 1]) startGame(MAPS[d - 1]!.key, playersRef.current, charactersRef.current);
      } else if (s === "Game") {
        if (ev.code === "KeyP" && !confirmRef.current) engine.current?.togglePause();
      }
    };
    const unlock = () => audio.unlock();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlock);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlock);
    };
  }, [backFromCharacter, go, pickCharacter, pickMode, startGame, toggleMute]);

  return (
    <div className="game-root g3d-root">
      <div ref={host} className="game-host g3d-host" />
      <div ref={floatLayer} className="g3d-floats" />
      {screen === "Game" && touch && !ending && <TouchControls />}
      {screen === "Game" && hud && (
        <Hud
          hud={hud}
          touch={touch}
          toast={toast}
          muted={muted}
          onMute={toggleMute}
          onPause={() => engine.current?.togglePause()}
          onExit={requestExit}
          onHelp={() => setOverlay("Help")}
          onSettings={() => setOverlay("Settings")}
          confirmExit={confirmExit}
          onCancelExit={() => setConfirmExit(false)}
          onConfirmExit={toMenu}
        />
      )}
      {screen === "Menu" && (
        <Menu touch={touch} onStart={() => go("Mode")} onHelp={() => go("Help")} onSettings={() => go("Settings")} onBoard={toBoard} onCredits={() => go("Credits")} />
      )}
      {screen === "Mode" && <ModeSelect touch={touch} onPick={pickMode} onBack={() => go("Menu")} />}
      {screen === "Character" && (
        <CharacterSelect touch={touch} players={players} slot={slot} taken={slot === 1 ? firstPick : null} onPick={pickCharacter} onBack={backFromCharacter} />
      )}
      {screen === "MapSelect" && (
        <MapSelect
          touch={touch}
          onPick={(k) => startGame(k, players, characters)}
          onBack={() => go("Character")}
          onPreview={(k) => void engine.current?.showBackdrop(k)}
        />
      )}
      {screen === "Game" && overlay && (
        <div className="g3d-ingame">
          {overlay === "Help" ? <HowToPlay touch={touch} onBack={() => setOverlay(null)} /> : <SettingsScreen inGame onBack={() => setOverlay(null)} />}
        </div>
      )}
      {screen === "Settings" && <SettingsScreen onBack={() => go("Menu")} />}
      {screen === "Help" && <HowToPlay touch={touch} onBack={() => go("Menu")} />}
      {screen === "Credits" && <Credits onBack={() => go("Menu")} />}
      {screen === "GameOver" && run && (
        <GameOver run={run} onAgain={() => startGame(run.map, run.mode === "2p" ? 2 : 1, characters)} onMenu={toMenu} onBoard={toBoard} />
      )}
      {screen !== "Game" && (
        <button type="button" className="g3d-icon g3d-mute-float" onClick={toggleMute} aria-label={muted ? t("unmute") : t("mute")}>
          {muted ? "🔇" : "🔊"}
        </button>
      )}
      <div className={`g3d-fade${ending ? " on" : ""}`} />
      <div className="rotate-prompt" role="alert">
        <p>{t("rotate")}</p>
      </div>
    </div>
  );
}
