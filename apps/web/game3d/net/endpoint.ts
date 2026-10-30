/**
 * Where the online API lives. In production the website and the API are one Cloudflare Worker, so it is the
 * same origin. In local development the pages come from Next (any port) and the Worker runs on :8787.
 */
const DEV_WORKER_PORT = "8787";

function isLocal(): boolean {
  return typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
}

export function httpBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE;
  if (configured) return configured.replace(/\/$/, "");
  if (isLocal() && window.location.port !== DEV_WORKER_PORT) return `http://${window.location.hostname}:${DEV_WORKER_PORT}`;
  return "";
}

export function wsUrl(code: string): string {
  const base = httpBase();
  const origin = base || window.location.origin;
  return `${origin.replace(/^http/, "ws")}/ws?room=${encodeURIComponent(code)}`;
}
