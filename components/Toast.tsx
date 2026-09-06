"use client";

import { useEffect, useState } from "react";

export interface ToastState {
  message: string;
  action?: { label: string; onAction: () => void };
  tone?: "default" | "error";
}

/**
 * A single transient toast. Deletion uses this to offer a genuine undo, so the
 * timeout is long enough to actually react to (six seconds), and hovering or
 * touching it does not dismiss it early.
 */
export function Toast({
  toast,
  onDismiss,
  durationMs = 6000,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
  durationMs?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      // Let the exit transition finish before clearing the message.
      setTimeout(onDismiss, 200);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [toast, durationMs, onDismiss]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 z-50 flex justify-center px-4"
      style={{
        bottom: "calc(4.75rem + env(safe-area-inset-bottom))",
        transition: "opacity 180ms ease, transform 180ms ease",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        className="flex w-full max-w-lg items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg"
        style={{
          background: toast.tone === "error" ? "var(--danger)" : "var(--surface-2)",
          color: toast.tone === "error" ? "white" : "var(--text)",
          border: "1px solid var(--border)",
        }}
      >
        <span className="min-w-0 flex-1">{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action!.onAction();
              setVisible(false);
              setTimeout(onDismiss, 200);
            }}
            className="shrink-0 font-semibold uppercase tracking-wide"
            style={{ color: toast.tone === "error" ? "white" : "var(--accent)" }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
