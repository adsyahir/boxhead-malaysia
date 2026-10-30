"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audio } from "../game/audio/audio";
import type { RunSummary } from "../game/constants";
import type { HudState } from "../game/hud-state";
import { isTouchDevice } from "../game/input/touch-state";
import { MAPS } from "../game/maps";
import type { Engine, SceneName } from "./engine/engine";
import Hud from "./ui/Hud";
import { GameOver, MapSelect, Menu } from "./ui/Screens";
import TouchControls from "./ui/TouchControls";

const TOAST_MS = 1600;

/**
 * Client-only 3D game. Three.js is imported inside the effect so it never runs during SSR, and the
 * cancelled flag handles React StrictMode's mount -> unmount -> mount.
 * React owns menus and HUD (DOM overlays); the Engine owns the canvas and the simulation loop.
 */
export default function Game3D() {
  const host = useRef<HTMLDivElement>(null);
  const floatLayer = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const pendingStart = useRef<{ key: string; players: 1 | 2 } | null>(null);
  const [screen, setScreen] = useState<SceneName>("Menu");
  const screenRef = useRef<SceneName>("Menu");
  const [players, setPlayers] = useState<1 | 2>(1);
  const playersRef = useRef<1 | 2>(1);
  playersRef.current = players;
  const [hud, setHud] = useState<HudState | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastQueue = useRef<string[]>([]);
  const toastBusy = useRef(false);
  const toastId = useRef(0);
  const [ending, setEnding] = useState(false);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [muted, setMuted] = useState(false);
  const [touch, setTouch] = useState(false);

  const go = useCallback((s: SceneName) => {
    screenRef.current = s;
    setScreen(s);
    if (s !== "Game") engine.current?.setSceneName(s);
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
    (key: string, n: 1 | 2) => {
      toastQueue.current = [];
      setToast(null);
      setEnding(false);
      setRun(null);
      setHud(null);
      go("Game");
      const e = engine.current;
      if (!e) {
        pendingStart.current = { key, players: n };
        return;
      }
      void e.startGame(key, n).then(() => {
        if (screenRef.current === "Game") e.setSceneName("Game");
      });
    },
    [go],
  );

  const toMenu = useCallback(() => {
    setHud(null);
    setRun(null);
    setEnding(false);
    go("Menu");
    void engine.current?.showBackdrop(engine.current.currentMap ?? MAPS[0]!.key);
  }, [go]);

  const toBoard = useCallback(() => {
    window.location.href = "/leaderboard";
  }, []);

  const toggleMute = useCallback(() => {
    audio.unlock();
    setMuted(audio.toggleMute());
  }, []);

  // engine lifecycle
  useEffect(() => {
    setMuted(audio.muted);
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
      instance.setSceneName(screenRef.current === "Game" ? "MapSelect" : screenRef.current);
      const p = pendingStart.current;
      pendingStart.current = null;
      if (p) {
        void instance.startGame(p.key, p.players).then(() => {
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
  }, [go, pushToast]);

  // keyboard shortcuts for the menus and pause/mute
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      audio.unlock();
      if (ev.repeat) return;
      const s = screenRef.current;
      if (ev.code === "KeyM") {
        toggleMute();
        return;
      }
      if (s === "Menu") {
        if (ev.code === "Digit1" || ev.code === "Numpad1") {
          setPlayers(1);
          go("MapSelect");
        } else if ((ev.code === "Digit2" || ev.code === "Numpad2") && !isTouchDevice()) {
          setPlayers(2);
          go("MapSelect");
        }
      } else if (s === "MapSelect") {
        const idx = ["Digit1", "Digit2", "Digit3"].indexOf(ev.code);
        const nidx = ["Numpad1", "Numpad2", "Numpad3"].indexOf(ev.code);
        const i = idx >= 0 ? idx : nidx;
        if (i >= 0 && MAPS[i]) startGame(MAPS[i]!.key, playersRef.current);
        else if (ev.code === "Escape") go("Menu");
      } else if (s === "Game") {
        if (ev.code === "KeyP" || ev.code === "Escape") engine.current?.togglePause();
      }
    };
    const unlock = () => audio.unlock();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlock);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlock);
    };
  }, [go, startGame, toggleMute]);

  const pickPlayers = (n: 1 | 2) => {
    setPlayers(n);
    go("MapSelect");
  };

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
        />
      )}
      {screen === "Menu" && <Menu touch={touch} onPlayers={pickPlayers} onBoard={toBoard} />}
      {screen === "MapSelect" && (
        <MapSelect
          touch={touch}
          onPick={(k) => startGame(k, players)}
          onBack={() => go("Menu")}
          onPreview={(k) => void engine.current?.showBackdrop(k)}
        />
      )}
      {screen === "GameOver" && run && (
        <GameOver run={run} onAgain={() => startGame(run.map, run.mode === "2p" ? 2 : 1)} onMenu={toMenu} onBoard={toBoard} />
      )}
      {screen !== "Game" && (
        <button type="button" className="g3d-icon g3d-mute-float" onClick={toggleMute} aria-label={muted ? "Bunyi" : "Senyap"}>
          {muted ? "🔇" : "🔊"}
        </button>
      )}
      <div className={`g3d-fade${ending ? " on" : ""}`} />
      <div className="rotate-prompt" role="alert">
        <p>Putar telefon ke mod landskap untuk bermain.</p>
      </div>
    </div>
  );
}
