import "./globals.css";
export const metadata = { title: "NIAC Action Scorecard" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
          Updated October 12, 2025 • Sources: Clerk, Senate LIS, Congress.gov, FEC.gov
        </footer>
      </body>
    </html>
  );
}