"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Today", match: (p: string) => p === "/" || p.startsWith("/day") },
  { href: "/calendar", label: "Calendar", match: (p: string) => p.startsWith("/calendar") },
  { href: "/stats", label: "Stats", match: (p: string) => p.startsWith("/stats") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

export function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in oklch, var(--surface) 88%, transparent)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Main"
    >
      <ul className="mx-auto flex w-full max-w-lg">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors"
                style={{ color: active ? "var(--accent)" : "var(--text-dim)" }}
              >
                <TabIcon name={tab.label} active={active} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2.1 : 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "Today":
      // A torso: the day view is the body map.
      return (
        <svg {...common}>
          <circle cx="12" cy="5" r="2.4" />
          <path d="M7.5 21v-5l-1.5-1V11a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4l-1.5 1v5" />
        </svg>
      );
    case "Calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2.5" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "Stats":
      // A radar polygon, matching what the page actually shows.
      return (
        <svg {...common}>
          <path d="M12 2.5 21 9l-3.4 10.5H6.4L3 9z" />
          <path d="M12 7.5 17 11l-1.9 5.8H8.9L7 11z" opacity={0.55} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.8v2.6M12 18.6v2.6M4.5 12H2M22 12h-2.5M6.2 6.2 4.4 4.4M19.6 19.6l-1.8-1.8M17.8 6.2l1.8-1.8M4.4 19.6l1.8-1.8" />
        </svg>
      );
  }
}
