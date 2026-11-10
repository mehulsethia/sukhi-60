import type { Metadata, Viewport } from "next";
import { Baloo_2, Mukta } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

// Both families cover Latin and Devanagari, so Hindi and Marathi render with the same care as English.
const display = Baloo_2({ subsets: ["latin", "devanagari"], variable: "--font-display-face", display: "swap", weight: ["500", "600", "700", "800"] });
const body = Mukta({ subsets: ["latin", "devanagari"], variable: "--font-body", display: "swap", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Sukhi — a gentle companion for your care routine", template: "%s · Sukhi" },
  description: "A gentle companion for the care routine you agreed on.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/192", apple: "/icons/180" },
  appleWebApp: { capable: true, title: "Sukhi", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1427" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const a11y = ((await cookies()).get("sukhi_a11y")?.value ?? "").split(",");
  return (
    <html
      lang={locale}
      className={`${display.variable} ${body.variable}`}
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
