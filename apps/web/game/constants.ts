export const VIEW_WORLD_WIDTH = 800;
export const VIEW_WORLD_HEIGHT = 450;
export const MIN_ZOOM_FACTOR = 0.7;
export const DARKNESS_ALPHA = 0.84;
export const NICK_KEY = "kpp-nickname";

export interface RunSummary {
  score: number;
  wave: number;
  kills: number;
  /** Team level reached (online runs and the 3D client; the 2D client leaves it out). */
  level?: number;
  durationMs: number;
  map: string;
  mode: "1p" | "2p" | "online";
}
