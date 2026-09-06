import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Snack Tracker",
  description: "Track exercise snacks and see which muscles you have actually trained.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Snacks" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available. Blocking it is an accessibility failure under both
  // Apple's guidance and WCAG 1.4.4, and the day-swipe does not actually need
  // it blocked: `touch-action: pan-y` already keeps the gesture separate.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#232120" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
      </body>
    </html>
  );
}
