// src/lib/loadCsv.ts
import Papa from "papaparse";
import type { Row, Meta } from "./types";

async function fetchCSV<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const res = await fetch(path, { cache: "no-store" });
  const text = await res.text();
  const parsed = Papa.parse<T>(text, { header: true, skipEmptyLines: true });
  return (parsed.data as T[]) || [];
}

export async function loadData(): Promise<{
  rows: Row[];
  columns: string[];
  metaByCol: Map<string, Meta>;
  categories: string[];
}> {
  const [rowsRaw, meta] = await Promise.all([
    fetchCSV<Row>("/data/scores_wide.csv"),
    fetchCSV<Meta>("/data/scores_columns_meta.csv"),
  ]);

  // Coerce numerics on a copy
  const rows: Row[] = rowsRaw.map((r) => {
    const out: Record<string, unknown> = { ...r };
    const numericCols = new Set(["Total", "Max_Possible", "Percent"]);
    for (const k of Object.keys(out)) {
      const v = out[k] as unknown;
      const looksBillCol = /^[A-Z]/.test(k); // bill/action cols start with a letter
      if (numericCols.has(k) || looksBillCol) {
        const n = Number(v as number | string);
        if (!Number.isNaN(n)) out[k] = n;
      }
    }
    return out as Row;
  });

  // Identity vs bill/action columns
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
  const columns = Object.keys(rows[0] ?? {}).filter((c) => !identity.includes(c));

  // Map column -> metadata
  const metaByCol = new Map<string, Meta>(meta.map((m) => [m.column, m]));

  // Categories list
  const catSet = new Set<string>();
  meta.forEach((m) => {
    const cats = (m.categories ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    cats.forEach((c) => catSet.add(c));
  });
  const categories = Array.from(catSet).sort();

  return { rows, columns, metaByCol, categories };
}