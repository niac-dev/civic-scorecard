import "./globals.css";
import type { Metadata, Viewport } from "next";
import Footer from "./Footer";
import BottomNav from "@/components/BottomNav";
import SyncStatus from "@/components/SyncStatus";
import QuickLinks from "@/components/QuickLinks";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "NIAC Action",
  description: "Congressional scorecard, news, and advocacy tools from NIAC Action",
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
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className="min-h-full flex flex-col">
        <QuickLinks />
        <SyncStatus />
        <main className="mx-auto max-w-7xl w-full px-0 py-0 pb-20 flex-1">{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}