"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useFilters } from "@/lib/store";

// Find icon (magnifying glass)
const FindIcon = ({ active }: { active: boolean }) => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

// Map icon
const MapIcon = ({ active }: { active: boolean }) => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);

// Scorecard icon (checklist)
const ScorecardIcon = ({ active }: { active: boolean }) => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>
  </svg>
);

// Tracker icon (document)
const TrackerIcon = ({ active }: { active: boolean }) => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

export default function BottomNav() {
  const pathname = usePathname();
  const f = useFilters();

  // Don't show on member detail pages or bill pages
  const hiddenPaths = ["/member/", "/bill/"];
  if (hiddenPaths.some((p) => pathname.startsWith(p))) {
    return null;
  }

  // Check if we're on the home page
  const isHomePage = pathname === "/";

  // Determine active state for home page tabs
  const isFindActive = isHomePage && f.viewMode === "find";
  const isMapActive = isHomePage && f.viewMode === "map";
  const isScorecardActive = isHomePage && (f.viewMode === "summary" || f.viewMode === "all" || f.viewMode === "category");
  const isTrackerActive = isHomePage && f.viewMode === "tracker";

  // Bright blue for active tabs
  const activeColor = "text-[#4B8CFB]";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-[#E7ECF2] dark:border-slate-800 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {/* Map Tab */}
        <button
          onClick={() => {
            if (!isHomePage) {
              window.location.href = "/?view=map";
            } else {
              f.set({ viewMode: "map", categories: new Set(), state: "" });
            }
          }}
          className={clsx(
            "flex flex-col items-center justify-center w-full h-full gap-0.5 transition-colors",
            isMapActive
              ? activeColor
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          )}
        >
          <MapIcon active={isMapActive} />
          <span className={clsx("text-[10px]", isMapActive && "font-semibold")}>Map</span>
        </button>

        {/* Find Tab */}
        <button
          onClick={() => {
            if (!isHomePage) {
              window.location.href = "/?view=find";
            } else {
              f.set({ viewMode: "find" });
            }
          }}
          className={clsx(
            "flex flex-col items-center justify-center w-full h-full gap-0.5 transition-colors",
            isFindActive
              ? activeColor
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          )}
        >
          <FindIcon active={isFindActive} />
          <span className={clsx("text-[10px]", isFindActive && "font-semibold")}>Find</span>
        </button>

        {/* Scorecard Tab */}
        <button
          onClick={() => {
            if (!isHomePage) {
              window.location.href = "/";
            } else {
              f.set({ viewMode: "summary", categories: new Set() });
            }
          }}
          className={clsx(
            "flex flex-col items-center justify-center w-full h-full gap-0.5 transition-colors",
            isScorecardActive
              ? activeColor
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          )}
        >
          <ScorecardIcon active={isScorecardActive} />
          <span className={clsx("text-[10px]", isScorecardActive && "font-semibold")}>Scorecard</span>
        </button>

        {/* Tracker Tab */}
        <button
          onClick={() => {
            if (!isHomePage) {
              window.location.href = "/?view=tracker";
            } else {
              f.set({ viewMode: "tracker", categories: new Set() });
            }
          }}
          className={clsx(
            "flex flex-col items-center justify-center w-full h-full gap-0.5 transition-colors",
            isTrackerActive
              ? activeColor
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          )}
        >
          <TrackerIcon active={isTrackerActive} />
          <span className={clsx("text-[10px]", isTrackerActive && "font-semibold")}>Legislation</span>
        </button>

      </div>
    </nav>
  );
}
