"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A countdown that survives a backgrounded tab. It counts against a deadline
 * rather than ticking a number down, so a phone that throttled the page for
 * twenty seconds comes back showing the right time instead of twenty seconds
 * behind.
 */
export function useCountdown(totalSec: number, options: { autoStart?: boolean; onDone?: () => void } = {}) {
  const [running, setRunning] = useState(Boolean(options.autoStart));
  const [remainingMs, setRemainingMs] = useState(totalSec * 1000);
  const deadline = useRef<number | null>(options.autoStart ? Date.now() + totalSec * 1000 : null);
  const done = useRef(false);
  const onDone = useRef(options.onDone);
  onDone.current = options.onDone;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (deadline.current == null) return;
      const left = Math.max(0, deadline.current - Date.now());
      setRemainingMs(left);
      if (left <= 0 && !done.current) {
        done.current = true;
        setRunning(false);
        onDone.current?.();
      }
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [running]);

  const start = useCallback(() => {
    done.current = false;
    deadline.current = Date.now() + remainingMs;
    setRunning(true);
  }, [remainingMs]);

  const pause = useCallback(() => {
    if (deadline.current != null) setRemainingMs(Math.max(0, deadline.current - Date.now()));
    deadline.current = null;
    setRunning(false);
  }, []);

  return {
    running,
    remainingSec: remainingMs / 1000,
    elapsedSec: totalSec - remainingMs / 1000,
    start,
    pause,
  };
}

let audio: AudioContext | null = null;

/**
 * A short tone and a buzz at every change of phase, so the phone can sit on
 * the floor during a plank. Both are best-effort: no audio permission, no
 * vibration motor, no problem.
 */
export function cue(kind: "go" | "rest" | "done" = "go") {
  try {
    navigator.vibrate?.(kind === "done" ? [120, 80, 120] : kind === "go" ? 200 : 80);
  } catch {
    // Not every browser lets a page vibrate.
  }
  try {
    const Context =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    audio ??= new Context();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = kind === "rest" ? 520 : 880;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.3);
  } catch {
    // Audio is a nicety, never a requirement.
  }
}

/** Keep the screen on while the player is open. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) await next.release();
        else lock = next;
      } catch {
        // Denied, or the page is hidden; try again when it is visible.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
