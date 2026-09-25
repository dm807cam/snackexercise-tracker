import type { NextConfig } from "next";

/**
 * Headers that never vary by request. The Content-Security-Policy does vary —
 * it carries a per-request nonce — so it is set in proxy.ts instead.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Invitation and reset links carry their credential in the path; no other
  // origin is ever told which page someone came from.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    // Dictation uses the phone keyboard's own microphone, never the page's.
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // better-sqlite3 is a native module; keep it external to the server bundle.
  // web-push pulls in node:crypto and an http agent, and only runs on the server.
  serverExternalPackages: ["@prisma/adapter-better-sqlite3", "better-sqlite3", "web-push"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker must never be cached stale: an old worker would
        // keep handling notification clicks with yesterday's code.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
