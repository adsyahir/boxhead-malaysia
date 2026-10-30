"use client";

import { useEffect, useRef } from "react";
import type Phaser from "phaser";

/** Client-only wrapper. Phaser is imported inside the effect so it never runs during SSR. */
export default function PhaserGame() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: Phaser.Game | null = null;
    let cancelled = false;
    const el = host.current;
    if (!el) return;

    void import("./create-game").then(({ createGame }) => {
      if (cancelled) return; // StrictMode mounts, unmounts, mounts again
      game = createGame(el);
    });

    return () => {
      cancelled = true;
      game?.destroy(true);
      game = null;
    };
  }, []);

  return (
    <div className="game-root">
      <div ref={host} className="game-host" />
      <div className="rotate-prompt" role="alert">
        <p>Putar telefon ke mod landskap untuk bermain.</p>
      </div>
    </div>
  );
}
