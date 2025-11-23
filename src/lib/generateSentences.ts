// src/lib/generateSentences.ts
// Generates shareable summary sentences based on member voting record
// Rules are loaded from public/data/graphic_sentences.csv for easy editing

import { Row } from './types';

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

    if (fields.length >= 6) {
      rules.push({
        chamber: fields[0].toUpperCase(),
        columns: fields[1].split(';').map(c => c.trim()),
        checkPositivePoints: fields[2].toLowerCase() === 'true',
        goodText: fields[3] || null,
        badText: fields[4] || null,
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
export function generateSentencesSync(row: Row, rules: Rule[], pacTotal?: number, pacTotal2026?: number): Sentence[] {
  const sentences: Sentence[] = [];
  let blockTheBombsSentence: Sentence | null = null;
  const chamber = row.chamber?.toUpperCase();

  const chamberRules = rules.filter(r => r.chamber === chamber);

  for (const rule of chamberRules) {
    const isBlockTheBombs = rule.columns.some(col => col.includes('Block the Bombs'));

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
        // Show good text
        if (rule.goodText) {
          const sentence = { text: `${rule.goodText} ${rule.ending}`, isGood: true };
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
          const wasAbsent = Number(row[absentCol] ?? 0) === 1;

          if (isCosponsorCol && value !== undefined && value !== null && value !== '') {
            // Cosponsor column with a value (0 = didn't cosponsor)
            hadOpportunity = true;
            break;
          } else if (!isCosponsorCol && !wasAbsent && value !== undefined && value !== null && value !== '') {
            // Vote/score column with a value and not absent
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
      // checkPositivePoints = false: bad action if they have positive points
      for (const col of rule.columns) {
        const value = row[col];
        if (hasPositivePoints(value)) {
          if (rule.badText) {
            sentences.push({ text: `${rule.badText} ${rule.ending}`, isGood: false });
          }
          break;
        }
      }
    }
  }

  // AIPAC/DMFI support sentence
  const rejectsAipac = row.reject_aipac_commitment && String(row.reject_aipac_commitment).trim() !== '';

  if (chamber === 'SENATE') {
    if (rejectsAipac) {
      sentences.push({ text: 'Publicly rejects AIPAC and DMFI.', isGood: true });
    } else if (pacTotal2026 && pacTotal2026 > 0) {
      sentences.push({ text: `Has already accepted $${pacTotal2026.toLocaleString()} in support from the Israel Lobby for their next election.`, isGood: false });
    } else if (pacTotal && pacTotal > 0) {
      sentences.push({ text: `Received $${pacTotal.toLocaleString()} in support from the Israel Lobby last election.`, isGood: false });
    } else {
      sentences.push({ text: 'Does not take money from AIPAC and DMFI.', isGood: true });
    }
  } else {
    if (rejectsAipac) {
      sentences.push({ text: 'Publicly rejects support from AIPAC and DMFI.', isGood: true });
    } else if (pacTotal && pacTotal > 0) {
      sentences.push({ text: `Received $${pacTotal.toLocaleString()} in support from the Israel Lobby last election.`, isGood: false });
    }
  }

  // Only include Block the Bombs if total will be less than 5
  if (blockTheBombsSentence && sentences.length < 3) {
    sentences.push(blockTheBombsSentence);
  }

  // Sort: positive sentences first, then negative
  sentences.sort((a, b) => (b.isGood ? 1 : 0) - (a.isGood ? 1 : 0));

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
export function generateSentences(row: Row, pacTotal?: number, pacTotal2026?: number): Sentence[] {
  // Fallback hardcoded rules for when CSV isn't loaded
  const FALLBACK_RULES: Rule[] = [
    { chamber: 'HOUSE', columns: ['H.Con.Res.38 — Iran War Powers Resolution (Preferred)_cosponsor', 'H.Con.Res.40 — Iran War Powers Resolution_cosponsor'], checkPositivePoints: true, goodText: 'Supports', badText: 'Has not sponsored', ending: 'war power resolution AGAINST war with Iran.' },
    { chamber: 'HOUSE', columns: ['H.R.1422 — Enhanced Iran Sanctions Act_cosponsor'], checkPositivePoints: false, goodText: null, badText: 'Supports', ending: "AIPAC's bill to impose more broad sanctions on Iranians." },
    { chamber: 'HOUSE', columns: ['H.Res.166 — MEK Bill_cosponsor'], checkPositivePoints: false, goodText: null, badText: 'Sponsored', ending: 'the MEK bill.' },
    { chamber: 'HOUSE', columns: ['H_R_2619_Travel_to_Iran_Amendment'], checkPositivePoints: true, goodText: 'Voted to prevent a ban on', badText: 'Voted in committee to ban', ending: 'U.S. travel to Iran.' },
    { chamber: 'HOUSE', columns: ['H.R.2619 — Travel to Iran Ban_cosponsor'], checkPositivePoints: false, goodText: null, badText: 'Sponsored legislation to ban', ending: 'U.S. travel to Iran.' },
    { chamber: 'HOUSE', columns: ['H.R.23 — Sanctions Against ICC'], checkPositivePoints: true, goodText: null, badText: 'Voted for', ending: 'sanctions on the International Criminal Court over its prosecution of Netanyahu.' },
    { chamber: 'HOUSE', columns: ['H.R.3565 — Block the Bombs Act_cosponsor'], checkPositivePoints: true, goodText: 'Sponsored', badText: 'Has not sponsored', ending: 'the Block the Bombs Act to prevent US weapons going to Israel to commit human right violations.' },
    { chamber: 'SENATE', columns: ['S.J.Res.59 — Iran War Powers Resolution'], checkPositivePoints: true, goodText: 'Voted in favor of', badText: 'Voted against', ending: 'Iran war powers resolution to make clear there is no authorization for U.S. war on Iran.' },
    { chamber: 'SENATE', columns: ['S.556 — Enhanced Iran Sanctions Act_cosponsor'], checkPositivePoints: false, goodText: null, badText: 'Supports', ending: "AIPAC's bill to impose more broad sanctions on Iranians." },
    { chamber: 'SENATE', columns: ['H.R.23 — Sanctions Against ICC'], checkPositivePoints: true, goodText: null, badText: 'Voted for', ending: 'sanctions on the International Criminal Court over its prosecution of Netanyahu.' },
    { chamber: 'SENATE', columns: ['S.J.Res.41 — Blocking Weapons to Israel (JRD 4)'], checkPositivePoints: true, goodText: 'Supports', badText: 'Opposes', ending: 'restricting US weapons transfers to Israel.' },
  ];

  return generateSentencesSync(row, cachedRules || FALLBACK_RULES, pacTotal, pacTotal2026);
}
