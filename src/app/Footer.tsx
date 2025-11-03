"use client";
import { useEffect, useState } from "react";

export default function Footer() {
  const [lastUpdated, setLastUpdated] = useState<string>("Loading...");

  useEffect(() => {
    // Fetch the CSV to get the Last-Modified header
    fetch('/data/scores_wide.csv', { method: 'HEAD' })
      .then(response => {
        const lastModified = response.headers.get('Last-Modified');
        if (lastModified) {
          const date = new Date(lastModified);
          setLastUpdated(date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          }));
        } else {
          setLastUpdated("October 12, 2025");
        }
      })
      .catch(() => {
        setLastUpdated("October 12, 2025");
      });
  }, []);

  return (
    <footer className="mx-auto max-w-7xl px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
      Updated {lastUpdated} • Sources: Clerk, Senate LIS, Congress.gov, FEC.gov
    </footer>
  );
}
