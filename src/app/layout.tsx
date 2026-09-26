import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/shell/app-providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FuelOps — Multi-Outlet Fuel Station Dashboard",
  description:
    "Local-first, offline-capable dashboard for managing multiple fuel retail outlets: sales, shifts, tanks, credit and reports in one place.",
  applicationName: "FuelOps",
  manifest: "/manifest.webmanifest",
  referrer: "no-referrer",
};

/**
 * Defense-in-depth CSP (L2). Static hosting (GitHub Pages) can't set response
 * headers, so it ships as a meta tag — production only, since the dev overlay
 * and HMR need eval/websockets. `frame-ancestors` is ignored in meta tags and
 * would need a real header.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "form-action 'self'",
].join("; ");

export const viewport: Viewport = {
  themeColor: "#17171c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrains.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full" suppressHydrationWarning>
        {process.env.NODE_ENV === "production" && (
          <meta httpEquiv="Content-Security-Policy" content={CSP} />
        )}
        <meta name="referrer" content="no-referrer" />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
