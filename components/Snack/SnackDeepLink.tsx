"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { SnackView } from "@/lib/snack/service";
import { Toast, type ToastState } from "@/components/Toast";
import { SnackPlayer } from "./SnackPlayer";

/** The player, opened from a notification. */
export function SnackDeepLink({ snack, closed }: { snack: SnackView; closed: boolean }) {
  const router = useRouter();
  const [ready, setReady] = useState<SnackView | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (closed) return;
    api<{ snack: SnackView }>(`/api/snacks/${snack.id}/start`, { method: "POST" })
      .then(({ snack: started }) => setReady(started))
      .catch((error) => setToast({ message: (error as Error).message, tone: "error" }));
  }, [snack.id, closed]);

  if (closed) {
    return (
      <div className="pt-10 text-center">
        <p className="text-lg font-semibold">That snack is {snack.status}.</p>
        <Link href="/" className="mt-4 inline-block underline" style={{ color: "var(--accent)" }}>
          Plan a fresh one
        </Link>
      </div>
    );
  }

  return (
    <>
      {ready && (
        <SnackPlayer
          snack={ready}
          onClose={() => router.replace("/")}
          onFinished={() => router.replace("/")}
          onError={(message) => setToast({ message, tone: "error" })}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
