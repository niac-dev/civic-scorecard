import "./globals.css";
import type { Metadata, Viewport } from "next";
import Footer from "./Footer";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "NIAC Action Scorecard",
  description: "Congressional scorecard tracking votes on civil rights, Iran, Israel-Gaza, and immigration issues",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.ico", sizes: "16x16", type: "image/x-icon" },
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <main className="mx-auto max-w-7xl px-0 py-0">{children}</main>
        <Footer />
      </body>
    </html>
  );
}