import { create } from "zustand";

export type Chamber = "" | "HOUSE" | "SENATE";

type FiltersState = {
  chamber: Chamber;        // "" = Both
  party: string;           // e.g. "Democrat", "Republican", "Independent"
  state: string;           // e.g. "WA"
  search: string;          // free-text member search
  categories: Set<string>; // selected category names
  viewMode: "summary" | "all" | "category"; // "summary" = category grades only, "all" = all bills, "category" = filtered by category

  set: (
    patch: Partial<Omit<FiltersState, "set" | "toggleCategory" | "clearCategories">>
  ) => void;

  toggleCategory: (c: string) => void;
  clearCategories: () => void;
};

export const useFilters = create<FiltersState>((set) => ({
  chamber: "",
  party: "",
  state: "",
  search: "",
  categories: new Set<string>(),
  viewMode: "summary",

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