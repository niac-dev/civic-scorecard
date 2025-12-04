// src/lib/generateSentences.ts
// Generates shareable summary sentences based on member voting record
// Rules are loaded from public/data/graphic_sentences.csv for easy editing

import { Row, Meta } from './types';

export type Sentence = {
  text: string;
  isGood: boolean;
};

type Rule = {
  chamber: string;
  columns: string[];
  checkPositivePoints: boolean;
  goodText: string | null;
  badText: string | null;
  sponsorText: string | null;
  ending: string;
};

// Cache for loaded rules
let cachedRules: Rule[] | null = null;

// Parse CSV content into rules
function parseRulesCSV(csvContent: string): Rule[] {
  const lines = csvContent.trim().split('\n');
  const rules: Rule[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse CSV with quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    if (fields.length >= 7) {
      rules.push({
        chamber: fields[0].toUpperCase(),
        columns: fields[1].split(';').map(c => c.trim()),
        checkPositivePoints: fields[2].toLowerCase() === 'true',
        goodText: fields[3] || null,
        badText: fields[4] || null,
        sponsorText: fields[5] || null,
        ending: fields[6],
      });
    } else if (fields.length >= 6) {
      // Backwards compatibility for old format without sponsorText
      rules.push({
        chamber: fields[0].toUpperCase(),
        columns: fields[1].split(';').map(c => c.trim()),
        checkPositivePoints: fields[2].toLowerCase() === 'true',
        goodText: fields[3] || null,
        badText: fields[4] || null,
        sponsorText: null,
        ending: fields[5],
      });
    }
  }

  return rules;
}

// Load rules from CSV (no caching in dev for easy updates)
export async function loadSentenceRules(): Promise<Rule[]> {
  try {
    // Add cache buster to force fresh load
    const cacheBuster = process.env.NODE_ENV === 'development' ? `?t=${Date.now()}` : '';
    const response = await fetch(`/data/graphic_sentences.csv${cacheBuster}`);
    if (!response.ok) throw new Error('Failed to load CSV');
    const csvContent = await response.text();
    cachedRules = parseRulesCSV(csvContent);
    return cachedRules;
  } catch (error) {
    console.error('Error loading sentence rules:', error);
    return [];
  }
}

// Synchronous version using pre-loaded rules
// pacDataLoaded: true if PAC data has been loaded (to distinguish from "no PAC data" vs "not loaded yet")
// metaByCol: optional map of column metadata to detect sponsors
export function generateSentencesSync(row: Row, rules: Rule[], pacTotal?: number, pacTotal2026?: number, hasAnyPacMoney?: boolean, hasLobbySupport?: boolean, pacDataLoaded?: boolean, aipacSupport?: boolean, dmfiSupport?: boolean, metaByCol?: Map<string, Meta>): Sentence[] {
  const sentences: Sentence[] = [];
  let blockTheBombsSentence: Sentence | null = null;
  const chamber = row.chamber?.toUpperCase();
  const memberBioguide = row.bioguide_id;

  const chamberRules = rules.filter(r => r.chamber === chamber);

  // Helper to check if member is sponsor of any column in the rule
  const isSponsorOfRule = (rule: Rule): boolean => {
    if (!metaByCol || !memberBioguide) return false;
    for (const col of rule.columns) {
      // Remove _cosponsor suffix to get base column name
      const baseCol = col.replace(/_cosponsor$/, '');
      const meta = metaByCol.get(baseCol);
      if (meta?.sponsor_bioguide_id === memberBioguide) {
        return true;
      }
    }
    return false;
  };

  for (const rule of chamberRules) {
    const isBlockTheBombs = rule.columns.some(col => col.includes('Block the Bombs'));
    const isSponsor = isSponsorOfRule(rule);

    if (rule.checkPositivePoints) {
      // First pass: check ALL columns for any positive points
      let foundPositive = false;
      for (const col of rule.columns) {
        const value = row[col];
        if (hasPositivePoints(value)) {
          foundPositive = true;
          break;
        }
      }

      if (foundPositive) {
        // Show good text (or sponsor text if applicable)
        const textToUse = (isSponsor && rule.sponsorText) ? rule.sponsorText : rule.goodText;
        if (textToUse) {
          const sentence = { text: `${textToUse} ${rule.ending}`, isGood: true };
          if (isBlockTheBombs) {
            blockTheBombsSentence = sentence;
          } else {
            sentences.push(sentence);
          }
        }
      } else {
        // Second pass: check if they had opportunity to act (has value or cosponsor column exists)
        let hadOpportunity = false;
        for (const col of rule.columns) {
          const value = row[col];
          const isCosponsorCol = col.includes('_cosponsor');
          const absentCol = `${col}_absent`;
          const notInOfficeCol = `${col}_not_in_office`;
          const wasAbsent = Number(row[absentCol] ?? 0) === 1;
          const wasNotInOffice = Number(row[notInOfficeCol] ?? 0) === 1;

          if (isCosponsorCol && value !== undefined && value !== null && value !== '') {
            // Cosponsor column with a value (0 = didn't cosponsor)
            hadOpportunity = true;
            break;
          } else if (!isCosponsorCol && !wasAbsent && !wasNotInOffice && value !== undefined && value !== null && value !== '') {
            // Vote/score column with a value, not absent, and was in office
            hadOpportunity = true;
            break;
          }
        }

        if (hadOpportunity && rule.badText) {
          const sentence = { text: `${rule.badText} ${rule.ending}`, isGood: false };
          if (isBlockTheBombs) {
            blockTheBombsSentence = sentence;
          } else {
            sentences.push(sentence);
          }
        }
      }
    } else {
      // checkPositivePoints = false: bad action if they cosponsored (or are sponsor)
      // Only check _cosponsor columns for positive points (1.0 = cosponsored)
      // Main column has 1.0 for non-cosponsors (reward) which we should ignore
      let didCosponsor = false;
      for (const col of rule.columns) {
        if (col.endsWith('_cosponsor')) {
          const value = row[col];
          if (hasPositivePoints(value)) {
            didCosponsor = true;
            break;
          }
        }
      }

      if (didCosponsor || isSponsor) {
        // They cosponsored or sponsored the bad bill
        const textToUse = (isSponsor && rule.sponsorText) ? rule.sponsorText : rule.badText;
        if (textToUse) {
          sentences.push({ text: `${textToUse} ${rule.ending}`, isGood: false });
        }
      }
    }
  }

  // Only include Block the Bombs if total will be less than 4 (before AIPAC sentence)
  if (blockTheBombsSentence && sentences.length < 3) {
    sentences.push(blockTheBombsSentence);
  }

  // Sort: positive sentences first, then negative
  sentences.sort((a, b) => (b.isGood ? 1 : 0) - (a.isGood ? 1 : 0));

  // AIPAC/DMFI support sentence - added LAST after sorting
  const rejectsAipac = row.reject_aipac_commitment && String(row.reject_aipac_commitment).trim() !== '';

  // Check specific support flags
  const aipacSupported = Boolean(aipacSupport);
  const dmfiSupported = Boolean(dmfiSupport);

  if (rejectsAipac) {
    sentences.push({ text: 'Publicly rejects support from AIPAC and DMFI.', isGood: true });
  } else if (aipacSupported && dmfiSupported) {
    sentences.push({ text: 'Supported by AIPAC and Democratic Majority For Israel.', isGood: false });
  } else if (aipacSupported) {
    sentences.push({ text: 'Supported by AIPAC.', isGood: false });
  } else if (dmfiSupported) {
    sentences.push({ text: 'Supported by Democratic Majority For Israel.', isGood: false });
  } else if (pacDataLoaded && !hasLobbySupport && !hasAnyPacMoney) {
    // No support flags AND no PAC money at all - show positive message (only if PAC data has loaded)
    sentences.push({ text: 'Not supported by AIPAC or DMFI.', isGood: true });
  }

  return sentences;
}

function hasPositivePoints(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return !isNaN(num) && num > 0;
}

function hasNegativePoints(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return !isNaN(num) && num < 0;
}

function hasAnyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  // Check if it's a non-zero number
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (!isNaN(num)) return num !== 0;
  // Non-empty string
  return String(value).trim() !== '';
}

// Backwards-compatible wrapper that uses hardcoded fallback rules
// For best results, use loadSentenceRules() + generateSentencesSync()
export function generateSentences(row: Row, pacTotal?: number, pacTotal2026?: number, hasAnyPacMoney?: boolean, hasLobbySupport?: boolean, pacDataLoaded?: boolean, aipacSupport?: boolean, dmfiSupport?: boolean, metaByCol?: Map<string, Meta>): Sentence[] {
  // Fallback hardcoded rules for when CSV isn't loaded
  const FALLBACK_RULES: Rule[] = [
    { chamber: 'HOUSE', columns: ['H.Con.Res.38 — Iran War Powers Resolution (Preferred)_cosponsor', 'H.Con.Res.40 — Iran War Powers Resolution_cosponsor'], checkPositivePoints: true, goodText: 'Supports', badText: 'Has not sponsored', sponsorText: 'Introduced', ending: 'war power resolution AGAINST war with Iran.' },
    { chamber: 'HOUSE', columns: ['H.R.1422 — Enhanced Iran Sanctions Act_cosponsor', 'H.R.1422 — Enhanced Iran Sanctions Act'], checkPositivePoints: false, goodText: null, badText: 'Supports', sponsorText: 'Introduced', ending: "AIPAC's bill to impose more broad sanctions on Iranians." },
    { chamber: 'HOUSE', columns: ['H.Res.166 — MEK Bill_cosponsor', 'H.Res.166 — MEK Bill'], checkPositivePoints: false, goodText: null, badText: 'Sponsored', sponsorText: 'Introduced', ending: 'the MEK bill.' },
    { chamber: 'HOUSE', columns: ['H_R_2619_Travel_to_Iran_Amendment'], checkPositivePoints: true, goodText: 'Voted to prevent a ban on', badText: 'Voted in committee to ban', sponsorText: null, ending: 'U.S. travel to Iran.' },
    { chamber: 'HOUSE', columns: ['H.R.2619 — Travel to Iran Ban_cosponsor', 'H.R.2619 — Travel to Iran Ban'], checkPositivePoints: false, goodText: null, badText: 'Sponsored legislation to ban', sponsorText: 'Introduced bill to ban', ending: 'U.S. travel to Iran.' },
    { chamber: 'HOUSE', columns: ['H.R.23 — Sanctions Against ICC'], checkPositivePoints: true, goodText: null, badText: 'Voted for', sponsorText: null, ending: 'sanctions on the International Criminal Court over its prosecution of Netanyahu.' },
    { chamber: 'HOUSE', columns: ['H.R.3565 — Block the Bombs Act', 'H.R.3565 — Block the Bombs Act_cosponsor'], checkPositivePoints: true, goodText: 'Supports', badText: 'Has not sponsored', sponsorText: 'Introduced', ending: 'the Block the Bombs Act to prevent US weapons going to Israel to commit human right violations.' },
    { chamber: 'SENATE', columns: ['S.J.Res.59 — Iran War Powers Resolution'], checkPositivePoints: true, goodText: 'Voted in favor of', badText: 'Voted against', sponsorText: null, ending: 'Iran war powers resolution to make clear there is no authorization for U.S. war on Iran.' },
    { chamber: 'SENATE', columns: ['S.556 — Enhanced Iran Sanctions Act_cosponsor', 'S.556 — Enhanced Iran Sanctions Act'], checkPositivePoints: false, goodText: null, badText: 'Supports', sponsorText: 'Introduced', ending: "AIPAC's bill to impose more broad sanctions on Iranians." },
    { chamber: 'SENATE', columns: ['H.R.23 — Sanctions Against ICC'], checkPositivePoints: true, goodText: null, badText: 'Voted for', sponsorText: null, ending: 'sanctions on the International Criminal Court over its prosecution of Netanyahu.' },
    { chamber: 'SENATE', columns: ['S.J.Res.41 — Blocking Weapons to Israel (JRD 4)'], checkPositivePoints: true, goodText: 'Supports', badText: 'Opposes', sponsorText: null, ending: 'restricting US weapons transfers to Israel.' },
  ];

  return generateSentencesSync(row, cachedRules || FALLBACK_RULES, pacTotal, pacTotal2026, hasAnyPacMoney, hasLobbySupport, pacDataLoaded, aipacSupport, dmfiSupport, metaByCol);
}
