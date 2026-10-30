"use client";

import { MAPS } from "../../game/maps";
import type { RunSummary } from "../../game/constants";

export function Menu({ touch, onPlayers, onBoard }: { touch: boolean; onPlayers(n: 1 | 2): void; onBoard(): void }) {
  return (
    <div className="g3d-screen g3d-menu">
      <h1 className="g3d-title">
        ZOMBIE
        <br />
        KAMPUNG PISANG
      </h1>
      <p className="g3d-sub">Pocong, toyol dan pontianak mengamuk di kampung!</p>
      <div className="g3d-buttons">
        <button type="button" className="g3d-btn primary" onClick={() => onPlayers(1)}>
          1 Pemain
        </button>
        {!touch && (
          <button type="button" className="g3d-btn" onClick={() => onPlayers(2)}>
            2 Pemain (satu papan kekunci)
          </button>
        )}
        <button type="button" className="g3d-btn" onClick={onBoard}>
          Papan Markah
        </button>
      </div>
      <p className="g3d-help">
        {touch ? (
          "Kayu bedik kiri untuk bergerak. Tembak dan Tukar di kanan."
        ) : (
          <>
            1P: WASD/anak panah, F/Space tembak, G/Q tukar senjata.
            <br />
            2P: Abu WASD+F+G, Siti anak panah+Enter+Shift kanan. P jeda, M senyap.
          </>
        )}
      </p>
    </div>
  );
}

export function MapSelect({ touch, onPick, onBack, onPreview }: { touch: boolean; onPick(key: string): void; onBack(): void; onPreview(key: string): void }) {
  return (
    <div className="g3d-screen g3d-maps">
      <button type="button" className="g3d-back" onClick={onBack}>
        &lt; Kembali
      </button>
      <h2 className="g3d-h2">Pilih Peta</h2>
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
            <span className="g3d-card-blurb">{m.blurb}</span>
          </button>
        ))}
      </div>
      {!touch && <p className="g3d-help">Tekan 1-3 untuk pilih, Esc untuk kembali.</p>}
    </div>
  );
}

export function GameOver({ run, onAgain, onMenu, onBoard }: { run: RunSummary; onAgain(): void; onMenu(): void; onBoard(): void }) {
  const secs = Math.round(run.durationMs / 1000);
  return (
    <div className="g3d-screen g3d-over">
      <h2 className="g3d-dead">TAMAT</h2>
      <dl className="g3d-stats">
        <dt>Markah</dt>
        <dd>{run.score}</dd>
        <dt>Gelombang</dt>
        <dd>{run.wave}</dd>
        <dt>Musuh dibunuh</dt>
        <dd>{run.kills}</dd>
        <dt>Masa</dt>
        <dd>
          {Math.floor(secs / 60)}m {secs % 60}s
        </dd>
      </dl>
      <div className="g3d-buttons">
        <button type="button" className="g3d-btn primary" onClick={onAgain}>
          Main Lagi
        </button>
        <button type="button" className="g3d-btn" onClick={onMenu}>
          Menu
        </button>
        <button type="button" className="g3d-btn" onClick={onBoard}>
          Papan Markah
        </button>
      </div>
    </div>
  );
}
