"use client";

import { useState, useEffect } from "react";
import { useFiltersStore } from "@/lib/store";

interface Lawmaker {
  name: string;
  party?: string;
  link?: string;
  office?: string;
}

export default function MyRepsPage() {
  const { myLawmakers, setMyLawmakers } = useFiltersStore();
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [representatives, setRepresentatives] = useState<Lawmaker[]>([]);

  // Load saved address from localStorage
  useEffect(() => {
    const savedAddress = localStorage.getItem("niac-address");
    if (savedAddress) {
      setAddress(savedAddress);
    }
  }, []);

  const handleLookup = async () => {
    if (!address.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/find-lawmakers?address=${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error("Failed to find representatives");

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setRepresentatives(data.officials || []);

      // Save to store and localStorage
      const names = (data.officials || []).map((o: Lawmaker) => o.name);
      setMyLawmakers(names);
      localStorage.setItem("niac-address", address);
      localStorage.setItem("niac-lawmakers", JSON.stringify(names));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to look up address");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setAddress("");
    setRepresentatives([]);
    setMyLawmakers([]);
    localStorage.removeItem("niac-address");
    localStorage.removeItem("niac-lawmakers");
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-[#E7ECF2] dark:border-slate-800">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">My Representatives</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Find your lawmakers by address</p>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Address Input */}
        <div className="card p-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Enter your address or ZIP code
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="123 Main St, City, State or ZIP"
              className="flex-1 h-11 rounded-lg border border-[#E7ECF2] dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-base text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            <button
              onClick={handleLookup}
              disabled={loading || !address.trim()}
              className="h-11 px-6 bg-[#30558C] text-white rounded-lg font-medium hover:bg-[#254470] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "..." : "Find"}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        {/* Results */}
        {representatives.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Your Representatives
              </h2>
              <button
                onClick={handleClear}
                className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Clear
              </button>
            </div>

            <div className="space-y-3">
              {representatives.map((rep, i) => (
                <div
                  key={i}
                  className="card p-4 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-medium text-slate-900 dark:text-white">
                      {rep.name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {rep.office}
                    </p>
                  </div>
                  <a
                    href={`/?search=${encodeURIComponent(rep.name.split(" ").pop() || "")}`}
                    className="px-4 py-2 bg-slate-100 dark:bg-white/10 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                  >
                    View Scorecard
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saved Lawmakers */}
        {myLawmakers.length > 0 && representatives.length === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Saved Representatives
            </h2>
            <div className="space-y-3">
              {myLawmakers.map((name, i) => (
                <div
                  key={i}
                  className="card p-4 flex items-center justify-between"
                >
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    {name}
                  </h3>
                  <a
                    href={`/?search=${encodeURIComponent(name.split(" ").pop() || "")}`}
                    className="px-4 py-2 bg-slate-100 dark:bg-white/10 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                  >
                    View Scorecard
                  </a>
                </div>
              ))}
            </div>
            <button
              onClick={handleClear}
              className="w-full py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
            >
              Clear Saved Representatives
            </button>
          </div>
        )}

        {/* Empty State */}
        {myLawmakers.length === 0 && representatives.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              Find Your Representatives
            </h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Enter your address above to find your congressional representatives and see how they score.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
