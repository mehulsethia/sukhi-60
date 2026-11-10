import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sukhi — care routine companion",
    short_name: "Sukhi",
    description: "A gentle companion for the care routine you agreed on.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#fbf7f0",
    theme_color: "#2f5d50",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
