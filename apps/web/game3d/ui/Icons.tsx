/** Small inline icons drawn in the text colour. They replace emoji, which look different on every device. */
const base = { viewBox: "0 0 24 24", width: 20, height: 20, "aria-hidden": true, focusable: false } as const;

export function PauseIcon() {
  return (
    <svg {...base} fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function SoundOnIcon() {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

export function SoundOffIcon() {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M17 9l5 6M22 9l-5 6" />
    </svg>
  );
}
