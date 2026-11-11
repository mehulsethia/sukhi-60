import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

// Inter for English; Noto Sans Devanagari for Hindi and Marathi (spec §2.3). The CSS stack
// lists Inter first, so Devanagari glyphs fall through to Noto automatically.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-deva", display: "swap", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Sukhi — Your health in your own hands", template: "%s · Sukhi" },
  description: "Sukhi is a voice-first wellbeing companion that helps you build small daily habits, stay consistent and gently restart when life gets in the way.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/192", type: "image/png", sizes: "192x192" }], apple: "/icons/180" },
  appleWebApp: { capable: true, title: "Sukhi", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F7FBFF",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const a11y = ((await cookies()).get("sukhi_a11y")?.value ?? "").split(",");
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${deva.variable}`}
      data-text={a11y.includes("large") ? "large" : undefined}
      data-contrast={a11y.includes("contrast") ? "high" : undefined}
      data-motion={a11y.includes("motion") ? "reduce" : undefined}
    >
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <SwRegister />
      </body>
    </html>
  );
}
