/* eslint-disable @typescript-eslint/no-unused-expressions */

import { create } from "zustand";

type Filters = {
  chamber: "" | "HOUSE" | "SENATE";
  party: "" | "Democratic" | "Republican" | "Independent";
  state: string;
  categories: Set<string>;
  search: string;
  toggleCategory: (c: string) => void;
  set: (partial: Partial<Omit<Filters,"toggleCategory">>) => void;
};

export const useFilters = create<Filters>((set, get) => ({
  chamber: "", party: "", state: "", categories: new Set(), search: "",
  set: (partial) => set(partial),
  toggleCategory: (c) => {
    const s = new Set(get().categories);
    s.has(c) ? s.delete(c) : s.add(c);
    set({ categories: s });
  },
}));