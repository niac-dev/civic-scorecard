// src/lib/loadCsv.ts
import Papa from "papaparse";
import type { Row, Meta, ManualScoringMeta } from "./types";

async function fetchCSV<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const res = await fetch(path, { cache: "force-cache" });
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

  // Coerce numerics on a copy and filter out malformed entries
  const rows: Row[] = rowsRaw
    .filter((r) => {
      // Filter out rows without essential fields (full_name, party, state, or chamber)
      return r.full_name && r.party && r.state && r.chamber;
    })
    .map((r) => {
      const out: Record<string, unknown> = { ...r };
      const numericCols = new Set(["Total", "Max_Possible", "Percent"]);
      for (const k of Object.keys(out)) {
        const v = out[k] as unknown;
        const looksBillCol = /^[A-Z]/.test(k); // bill/action cols start with a letter
        const isGradeCol = k === "Grade" || k.startsWith("Grade_"); // Grade columns should stay as strings
        const isCategoryNumeric = k.startsWith("Total_") || k.startsWith("Max_Possible_") || k.startsWith("Percent_");
        if ((numericCols.has(k) || looksBillCol || isCategoryNumeric) && !isGradeCol) {
          // Keep empty/null values as-is (don't convert empty string to 0)
          if (v === null || v === undefined || v === '') {
            out[k] = null;
          } else {
            const n = Number(v as number | string);
            if (!Number.isNaN(n)) out[k] = n;
          }
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
    "district",
    "office_phone",
    "office_address",
    "district_offices",
    "committees",
    "aipac_supported",
    "dmfi_supported",
    "Total",
    "Max_Possible",
    "Percent",
    "Grade",
    "Total_Civil_Rights",
    "Max_Possible_Civil_Rights",
    "Percent_Civil_Rights",
    "Grade_Civil_Rights",
    "Total_Iran",
    "Max_Possible_Iran",
    "Percent_Iran",
    "Grade_Iran",
    "Total_Israel_Gaza",
    "Max_Possible_Israel_Gaza",
    "Percent_Israel_Gaza",
    "Grade_Israel_Gaza",
    "Total_Travel_Immigration",
    "Max_Possible_Travel_Immigration",
    "Percent_Travel_Immigration",
    "Grade_Travel_Immigration",
  ];
  const columns = Object.keys(rows[0] ?? {}).filter((c) => !identity.includes(c) && !c.endsWith('_sponsor') && !c.endsWith('_absent') && !c.endsWith('_cosponsor') && c !== 'reject_aipac_commitment' && c !== 'reject_aipac_link');

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
  // Add AIPAC as a special category
  catSet.add("AIPAC");
  const categories = Array.from(catSet).sort();

  return { rows, columns, metaByCol, categories };
}

/**
 * Load manual scoring metadata from manual_scoring_meta.csv
 * Returns a Map from "label|score" to custom_scoring_description
 */
export async function loadManualScoringMeta(): Promise<Map<string, string>> {
  const data = await fetchCSV<{ label: string; score: string; custom_scoring_description: string }>(
    "/data/manual_scoring_meta.csv"
  );

  const map = new Map<string, string>();
  data.forEach((row) => {
    const label = row.label?.trim();
    const score = parseFloat(row.score);
    const description = row.custom_scoring_description?.trim();

    if (label && !isNaN(score) && description) {
      // Create a key combining label and score
      const key = `${label}|${score}`;
      map.set(key, description);
    }
  });

  return map;
}