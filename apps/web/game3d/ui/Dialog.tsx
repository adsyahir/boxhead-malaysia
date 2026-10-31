"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * An overlay that behaves like a dialog for keyboards and screen readers: it announces itself, moves focus to its
 * first control when it opens, and gives focus back to what had it when it closes.
 */
export default function Dialog({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])')?.focus();
    return () => before?.focus?.();
  }, []);
  return (
    <div ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label}>
      {children}
    </div>
  );
}
