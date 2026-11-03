"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ROOM_CODE_RE, type ErrorCode, type MapId, type RoomListing, type Slot } from "@kampung/protocol";
import { audio } from "../game/audio/audio";
import { CHARACTERS, DEFAULT_CHARACTERS, type Character } from "../game/characters";
import { NICK_KEY, type RunSummary } from "../game/constants";
import type { HudState } from "../game/hud-state";
import { isTouchDevice } from "../game/input/touch-state";
import { MAPS } from "../game/maps";
import type { Engine, SceneName } from "./engine/engine";
import type { Key } from "../i18n";
import { useSettings, useT } from "../settings/react";
import { createRoom, listRooms } from "./net/api";
import { OnlineClient, type LinkStatus, type LobbyView } from "./net/client";
import Dialog from "./ui/Dialog";
import Hud from "./ui/Hud";
import { SoundOffIcon, SoundOnIcon } from "./ui/Icons";
import { Lobby, OnlineMenu, nameIsValid } from "./ui/OnlineScreens";
import { CharacterSelect, Credits, GameOver, HowToPlay, MapSelect, Menu, ModeSelect, SettingsScreen, UpgradeList } from "./ui/Screens";
import TouchControls from "./ui/TouchControls";
import PerfOverlay from "./ui/PerfOverlay";
import type { PerfStats } from "./engine/perf";

const TOAST_MS = 1600;

/** Screens that play the menu soundscape; the game itself and the game-over screen are quiet until something is near. */
const AMBIENT_SCREENS: Screen[] = ["Menu", "Mode", "Character", "MapSelect", "Online", "Lobby", "Settings", "Help", "Upgrades", "Credits"];

/** UI screens. Only MapSelect, Game and GameOver have their own engine scene; the rest sit over the menu backdrop. */
type Screen = "Menu" | "Mode" | "Character" | "MapSelect" | "Online" | "Lobby" | "Settings" | "Help" | "Upgrades" | "Credits" | "Game" | "GameOver";

const ERROR_KEY: Record<ErrorCode, Key> = {
  bad_message: "errGeneric",
  no_room: "errNoRoom",
  room_full: "errFull",
  bad_name: "errBadName",
  not_host: "errNotHost",
  not_ready: "errNotReady",
  in_progress: "errInProgress",
  rate_limited: "errRate",
  busy: "errBusy",
};

/** After these the server has closed the connection and the seat is gone. */
const FINAL_ERRORS: ErrorCode[] = ["no_room", "room_full", "bad_name", "in_progress"];

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
  /** A room start that arrived before the 3D engine finished loading; replayed once it exists. */
  const pendingOnline = useRef<{ map: MapId; heroes: Character[]; you: Slot } | null>(null);
  const t = useT();
  const { muted, quality } = useSettings();
  /** Graphics quality is applied by rebuilding the engine, so it waits until you are out of a run. */
  const [engineQuality, setEngineQuality] = useState(quality);
  /** Help and Settings can be opened over a paused run without ending it. */
  const [overlay, setOverlay] = useState<"Help" | "Settings" | "Upgrades" | null>(null);
  const overlayRef = useRef<"Help" | "Settings" | "Upgrades" | null>(null);
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
  const [perf, setPerf] = useState<PerfStats | null>(null);
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

  // ---- online ----
  const netRef = useRef<OnlineClient | null>(null);
  const [lobby, setLobby] = useState<{ view: LobbyView; you: Slot } | null>(null);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("idle");
  const [netError, setNetError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  const [nick, setNick] = useState("");
  const [rooms, setRooms] = useState<RoomListing[] | null | undefined>(undefined);
  const [prefill, setPrefill] = useState("");
  /** The run in progress belongs to a room. A shared game cannot be paused, so its menu just overlays it. */
  const [isOnline, setIsOnline] = useState(false);
  const isOnlineRef = useRef(false);
  isOnlineRef.current = isOnline;
  /** Online run: undefined until the room server says whether the team score was stored. */
  const [savedRank, setSavedRank] = useState<number | null | undefined>(undefined);
  const [onlineMenu, setOnlineMenu] = useState(false);
  const onlineMenuRef = useRef(false);
  onlineMenuRef.current = onlineMenu;

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
    setOnlineMenu(false);
    setIsOnline(false);
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
    if (isOnlineRef.current) setOnlineMenu(true);
    else if (hudRef.current && !hudRef.current.paused) engine.current?.togglePause();
    setConfirmExit(true);
  }, []);

  const dropNet = useCallback(() => {
    netRef.current?.close();
    netRef.current = null;
    setLobby(null);
    setLinkStatus("idle");
    setIsOnline(false);
    setOnlineMenu(false);
  }, []);

  /** Leave the room for good (gives up the seat) and go to the menu. */
  const leaveRoomToMenu = useCallback(() => {
    netRef.current?.leave();
    dropNet();
    toMenu();
  }, [dropNet, toMenu]);

  const startOnlineGame = useCallback(
    (s: { map: MapId; heroes: Character[]; you: Slot }) => {
      const link = netRef.current;
      if (!link) return;
      toastQueue.current = [];
      setToast(null);
      setConfirmExit(false);
      setOverlay(null);
      setOnlineMenu(false);
      setEnding(false);
      setRun(null);
      setHud(null);
      setCharacters(s.heroes);
      setSavedRank(undefined);
      setIsOnline(true);
      go("Game");
      const e = engine.current;
      if (!e) {
        pendingOnline.current = s;
        return;
      }
      void e.startOnline(s.map, s.heroes, s.you, link).then(() => {
        if (screenRef.current === "Game") e.setSceneName("Game");
      });
    },
    [go],
  );

  const connect = useCallback(
    (code: string, name: string) => {
      netRef.current?.close();
      setNetError(null);
      setBusy(true);
      const client = new OnlineClient({
        onStatus: setLinkStatus,
        onLobby: (view, you) => {
          setLobby({ view, you });
          setBusy(false);
          const s = screenRef.current;
          if (s === "Online" || (s === "GameOver" && view.state === "lobby")) go("Lobby");
        },
        onStart: (st) => {
          if (screenRef.current !== "Game") startOnlineGame(st);
        },
        onOver: (r) => engine.current?.endOnlineRun(r),
        onSaved: (rank) => setSavedRank(rank),
        onError: (code2, _msg) => {
          setNetError(ERROR_KEY[code2]);
          setBusy(false);
          if (FINAL_ERRORS.includes(code2)) {
            dropNet();
            if (screenRef.current === "Lobby" || screenRef.current === "Online") go("Online");
          }
        },
      });
      netRef.current = client;
      client.connect(code, name);
    },
    [dropNet, go, startOnlineGame],
  );

  const saveNick = useCallback((n: string) => {
    setNick(n);
    try {
      localStorage.setItem(NICK_KEY, n);
    } catch {
      /* not remembered */
    }
  }, []);

  const createAndJoin = useCallback(
    async (isPublic: boolean) => {
      if (!nameIsValid(nick)) return;
      setBusy(true);
      setNetError(null);
      const r = await createRoom(isPublic);
      if (!r.ok) {
        setBusy(false);
        setNetError(r.error === "rate_limited" ? "errRate" : r.error === "busy" ? "errBusy" : "errOffline");
        return;
      }
      connect(r.code, nick.trim());
    },
    [connect, nick],
  );

  const joinRoom = useCallback(
    (code: string) => {
      if (!nameIsValid(nick) || !ROOM_CODE_RE.test(code)) return;
      connect(code, nick.trim());
    },
    [connect, nick],
  );

  const refreshRooms = useCallback(async () => {
    setRooms(await listRooms());
  }, []);

  // remembered nickname, and ?room=ABCD links
  useEffect(() => {
    try {
      setNick(localStorage.getItem(NICK_KEY) ?? "");
    } catch {
      /* none */
    }
    const code = (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase();
    if (ROOM_CODE_RE.test(code)) {
      setPrefill(code);
      go("Online");
    }
    return () => {
      netRef.current?.close();
      netRef.current = null;
    };
  }, [go]);

  // keep the public room list fresh while the Online screen is open
  useEffect(() => {
    if (screen !== "Online") return;
    setRooms(undefined);
    void refreshRooms();
    const id = setInterval(() => void refreshRooms(), 4000);
    return () => clearInterval(id);
  }, [screen, refreshRooms]);

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
        onPerf: (s) => setPerf(s),
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
      const po = pendingOnline.current;
      pendingOnline.current = null;
      if (po && netRef.current) {
        const link = netRef.current;
        void instance.startOnline(po.map, po.heroes, po.you, link).then(() => {
          if (screenRef.current === "Game") instance?.setSceneName("Game");
        });
      } else if (p) {
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

  // the menu soundscape plays on menu screens (once the browser lets sound start) and stops for a run
  useEffect(() => {
    audio.setAmbience(AMBIENT_SCREENS.includes(screen));
  }, [screen]);
  useEffect(() => () => audio.setAmbience(false), []);

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

  /** Leave the lobby (gives up the seat) and return to the join screen. */
  const leaveToOnlineMenu = useCallback(() => {
    netRef.current?.leave();
    dropNet();
    go("Online");
  }, [dropNet, go]);

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
        const back: Partial<Record<Screen, Screen>> = { Mode: "Menu", MapSelect: "Character", Online: "Mode", Settings: "Menu", Help: "Menu", Upgrades: "Help", Credits: "Menu" };
        const to = back[s];
        if (s === "Character") backFromCharacter();
        else if (s === "Lobby") leaveToOnlineMenu();
        else if (to) go(to);
        else if (s === "Game") {
          if (confirmRef.current) setConfirmExit(false); // Esc on the warning keeps you in the game
          else if (isOnlineRef.current) setOnlineMenu((v) => !v);
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
        else if (d === 2) go("Online");
      } else if (s === "Character") {
        const hero = CHARACTERS[d - 1];
        if (hero) pickCharacter(hero);
      } else if (s === "MapSelect") {
        if (d >= 1 && MAPS[d - 1]) startGame(MAPS[d - 1]!.key, playersRef.current, charactersRef.current);
      } else if (s === "Game") {
        if (ev.code === "KeyP" && !confirmRef.current) {
          if (isOnlineRef.current) setOnlineMenu((v) => !v);
          else engine.current?.togglePause();
        }
      }
    };
    const unlock = () => audio.unlock();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlock);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlock);
    };
  }, [backFromCharacter, go, leaveToOnlineMenu, pickCharacter, pickMode, startGame, toggleMute]);

  return (
    <div className="game-root g3d-root">
      <div ref={host} className="game-host g3d-host" />
      <div ref={floatLayer} className="g3d-floats" />
      {screen === "Game" && touch && !ending && <TouchControls />}
      {screen === "Game" && perf && <PerfOverlay stats={perf} />}
      {screen === "Game" && hud && (
        <Hud
          hud={isOnline ? { ...hud, paused: onlineMenu } : hud}
          online={isOnline}
          touch={touch}
          toast={toast}
          muted={muted}
          onMute={toggleMute}
          onPause={() => (isOnline ? setOnlineMenu((v) => !v) : engine.current?.togglePause())}
          onExit={requestExit}
          onHelp={() => setOverlay("Help")}
          onSettings={() => setOverlay("Settings")}
          onUpgrades={() => setOverlay("Upgrades")}
          confirmExit={confirmExit}
          onCancelExit={() => setConfirmExit(false)}
          onConfirmExit={isOnline ? leaveRoomToMenu : toMenu}
        />
      )}
      {screen === "Menu" && (
        <Menu touch={touch} onStart={() => go("Mode")} onHelp={() => go("Help")} onSettings={() => go("Settings")} onBoard={toBoard} onCredits={() => go("Credits")} />
      )}
      {screen === "Mode" && <ModeSelect touch={touch} onPick={pickMode} onOnline={() => go("Online")} onBack={() => go("Menu")} />}
      {screen === "Online" && (
        <OnlineMenu
          name={nick}
          onName={saveNick}
          busy={busy}
          error={netError}
          rooms={rooms}
          prefillCode={prefill}
          onCreate={(pub) => void createAndJoin(pub)}
          onJoin={joinRoom}
          onRefresh={() => void refreshRooms()}
          onBack={() => go("Mode")}
        />
      )}
      {screen === "Lobby" && lobby && (
        <Lobby
          view={lobby.view}
          you={lobby.you}
          error={netError}
          onHero={(h) => netRef.current?.send({ t: "hero", hero: h })}
          onReady={(r) => netRef.current?.send({ t: "ready", ready: r })}
          onMap={(m) => netRef.current?.send({ t: "map", map: m })}
          onStart={() => netRef.current?.send({ t: "start" })}
          onLeave={leaveToOnlineMenu}
        />
      )}
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
        <Dialog className="g3d-ingame" label={overlay === "Help" ? t("howToPlay") : overlay === "Settings" ? t("settings") : t("upgradeList")}>
          {overlay === "Help" && <HowToPlay touch={touch} onBack={() => setOverlay(null)} onUpgrades={() => setOverlay("Upgrades")} />}
          {overlay === "Settings" && <SettingsScreen inGame onBack={() => setOverlay(null)} />}
          {overlay === "Upgrades" && <UpgradeList currentLevel={hud?.level} onBack={() => setOverlay(null)} />}
        </Dialog>
      )}
      {screen === "Settings" && <SettingsScreen onBack={() => go("Menu")} />}
      {screen === "Help" && <HowToPlay touch={touch} onBack={() => go("Menu")} onUpgrades={() => go("Upgrades")} />}
      {screen === "Upgrades" && <UpgradeList onBack={() => go("Help")} />}
      {screen === "Credits" && <Credits onBack={() => go("Menu")} />}
      {screen === "GameOver" && run && (
        <GameOver
          run={run}
          savedRank={savedRank}
          onAgain={() => (run.mode === "online" ? netRef.current?.send({ t: "ready", ready: false }) : startGame(run.map, run.mode === "2p" ? 2 : 1, characters))}
          onMenu={run.mode === "online" ? leaveRoomToMenu : toMenu}
          onBoard={toBoard}
        />
      )}
      {screen !== "Game" && (
        <button type="button" className="g3d-icon g3d-mute-float" onClick={toggleMute} aria-label={muted ? t("unmute") : t("mute")}>
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </button>
      )}
      {(isOnline || screen === "Lobby") && (screen === "Game" || screen === "GameOver" || screen === "Lobby") && linkStatus !== "open" && linkStatus !== "idle" && (
        <div className={`g3d-conn${linkStatus === "closed" ? " dead" : ""}`} role="alert">
          <span>{linkStatus === "closed" ? t("disconnected") : linkStatus === "connecting" ? t("connecting") : t("reconnecting")}</span>
          {linkStatus === "closed" && (
            <button type="button" className="g3d-btn slim" onClick={leaveRoomToMenu}>
              {t("menu")}
            </button>
          )}
        </div>
      )}
      <div className={`g3d-fade${ending ? " on" : ""}`} />
      <div className="rotate-prompt" role="alert">
        <p>{t("rotate")}</p>
      </div>
    </div>
  );
}
