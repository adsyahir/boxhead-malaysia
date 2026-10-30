"use client";

import { useSyncExternalStore } from "react";
import { audio } from "./audio";

/** False until a click or key press has let the browser play sound. */
export function useAudioReady(): boolean {
  return useSyncExternalStore(
    (fn) => audio.subscribeReady(fn),
    () => audio.ready,
    () => true, // server render: show no hint
  );
}
