import "./globals.css";
export const metadata = { title: "NIAC Action Scorecard" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <header className="sticky top-0 z-40 backdrop-blur bg-white/80 dark:bg-black/40 border-b border-[#E7ECF2] dark:border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
            <div className="font-semibold tracking-tight">NIAC Action Scorecard</div>
            <div className="ml-auto" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
          Updated nightly • Sources: Clerk, Senate LIS, Congress.gov
        </footer>
      </body>
    </html>
  );
}