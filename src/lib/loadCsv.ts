import Papa from "papaparse";
import type { Row, ColumnMeta } from "./types";

/**
 * Fetch and parse a CSV file into typed rows.
 */
export async function fetchCSV<T = unknown>(path: string): Promise<T[]> {
  const res = await fetch(path, { cache: "no-store" });
  const text = await res.text();
  const { data } = Papa.parse<T>(text, { header: true, skipEmptyLines: true });
  return data as T[];
}

/**
 * Load score rows and column metadata, coerce numeric fields, and
 * build helper structures for the UI.
 */
export async function loadData(): Promise<{
  rows: Row[];
  columns: string[];
  metaByCol: Map<string, ColumnMeta>;
  categories: string[];
}> {
  const [rows, meta] = await Promise.all([
    fetchCSV<Row>("/data/scores_wide.csv"),
    fetchCSV<ColumnMeta>("/data/scores_columns_meta.csv"),
  ]);

  // Coerce numerics (totals/percent plus any uppercase header bill/action columns)
  const numericCols = new Set(["Total", "Max_Possible", "Percent"]);
  rows.forEach((r) => {
    const rec = r as unknown as Record<string, number | string>;
    for (const k of Object.keys(rec)) {
      if (numericCols.has(k) || /^[A-Z]/.test(k)) {
        const maybe = Number(rec[k] as string | number);
        if (!Number.isNaN(maybe)) {
          rec[k] = maybe;
        }
      }
    }
  });

  // Identity columns we don't want to treat as bill/action columns
  const identity = [
    "full_name",
    "party",
    "state",
    "chamber",
    "bioguide_id",
    "photo_url",
    "Total",
    "Max_Possible",
    "Percent",
    "Grade",
  ];

  // All other columns are bill/action columns
  const columns = Object.keys(rows[0] || {}).filter((c) => !identity.includes(c));

  // Map metadata by column for quick lookups
  const metaByCol = new Map<string, ColumnMeta>(meta.map((m) => [m.column, m]));

  // Unique, sorted list of categories extracted from metadata
  const catSet = new Set<string>();
  meta.forEach((m) => {
    (m.categories || "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((c) => catSet.add(c));
  });
  const categories = Array.from(catSet).sort();

  return { rows, columns, metaByCol, categories };
}