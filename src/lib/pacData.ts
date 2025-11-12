// src/lib/pacData.ts
import Papa from "papaparse";

export interface PacData {
  bioguide_id: string;
  full_name: string;
  aipac_featured: number;
  dmfi_website: number;
  dmfi_actblue_url: string;
  // 2022 data
  aipac_direct_amount_2022: number;
  aipac_earmark_amount_2022: number;
  aipac_ie_support_2022: number;
  aipac_ie_against_opp_2022: number;
  aipac_ie_total_2022: number;
  aipac_total_2022: number;
  dmfi_direct_2022: number;
  dmfi_earmark_2022: number;
  dmfi_ie_support_2022: number;
  dmfi_ie_against_opp_2022: number;
  dmfi_ie_total_2022: number;
  dmfi_total_2022: number;
  aipac_supported_2022: number;
  dmfi_supported_2022: number;
  // 2024 data
  aipac_direct_amount_2024: number;
  aipac_earmark_amount_2024: number;
  aipac_ie_support_2024: number;
  aipac_ie_against_opp_2024: number;
  aipac_ie_total_2024: number;
  aipac_total_2024: number;
  dmfi_direct_2024: number;
  dmfi_earmark_2024: number;
  dmfi_ie_support_2024: number;
  dmfi_ie_against_opp_2024: number;
  dmfi_ie_total_2024: number;
  dmfi_total_2024: number;
  aipac_supported_2024: number;
  dmfi_supported_2024: number;
  // 2026 data
  aipac_direct_amount_2026: number;
  aipac_earmark_amount_2026: number;
  aipac_ie_support_2026: number;
  aipac_ie_against_opp_2026: number;
  aipac_ie_total_2026: number;
  aipac_total_2026: number;
  dmfi_direct_2026: number;
  dmfi_earmark_2026: number;
  dmfi_ie_support_2026: number;
  dmfi_ie_against_opp_2026: number;
  dmfi_ie_total_2026: number;
  dmfi_total_2026: number;
  aipac_supported_2026: number;
  dmfi_supported_2026: number;
}

export async function loadPacData(): Promise<Map<string, PacData>> {
  const response = await fetch('/data/pac_data.csv');
  const text = await response.text();

  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const map = new Map<string, PacData>();

        results.data.forEach((row) => {
          const bioguide_id = row.bioguide_id;
          if (!bioguide_id) return;

          map.set(bioguide_id, {
            bioguide_id,
            full_name: row.full_name || '',
            aipac_featured: parseFloat(row.aipac_featured) || 0,
            dmfi_website: parseFloat(row.dmfi_website) || 0,
            dmfi_actblue_url: row.dmfi_actblue_url || '',
            // 2022 data
            aipac_direct_amount_2022: parseFloat(row.aipac_direct_amount_2022) || 0,
            aipac_earmark_amount_2022: parseFloat(row.aipac_earmark_amount_2022) || 0,
            aipac_ie_support_2022: parseFloat(row.aipac_ie_support_2022) || 0,
            aipac_ie_against_opp_2022: parseFloat(row.aipac_ie_against_opp_2022) || 0,
            aipac_ie_total_2022: parseFloat(row.aipac_ie_total_2022) || 0,
            aipac_total_2022: parseFloat(row.aipac_total_2022) || 0,
            dmfi_direct_2022: parseFloat(row.dmfi_direct_2022) || 0,
            dmfi_earmark_2022: parseFloat(row.dmfi_earmark_2022) || 0,
            dmfi_ie_support_2022: parseFloat(row.dmfi_ie_support_2022) || 0,
            dmfi_ie_against_opp_2022: parseFloat(row.dmfi_ie_against_opp_2022) || 0,
            dmfi_ie_total_2022: parseFloat(row.dmfi_ie_total_2022) || 0,
            dmfi_total_2022: parseFloat(row.dmfi_total_2022) || 0,
            aipac_supported_2022: parseFloat(row.aipac_supported_2022) || 0,
            dmfi_supported_2022: parseFloat(row.dmfi_supported_2022) || 0,
            // 2024 data
            aipac_direct_amount_2024: parseFloat(row.aipac_direct_amount_2024) || 0,
            aipac_earmark_amount_2024: parseFloat(row.aipac_earmark_amount_2024) || 0,
            aipac_ie_support_2024: parseFloat(row.aipac_ie_support_2024) || 0,
            aipac_ie_against_opp_2024: parseFloat(row.aipac_ie_against_opp_2024) || 0,
            aipac_ie_total_2024: parseFloat(row.aipac_ie_total_2024) || 0,
            aipac_total_2024: parseFloat(row.aipac_total_2024) || 0,
            dmfi_direct_2024: parseFloat(row.dmfi_direct_2024) || 0,
            dmfi_earmark_2024: parseFloat(row.dmfi_earmark_2024) || 0,
            dmfi_ie_support_2024: parseFloat(row.dmfi_ie_support_2024) || 0,
            dmfi_ie_against_opp_2024: parseFloat(row.dmfi_ie_against_opp_2024) || 0,
            dmfi_ie_total_2024: parseFloat(row.dmfi_ie_total_2024) || 0,
            dmfi_total_2024: parseFloat(row.dmfi_total_2024) || 0,
            aipac_supported_2024: parseFloat(row.aipac_supported_2024) || 0,
            dmfi_supported_2024: parseFloat(row.dmfi_supported_2024) || 0,
            // 2026 data
            aipac_direct_amount_2026: parseFloat(row.aipac_direct_amount_2026) || 0,
            aipac_earmark_amount_2026: parseFloat(row.aipac_earmark_amount_2026) || 0,
            aipac_ie_support_2026: parseFloat(row.aipac_ie_support_2026) || 0,
            aipac_ie_against_opp_2026: parseFloat(row.aipac_ie_against_opp_2026) || 0,
            aipac_ie_total_2026: parseFloat(row.aipac_ie_total_2026) || 0,
            aipac_total_2026: parseFloat(row.aipac_total_2026) || 0,
            dmfi_direct_2026: parseFloat(row.dmfi_direct_2026) || 0,
            dmfi_earmark_2026: parseFloat(row.dmfi_earmark_2026) || 0,
            dmfi_ie_support_2026: parseFloat(row.dmfi_ie_support_2026) || 0,
            dmfi_ie_against_opp_2026: parseFloat(row.dmfi_ie_against_opp_2026) || 0,
            dmfi_ie_total_2026: parseFloat(row.dmfi_ie_total_2026) || 0,
            dmfi_total_2026: parseFloat(row.dmfi_total_2026) || 0,
            aipac_supported_2026: parseFloat(row.aipac_supported_2026) || 0,
            dmfi_supported_2026: parseFloat(row.dmfi_supported_2026) || 0,
          });
        });

        resolve(map);
      },
    });
  });
}

export function isAipacEndorsed(pacData: PacData | undefined, aipacSupportedFlag?: string | number | boolean): boolean {
  if (!pacData) return false;

  // Use the flag from scores_wide.csv if provided, otherwise check pac_data supported flags
  let isSupported = false;
  if (aipacSupportedFlag !== undefined) {
    // Flag from scores_wide.csv (primary source of truth)
    isSupported = Number(aipacSupportedFlag) === 1 || aipacSupportedFlag === true || aipacSupportedFlag === '1';
  } else {
    // Fallback to pac_data.csv flags (for backward compatibility)
    isSupported = pacData.aipac_supported_2022 === 1 || pacData.aipac_supported_2024 === 1 || pacData.aipac_supported_2026 === 1;
  }

  // If not supported, return false regardless of donation data
  if (!isSupported) return false;

  // Check if there's actual support data in any cycle
  return (
    pacData.aipac_featured === 1 ||
    // 2022 cycle
    pacData.aipac_direct_amount_2022 > 0 ||
    pacData.aipac_earmark_amount_2022 > 0 ||
    pacData.aipac_ie_support_2022 > 0 ||
    // 2024 cycle
    pacData.aipac_direct_amount_2024 > 0 ||
    pacData.aipac_earmark_amount_2024 > 0 ||
    pacData.aipac_ie_support_2024 > 0 ||
    // 2026 cycle
    pacData.aipac_direct_amount_2026 > 0 ||
    pacData.aipac_earmark_amount_2026 > 0 ||
    pacData.aipac_ie_support_2026 > 0
  );
}

export function isDmfiEndorsed(pacData: PacData | undefined, dmfiSupportedFlag?: string | number | boolean): boolean {
  if (!pacData) return false;

  // Use the flag from scores_wide.csv if provided, otherwise check pac_data supported flags
  let isSupported = false;
  if (dmfiSupportedFlag !== undefined) {
    // Flag from scores_wide.csv (primary source of truth)
    isSupported = Number(dmfiSupportedFlag) === 1 || dmfiSupportedFlag === true || dmfiSupportedFlag === '1';
  } else {
    // Fallback to pac_data.csv flags (for backward compatibility)
    isSupported = pacData.dmfi_supported_2022 === 1 || pacData.dmfi_supported_2024 === 1 || pacData.dmfi_supported_2026 === 1;
  }

  // If not supported, return false regardless of donation data
  if (!isSupported) return false;

  // Check if there's actual financial support data in any cycle
  // Being on the website alone is not enough - there must be actual financial support
  return (
    // 2022 cycle
    pacData.dmfi_direct_2022 > 0 ||
    pacData.dmfi_ie_support_2022 > 0 ||
    // 2024 cycle
    pacData.dmfi_direct_2024 > 0 ||
    pacData.dmfi_ie_support_2024 > 0 ||
    // 2026 cycle
    pacData.dmfi_direct_2026 > 0 ||
    pacData.dmfi_ie_support_2026 > 0
  );
}
