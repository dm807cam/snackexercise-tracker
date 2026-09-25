import { BottomNav } from "@/components/BottomNav";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

/**
 * The signed-in app. Checking the session here is a backstop, not the gate:
 * a layout is not re-rendered on every client navigation, so each page also
 * asks `requireUser` for the id it scopes its queries by.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <main
        className="mx-auto w-full max-w-lg"
        style={{
          // 16pt is Apple's standard layout margin; the notch only ever
          // widens it.
          paddingInlineStart: "max(1rem, env(safe-area-inset-left))",
          paddingInlineEnd: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        {children}
      </main>
      <BottomNav />
    </>
  );
}
