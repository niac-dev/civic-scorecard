"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { loadData } from "@/lib/loadCsv";
import type { Row, Meta } from "@/lib/types";
import { chamberColor, inferChamber } from "@/lib/utils";
import clsx from "clsx";

export default function LegislationPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [metaByCol, setMetaByCol] = useState<Map<string, Meta>>(new Map());
  const [columns, setColumns] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedChamber, setSelectedChamber] = useState<string | null>(null);
  const [selectedActionType, setSelectedActionType] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await loadData();
      setRows(data.rows);
      setMetaByCol(data.metaByCol);
      setColumns(data.columns);
      setCategories(data.categories.filter(cat => cat !== "AIPAC"));
      setLoading(false);
    })();
  }, []);

  // Build list of all bills with metadata
  const bills = useMemo(() => {
    if (!columns.length || !metaByCol.size) return [];

    return columns
      .map((col) => {
        const meta = metaByCol.get(col);
        if (!meta) return null;

        const inferredChamber = inferChamber(meta, col);
        const actionType = (meta as { action_types?: string })?.action_types || '';
        const position = (meta?.position_to_score || '').toUpperCase();
        const categories = (meta?.categories || "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);

        // Find sponsor
        const sponsorCol = `${col}_sponsor`;
        const sponsorBioguideId = rows.find(r => (r as Record<string, unknown>)[sponsorCol])
          ? String((rows.find(r => (r as Record<string, unknown>)[sponsorCol]) as Record<string, unknown>)[sponsorCol])
          : undefined;
        const sponsor = sponsorBioguideId
          ? rows.find(r => r.bioguide_id === sponsorBioguideId)
          : undefined;

        return {
          col,
          meta,
          inferredChamber,
          actionType,
          position,
          categories,
          sponsor,
        };
      })
      .filter(Boolean) as Array<{
        col: string;
        meta: Meta;
        inferredChamber: string;
        actionType: string;
        position: string;
        categories: string[];
        sponsor?: Row;
      }>;
  }, [columns, metaByCol, rows]);

  // Filter bills
  const filteredBills = useMemo(() => {
    let filtered = bills;

    if (selectedCategory) {
      filtered = filtered.filter(bill => bill.categories.includes(selectedCategory));
    }

    if (selectedChamber) {
      filtered = filtered.filter(bill => bill.inferredChamber === selectedChamber);
    }

    if (selectedActionType) {
      filtered = filtered.filter(bill => bill.actionType.includes(selectedActionType));
    }

    return filtered;
  }, [bills, selectedCategory, selectedChamber, selectedActionType]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0B1220] flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-400">Loading legislation...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1220]">
      {/* Header */}
      <div className="border-b border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Legislative Tracker
            </h1>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg border border-[#E7ECF2] dark:border-slate-900 transition"
            >
              Back to Scorecard
            </button>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Tracking {filteredBills.length} pieces of legislation across {categories.length} policy areas
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-[#E7ECF2] dark:border-slate-900 bg-slate-50 dark:bg-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap gap-4">
            {/* Category Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Category
              </label>
              <select
                value={selectedCategory || ""}
                onChange={(e) => setSelectedCategory(e.target.value || null)}
                className="px-3 py-2 text-sm rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Chamber Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Chamber
              </label>
              <select
                value={selectedChamber || ""}
                onChange={(e) => setSelectedChamber(e.target.value || null)}
                className="px-3 py-2 text-sm rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="">All Chambers</option>
                <option value="HOUSE">House</option>
                <option value="SENATE">Senate</option>
                <option value="">Both</option>
              </select>
            </div>

            {/* Action Type Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Action Type
              </label>
              <select
                value={selectedActionType || ""}
                onChange={(e) => setSelectedActionType(e.target.value || null)}
                className="px-3 py-2 text-sm rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="">All Types</option>
                <option value="vote">Vote</option>
                <option value="cosponsor">Cosponsor</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Bills List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-4">
          {filteredBills.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              No legislation found matching the selected filters
            </div>
          ) : (
            filteredBills.map((bill) => (
              <div
                key={bill.col}
                className="rounded-xl border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800 p-6 hover:shadow-lg transition cursor-pointer"
                onClick={() => router.push(`/bill/${encodeURIComponent(bill.col)}?from=legislation`)}
              >
                <div className="flex gap-4">
                  {/* Sponsor Photo */}
                  {bill.sponsor && (
                    <div className="flex-shrink-0">
                      {bill.sponsor.photo_url ? (
                        <img
                          src={String(bill.sponsor.photo_url)}
                          alt=""
                          className="h-16 w-16 rounded-full object-cover bg-slate-200 dark:bg-white/10"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-full bg-slate-300 dark:bg-white/10" />
                      )}
                    </div>
                  )}

                  {/* Bill Info */}
                  <div className="flex-1 min-w-0">
                    {/* Title and Chamber Badge */}
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
                          {bill.meta.display_name || bill.meta.short_title || bill.meta.bill_number || bill.col}
                        </h3>
                        {bill.meta.bill_number && (
                          <div className="text-sm text-slate-600 dark:text-slate-400">
                            {bill.meta.bill_number}
                          </div>
                        )}
                      </div>
                      {bill.inferredChamber && (
                        <span
                          className="px-2 py-1 rounded text-xs font-semibold text-slate-700 dark:text-slate-200 flex-shrink-0"
                          style={{
                            backgroundColor: `${chamberColor(bill.inferredChamber)}20`,
                          }}
                        >
                          {bill.inferredChamber === "HOUSE" ? "House" : "Senate"}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {bill.meta.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 line-clamp-2">
                        {bill.meta.description}
                      </p>
                    )}

                    {/* Metadata Row */}
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      {/* NIAC Position */}
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-600 dark:text-slate-400">
                          Our Position:
                        </span>
                        <span className={clsx(
                          "px-2 py-1 rounded font-semibold",
                          bill.position === "SUPPORT"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                        )}>
                          {bill.position === "SUPPORT" ? "Support" : "Oppose"}
                        </span>
                      </div>

                      {/* Action Pill */}
                      {bill.actionType && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-600 dark:text-slate-400">
                            Action:
                          </span>
                          <span className={clsx(
                            "px-2 py-1 rounded-full font-semibold",
                            bill.position === "SUPPORT"
                              ? "bg-green-500 dark:bg-green-600 text-white"
                              : "bg-red-500 dark:bg-red-600 text-white"
                          )}>
                            {bill.actionType.includes("cosponsor")
                              ? (bill.position === "SUPPORT" ? "Cosponsor" : "Do Not Cosponsor")
                              : (bill.position === "SUPPORT" ? "Vote in Favor" : "Vote Against")
                            }
                          </span>
                        </div>
                      )}

                      {/* Points */}
                      {bill.meta.points && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-600 dark:text-slate-400">
                            Points:
                          </span>
                          <span className="text-slate-700 dark:text-slate-200">
                            {bill.meta.points}
                          </span>
                        </div>
                      )}

                      {/* Categories */}
                      {bill.categories.length > 0 && (
                        <div className="flex items-center gap-2">
                          {bill.categories.map(cat => (
                            <span
                              key={cat}
                              className="px-2 py-1 rounded bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sponsor Info */}
                    {bill.sponsor && (
                      <div className="mt-3 pt-3 border-t border-[#E7ECF2] dark:border-slate-900">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-slate-600 dark:text-slate-400">
                            Sponsor:
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/member/${bill.sponsor?.bioguide_id}`);
                            }}
                            className="text-[#4B8CFB] hover:text-[#3a7de8] underline"
                          >
                            {bill.sponsor.full_name}
                          </button>
                          <span className="text-slate-600 dark:text-slate-400">
                            ({bill.sponsor.party} - {bill.sponsor.state})
                          </span>
                          {bill.sponsor.Grade && (
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 font-semibold">
                              Grade: {bill.sponsor.Grade}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
