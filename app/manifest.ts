import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Snack Exercise Tracker",
    short_name: "Snacks",
    description: "Track exercise snacks and see which muscles you have actually trained.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#232120",
    theme_color: "#232120",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
