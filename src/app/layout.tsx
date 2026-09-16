import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { withBasePath } from "@/lib/basePath";

/** App UI font (Hebrew + Latin). */
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

/**
 * Biblical text font for BOTH display layers (bare letters and pointed text):
 * Culmus "Taamey Ashkenaz" v0.200 (Yoram Gnat), GPLv2 + font-embedding exception.
 * Every vowel/cantillation glyph is drawn and positioned via GPOS, so toggling the
 * hint never changes font, size or metrics.
 */
const taamey = localFont({
  variable: "--font-stam",
  src: [
    { path: "../fonts/TaameyAshkenaz-Medium.ttf", weight: "500", style: "normal" },
    { path: "../fonts/TaameyAshkenaz-Bold.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: "מדקר — Medaker",
  description: "אימון טעמי המקרא במחוות מגע: קרא מהמגילה, ודקר את הטעם הנכון.",
  applicationName: "Medaker",
  icons: { icon: withBasePath("/logo-gold.svg") },
  // Added to the home screen on iOS, the app runs without Safari's toolbars, which keeps
  // edge swipes from triggering browser navigation while practising.
  appleWebApp: { capable: true, title: "מדקר", statusBarStyle: "black-translucent" },
};

/**
 * Mobile readiness: pinch-zoom and double-tap zoom are disabled here (userScalable=no,
 * maximumScale=1) on top of `touch-action: none` on every gesture target; pull-to-refresh
 * is disabled by `overscroll-behavior: none` on html/body in globals.css, so a swipe-down
 * that starts on a word never turns into a page reload.
 */
export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${taamey.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
