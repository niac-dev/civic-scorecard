// src/lib/pacData.ts
import Papa from "papaparse";

export interface PacData {
  bioguide_id: string;
  full_name: string;
  // 2024 data
  aipac_featured: number;
  aipac_direct_amount: number;
  aipac_earmark_amount: number;
  aipac_ie_support: number;
  aipac_ie_total: number;
  aipac_total: number;
  dmfi_website: number;
  dmfi_direct: number;
  dmfi_ie_support: number;
  dmfi_ie_total: number;
  dmfi_total: number;
  // 2025 data
  aipac_direct_amount_2025: number;
  aipac_earmark_amount_2025: number;
  aipac_ie_support_2025: number;
  aipac_ie_total_2025: number;
  aipac_total_2025: number;
  aipac_supported_2025: number;
  dmfi_direct_2025: number;
  dmfi_total_2025: number;
  dmfi_supported_2025: number;
  // 2022 data
  aipac_direct_amount_2022: number;
  aipac_earmark_amount_2022: number;
  aipac_ie_support_2022: number;
  aipac_ie_total_2022: number;
  aipac_total_2022: number;
  dmfi_direct_2022: number;
  dmfi_ie_support_2022: number;
  dmfi_ie_total_2022: number;
  dmfi_total_2022: number;
}

export async function loadPacData(): Promise<Map<string, PacData>> {
  const [response2024, response2025, response2022] = await Promise.all([
    fetch('/data/pac_data.csv'),
    fetch('/data/pac_data_2025.csv'),
    fetch('/data/pac_data_2022.csv')
  ]);
  const [text2024, text2025, text2022] = await Promise.all([
    response2024.text(),
    response2025.text(),
    response2022.text()
  ]);

  return new Promise((resolve) => {
    // First parse 2024 data
    Papa.parse<Record<string, string>>(text2024, {
      header: true,
      skipEmptyLines: true,
      complete: (results2024) => {
        const map = new Map<string, PacData>();

        // Load 2024 data
        results2024.data.forEach((row) => {
          const bioguide_id = row.bioguide_id;
          if (!bioguide_id) return;

          map.set(bioguide_id, {
            bioguide_id,
            full_name: row.full_name || '',
            aipac_featured: parseFloat(row.aipac_featured) || 0,
            aipac_direct_amount: parseFloat(row.aipac_direct_amount) || 0,
            aipac_earmark_amount: parseFloat(row.aipac_earmark_amount) || 0,
            aipac_ie_support: parseFloat(row.aipac_ie_support) || 0,
            aipac_ie_total: parseFloat(row.aipac_ie_total) || 0,
            aipac_total: parseFloat(row.aipac_total) || 0,
            dmfi_website: parseFloat(row.dmfi_website) || 0,
            dmfi_direct: parseFloat(row.dmfi_direct) || 0,
            dmfi_ie_support: parseFloat(row.dmfi_ie_support) || 0,
            dmfi_ie_total: parseFloat(row.dmfi_ie_total) || 0,
            dmfi_total: parseFloat(row.dmfi_total) || 0,
            // Initialize 2025 data as 0
            aipac_direct_amount_2025: 0,
            aipac_earmark_amount_2025: 0,
            aipac_ie_support_2025: 0,
            aipac_ie_total_2025: 0,
            aipac_total_2025: 0,
            aipac_supported_2025: 0,
            dmfi_direct_2025: 0,
            dmfi_total_2025: 0,
            dmfi_supported_2025: 0,
            // Initialize 2022 data as 0
            aipac_direct_amount_2022: 0,
            aipac_earmark_amount_2022: 0,
            aipac_ie_support_2022: 0,
            aipac_ie_total_2022: 0,
            aipac_total_2022: 0,
            dmfi_direct_2022: 0,
            dmfi_ie_support_2022: 0,
            dmfi_ie_total_2022: 0,
            dmfi_total_2022: 0,
          });
        });

        // Parse 2025 data and merge
        Papa.parse<Record<string, string>>(text2025, {
          header: true,
          skipEmptyLines: true,
          complete: (results2025) => {
            results2025.data.forEach((row) => {
              const bioguide_id = row.bioguide_id;
              if (!bioguide_id) return;

              const existing = map.get(bioguide_id);
              if (existing) {
                existing.aipac_direct_amount_2025 = parseFloat(row.aipac_direct_amount) || 0;
                existing.aipac_earmark_amount_2025 = parseFloat(row.aipac_earmark_amount) || 0;
                existing.aipac_ie_support_2025 = parseFloat(row.aipac_ie_support) || 0;
                existing.aipac_ie_total_2025 = parseFloat(row.aipac_ie_total) || 0;
                existing.aipac_total_2025 = parseFloat(row.aipac_total) || 0;
                existing.aipac_supported_2025 = parseFloat(row.aipac_supported) || 0;
                existing.dmfi_direct_2025 = parseFloat(row.dmfi_direct) || 0;
                existing.dmfi_total_2025 = parseFloat(row.dmfi_total) || 0;
                existing.dmfi_supported_2025 = parseFloat(row.dmfi_supported) || 0;
              } else {
                // Create new entry if not in 2024 data
                map.set(bioguide_id, {
                  bioguide_id,
                  full_name: row.full_name || '',
                  aipac_featured: 0,
                  aipac_direct_amount: 0,
                  aipac_earmark_amount: 0,
                  aipac_ie_support: 0,
                  aipac_ie_total: 0,
                  aipac_total: 0,
                  dmfi_website: 0,
                  dmfi_direct: 0,
                  dmfi_ie_support: 0,
                  dmfi_ie_total: 0,
                  dmfi_total: 0,
                  aipac_direct_amount_2025: parseFloat(row.aipac_direct_amount) || 0,
                  aipac_earmark_amount_2025: parseFloat(row.aipac_earmark_amount) || 0,
                  aipac_ie_support_2025: parseFloat(row.aipac_ie_support) || 0,
                  aipac_ie_total_2025: parseFloat(row.aipac_ie_total) || 0,
                  aipac_total_2025: parseFloat(row.aipac_total) || 0,
                  aipac_supported_2025: parseFloat(row.aipac_supported) || 0,
                  dmfi_direct_2025: parseFloat(row.dmfi_direct) || 0,
                  dmfi_total_2025: parseFloat(row.dmfi_total) || 0,
                  dmfi_supported_2025: parseFloat(row.dmfi_supported) || 0,
                  aipac_direct_amount_2022: 0,
                  aipac_earmark_amount_2022: 0,
                  aipac_ie_support_2022: 0,
                  aipac_ie_total_2022: 0,
                  aipac_total_2022: 0,
                  dmfi_direct_2022: 0,
                  dmfi_ie_support_2022: 0,
                  dmfi_ie_total_2022: 0,
                  dmfi_total_2022: 0,
                });
              }
            });

            // Parse 2022 data and merge
            Papa.parse<Record<string, string>>(text2022, {
              header: true,
              skipEmptyLines: true,
              complete: (results2022) => {
                results2022.data.forEach((row) => {
                  const bioguide_id = row.bioguide_id;
                  if (!bioguide_id) return;

                  const existing = map.get(bioguide_id);
                  if (existing) {
                    existing.aipac_direct_amount_2022 = parseFloat(row.aipac_direct_amount) || 0;
                    existing.aipac_earmark_amount_2022 = parseFloat(row.aipac_earmark_amount) || 0;
                    existing.aipac_ie_support_2022 = parseFloat(row.aipac_ie_support) || 0;
                    existing.aipac_ie_total_2022 = parseFloat(row.aipac_ie_total) || 0;
                    existing.aipac_total_2022 = parseFloat(row.aipac_total) || 0;
                    existing.dmfi_direct_2022 = parseFloat(row.dmfi_direct) || 0;
                    existing.dmfi_ie_support_2022 = parseFloat(row.dmfi_ie_support) || 0;
                    existing.dmfi_ie_total_2022 = parseFloat(row.dmfi_ie_total) || 0;
                    existing.dmfi_total_2022 = parseFloat(row.dmfi_total) || 0;
                  } else {
                    // Create new entry if not in 2024/2025 data
                    map.set(bioguide_id, {
                      bioguide_id,
                      full_name: row.full_name || '',
                      aipac_featured: 0,
                      aipac_direct_amount: 0,
                      aipac_earmark_amount: 0,
                      aipac_ie_support: 0,
                      aipac_ie_total: 0,
                      aipac_total: 0,
                      dmfi_website: 0,
                      dmfi_direct: 0,
                      dmfi_ie_support: 0,
                      dmfi_ie_total: 0,
                      dmfi_total: 0,
                      aipac_direct_amount_2025: 0,
                      aipac_earmark_amount_2025: 0,
                      aipac_ie_support_2025: 0,
                      aipac_ie_total_2025: 0,
                      aipac_total_2025: 0,
                      aipac_supported_2025: 0,
                      dmfi_direct_2025: 0,
                      dmfi_total_2025: 0,
                      dmfi_supported_2025: 0,
                      aipac_direct_amount_2022: parseFloat(row.aipac_direct_amount) || 0,
                      aipac_earmark_amount_2022: parseFloat(row.aipac_earmark_amount) || 0,
                      aipac_ie_support_2022: parseFloat(row.aipac_ie_support) || 0,
                      aipac_ie_total_2022: parseFloat(row.aipac_ie_total) || 0,
                      aipac_total_2022: parseFloat(row.aipac_total) || 0,
                      dmfi_direct_2022: parseFloat(row.dmfi_direct) || 0,
                      dmfi_ie_support_2022: parseFloat(row.dmfi_ie_support) || 0,
                      dmfi_ie_total_2022: parseFloat(row.dmfi_ie_total) || 0,
                      dmfi_total_2022: parseFloat(row.dmfi_total) || 0,
                    });
                  }
                });

                resolve(map);
              },
            });
          },
        });
      },
    });
  });
}

export function isAipacEndorsed(pacData: PacData | undefined): boolean {
  if (!pacData) return false;
  return (
    pacData.aipac_featured === 1 ||
    // 2024 cycle
    pacData.aipac_direct_amount > 0 ||
    pacData.aipac_earmark_amount > 0 ||
    pacData.aipac_ie_support > 0 ||
    // 2025 cycle
    pacData.aipac_direct_amount_2025 > 0 ||
    pacData.aipac_earmark_amount_2025 > 0 ||
    pacData.aipac_ie_support_2025 > 0 ||
    // 2022 cycle
    pacData.aipac_direct_amount_2022 > 0 ||
    pacData.aipac_earmark_amount_2022 > 0 ||
    pacData.aipac_ie_support_2022 > 0
  );
}

export function isDmfiEndorsed(pacData: PacData | undefined): boolean {
  if (!pacData) return false;

  // If DMFI has actual financial support in any cycle, return true
  return (
    // 2024 cycle
    pacData.dmfi_direct > 0 || pacData.dmfi_ie_support > 0 ||
    // 2025 cycle
    pacData.dmfi_direct_2025 > 0 || pacData.dmfi_total_2025 > 0 ||
    // 2022 cycle
    pacData.dmfi_direct_2022 > 0 || pacData.dmfi_ie_support_2022 > 0 ||
    // Listed on DMFI website
    pacData.dmfi_website === 1
  );
}
