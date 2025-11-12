import { create } from "zustand";

export type Chamber = "" | "HOUSE" | "SENATE";

type FiltersState = {
  chamber: Chamber;        // "" = Both
  party: string;           // e.g. "Democrat", "Republican", "Independent"
  state: string;           // e.g. "WA"
  search: string;          // free-text member search
  categories: Set<string>; // selected category names
  viewMode: "summary" | "all" | "category" | "map" | "tracker"; // "summary" = category grades only, "all" = all bills, "category" = filtered by category, "map" = map view, "tracker" = legislation tracker
  myLawmakers: string[];   // array of full names from address search
  billColumn: string;      // column name for bill search

  set: (
    patch: Partial<Omit<FiltersState, "set" | "toggleCategory" | "clearCategories">>
  ) => void;

  toggleCategory: (c: string) => void;
  clearCategories: () => void;
};

// Helper to get initial viewMode based on localStorage
function getInitialViewMode(): "summary" | "all" | "category" | "map" | "tracker" {
  if (typeof window === "undefined") return "summary";

  // Check if user has visited before
  const hasVisited = localStorage.getItem("hasVisitedScorecard");

  if (!hasVisited) {
    // First visit - default to map view
    localStorage.setItem("hasVisitedScorecard", "true");
    return "map";
  }

  // Returning user - default to summary (scorecard view)
  return "summary";
}

export const useFilters = create<FiltersState>((set) => ({
  chamber: "",
  party: "",
  state: "",
  search: "",
  categories: new Set<string>(),
  viewMode: getInitialViewMode(),
  myLawmakers: [],
  billColumn: "",

  set: (patch) =>
    set((prev) => ({
      ...prev,
      ...patch,
      // tiny normalizations
      party: typeof patch.party === "string" ? patch.party.trim() : prev.party,
      state:
        typeof patch.state === "string"
          ? patch.state.trim().toUpperCase()
          : prev.state,
      search: typeof patch.search === "string" ? patch.search : prev.search,
    })),

  toggleCategory: (c) =>
    set((prev) => {
      const next = new Set(prev.categories);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return { ...prev, categories: next };
    }),

  clearCategories: () => set((prev) => ({ ...prev, categories: new Set() })),
}));