import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

const noto = Noto_Sans({ subsets: ["latin"], variable: "--font-noto", display: "swap" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-deva", display: "swap", weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: "Sukhi",
  description: "A gentle companion for the care routine you agreed on.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/192", apple: "/icons/180" },
  appleWebApp: { capable: true, title: "Sukhi", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#141a17" },
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
      className={`${noto.variable} ${deva.variable}`}
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
