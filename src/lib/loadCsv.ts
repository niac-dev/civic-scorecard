// src/lib/loadCsv.ts
import Papa from "papaparse";
import type { Row, Meta } from "./types";
import { cacheScorecard, loadCachedScorecard } from "./offlineStorage";
import type { PacData } from "./pacData";

async function fetchCSV<T = Record<string, unknown>>(path: string): Promise<T[]> {
  // Cache busting: use build time in production, current time in development
  const version = process.env.NEXT_PUBLIC_BUILD_TIME || Date.now().toString();
  const urlWithVersion = `${path}?v=${version}`;

  // In development, disable cache to always get fresh data
  // In production, use default caching (will cache per version)
  const cacheOption = process.env.NODE_ENV === 'production'
    ? { cache: "default" as RequestCache }
    : { cache: "no-store" as RequestCache };

  const res = await fetch(urlWithVersion, cacheOption);
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
      if (!r.full_name || !r.party || !r.state || !r.chamber) return false;
      // Keep all members (including those no longer in office) so their
      // historical votes are preserved in tallies. Individual pages use
      // the per-bill _not_in_office flag to exclude them where appropriate.
      return true;
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

/**
 * Load data with offline caching support
 * Tries network first, falls back to cached data if offline
 */
export async function loadDataWithCache(): Promise<{
  rows: Row[];
  columns: string[];
  metaByCol: Map<string, Meta>;
  categories: string[];
  isOffline: boolean;
}> {
  // Check if online
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  if (isOnline) {
    try {
      // Try to load from network
      const data = await loadData();

      // Load PAC data for caching
      let pacData: PacData[] = [];
      try {
        const pacResponse = await fetch("/data/pac_data.csv");
        const pacText = await pacResponse.text();
        const parsed = Papa.parse<PacData>(pacText, { header: true, skipEmptyLines: true });
        pacData = parsed.data || [];
      } catch {
        // PAC data loading failed, continue without it
      }

      // Cache the data for offline use
      try {
        await cacheScorecard({
          rows: data.rows,
          cols: data.columns,
          metaByCol: data.metaByCol,
          categories: data.categories,
          pacData,
        });
      } catch (cacheError) {
        console.warn("Failed to cache scorecard data:", cacheError);
      }

      return { ...data, isOffline: false };
    } catch (networkError) {
      console.warn("Network error, trying cache:", networkError);
      // Fall through to cache
    }
  }

  // Try to load from cache
  const cached = await loadCachedScorecard();
  if (cached) {
    return {
      rows: cached.rows,
      columns: cached.cols,
      metaByCol: cached.metaByCol,
      categories: cached.categories,
      isOffline: true,
    };
  }

  // No cache available, throw error
  throw new Error("No data available. Please connect to the internet to load scorecard data.");
}

/**
 * Load lawmaker statements on Iran war
 * Returns a Map from last name to { statement, link }
 */
export interface WarStatement {
  name: string;
  statement: string;
  link: string;
  date: string;
  position: "Support" | "Oppose";
}

export async function loadWarStatements(): Promise<Map<string, WarStatement>> {
  const data = await fetchCSV<{ "Lawmaker Name": string; Statement: string; Link: string; Date: string; Position: string }>(
    "/data/lawmaker_statements_opposing_iran_war_FULL.csv"
  );

  const map = new Map<string, WarStatement>();
  data.forEach((row) => {
    const fullName = row["Lawmaker Name"]?.trim();
    let statement = row.Statement?.trim();
    const link = row.Link?.trim();
    const date = row.Date?.trim() || "";

    if (fullName && statement) {
      // Remove surrounding quotes if present (e.g., ""quote"" -> quote)
      statement = statement.replace(/^[""\u201C\u201D]+|[""\u201C\u201D]+$/g, '').trim();

      // Parse name like "Sen. Ruben Gallego (D-AZ)" or "Rep. Ami Bera (D-CA)"
      // Extract the name part between title and state
      const nameMatch = fullName.match(/^(?:Sen\.|Rep\.)\s+(.+?)\s+\(.*\)$/);
      if (nameMatch) {
        const namePart = nameMatch[1]; // e.g., "Ruben Gallego" or "Debbie Wasserman Schultz"
        const nameParts = namePart.split(/\s+/);

        // Filter out middle initials (single letters or letters with periods like "E." or "C.")
        const nonInitials = nameParts.filter(part => !/^[A-Z]\.?$/i.test(part));
        // Last name is everything after first name, excluding middle initials
        const lastName = nonInitials.length > 1 ? nonInitials.slice(1).join(" ") : nameParts[nameParts.length - 1];
        const firstName = nonInitials[0] || nameParts[0];

        // Store by "first last" to disambiguate members sharing a last name (e.g. Hank vs Ron Johnson)
        map.set(`${firstName} ${lastName}`.toLowerCase(), {
          name: fullName,
          statement,
          link: link || "",
          date,
          position: (row.Position?.trim() === "Oppose" ? "Oppose" : "Support") as "Support" | "Oppose",
        });
      }
    }
  });

  return map;
}