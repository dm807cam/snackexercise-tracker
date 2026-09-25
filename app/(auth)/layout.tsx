/** Signing in and setting up: no navigation, one card, centred. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-[85vh] w-full max-w-sm flex-col items-center justify-center py-8"
      style={{
        paddingInlineStart: "max(1rem, env(safe-area-inset-left))",
        paddingInlineEnd: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <div className="mb-6 flex items-center gap-2" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={32} height={32} className="rounded-lg" />
        <span className="text-lg font-semibold">Snacks</span>
      </div>
      {children}
    </main>
  );
}
