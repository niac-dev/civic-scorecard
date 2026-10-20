// src/lib/loadCsv.ts
import Papa from "papaparse";
import type { Row, Meta } from "./types";
import { cacheScorecard, loadCachedScorecard } from "./offlineStorage";
import type { PacData } from "./pacData";

function percentToGrade(pct: number): string {
  if (pct >= 1.0) return "A+";
  if (pct >= 0.85) return "A";
  if (pct >= 0.80) return "A-";
  if (pct >= 0.75) return "B+";
  if (pct >= 0.65) return "B";
  if (pct >= 0.58) return "B-";
  if (pct >= 0.55) return "C+";
  if (pct >= 0.45) return "C";
  if (pct >= 0.39) return "C-";
  if (pct >= 0.19) return "D";
  return "F";
}

function inferBillChamber(col: string, metaChamber?: string): "HOUSE" | "SENATE" {
  if (metaChamber === "HOUSE" || metaChamber === "SENATE") return metaChamber;
  return /^S\./.test(col) ? "SENATE" : "HOUSE";
}

function catFieldSuffix(cat: string): string {
  return cat.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
}

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

  // Manual overrides for fields the sheet sync gets wrong. Keyed by bioguide_id.
  // Remove an entry once the upstream sheet has been corrected.
  const MEMBER_OVERRIDES: Record<string, Partial<Row>> = {
    H001104: { next_election: "2026" }, // Jon Husted (OH) — appointed, special election 2026
    M001244: { next_election: "2026" }, // Ashley Moody (FL) — appointed, special election 2026
    A000383: { not_seeking_reelection: "Retiring" }, // Alan Armstrong (OK)
  };

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
      const override = MEMBER_OVERRIDES[String(out.bioguide_id || "").toUpperCase()];
      if (override) Object.assign(out, override);
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

  // Build pair info: pair_key → { totalPts (sum of all bills in pair), cols[] }
  // The sheet adds each paired bill's points independently to Max_Possible,
  // so we deduct the total sum when all bills in the pair are not_in_office.
  const pairInfo = new Map<string, { totalPts: number; cols: string[] }>();
  for (const [col, m] of metaByCol) {
    if (!m.pair_key) continue;
    const pts = Number(m.points ?? 0);
    const entry = pairInfo.get(m.pair_key) ?? { totalPts: 0, cols: [] };
    entry.cols.push(col);
    entry.totalPts += pts;
    pairInfo.set(m.pair_key, entry);
  }

  // Adjust Max_Possible/Percent/Grade for members not in office during certain votes.
  // When _not_in_office = 1, the bill should be excluded from the denominator too,
  // otherwise a member is penalized for a vote they couldn't participate in.
  const adjustedRows = rows.map((row) => {
    const notInOffice = new Set<string>();
    for (const key of Object.keys(row)) {
      if (key.endsWith("_not_in_office") && row[key] === 1) {
        notInOffice.add(key.slice(0, -"_not_in_office".length));
      }
    }
    if (notInOffice.size === 0) return row;

    let totalDeduction = 0;
    const catDeductions = new Map<string, number>();
    const seenPairs = new Set<string>();

    for (const col of notInOffice) {
      const m = metaByCol.get(col);
      if (!m) continue;
      if (Number(m.tracker_only) === 1) continue;
      // Skip bills that don't apply to this member's chamber
      if (row.chamber && inferBillChamber(col, m.chamber as string) !== row.chamber) continue;

      const cats = (m.categories ?? "").split(";").map((s) => s.trim()).filter(Boolean);
      let deduction = 0;

      if (m.pair_key) {
        if (seenPairs.has(m.pair_key)) continue;
        seenPairs.add(m.pair_key);
        const pair = pairInfo.get(m.pair_key);
        if (!pair) continue;
        // Only deduct if ALL bills in the pair are not_in_office (otherwise the member
        // could still participate in the other bill in the pair)
        if (!pair.cols.every((c) => notInOffice.has(c))) continue;
        deduction = pair.totalPts;
      } else {
        deduction = Number(m.points ?? 0);
      }

      if (deduction === 0) continue;
      totalDeduction += deduction;
      for (const cat of cats) {
        catDeductions.set(cat, (catDeductions.get(cat) ?? 0) + deduction);
      }
    }

    if (totalDeduction === 0 && catDeductions.size === 0) return row;

    const r: Record<string, unknown> = { ...row };

    const curMax = Number(row.Max_Possible ?? 0);
    const total = Number(row.Total ?? 0);
    const newMax = Math.max(0, curMax - totalDeduction);
    if (newMax > 0) {
      const pct = Math.min(1, total / newMax);
      r.Max_Possible = newMax;
      r.Percent = pct;
      r.Grade = percentToGrade(pct);
    } else if (total > 0) {
      // All scoreable bills were not_in_office but member still earned bonus points → A+
      r.Max_Possible = total;
      r.Percent = 1;
      r.Grade = "A+";
    }

    for (const [cat, ded] of catDeductions) {
      const suf = catFieldSuffix(cat);
      const catMax = Number(r[`Max_Possible_${suf}`] ?? 0);
      const catTotal = Number(r[`Total_${suf}`] ?? 0);
      const newCatMax = Math.max(0, catMax - ded);
      if (newCatMax > 0) {
        // Cap at 1.0 in case bonus points (from OPPOSE bills) push total above max
        const pct = Math.min(1, catTotal / newCatMax);
        r[`Max_Possible_${suf}`] = newCatMax;
        r[`Percent_${suf}`] = pct;
        r[`Grade_${suf}`] = percentToGrade(pct);
      } else if (catTotal > 0) {
        r[`Max_Possible_${suf}`] = catTotal;
        r[`Percent_${suf}`] = 1;
        r[`Grade_${suf}`] = "A+";
      }
    }

    return r as Row;
  });

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

  return { rows: adjustedRows, columns, metaByCol, categories };
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