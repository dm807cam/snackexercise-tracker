"use client";

import { useRef, useState } from "react";

/**
 * Horizontal swipe to change day.
 *
 * Direction is locked on the first few pixels of movement: without that, a
 * vertical scroll through a long entry list keeps nudging the day sideways.
 * Once a gesture is judged vertical it is ignored entirely.
 */
export function useSwipeDays({
  onPrevious,
  onNext,
  threshold = 60,
}: {
  onPrevious: () => void;
  onNext: () => void;
  threshold?: number;
}) {
  const [dragX, setDragX] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"undecided" | "horizontal" | "vertical">("undecided");

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
    axis.current = "undecided";
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - start.current.x;
    const dy = touch.clientY - start.current.y;

    if (axis.current === "undecided") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    }
    if (axis.current !== "horizontal") return;

    // Rubber-band the drag so it feels attached but never runs off-screen.
    setDragX(Math.sign(dx) * Math.min(Math.abs(dx), 120) * 0.6);
  }

  function onTouchEnd() {
    if (!start.current) return;
    const travelled = dragX / 0.6;

    if (axis.current === "horizontal" && Math.abs(travelled) > threshold) {
      // Swiping right (positive dx) reveals the day to the left: yesterday.
      if (travelled > 0) onPrevious();
      else onNext();
    }

    setDragX(0);
    start.current = null;
    axis.current = "undecided";
  }

  return {
    dragX,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  };
}
