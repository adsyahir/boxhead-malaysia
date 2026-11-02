"use client";

import { useT } from "../../settings/react";
import { useEffect, useRef, useState } from "react";
import { STICK_RADIUS, applyAim, applyStick, resetTouchState, touchState } from "../../game/input/touch-state";

interface Btn {
  x: number;
  y: number;
  r: number;
}

/**
 * Twin-stick touch controls as DOM pointer events: a move stick (left half), a Fire stick (bottom-right: press to
 * shoot ahead, drag to aim and shoot that way) and a Tukar button.
 */
export default function TouchControls() {
  const t = useT();
  const layer = useRef<HTMLDivElement>(null);
  const ids = useRef({ stick: -1, fire: -1, swap: -1 });
  /** Stick origin lives in a ref so a move that arrives before React re-renders still has it. */
  const origin = useRef({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [stick, setStick] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);
  const [pressed, setPressed] = useState({ fire: false, swap: false });
  const [aimKnob, setAimKnob] = useState({ dx: 0, dy: 0 });

  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    resetTouchState();
    return () => {
      ro.disconnect();
      resetTouchState();
    };
  }, []);

  const fireBtn: Btn = { x: size.w - 90, y: size.h - 100, r: 56 };
  const swapBtn: Btn = { x: size.w - 200, y: size.h - 60, r: 40 };
  const inside = (x: number, y: number, b: Btn, slack = 12) => Math.hypot(x - b.x, y - b.y) <= b.r + slack;

  const local = (e: React.PointerEvent) => {
    const r = layer.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = local(e);
    const s = ids.current;
    if (inside(x, y, fireBtn, 24) && s.fire < 0) {
      s.fire = e.pointerId;
      touchState.fire = true;
      setAimKnob(applyAim(x - fireBtn.x, y - fireBtn.y));
      setPressed((p) => ({ ...p, fire: true }));
    } else if (inside(x, y, swapBtn) && s.swap < 0) {
      s.swap = e.pointerId;
      touchState.swapHeld = true;
      touchState.swapTapped = true;
      setPressed((p) => ({ ...p, swap: true }));
    } else if (x < size.w * 0.5 && s.stick < 0) {
      s.stick = e.pointerId;
      origin.current = { x, y };
      setStick({ ox: x, oy: y, kx: x, ky: y });
    } else return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone; moves still arrive while it stays over the layer */
    }
    e.preventDefault();
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === ids.current.fire) {
      const { x, y } = local(e);
      setAimKnob(applyAim(x - fireBtn.x, y - fireBtn.y));
      return;
    }
    if (e.pointerId !== ids.current.stick) return;
    const { x, y } = local(e);
    const o = origin.current;
    const d = applyStick(x - o.x, y - o.y);
    setStick({ ox: o.x, oy: o.y, kx: o.x + d.dx, ky: o.y + d.dy });
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = ids.current;
    if (e.pointerId === s.stick) {
      s.stick = -1;
      touchState.moveX = 0;
      touchState.moveY = 0;
      setStick(null);
    }
    if (e.pointerId === s.fire) {
      s.fire = -1;
      touchState.fire = false;
      touchState.aimX = 0;
      touchState.aimY = 0;
      setAimKnob({ dx: 0, dy: 0 });
      setPressed((p) => ({ ...p, fire: false }));
    }
    if (e.pointerId === s.swap) {
      s.swap = -1;
      touchState.swapHeld = false;
      setPressed((p) => ({ ...p, swap: false }));
    }
  };

  const base = stick ? { x: stick.ox, y: stick.oy } : { x: 110, y: size.h - 110 };
  const knob = stick ? { x: stick.kx, y: stick.ky } : base;

  return (
    <div
      ref={layer}
      className="g3d-touch"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {size.w > 0 && (
        <>
          <div className="g3d-stick" style={{ left: base.x, top: base.y, width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }} />
          <div className="g3d-knob" style={{ left: knob.x, top: knob.y }} />
          <div className={`g3d-tbtn fire${pressed.fire ? " on" : ""}`} style={{ left: fireBtn.x, top: fireBtn.y, width: fireBtn.r * 2, height: fireBtn.r * 2 }}>
            {t("fire")}
          </div>
          {pressed.fire && <div className="g3d-knob aim" style={{ left: fireBtn.x + aimKnob.dx, top: fireBtn.y + aimKnob.dy }} />}
          <div className={`g3d-tbtn swap${pressed.swap ? " on" : ""}`} style={{ left: swapBtn.x, top: swapBtn.y, width: swapBtn.r * 2, height: swapBtn.r * 2 }}>
            {t("swap")}
          </div>
        </>
      )}
    </div>
  );
}
