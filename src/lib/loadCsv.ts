import Papa from "papaparse";
import type { Row, ColumnMeta } from "./types";

export async function fetchCSV<T=any>(path: string): Promise<T[]> {
  const res = await fetch(path, { cache: "no-store" });
  const text = await res.text();
  const { data } = Papa.parse<T>(text, { header: true, skipEmptyLines: true });
  return data as T[];
}

export async function loadData() {
  const [rows, meta] = await Promise.all([
    fetchCSV<Row>("/data/scores_wide.csv"),
    fetchCSV<ColumnMeta>("/data/scores_columns_meta.csv"),
  ]);

  // Coerce numerics
  const numericCols = new Set(["Total","Max_Possible","Percent"]);
  rows.forEach(r=>{
    for (const k of Object.keys(r)) {
      if (numericCols.has(k) || /^[A-Z]/.test(k)) {
        const maybe = Number((r as any)[k]);
        if (!Number.isNaN(maybe)) (r as any)[k] = maybe;
      }
    }
  });

  // Build identity/bill lists
  const identity = ["full_name","party","state","chamber","bioguide_id","photo_url","Total","Max_Possible","Percent","Grade"];
  const columns = Object.keys(rows[0] || {}).filter(c=>!identity.includes(c));
  const metaByCol = new Map(meta.map(m => [m.column, m]));

  // Categories list
  const catSet = new Set<string>();
  meta.forEach(m => m.categories?.split(";").map(s=>s.trim()).filter(Boolean).forEach(c=>catSet.add(c)));
  const categories = Array.from(catSet).sort();

  return { rows, columns, metaByCol, categories };
}