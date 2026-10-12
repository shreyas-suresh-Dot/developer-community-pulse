import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Instrument_Sans, Newsreader } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import "./globals.css";

/*
 * Root layout: editorial serif for headlines (Newsreader), a clean sans for UI and numbers
 * (Instrument Sans), shared masthead and footer. Everything here is static, so every route
 * ships a prerendered shell and only the data-reading parts stream in at request time.
 */

const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Community Pulse — weekly developer intelligence",
    template: "%s · Community Pulse",
  },
  description:
    "A Friday-morning brief on what developers are discussing about code review, CI/CD and developer workflow: the most frequent pain points, week-over-week trends and unresolved problems, with every claim linked to its thread.",
  applicationName: "Community Pulse",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#121210" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${serif.variable} ${sans.variable}`}>
      <body className="flex min-h-dvh flex-col bg-paper text-ink antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 outline-none sm:px-6 sm:pt-14">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
