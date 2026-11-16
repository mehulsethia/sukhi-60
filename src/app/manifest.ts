import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sukhi: your everyday wellbeing companion",
    short_name: "Sukhi",
    description: "Small steps today. A healthier tomorrow.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#F7FBFF",
    theme_color: "#0b6e5f",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
