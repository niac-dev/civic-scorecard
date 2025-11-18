"use client";

import { useEffect, useRef, useState, memo, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Row, Meta } from '@/lib/types';
import type { PacData } from '@/lib/pacData';
import { GRADE_COLORS, extractVoteInfo, inferChamber, stateCodeOf } from '@/lib/utils';

// State FIPS mapping
const stateToFips: Record<string, string> = {
  'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
  'CO': '08', 'CT': '09', 'DE': '10', 'DC': '11', 'FL': '12',
  'GA': '13', 'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18',
  'IA': '19', 'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23',
  'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28',
  'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33',
  'NJ': '34', 'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38',
  'OH': '39', 'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44',
  'SC': '45', 'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49',
  'VT': '50', 'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55',
  'WY': '56', 'AS': '60', 'GU': '66', 'MP': '69', 'PR': '72',
  'VI': '78'
};

const stateNameMapping: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
  'DC': 'District of Columbia'
};

interface DistrictMapProps {
  members: Row[];
  onMemberClick?: (member: Row) => void;
  onStateClick?: (stateCode: string) => void;
  chamber?: string; // "HOUSE" or "SENATE"
  selectedBillColumn?: string;
  metaByCol?: Map<string, Meta>;
  allRows?: Row[];
  onBillMapClick?: (stateCode: string) => void; // Called when clicking on map with bill selected
}

function DistrictMap({ members, onMemberClick, onStateClick, chamber, selectedBillColumn, metaByCol, allRows, onBillMapClick }: DistrictMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const tooltipDiv = useRef<HTMLDivElement>(null);
  const hoveredFeatureId = useRef<string | number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastEffectiveChamber = useRef<'HOUSE' | 'SENATE' | null>(null);
  const districtMembersRef = useRef<Record<string, Row | Row[]>>({});
  const districtGradesRef = useRef<Record<string, string>>({});

  // Use refs to always have latest callbacks and data (avoids stale closures in map event handlers)
  const onBillMapClickRef = useRef(onBillMapClick);
  const selectedBillColumnRef = useRef(selectedBillColumn);

  // Load PAC data for AIPAC filtering
  const [pacDataMap, setPacDataMap] = useState<Map<string, PacData>>(new Map());

  useEffect(() => {
    import('@/lib/pacData').then(({ loadPacData }) => {
      loadPacData().then(setPacDataMap);
    });
  }, []);

  // Compute bill action data for coloring when a bill is selected
  const billActionData = useMemo(() => {
    if (!selectedBillColumn || !allRows) return null;

    // Handle AIPAC/DMFI special case
    if (selectedBillColumn === '__AIPAC__') {
      const districtActions: Record<string, 'good' | 'bad'> = {};
      const stateActions: Record<string, { good: number; bad: number }> = {};
      let houseGood = 0;
      let houseBad = 0;
      let senateBothGood = 0;
      let senateSplit = 0;
      let senateBothBad = 0;

      allRows.forEach(member => {
        const pacData = pacDataMap.get(String(member.bioguide_id));

        let hasSupport = false;

        if (pacData) {
          // Check PAC data for support flags
          const hasAipacSupport = pacData.aipac_supported_2022 === 1 || pacData.aipac_supported_2024 === 1 || pacData.aipac_supported_2026 === 1;
          const hasDmfiSupport = pacData.dmfi_supported_2022 === 1 || pacData.dmfi_supported_2024 === 1 || pacData.dmfi_supported_2026 === 1;
          hasSupport = hasAipacSupport || hasDmfiSupport;
        }
        const state = stateCodeOf(member.state);

        if (member.chamber === 'HOUSE') {
          const district = String(member.district || '00').padStart(2, '0');
          const fips = stateToFips[state];
          if (fips) {
            const key = `${fips}${district}`;
            // No support = good (green), has support = bad (red)
            districtActions[key] = hasSupport ? 'bad' : 'good';
            if (hasSupport) houseBad++; else houseGood++;
          }
        } else if (member.chamber === 'SENATE') {
          if (!stateActions[state]) {
            stateActions[state] = { good: 0, bad: 0 };
          }
          if (hasSupport) {
            stateActions[state].bad++;
          } else {
            stateActions[state].good++;
          }
        }
      });

      // Calculate Senate stats
      Object.values(stateActions).forEach(actions => {
        if (actions.good === 2) senateBothGood++;
        else if (actions.good === 1 && actions.bad === 1) senateSplit++;
        else if (actions.bad === 2) senateBothBad++;
        else if (actions.good === 1) senateBothGood++; // Only one senator, no support
        else if (actions.bad === 1) senateBothBad++; // Only one senator, has support
      });

      return {
        districtActions,
        stateActions,
        goodLabel: 'Does not receive AIPAC/DMFI support',
        badLabel: 'Receives AIPAC/DMFI support',
        goodValue: 0, // Not receiving support = good
        stats: { houseGood, houseBad, senateBothGood, senateSplit, senateBothBad },
        meta: { display_name: 'AIPAC & DMFI Support' } as Meta,
        effectiveChamber: (chamber || 'SENATE') as 'HOUSE' | 'SENATE'
      };
    }

    // Handle Partisan special case
    if (selectedBillColumn === '__PARTISAN__') {
      const districtActions: Record<string, 'good' | 'bad' | 'neutral'> = {};
      const stateActions: Record<string, { republican: number; democrat: number; other: number }> = {};
      let houseRepublican = 0;
      let houseDemocrat = 0;
      let houseOther = 0;
      let senateBothDemocrat = 0;
      let senateSplit = 0;
      let senateBothRepublican = 0;

      allRows.forEach(member => {
        const party = String(member.party || '').toLowerCase();
        const state = stateCodeOf(member.state);

        let partyType: 'republican' | 'democrat' | 'other';
        if (party === 'republican' || party === 'r') {
          partyType = 'republican';
        } else if (party === 'democratic' || party === 'democrat' || party === 'd') {
          partyType = 'democrat';
        } else {
          partyType = 'other';
        }

        if (member.chamber === 'HOUSE') {
          const district = String(member.district || '00').padStart(2, '0');
          const fips = stateToFips[state];
          if (fips) {
            const key = `${fips}${district}`;
            if (partyType === 'democrat') {
              districtActions[key] = 'good'; // Blue
              houseDemocrat++;
            } else if (partyType === 'republican') {
              districtActions[key] = 'bad'; // Red
              houseRepublican++;
            } else {
              districtActions[key] = 'neutral'; // Purple/Other
              houseOther++;
            }
          }
        } else if (member.chamber === 'SENATE') {
          if (!stateActions[state]) {
            stateActions[state] = { republican: 0, democrat: 0, other: 0 };
          }
          stateActions[state][partyType]++;
        }
      });

      // Calculate Senate stats
      Object.values(stateActions).forEach(actions => {
        if (actions.democrat === 2) senateBothDemocrat++;
        else if (actions.republican === 2) senateBothRepublican++;
        else senateSplit++; // Mixed or has independent/other
      });

      return {
        districtActions,
        stateActions,
        goodLabel: 'Democrat',
        badLabel: 'Republican',
        neutralLabel: 'Independent/Other',
        goodValue: 1,
        stats: {
          houseGood: houseDemocrat,
          houseBad: houseRepublican,
          houseNeutral: houseOther,
          senateBothGood: senateBothDemocrat,
          senateSplit,
          senateBothBad: senateBothRepublican
        },
        meta: { display_name: 'Partisan' } as Meta,
        effectiveChamber: (chamber || 'SENATE') as 'HOUSE' | 'SENATE',
        isPartisan: true
      };
    }

    // Normal bill handling
    if (!metaByCol) return null;
    const meta = metaByCol.get(selectedBillColumn);
    if (!meta) return null;

    const voteInfo = extractVoteInfo(meta);
    const position = (meta.position_to_score || '').toUpperCase();
    const isAgainst = position.includes('AGAINST') || position.includes('OPPOSE');

    // Map district/state to action
    const districtActions: Record<string, 'good' | 'bad'> = {};
    const stateActions: Record<string, { good: number; bad: number }> = {};

    // Generate labels based on action type
    let goodLabel = '';
    let badLabel = '';
    const actionTypes = (meta.action_types || '').toLowerCase();

    // Check action_types first since it's explicitly set in metadata
    if (actionTypes.includes('cosponsor')) {
      // Cosponsorship action
      goodLabel = isAgainst ? 'Has not cosponsored' : 'Cosponsored';
      badLabel = isAgainst ? 'Cosponsored' : 'Has not cosponsored';
    } else if (actionTypes.includes('vote') || voteInfo.voteResult) {
      // Vote-based action
      goodLabel = isAgainst ? 'Voted against' : 'Voted in favor';
      badLabel = isAgainst ? 'Voted in favor' : 'Voted against';
    } else if (voteInfo.dateIntroduced) {
      // Fallback to cosponsor if we have an introduced date but no explicit action type
      goodLabel = isAgainst ? 'Has not cosponsored' : 'Cosponsored';
      badLabel = isAgainst ? 'Cosponsored' : 'Has not cosponsored';
    } else {
      goodLabel = 'Good action';
      badLabel = 'Bad action';
    }

    // Check if there's a specific cosponsor column for more accurate counting
    // Only use _cosponsor column for SUPPORT bills (to get accurate cosponsor counts)
    // For OPPOSE bills, use the main score column (which includes sponsors + cosponsors)
    const cosponsorColumn = (actionTypes.includes('cosponsor') && !isAgainst) ? `${selectedBillColumn}_cosponsor` : null;

    // Determine what counts as "good" based on data source:
    // - For vote actions (using main score column): positive score = aligned with us = GOOD
    // - For cosponsor actions with _cosponsor column (SUPPORT only): 1.0 = cosponsored = good
    // - For cosponsor actions using main column (OPPOSE): positive score = didn't cosponsor = good
    const goodValue = 1; // Default: positive score = aligned with us = GOOD

    allRows.forEach(member => {
      // For SUPPORT cosponsor actions, prefer the specific _cosponsor column if it exists
      let rawValue = member[selectedBillColumn];
      let useCosponsorColumn = false;

      if (cosponsorColumn && member[cosponsorColumn] !== undefined) {
        rawValue = member[cosponsorColumn];
        useCosponsorColumn = true;
      }

      // Skip if no data (undefined, null, empty string, or non-numeric)
      if (rawValue === undefined || rawValue === null || rawValue === '' || rawValue === -1) return;
      const value = Number(rawValue);
      if (isNaN(value)) return;

      // Convert point values to binary: any positive value = took action (1), zero = didn't take action (0)
      // For cosponsor columns, 1.0 = cosponsored, 0.0 = did not cosponsor
      const binaryValue = value > 0 ? 1 : 0;
      const isGood = binaryValue === goodValue;
      const state = stateCodeOf(member.state);

      if (member.chamber === 'HOUSE') {
        const district = String(member.district || '00').padStart(2, '0');
        const fips = stateToFips[state];
        if (fips) {
          const key = `${fips}${district}`;
          districtActions[key] = isGood ? 'good' : 'bad';
        }
      } else if (member.chamber === 'SENATE') {
        if (!stateActions[state]) {
          stateActions[state] = { good: 0, bad: 0 };
        }
        if (isGood) {
          stateActions[state].good++;
        } else {
          stateActions[state].bad++;
        }
      }
    });

    // Count stats
    let houseGood = 0;
    let houseBad = 0;
    let senateBothGood = 0;
    let senateSplit = 0;
    let senateBothBad = 0;

    Object.values(districtActions).forEach(action => {
      if (action === 'good') houseGood++;
      else houseBad++;
    });

    Object.values(stateActions).forEach(actions => {
      if (actions.good === 2) senateBothGood++;
      else if (actions.good === 1 && actions.bad === 1) senateSplit++;
      else if (actions.bad === 2) senateBothBad++;
      else if (actions.good === 1) senateBothGood++; // Only one senator has data
      else if (actions.bad === 1) senateBothBad++;
    });

    // Determine effective chamber for display (same logic as map rendering)
    let effectiveChamber: 'HOUSE' | 'SENATE' = 'SENATE';
    if (!chamber) {
      const hasHouseData = houseGood + houseBad > 0;
      const hasSenateData = senateBothGood + senateSplit + senateBothBad > 0;

      if (hasHouseData && !hasSenateData) {
        effectiveChamber = 'HOUSE';
      } else if (!hasHouseData && hasSenateData) {
        effectiveChamber = 'SENATE';
      } else if (hasHouseData && hasSenateData) {
        effectiveChamber = 'HOUSE'; // Prefer House (more granular)
      }
    } else {
      effectiveChamber = chamber as 'HOUSE' | 'SENATE';
    }

    return {
      districtActions,
      stateActions,
      goodLabel,
      badLabel,
      goodValue, // Include for consistent tooltip logic
      stats: { houseGood, houseBad, senateBothGood, senateSplit, senateBothBad },
      meta,
      effectiveChamber
    };
  }, [selectedBillColumn, metaByCol, allRows, chamber, pacDataMap]);

  // Ref for billActionData to avoid stale closures
  const billActionDataRef = useRef(billActionData);

  // Keep refs updated with latest values
  useEffect(() => {
    onBillMapClickRef.current = onBillMapClick;
    selectedBillColumnRef.current = selectedBillColumn;
    billActionDataRef.current = billActionData;
  }, [onBillMapClick, selectedBillColumn, billActionData]);

  // Compute the actual chamber the map should display (for dependency tracking)
  const mapChamberView = useMemo(() => {
    if (chamber) return chamber;
    if (billActionData) return billActionData.effectiveChamber;
    return 'SENATE'; // Default to state view when no chamber set
  }, [chamber, billActionData]);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Only rebuild map if chamber view actually changed
    if (map.current && lastEffectiveChamber.current === mapChamberView) {
      // Chamber hasn't changed, skip rebuild
      return;
    }

    // Track the current chamber view
    lastEffectiveChamber.current = mapChamberView as 'HOUSE' | 'SENATE';

    // Reset loading state
    setLoading(true);
    setError(null);

    // Clean up existing map when chamber changes
    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    if (popup.current) {
      popup.current.remove();
      popup.current = null;
    }

    // Calculate zoom based on screen width - more zoomed out on smaller screens
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const initialZoom = screenWidth < 768 ? 2.3 : screenWidth < 1024 ? 2.8 : 3.5;

    // Initialize map
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'carto': {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© CARTO © OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'carto',
            type: 'raster',
            source: 'carto'
          }
        ]
      },
      center: [-98.5795, 39.8283], // Center of US
      zoom: initialZoom,
      maxZoom: 10,
      minZoom: 2
    });

    // Load congressional district or state boundaries based on chamber
    map.current.on('load', async () => {
      if (!map.current) return;

      try {
        // When bill action data is present and chamber is not set, auto-detect based on bill data
        let isSenate = chamber === 'SENATE' || !chamber; // Both mode (no chamber) shows states too
        const isBothMode = !chamber; // Both mode when chamber is empty/undefined

        // If we have bill action data and no specific chamber selected, choose based on data
        if (billActionData && !chamber) {
          const hasHouseData = Object.keys(billActionData.districtActions).length > 0;
          const hasSenateData = Object.keys(billActionData.stateActions).length > 0;

          // Prefer House view if we have House data, otherwise Senate
          if (hasHouseData && !hasSenateData) {
            isSenate = false;
          } else if (!hasHouseData && hasSenateData) {
            isSenate = true;
          } else if (hasHouseData && hasSenateData) {
            // If both have data, show House (more granular)
            isSenate = false;
          }
        }

        // Load appropriate GeoJSON file based on chamber
        const dataUrl = isSenate
          ? 'https://cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json'  // State boundaries GeoJSON for Senate
          : '/data/districts/congressional-districts-118th.geojson';    // District boundaries for House

        const response = await fetch(dataUrl);

        if (!response.ok) {
          throw new Error(`Failed to load ${isSenate ? 'state' : 'district'} data: ${response.status} ${response.statusText}`);
        }

        const geoJsonData = await response.json();

        // Create new GeoJSON with unique IDs in properties for hover state tracking
        const processedGeoJson = {
          type: 'FeatureCollection' as const,
          features: geoJsonData.features.map((feature: { properties?: { name?: string; STATEFP?: string; CD118FP?: string; NAMELSAD?: string }; geometry?: unknown }, index: number) => {
            let customId;
            if (isSenate) {
              // For Senate, use state name as ID
              customId = feature.properties?.name || `state-${index}`;
            } else {
              // For House, use STATEFP + CD118FP as ID
              const statefp = feature.properties?.STATEFP || '';
              const cd = feature.properties?.CD118FP || '';
              customId = `${statefp}-${cd}`;
            }
            console.log('Set feature ID:', customId, 'for', feature.properties?.NAMELSAD);

            return {
              type: 'Feature',
              properties: {
                ...feature.properties,
                customId: customId  // Store in properties so we can use promoteId
              },
              geometry: feature.geometry
            };
          })
        };

        // Add data source with promoteId to use our custom ID property
        map.current.addSource('districts', {
          type: 'geojson',
          data: processedGeoJson,
          promoteId: 'customId'  // Use customId property as the feature ID
        });

        // Create a grade color map for districts (matching main app color scheme)
        const gradeColors: Record<string, string> = {
          'A+': GRADE_COLORS.A,
          'A': GRADE_COLORS.A,
          'A-': GRADE_COLORS.A,
          'B+': GRADE_COLORS.B,
          'B': GRADE_COLORS.B,
          'B-': GRADE_COLORS.B,
          'C+': GRADE_COLORS.C,
          'C': GRADE_COLORS.C,
          'C-': GRADE_COLORS.C,
          'D+': GRADE_COLORS.D,
          'D': GRADE_COLORS.D,
          'D-': GRADE_COLORS.D,
          'F': GRADE_COLORS.F,
          'N/A': '#E5E7EB'  // gray
        };

        // State name/abbreviation to FIPS code mapping
        const stateToFips: Record<string, string> = {
          'AL': '01', 'ALABAMA': '01',
          'AK': '02', 'ALASKA': '02',
          'AZ': '04', 'ARIZONA': '04',
          'AR': '05', 'ARKANSAS': '05',
          'CA': '06', 'CALIFORNIA': '06',
          'CO': '08', 'COLORADO': '08',
          'CT': '09', 'CONNECTICUT': '09',
          'DE': '10', 'DELAWARE': '10',
          'DC': '11', 'DISTRICT OF COLUMBIA': '11',
          'FL': '12', 'FLORIDA': '12',
          'GA': '13', 'GEORGIA': '13',
          'HI': '15', 'HAWAII': '15',
          'ID': '16', 'IDAHO': '16',
          'IL': '17', 'ILLINOIS': '17',
          'IN': '18', 'INDIANA': '18',
          'IA': '19', 'IOWA': '19',
          'KS': '20', 'KANSAS': '20',
          'KY': '21', 'KENTUCKY': '21',
          'LA': '22', 'LOUISIANA': '22',
          'ME': '23', 'MAINE': '23',
          'MD': '24', 'MARYLAND': '24',
          'MA': '25', 'MASSACHUSETTS': '25',
          'MI': '26', 'MICHIGAN': '26',
          'MN': '27', 'MINNESOTA': '27',
          'MS': '28', 'MISSISSIPPI': '28',
          'MO': '29', 'MISSOURI': '29',
          'MT': '30', 'MONTANA': '30',
          'NE': '31', 'NEBRASKA': '31',
          'NV': '32', 'NEVADA': '32',
          'NH': '33', 'NEW HAMPSHIRE': '33',
          'NJ': '34', 'NEW JERSEY': '34',
          'NM': '35', 'NEW MEXICO': '35',
          'NY': '36', 'NEW YORK': '36',
          'NC': '37', 'NORTH CAROLINA': '37',
          'ND': '38', 'NORTH DAKOTA': '38',
          'OH': '39', 'OHIO': '39',
          'OK': '40', 'OKLAHOMA': '40',
          'OR': '41', 'OREGON': '41',
          'PA': '42', 'PENNSYLVANIA': '42',
          'RI': '44', 'RHODE ISLAND': '44',
          'SC': '45', 'SOUTH CAROLINA': '45',
          'SD': '46', 'SOUTH DAKOTA': '46',
          'TN': '47', 'TENNESSEE': '47',
          'TX': '48', 'TEXAS': '48',
          'UT': '49', 'UTAH': '49',
          'VT': '50', 'VERMONT': '50',
          'VA': '51', 'VIRGINIA': '51',
          'WA': '53', 'WASHINGTON': '53',
          'WV': '54', 'WEST VIRGINIA': '54',
          'WI': '55', 'WISCONSIN': '55',
          'WY': '56', 'WYOMING': '56',
          'AS': '60', 'AMERICAN SAMOA': '60',
          'GU': '66', 'GUAM': '66',
          'MP': '69', 'NORTHERN MARIANA ISLANDS': '69',
          'PR': '72', 'PUERTO RICO': '72',
          'VI': '78', 'U.S. VIRGIN ISLANDS': '78', 'VIRGIN ISLANDS': '78'
        };

        // Helper to normalize state to FIPS
        const getStateFips = (stateValue: string | undefined): string | undefined => {
          const raw = String(stateValue || '').trim();
          if (!raw) return undefined;
          // Try direct lookup with uppercase
          const directLookup = stateToFips[raw.toUpperCase()];
          if (directLookup) return directLookup;
          // Try as lowercase (for full names)
          const lowerLookup = stateToFips[raw.toUpperCase()];
          return lowerLookup;
        };

        // Create district/state-to-member mapping
        const districtGrades: Record<string, string> = {};
        const districtMembers: Record<string, Row | Row[]> = {};

        if (isSenate) {
          // For Senate or Both mode: group members by state and calculate average grade
          const membersByState: Record<string, Row[]> = {};

          // Use allRows for grade coloring to show all members, not just filtered ones
          const membersToColor = allRows || members;
          const senateMembersCount = membersToColor.filter(m => m.chamber === 'SENATE').length;
          const houseMembersCount = membersToColor.filter(m => m.chamber === 'HOUSE').length;

          membersToColor.forEach((member) => {
            // In Both mode, include all members; in Senate mode, only senators
            if (isBothMode || member.chamber === 'SENATE') {
              const state = member.state;
              const fips = getStateFips(state);


              if (fips) {
                if (!membersByState[fips]) {
                  membersByState[fips] = [];
                }
                membersByState[fips].push(member);
              }
            }
          });


          // Calculate average grade for each state
          Object.entries(membersByState).forEach(([fips, stateMembers]) => {
            // Convert grades to numeric values for averaging
            const gradeValues: Record<string, number> = {
              'A+': 100, 'A': 95, 'A-': 90,
              'B+': 87, 'B': 83, 'B-': 80,
              'C+': 77, 'C': 73, 'C-': 70,
              'D+': 67, 'D': 63, 'D-': 60,
              'F': 50
            };

            const validGrades = stateMembers
              .map(m => gradeValues[String(m.Grade || '')])
              .filter(v => v !== undefined);

            if (validGrades.length > 0) {
              const avg = validGrades.reduce((a, b) => a + b, 0) / validGrades.length;

              // Convert back to letter grade
              let avgGrade = 'N/A';
              if (avg >= 98) avgGrade = 'A+';
              else if (avg >= 93) avgGrade = 'A';
              else if (avg >= 88.5) avgGrade = 'A-';
              else if (avg >= 85) avgGrade = 'B+';
              else if (avg >= 81.5) avgGrade = 'B';
              else if (avg >= 78.5) avgGrade = 'B-';
              else if (avg >= 75) avgGrade = 'C+';
              else if (avg >= 71.5) avgGrade = 'C';
              else if (avg >= 68.5) avgGrade = 'C-';
              else if (avg >= 65) avgGrade = 'D+';
              else if (avg >= 61.5) avgGrade = 'D';
              else if (avg >= 55) avgGrade = 'D-';
              else avgGrade = 'F';

              districtGrades[fips] = avgGrade;
              districtMembers[fips] = stateMembers;
            }
          });

          // Update refs for tooltip access
          districtMembersRef.current = districtMembers;
          districtGradesRef.current = districtGrades;

        } else {
          // For House: map districts to individual representatives
          // Use allRows for grade coloring to show all members, not just filtered ones
          const membersToColor = allRows || members;

          // Check if district data is available
          const hasDistrictData = membersToColor.some(m => m.chamber === 'HOUSE' && m.district && m.district.trim() !== '');

          if (!hasDistrictData) {
            // Fallback: If no district data, aggregate by state like Senate mode
            console.warn('House mode: No district data available, aggregating by state instead');
            const membersByState: Record<string, Row[]> = {};

            membersToColor.forEach((member) => {
              if (member.chamber === 'HOUSE') {
                const state = member.state;
                const fips = getStateFips(state);

                if (fips) {
                  if (!membersByState[fips]) {
                    membersByState[fips] = [];
                  }
                  membersByState[fips].push(member);
                }
              }
            });

            // Calculate average grade for each state
            const gradeValues: Record<string, number> = {
              'A+': 100, 'A': 95, 'A-': 90,
              'B+': 87, 'B': 83, 'B-': 80,
              'C+': 77, 'C': 73, 'C-': 70,
              'D+': 67, 'D': 63, 'D-': 60,
              'F': 50
            };

            Object.entries(membersByState).forEach(([fips, stateMembers]) => {
              const validGrades = stateMembers
                .map(m => gradeValues[String(m.Grade || '')])
                .filter(v => v !== undefined);

              if (validGrades.length > 0) {
                const avg = validGrades.reduce((a, b) => a + b, 0) / validGrades.length;

                let avgGrade = 'N/A';
                if (avg >= 98) avgGrade = 'A+';
                else if (avg >= 93) avgGrade = 'A';
                else if (avg >= 88.5) avgGrade = 'A-';
                else if (avg >= 85) avgGrade = 'B+';
                else if (avg >= 81.5) avgGrade = 'B';
                else if (avg >= 78.5) avgGrade = 'B-';
                else if (avg >= 75) avgGrade = 'C+';
                else if (avg >= 71.5) avgGrade = 'C';
                else if (avg >= 68.5) avgGrade = 'C-';
                else if (avg >= 65) avgGrade = 'D+';
                else if (avg >= 61.5) avgGrade = 'D';
                else if (avg >= 55) avgGrade = 'D-';
                else avgGrade = 'F';

                districtGrades[fips] = avgGrade;
                districtMembers[fips] = stateMembers;
              }
            });
          } else {
            // Normal path: Map individual districts
            membersToColor.forEach((member) => {
              if (member.chamber === 'HOUSE') {
                const state = member.state;
                const district = String(member.district || '');

                const fips = getStateFips(state);
                if (fips) {
                  const districtNum = district === '' ? '00' : district.padStart(2, '0');
                  const districtKey = `${fips}${districtNum}`;
                  const grade = String(member.Grade || 'N/A');
                  districtGrades[districtKey] = grade;
                  districtMembers[districtKey] = member;
                }
              }
            });
          }

          // Update refs for tooltip access
          districtMembersRef.current = districtMembers;
          districtGradesRef.current = districtGrades;

        }

        // Create FIPS to state abbr reverse lookup for Senate matching
        const fipsToStateAbbr: Record<string, string> = {};
        Object.entries(stateToFips).forEach(([abbr, fips]) => {
          if (abbr.length === 2) {
            fipsToStateAbbr[fips] = abbr;
          }
        });

        // Add fill layer for districts/states with colors based on grades or bill actions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fillColor: any;

        // Check if we're in bill action coloring mode
        if (billActionData) {
          // Check if this is partisan view
          const isPartisanView = selectedBillColumn === '__PARTISAN__';

          if (isSenate) {
            // Senate mode: color states based on senator actions
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const colorParts: any[] = [];

            Object.entries(billActionData.stateActions).forEach(([stateCode, actions]) => {
              const stateName = stateNameMapping[stateCode];
              if (stateName) {
                let color = '#E5E7EB'; // default gray

                // Check if this is partisan view
                if (isPartisanView && 'republican' in actions) {
                  // Partisan view: republican/democrat/other
                  const partisanActions = actions as { republican: number; democrat: number; other: number };
                  if (partisanActions.democrat === 2 || (partisanActions.democrat === 1 && partisanActions.republican === 0 && partisanActions.other === 0)) {
                    color = '#2563eb'; // Blue - Both Democrats
                  } else if (partisanActions.republican === 2 || (partisanActions.republican === 1 && partisanActions.democrat === 0 && partisanActions.other === 0)) {
                    color = '#dc2626'; // Red - Both Republicans
                  } else {
                    color = '#9333ea'; // Purple - Split/Mixed
                  }
                } else if (!isPartisanView && 'good' in actions) {
                  // Regular bill view: good/bad
                  const regularActions = actions as { good: number; bad: number };
                  if (regularActions.good === 2) {
                    color = GRADE_COLORS.A; // Both senators good
                  } else if (regularActions.good === 1 && regularActions.bad === 1) {
                    color = GRADE_COLORS.C; // Split
                  } else if (regularActions.bad === 2) {
                    color = GRADE_COLORS.F; // Both senators bad
                  } else if (regularActions.good === 1) {
                    color = GRADE_COLORS.A; // Only one senator has data, good
                  } else if (regularActions.bad === 1) {
                    color = GRADE_COLORS.F; // Only one senator has data, bad
                  }
                }
                colorParts.push(['==', ['get', 'name'], stateName], color);
              }
            });

            colorParts.push('#E5E7EB'); // fallback color
            fillColor = ['case', ...colorParts];
          } else {
            // House mode: color districts based on member actions
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const colorParts: any[] = [];

            Object.entries(billActionData.districtActions).forEach(([key, action]) => {
              let color: string;
              if (action === 'good') {
                // Democrat blue or "good" action green
                color = isPartisanView ? '#2563eb' : GRADE_COLORS.A;
              } else if (action === 'bad') {
                // Republican red or "bad" action red
                color = isPartisanView ? '#dc2626' : GRADE_COLORS.F;
              } else {
                // Independent/Other purple
                color = '#9333ea';
              }
              colorParts.push(['==', ['concat', ['get', 'STATEFP'], ['get', 'CD118FP']], key], color);
            });

            colorParts.push('#E5E7EB'); // fallback color
            fillColor = ['case', ...colorParts];
          }
        } else if (Object.keys(districtGrades).length > 0) {
          // Senate or House mode: Use grade colors
          // Check if we're aggregating by state (no district data)
          const firstKey = Object.keys(districtGrades)[0];
          const aggregatingByState = firstKey.length === 2; // FIPS codes are 2 digits

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const matchExpression: any[] = [
            'match',
            isSenate || aggregatingByState
              ? (isSenate ? ['get', 'name'] : ['get', 'STATEFP'])  // For states: use 'name' for Senate GeoJSON, 'STATEFP' for House
              : ['concat', ['get', 'STATEFP'], ['get', 'CD118FP']] // For districts, concatenate STATEFP and CD118FP
          ];

          // Add all district/state grade pairs
          Object.entries(districtGrades).forEach(([key, grade]) => {
            let matchKey;
            if (isSenate) {
              // Convert FIPS to state abbreviation, then to full name
              const stateAbbr = fipsToStateAbbr[key];
              // Find the full state name
              const stateEntry = Object.entries(stateToFips).find(([name]) =>
                name.length === 2 && name === stateAbbr
              );
              if (stateEntry) {
                // Get the full name version
                const fullNameEntry = Object.entries(stateToFips).find(([name, fips]) =>
                  fips === key && name.length > 2
                );
                matchKey = fullNameEntry ? fullNameEntry[0].toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : stateAbbr;
              } else {
                matchKey = key;
              }
            } else {
              matchKey = key;
            }
            matchExpression.push(matchKey);
            matchExpression.push(gradeColors[grade] || '#9ca3af');
          });

          // Add fallback color (required)
          matchExpression.push('#e5e7eb'); // default gray for areas without data

          fillColor = matchExpression;
        } else {
          // If no grades mapped, just use a default color
          console.warn(`No ${isSenate ? 'states' : 'districts'} mapped to grades, using default color`);
          fillColor = '#e5e7eb';
        }

        map.current.addLayer({
          id: 'districts-fill',
          type: 'fill',
          source: 'districts',
          paint: {
            'fill-color': fillColor,
            'fill-opacity': 0.8
          }
        });

        // Add hover highlight layer
        map.current.addLayer({
          id: 'districts-hover',
          type: 'fill',
          source: 'districts',
          paint: {
            'fill-color': '#ffffff',
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.3,
              0
            ]
          }
        });

        // Add border layer for districts
        map.current.addLayer({
          id: 'districts-border',
          type: 'line',
          source: 'districts',
          paint: {
            'line-color': '#ffffff',
            'line-width': 0.5
          }
        });

        // Add state borders for House view
        if (!isSenate) {
          try {
            const stateResponse = await fetch('https://cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json');
            if (stateResponse.ok) {
              const stateData = await stateResponse.json();
              if (map.current) {
                map.current.addSource('state-boundaries', {
                  type: 'geojson',
                  data: stateData
                });

                map.current.addLayer({
                  id: 'state-borders',
                  type: 'line',
                  source: 'state-boundaries',
                  paint: {
                    'line-color': '#000000',
                    'line-width': 1
                  }
                });
              }
            }
          } catch (err) {
            console.error('Failed to load state boundaries for House view', err);
          }

          // Add district number labels that appear when zoomed in
          // Create centroid points for each unique district to avoid duplicate labels
          if (map.current) {
            // Calculate centroids for each district (deduplicated by STATEFP + CD118FP)
            const districtCentroids: { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; properties: { district: string; statefp: string; cd: string }; geometry: { type: 'Point'; coordinates: [number, number] } }> } = {
              type: 'FeatureCollection',
              features: []
            };

            const seenDistricts = new Set<string>();

            processedGeoJson.features.forEach((feature: { properties?: { STATEFP?: string; CD118FP?: string }; geometry?: { type?: string; coordinates?: unknown } }) => {
              const statefp = feature.properties?.STATEFP || '';
              const cd = feature.properties?.CD118FP || '';
              const key = `${statefp}-${cd}`;

              if (!seenDistricts.has(key) && statefp && cd) {
                seenDistricts.add(key);

                // Calculate centroid from geometry
                const geom = feature.geometry;
                if (geom && geom.type && geom.coordinates) {
                  let centroid: [number, number] = [0, 0];

                  if (geom.type === 'Polygon') {
                    const coords = geom.coordinates as number[][][];
                    centroid = calculatePolygonCentroid(coords[0]);
                  } else if (geom.type === 'MultiPolygon') {
                    // For MultiPolygon, find the largest polygon and use its centroid
                    const multiCoords = geom.coordinates as number[][][][];
                    let maxArea = 0;
                    let largestPoly: number[][] = [];

                    multiCoords.forEach(poly => {
                      const area = calculatePolygonArea(poly[0]);
                      if (area > maxArea) {
                        maxArea = area;
                        largestPoly = poly[0];
                      }
                    });

                    if (largestPoly.length > 0) {
                      centroid = calculatePolygonCentroid(largestPoly);
                    }
                  }

                  if (centroid[0] !== 0 || centroid[1] !== 0) {
                    districtCentroids.features.push({
                      type: 'Feature',
                      properties: {
                        district: cd === '00' ? 'AL' : String(parseInt(cd, 10)),
                        statefp: statefp,
                        cd: cd
                      },
                      geometry: {
                        type: 'Point',
                        coordinates: centroid
                      }
                    });
                  }
                }
              }
            });

            // Helper function to calculate polygon centroid using the proper geometric formula
            function calculatePolygonCentroid(coords: number[][]): [number, number] {
              let cx = 0, cy = 0;
              let signedArea = 0;
              const n = coords.length;

              for (let i = 0; i < n - 1; i++) {
                const x0 = coords[i][0];
                const y0 = coords[i][1];
                const x1 = coords[i + 1][0];
                const y1 = coords[i + 1][1];
                const a = x0 * y1 - x1 * y0;
                signedArea += a;
                cx += (x0 + x1) * a;
                cy += (y0 + y1) * a;
              }

              signedArea *= 0.5;
              cx = cx / (6.0 * signedArea);
              cy = cy / (6.0 * signedArea);

              // If calculation fails (very small or degenerate polygon), fall back to simple average
              if (isNaN(cx) || isNaN(cy) || !isFinite(cx) || !isFinite(cy)) {
                let x = 0, y = 0;
                for (let i = 0; i < n; i++) {
                  x += coords[i][0];
                  y += coords[i][1];
                }
                return [x / n, y / n];
              }

              return [cx, cy];
            }

            // Helper function to calculate polygon area (for finding largest)
            function calculatePolygonArea(coords: number[][]): number {
              let area = 0;
              const n = coords.length;
              for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                area += coords[i][0] * coords[j][1];
                area -= coords[j][0] * coords[i][1];
              }
              return Math.abs(area / 2);
            }

            map.current.addSource('district-centroids', {
              type: 'geojson',
              data: districtCentroids
            });

            map.current.addLayer({
              id: 'district-labels',
              type: 'symbol',
              source: 'district-centroids',
              layout: {
                'text-field': ['get', 'district'],
                'text-size': [
                  'step',
                  ['zoom'],
                  0,    // Hidden at low zoom
                  5, 12,  // Show at zoom 5+
                  6, 14,  // Larger at zoom 6+
                  7, 16   // Even larger at zoom 7+
                ],
                'text-allow-overlap': false,
                'text-ignore-placement': false,
                'text-padding': 2
              },
              paint: {
                'text-color': '#0f172a',
                'text-opacity': [
                  'step',
                  ['zoom'],
                  0,    // Hidden at low zoom
                  5, 1  // Show at zoom 5+
                ]
              }
            });
          }
        }

        // Add major city labels with tier system for zoom-based display
        const majorCities = {
          type: 'FeatureCollection' as const,
          features: [
            // Tier 1: Largest cities (always visible)
            { type: 'Feature', properties: { name: 'New York', tier: 1 }, geometry: { type: 'Point', coordinates: [-74.006, 40.7128] } },
            { type: 'Feature', properties: { name: 'Los Angeles', tier: 1 }, geometry: { type: 'Point', coordinates: [-118.2437, 34.0522] } },
            { type: 'Feature', properties: { name: 'Chicago', tier: 1 }, geometry: { type: 'Point', coordinates: [-87.6298, 41.8781] } },
            { type: 'Feature', properties: { name: 'Houston', tier: 1 }, geometry: { type: 'Point', coordinates: [-95.3698, 29.7604] } },
            { type: 'Feature', properties: { name: 'Phoenix', tier: 1 }, geometry: { type: 'Point', coordinates: [-112.074, 33.4484] } },
            { type: 'Feature', properties: { name: 'Philadelphia', tier: 1 }, geometry: { type: 'Point', coordinates: [-75.1652, 39.9526] } },
            { type: 'Feature', properties: { name: 'San Antonio', tier: 1 }, geometry: { type: 'Point', coordinates: [-98.4936, 29.4241] } },
            { type: 'Feature', properties: { name: 'San Diego', tier: 1 }, geometry: { type: 'Point', coordinates: [-117.1611, 32.7157] } },
            { type: 'Feature', properties: { name: 'Dallas', tier: 1 }, geometry: { type: 'Point', coordinates: [-96.797, 32.7767] } },
            { type: 'Feature', properties: { name: 'San Jose', tier: 1 }, geometry: { type: 'Point', coordinates: [-121.8863, 37.3382] } },

            // Tier 2: Major cities (visible at zoom 4+)
            { type: 'Feature', properties: { name: 'Austin', tier: 2 }, geometry: { type: 'Point', coordinates: [-97.7431, 30.2672] } },
            { type: 'Feature', properties: { name: 'Jacksonville', tier: 2 }, geometry: { type: 'Point', coordinates: [-81.6557, 30.3322] } },
            { type: 'Feature', properties: { name: 'San Francisco', tier: 2 }, geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] } },
            { type: 'Feature', properties: { name: 'Columbus', tier: 2 }, geometry: { type: 'Point', coordinates: [-82.9988, 39.9612] } },
            { type: 'Feature', properties: { name: 'Indianapolis', tier: 2 }, geometry: { type: 'Point', coordinates: [-86.1581, 39.7684] } },
            { type: 'Feature', properties: { name: 'Seattle', tier: 2 }, geometry: { type: 'Point', coordinates: [-122.3321, 47.6062] } },
            { type: 'Feature', properties: { name: 'Denver', tier: 2 }, geometry: { type: 'Point', coordinates: [-104.9903, 39.7392] } },
            { type: 'Feature', properties: { name: 'Boston', tier: 2 }, geometry: { type: 'Point', coordinates: [-71.0589, 42.3601] } },
            { type: 'Feature', properties: { name: 'Nashville', tier: 2 }, geometry: { type: 'Point', coordinates: [-86.7816, 36.1627] } },
            { type: 'Feature', properties: { name: 'Detroit', tier: 2 }, geometry: { type: 'Point', coordinates: [-83.0458, 42.3314] } },
            { type: 'Feature', properties: { name: 'Portland', tier: 2 }, geometry: { type: 'Point', coordinates: [-122.6765, 45.5152] } },
            { type: 'Feature', properties: { name: 'Las Vegas', tier: 2 }, geometry: { type: 'Point', coordinates: [-115.1398, 36.1699] } },
            { type: 'Feature', properties: { name: 'Memphis', tier: 2 }, geometry: { type: 'Point', coordinates: [-90.0490, 35.1495] } },
            { type: 'Feature', properties: { name: 'Atlanta', tier: 2 }, geometry: { type: 'Point', coordinates: [-84.3880, 33.7490] } },
            { type: 'Feature', properties: { name: 'Miami', tier: 2 }, geometry: { type: 'Point', coordinates: [-80.1918, 25.7617] } },

            // Tier 3: Additional cities (visible at zoom 5+)
            { type: 'Feature', properties: { name: 'Salt Lake City', tier: 3 }, geometry: { type: 'Point', coordinates: [-111.8910, 40.7608] } },
            { type: 'Feature', properties: { name: 'Reno', tier: 3 }, geometry: { type: 'Point', coordinates: [-119.8138, 39.5296] } },
            { type: 'Feature', properties: { name: 'Albuquerque', tier: 3 }, geometry: { type: 'Point', coordinates: [-106.6504, 35.0844] } },
            { type: 'Feature', properties: { name: 'Tucson', tier: 3 }, geometry: { type: 'Point', coordinates: [-110.9747, 32.2226] } },
            { type: 'Feature', properties: { name: 'Fresno', tier: 3 }, geometry: { type: 'Point', coordinates: [-119.7871, 36.7378] } },
            { type: 'Feature', properties: { name: 'Sacramento', tier: 3 }, geometry: { type: 'Point', coordinates: [-121.4944, 38.5816] } },
            { type: 'Feature', properties: { name: 'Kansas City', tier: 3 }, geometry: { type: 'Point', coordinates: [-94.5786, 39.0997] } },
            { type: 'Feature', properties: { name: 'Mesa', tier: 3 }, geometry: { type: 'Point', coordinates: [-111.8315, 33.4152] } },
            { type: 'Feature', properties: { name: 'Charlotte', tier: 3 }, geometry: { type: 'Point', coordinates: [-80.8431, 35.2271] } },
            { type: 'Feature', properties: { name: 'Omaha', tier: 3 }, geometry: { type: 'Point', coordinates: [-95.9345, 41.2565] } },
            { type: 'Feature', properties: { name: 'Raleigh', tier: 3 }, geometry: { type: 'Point', coordinates: [-78.6382, 35.7796] } },
            { type: 'Feature', properties: { name: 'Long Beach', tier: 3 }, geometry: { type: 'Point', coordinates: [-118.1937, 33.7701] } },
            { type: 'Feature', properties: { name: 'Virginia Beach', tier: 3 }, geometry: { type: 'Point', coordinates: [-75.9780, 36.8529] } },
            { type: 'Feature', properties: { name: 'Oakland', tier: 3 }, geometry: { type: 'Point', coordinates: [-122.2711, 37.8044] } },
            { type: 'Feature', properties: { name: 'Minneapolis', tier: 3 }, geometry: { type: 'Point', coordinates: [-93.2650, 44.9778] } },
            { type: 'Feature', properties: { name: 'Tampa', tier: 3 }, geometry: { type: 'Point', coordinates: [-82.4572, 27.9506] } },
            { type: 'Feature', properties: { name: 'New Orleans', tier: 3 }, geometry: { type: 'Point', coordinates: [-90.0715, 29.9511] } },
            { type: 'Feature', properties: { name: 'Cleveland', tier: 3 }, geometry: { type: 'Point', coordinates: [-81.6944, 41.4993] } },
            { type: 'Feature', properties: { name: 'Pittsburgh', tier: 3 }, geometry: { type: 'Point', coordinates: [-79.9959, 40.4406] } },
            { type: 'Feature', properties: { name: 'Cincinnati', tier: 3 }, geometry: { type: 'Point', coordinates: [-84.5120, 39.1031] } },
            { type: 'Feature', properties: { name: 'Milwaukee', tier: 3 }, geometry: { type: 'Point', coordinates: [-87.9065, 43.0389] } },
            { type: 'Feature', properties: { name: 'Boise', tier: 3 }, geometry: { type: 'Point', coordinates: [-116.2146, 43.6150] } },
            { type: 'Feature', properties: { name: 'Spokane', tier: 3 }, geometry: { type: 'Point', coordinates: [-117.4260, 47.6588] } },
            { type: 'Feature', properties: { name: 'Richmond', tier: 3 }, geometry: { type: 'Point', coordinates: [-77.4360, 37.5407] } },
            { type: 'Feature', properties: { name: 'Louisville', tier: 3 }, geometry: { type: 'Point', coordinates: [-85.7585, 38.2527] } },

            // Tier 4: Medium cities (visible at zoom 6+)
            { type: 'Feature', properties: { name: 'Irvine', tier: 4 }, geometry: { type: 'Point', coordinates: [-117.8265, 33.6846] } },
            { type: 'Feature', properties: { name: 'Anaheim', tier: 4 }, geometry: { type: 'Point', coordinates: [-117.9145, 33.8366] } },
            { type: 'Feature', properties: { name: 'Santa Ana', tier: 4 }, geometry: { type: 'Point', coordinates: [-117.8678, 33.7455] } },
            { type: 'Feature', properties: { name: 'Riverside', tier: 4 }, geometry: { type: 'Point', coordinates: [-117.3961, 33.9533] } },
            { type: 'Feature', properties: { name: 'Stockton', tier: 4 }, geometry: { type: 'Point', coordinates: [-121.2908, 37.9577] } },
            { type: 'Feature', properties: { name: 'Bakersfield', tier: 4 }, geometry: { type: 'Point', coordinates: [-119.0187, 35.3733] } },
            { type: 'Feature', properties: { name: 'Aurora', tier: 4 }, geometry: { type: 'Point', coordinates: [-104.8319, 39.7294] } },
            { type: 'Feature', properties: { name: 'St. Louis', tier: 4 }, geometry: { type: 'Point', coordinates: [-90.1994, 38.6270] } },
            { type: 'Feature', properties: { name: 'Corpus Christi', tier: 4 }, geometry: { type: 'Point', coordinates: [-97.3964, 27.8006] } },
            { type: 'Feature', properties: { name: 'Plano', tier: 4 }, geometry: { type: 'Point', coordinates: [-96.6989, 33.0198] } },
            { type: 'Feature', properties: { name: 'Newark', tier: 4 }, geometry: { type: 'Point', coordinates: [-74.1724, 40.7357] } },
            { type: 'Feature', properties: { name: 'Buffalo', tier: 4 }, geometry: { type: 'Point', coordinates: [-78.8784, 42.8864] } },
            { type: 'Feature', properties: { name: 'Jersey City', tier: 4 }, geometry: { type: 'Point', coordinates: [-74.0776, 40.7178] } },
            { type: 'Feature', properties: { name: 'St. Petersburg', tier: 4 }, geometry: { type: 'Point', coordinates: [-82.6403, 27.7676] } },
            { type: 'Feature', properties: { name: 'Orlando', tier: 4 }, geometry: { type: 'Point', coordinates: [-81.3792, 28.5383] } },
            { type: 'Feature', properties: { name: 'Fort Worth', tier: 4 }, geometry: { type: 'Point', coordinates: [-97.3208, 32.7555] } },
            { type: 'Feature', properties: { name: 'Tacoma', tier: 4 }, geometry: { type: 'Point', coordinates: [-122.4443, 47.2529] } },
            { type: 'Feature', properties: { name: 'Lexington', tier: 4 }, geometry: { type: 'Point', coordinates: [-84.5037, 38.0406] } },
            { type: 'Feature', properties: { name: 'Anchorage', tier: 4 }, geometry: { type: 'Point', coordinates: [-149.9003, 61.2181] } },
            { type: 'Feature', properties: { name: 'Honolulu', tier: 4 }, geometry: { type: 'Point', coordinates: [-157.8583, 21.3099] } },

            // Tier 5: Smaller cities (visible at zoom 7+)
            { type: 'Feature', properties: { name: 'Everett', tier: 5 }, geometry: { type: 'Point', coordinates: [-122.2015, 47.9790] } },
            { type: 'Feature', properties: { name: 'Bellingham', tier: 5 }, geometry: { type: 'Point', coordinates: [-122.4783, 48.7519] } },
            { type: 'Feature', properties: { name: 'Santa Rosa', tier: 5 }, geometry: { type: 'Point', coordinates: [-122.7141, 38.4404] } },
            { type: 'Feature', properties: { name: 'Modesto', tier: 5 }, geometry: { type: 'Point', coordinates: [-120.9969, 37.6391] } },
            { type: 'Feature', properties: { name: 'Berkeley', tier: 5 }, geometry: { type: 'Point', coordinates: [-122.2728, 37.8715] } },
            { type: 'Feature', properties: { name: 'Pasadena', tier: 5 }, geometry: { type: 'Point', coordinates: [-118.1445, 34.1478] } },
            { type: 'Feature', properties: { name: 'Glendale', tier: 5 }, geometry: { type: 'Point', coordinates: [-118.2551, 34.1425] } },
            { type: 'Feature', properties: { name: 'Huntington Beach', tier: 5 }, geometry: { type: 'Point', coordinates: [-117.9992, 33.6603] } },
            { type: 'Feature', properties: { name: 'Ontario', tier: 5 }, geometry: { type: 'Point', coordinates: [-117.6509, 34.0633] } },
            { type: 'Feature', properties: { name: 'Eugene', tier: 5 }, geometry: { type: 'Point', coordinates: [-123.0868, 44.0521] } },
            { type: 'Feature', properties: { name: 'Salem', tier: 5 }, geometry: { type: 'Point', coordinates: [-123.0351, 44.9429] } },
            { type: 'Feature', properties: { name: 'Fort Collins', tier: 5 }, geometry: { type: 'Point', coordinates: [-105.0844, 40.5853] } },
            { type: 'Feature', properties: { name: 'Boulder', tier: 5 }, geometry: { type: 'Point', coordinates: [-105.2705, 40.0150] } },
            { type: 'Feature', properties: { name: 'Ann Arbor', tier: 5 }, geometry: { type: 'Point', coordinates: [-83.7430, 42.2808] } },
            { type: 'Feature', properties: { name: 'Charleston', tier: 5 }, geometry: { type: 'Point', coordinates: [-79.9311, 32.7765] } },
            { type: 'Feature', properties: { name: 'Savannah', tier: 5 }, geometry: { type: 'Point', coordinates: [-81.0998, 32.0809] } },
            { type: 'Feature', properties: { name: 'Durham', tier: 5 }, geometry: { type: 'Point', coordinates: [-78.8986, 35.9940] } },
            { type: 'Feature', properties: { name: 'Madison', tier: 5 }, geometry: { type: 'Point', coordinates: [-89.4012, 43.0731] } },
            { type: 'Feature' as const, properties: { name: 'Des Moines', tier: 5 }, geometry: { type: 'Point' as const, coordinates: [-93.6091, 41.6005] } },
            { type: 'Feature' as const, properties: { name: 'Providence', tier: 5 }, geometry: { type: 'Point' as const, coordinates: [-71.4128, 41.8240] } }
          ].map(f => ({ ...f, type: 'Feature' as const, geometry: { ...f.geometry, type: 'Point' as const } }))
        };

        map.current.addSource('cities', {
          type: 'geojson',
          data: majorCities
        });

        map.current.addLayer({
          id: 'city-labels',
          type: 'symbol',
          source: 'cities',
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 10,
            'text-anchor': 'top',
            'text-offset': [0, 0.5]
          },
          paint: {
            'text-color': '#000000',
            'text-halo-color': '#ffffff',
            'text-halo-width': 0.5,
            'text-halo-blur': 0,
            'text-opacity': [
              'step',
              ['zoom'],
              ['case', ['==', ['get', 'tier'], 1], 1, 0],  // Default zoom: tier 1 (10 largest)
              4, ['case', ['<=', ['get', 'tier'], 2], 1, 0],  // Zoom 4+: tier 1-2 (25 cities)
              5, ['case', ['<=', ['get', 'tier'], 3], 1, 0],  // Zoom 5+: tier 1-3 (50 cities)
              6, ['case', ['<=', ['get', 'tier'], 4], 1, 0],  // Zoom 6+: tier 1-4 (70 cities)
              7, 1  // Zoom 7+: all tiers (90 cities)
            ]
          }
        });

        // Add city dots
        map.current.addLayer({
          id: 'city-dots',
          type: 'circle',
          source: 'cities',
          paint: {
            'circle-radius': 3,
            'circle-color': '#475569',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': [
              'step',
              ['zoom'],
              ['case', ['==', ['get', 'tier'], 1], 1, 0],  // Default zoom: tier 1 (10 largest)
              4, ['case', ['<=', ['get', 'tier'], 2], 1, 0],  // Zoom 4+: tier 1-2 (25 cities)
              5, ['case', ['<=', ['get', 'tier'], 3], 1, 0],  // Zoom 5+: tier 1-3 (50 cities)
              6, ['case', ['<=', ['get', 'tier'], 4], 1, 0],  // Zoom 6+: tier 1-4 (70 cities)
              7, 1  // Zoom 7+: all tiers (90 cities)
            ]
          }
        });

        // Add state labels for all views (added AFTER cities to render on top)
        // State name to abbreviation mapping
          const stateNameToAbbr: Record<string, string> = {
            'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
            'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
            'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
            'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
            'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
            'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
            'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
            'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
            'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
            'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
            'District of Columbia': 'DC'
          };

          // Predefined state centers for consistent labeling
          const stateCenters: Record<string, [number, number]> = {
            'Alabama': [-86.9023, 32.3182], 'Alaska': [-152.4044, 61.3707], 'Arizona': [-111.0937, 34.0489],
            'Arkansas': [-92.3731, 34.7465], 'California': [-119.4179, 36.7783], 'Colorado': [-105.5478, 39.5501],
            'Connecticut': [-72.7554, 41.6032], 'Delaware': [-75.5277, 38.9108], 'Florida': [-81.5158, 27.6648],
            'Georgia': [-83.5007, 32.1656], 'Hawaii': [-156.3319, 20.2927], 'Idaho': [-114.7420, 44.0682],
            'Illinois': [-89.3985, 40.6331], 'Indiana': [-86.1349, 40.2672], 'Iowa': [-93.0977, 41.8780],
            'Kansas': [-98.4842, 39.0119], 'Kentucky': [-84.2700, 37.8393], 'Louisiana': [-91.9623, 30.9843],
            'Maine': [-69.4455, 45.2538], 'Maryland': [-76.6413, 39.0458], 'Massachusetts': [-71.3824, 42.4072],
            'Michigan': [-85.6024, 44.3148], 'Minnesota': [-94.6859, 46.7296], 'Mississippi': [-89.3985, 32.3547],
            'Missouri': [-92.6038, 37.9643], 'Montana': [-110.3626, 46.8797], 'Nebraska': [-99.9018, 41.4925],
            'Nevada': [-116.4194, 38.8026], 'New Hampshire': [-71.5724, 43.1939], 'New Jersey': [-74.4057, 40.0583],
            'New Mexico': [-105.8701, 34.5199], 'New York': [-75.5268, 43.2994], 'North Carolina': [-79.0193, 35.7596],
            'North Dakota': [-101.0020, 47.5515], 'Ohio': [-82.9071, 40.4173], 'Oklahoma': [-97.5164, 35.4676],
            'Oregon': [-120.5542, 43.8041], 'Pennsylvania': [-77.1945, 41.2033], 'Rhode Island': [-71.4774, 41.5801],
            'South Carolina': [-81.1637, 33.8361], 'South Dakota': [-100.2263, 43.9695], 'Tennessee': [-86.5804, 35.5175],
            'Texas': [-99.9018, 31.9686], 'Utah': [-111.0937, 39.3210], 'Vermont': [-72.5778, 44.5588],
            'Virginia': [-78.6569, 37.4316], 'Washington': [-120.7401, 47.7511], 'West Virginia': [-80.4549, 38.5976],
            'Wisconsin': [-89.6385, 43.7844], 'Wyoming': [-107.2903, 43.0750], 'District of Columbia': [-77.0369, 38.9072]
          };

          const stateLabels = {
            type: 'FeatureCollection' as const,
            features: Object.entries(stateCenters).map(([name, coords]) => ({
              type: 'Feature' as const,
              properties: { name: stateNameToAbbr[name] || name },
              geometry: { type: 'Point' as const, coordinates: coords }
            }))
          };

          map.current.addSource('state-labels', {
            type: 'geojson',
            data: stateLabels
          });

          map.current.addLayer({
            id: 'state-labels',
            type: 'symbol',
            source: 'state-labels',
            layout: {
              'text-field': ['get', 'name'],
              'text-size': [
                'step',
                ['zoom'],
                12,  // Bigger at low zoom
                4, 14,  // Larger size at zoom 4+
                6, 16   // Even larger at higher zoom
              ],
              'text-transform': 'uppercase',
              'text-letter-spacing': 0.1,
              'text-max-width': 15,  // Increased from 8 to allow longer names
              'text-allow-overlap': true,  // Allow state names to overlap if needed
              'text-optional': false,
              'text-ignore-placement': false,
              'text-padding': 2,
              'symbol-sort-key': 1  // Give states high priority
            },
            paint: {
              'text-color': '#000000',
              'text-halo-color': '#d1d5db',
              'text-halo-width': 1.5,
              'text-halo-blur': 0,
              'text-opacity': [
                'step',
                ['zoom'],
                1,  // Full opacity at low zoom
                5, 0.7  // Slightly transparent at higher zoom when cities appear
              ]
            }
          });

        // Initialize popup
        popup.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'district-tooltip',
          maxWidth: 'none'
        });

        // State FIPS code to abbreviation mapping (reverse lookup)
        const fipsToState: Record<string, string> = {};
        Object.entries(stateToFips).forEach(([abbr, fips]) => {
          if (abbr.length === 2) { // Only use 2-letter abbreviations
            fipsToState[fips] = abbr;
          }
        });

        // Add hover effect with tooltip
        map.current.on('mousemove', 'districts-fill', (e) => {
          if (!map.current || !e.features || e.features.length === 0) return;

          map.current.getCanvas().style.cursor = 'pointer';

          const feature = e.features[0];

          // Update hover state
          if (feature.id !== undefined && feature.id !== hoveredFeatureId.current) {
            if (hoveredFeatureId.current !== null) {
              map.current.setFeatureState(
                { source: 'districts', id: hoveredFeatureId.current },
                { hover: false }
              );
            }
            hoveredFeatureId.current = feature.id;
            map.current.setFeatureState(
              { source: 'districts', id: feature.id },
              { hover: true }
            );
          }

          if (isSenate) {
            // Senate or Both mode: show state and all lawmakers
            const stateName = feature.properties?.name;
            if (stateName && popup.current) {
              // Find FIPS from state name
              const stateFips = Object.entries(stateToFips).find(([name, fips]) =>
                name.toLowerCase() === stateName.toLowerCase()
              )?.[1];

              if (stateFips) {
                const stateMembers = districtMembersRef.current[stateFips];
                const stateAbbr = fipsToState[stateFips] || stateName;

                if (stateMembers && Array.isArray(stateMembers)) {
                  const avgGrade = districtGradesRef.current[stateFips] || 'N/A';

                  // Helper function to get grade chip styling (50% larger)
                  const getGradeChipStyle = (grade: string) => {
                    const color = grade.startsWith("A") ? GRADE_COLORS.A
                      : grade.startsWith("B") ? GRADE_COLORS.B
                      : grade.startsWith("C") ? GRADE_COLORS.C
                      : grade.startsWith("D") ? GRADE_COLORS.D
                      : grade.startsWith("F") ? GRADE_COLORS.F
                      : GRADE_COLORS.default;
                    const textColor = grade.startsWith("A") ? "#ffffff"
                      : "#4b5563";
                    return `background: ${color}; color: ${textColor}; display: inline-flex; align-items: center; justify-content: center; border-radius: 9999px; padding: 3px 12px; font-size: 15px; font-weight: 600; min-width: 48px;`;
                  };

                  // Helper function to normalize party label
                  const normalizeParty = (party: string) => {
                    const raw = (party || '').trim();
                    if (!raw) return 'Unknown';
                    const s = raw.toLowerCase();
                    // Normalize any form of Democratic/Democrat -> "Democrat"
                    if (s.startsWith("democ")) return "Democrat";
                    // Capitalize each word for other parties (e.g., "republican" -> "Republican")
                    return raw
                      .split(/\s+/)
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                      .join(" ");
                  };

                  // Helper function to get party badge styling (50% larger)
                  const getPartyBadgeStyle = (party: string) => {
                    const label = (party || '').toLowerCase();
                    const baseColor = label.startsWith("rep") ? "#EF4444"
                      : label.startsWith("dem") ? "#3B82F6"
                      : label.startsWith("ind") ? "#10B981"
                      : "#94A3B8";
                    return `color: ${baseColor}; background-color: ${baseColor}1A; border: 1px solid ${baseColor}66; display: inline-flex; align-items: center; border-radius: 9px; padding: 2px 6px; font-size: 15px; font-weight: 500;`;
                  };

                  // Detect theme - check both class and computed background color
                  const hasDarkClass = document.documentElement.classList.contains('dark');
                  const bodyBg = window.getComputedStyle(document.body).backgroundColor;
                  const isDarkMode = hasDarkClass || bodyBg.includes('11, 18, 32'); // Check for dark bg color
                  // Dark mode needs white text, light mode needs dark text
                  const primaryTextColor = isDarkMode ? '#ffffff' : '#334155';
                  const secondaryTextColor = isDarkMode ? '#ffffff' : '#475569';

                  let html = '';

                  if (isBothMode) {
                    // Both mode: Just show state and average grade
                    html = `
                      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 12px;">
                        <div style="font-size: 20px; font-weight: 600; color: ${primaryTextColor}; margin-bottom: 6px;">
                          ${stateName}
                        </div>
                        <div style="display: flex; align-items: center; gap: 9px;">
                          <span style="font-size: 15px; color: ${secondaryTextColor}; font-weight: 500;">Average Grade:</span>
                          <span style="${getGradeChipStyle(avgGrade)}">${avgGrade}</span>
                        </div>
                      </div>
                    `;
                  } else {
                    // Senate mode: Show senators with photo on left, info on right (like scorecard)
                    const senators = stateMembers.filter(m => m.chamber === 'SENATE');
                    const senatorsHtml = senators.map((senator, idx) => {
                      // Get bill action for this senator if bill is selected
                      let billActionHtml = '';
                      if (billActionData && selectedBillColumn) {
                        // Handle AIPAC/DMFI special case
                        if (selectedBillColumn === '__AIPAC__') {
                          const pacData = pacDataMap.get(String(senator.bioguide_id));

                          let hasSupport = false;

                          if (pacData) {
                            const hasAipacSupport = pacData.aipac_supported_2022 === 1 || pacData.aipac_supported_2024 === 1 || pacData.aipac_supported_2026 === 1;
                            const hasDmfiSupport = pacData.dmfi_supported_2022 === 1 || pacData.dmfi_supported_2024 === 1 || pacData.dmfi_supported_2026 === 1;
                            hasSupport = hasAipacSupport || hasDmfiSupport;
                          }
                          const isGood = !hasSupport; // Not receiving support is good
                          const actionLabel = isGood ? billActionData.goodLabel : billActionData.badLabel;
                          const checkmark = isGood ? '✓' : '✗';
                          const checkColor = isGood ? '#10B981' : '#EF4444';
                          billActionHtml = `
                            <div style="margin-top: 6px; font-size: 13px; color: ${secondaryTextColor};">
                              <span style="color: ${checkColor}; font-weight: 600;">${checkmark}</span> ${actionLabel}
                            </div>
                          `;
                        } else {
                          // Check for _cosponsor column for SUPPORT bills only
                          const actionTypes = (billActionData.meta.action_types || '').toLowerCase();
                          const position = (billActionData.meta.position_to_score || '').toUpperCase();
                          const isAgainstBill = position.includes('AGAINST') || position.includes('OPPOSE');
                          const cosponsorColumn = (actionTypes.includes('cosponsor') && !isAgainstBill) ? `${selectedBillColumn}_cosponsor` : null;
                          let rawValue = senator[selectedBillColumn];
                          if (cosponsorColumn && senator[cosponsorColumn] !== undefined) {
                            rawValue = senator[cosponsorColumn];
                          }
                          if (rawValue !== undefined && rawValue !== null && rawValue !== '' && rawValue !== -1) {
                            const value = Number(rawValue);
                            if (!isNaN(value)) {
                              const binaryValue = value > 0 ? 1 : 0;
                              // Use consistent goodValue from billActionData
                              const isGood = binaryValue === billActionData.goodValue;
                              const actionLabel = isGood ? billActionData.goodLabel : billActionData.badLabel;
                              const checkmark = isGood ? '✓' : '✗';
                              const checkColor = isGood ? '#10B981' : '#EF4444';
                              billActionHtml = `
                                <div style="margin-top: 6px; font-size: 13px; color: ${secondaryTextColor};">
                                  <span style="color: ${checkColor}; font-weight: 600;">${checkmark}</span> ${actionLabel}
                                </div>
                              `;
                            }
                          }
                        }
                      }
                      return `
                      <div style="${idx > 0 ? 'margin-top: 9px; padding-top: 9px; border-top: 1px solid rgba(71, 85, 105, 0.3);' : ''}">
                        <div style="display: flex; align-items: center; gap: 12px;">
                          ${senator.photo_url ? `
                            <img
                              src="${senator.photo_url}"
                              alt=""
                              style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover; background-color: #475569; flex-shrink: 0;"
                            />
                          ` : `
                            <div style="width: 54px; height: 54px; border-radius: 50%; background-color: #475569; flex-shrink: 0;"></div>
                          `}
                          <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 17px; font-weight: 600; color: ${primaryTextColor}; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                              ${senator.full_name}
                            </div>
                            <div style="display: flex; gap: 6px; align-items: center;">
                              <span style="${getPartyBadgeStyle(senator.party || '')}">${normalizeParty(senator.party || '')}</span>
                              <span style="${getGradeChipStyle(String(senator.Grade || 'N/A'))}">${senator.Grade || 'N/A'}</span>
                            </div>
                            ${billActionHtml}
                          </div>
                        </div>
                      </div>
                    `}).join('');

                    html = `
                      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 12px;">
                        <div style="font-size: 18px; font-weight: 600; color: ${primaryTextColor}; margin-bottom: 9px;">
                          ${stateName}
                        </div>
                        ${senatorsHtml}
                      </div>
                    `;
                  }

                  // Show tooltip in fixed position (upper right)
                  if (tooltipDiv.current) {
                    tooltipDiv.current.innerHTML = html;
                    tooltipDiv.current.style.display = 'block';
                  }
                }
              }
            }
          } else {
            // House mode: show district and representative
            const stateFips = feature.properties?.STATEFP;
            const cd = feature.properties?.CD118FP;

            if (stateFips && cd && popup.current) {
              const districtKey = `${stateFips}${cd}`;
              const member = districtMembersRef.current[districtKey];
              const stateAbbr = fipsToState[stateFips] || 'Unknown';

              // Get full state name
              const stateName = Object.entries(stateToFips).find(([name, fips]) =>
                fips === stateFips && name.length > 2
              )?.[0] || stateAbbr;

              // Format district number (00 = At-Large, otherwise show number)
              const districtDisplay = cd === '00' ? 'At-Large' : `District ${parseInt(cd, 10)}`;

              if (member && !Array.isArray(member)) {
                // Helper function to get grade chip styling (50% larger)
                const getGradeChipStyle = (grade: string) => {
                  const color = grade.startsWith("A") ? GRADE_COLORS.A
                    : grade.startsWith("B") ? GRADE_COLORS.B
                    : grade.startsWith("C") ? GRADE_COLORS.C
                    : grade.startsWith("D") ? GRADE_COLORS.D
                    : grade.startsWith("F") ? GRADE_COLORS.F
                    : GRADE_COLORS.default;
                  const textColor = grade.startsWith("A") ? "#ffffff"
                    : "#4b5563";
                  return `background: ${color}; color: ${textColor}; display: inline-flex; align-items: center; justify-content: center; border-radius: 9999px; padding: 3px 12px; font-size: 15px; font-weight: 600; min-width: 48px;`;
                };

                // Helper function to get party badge styling (50% larger)
                const getPartyBadgeStyle = (party: string) => {
                  const label = (party || '').toLowerCase();
                  const baseColor = label.startsWith("rep") ? "#EF4444"
                    : label.startsWith("dem") ? "#3B82F6"
                    : label.startsWith("ind") ? "#10B981"
                    : "#94A3B8";
                  return `color: ${baseColor}; background-color: ${baseColor}1A; border: 1px solid ${baseColor}66; display: inline-flex; align-items: center; border-radius: 9px; padding: 2px 6px; font-size: 15px; font-weight: 500;`;
                };

                // Helper function to normalize party label
                const normalizeParty = (party: string) => {
                  const raw = (party || '').trim();
                  if (!raw) return 'Unknown';
                  const s = raw.toLowerCase();
                  if (s.startsWith("democ")) return "Democrat";
                  return raw
                    .split(/\s+/)
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(" ");
                };

                // Detect theme - check both class and computed background color
                const hasDarkClass = document.documentElement.classList.contains('dark');
                const bodyBg = window.getComputedStyle(document.body).backgroundColor;
                const isDarkMode = hasDarkClass || bodyBg.includes('11, 18, 32'); // Check for dark bg color
                // Dark mode needs white text, light mode needs dark text
                const primaryTextColor = isDarkMode ? '#ffffff' : '#334155';
                const secondaryTextColor = isDarkMode ? '#ffffff' : '#475569';

                // Get bill action for this member if bill is selected
                let billActionHtml = '';
                if (billActionData && selectedBillColumn) {
                  // Handle AIPAC/DMFI special case
                  if (selectedBillColumn === '__AIPAC__') {
                    const pacData = pacDataMap.get(String(member.bioguide_id));

                    let hasSupport = false;

                    if (pacData) {
                      const hasAipacSupport = pacData.aipac_supported_2022 === 1 || pacData.aipac_supported_2024 === 1 || pacData.aipac_supported_2026 === 1;
                      const hasDmfiSupport = pacData.dmfi_supported_2022 === 1 || pacData.dmfi_supported_2024 === 1 || pacData.dmfi_supported_2026 === 1;
                      hasSupport = hasAipacSupport || hasDmfiSupport;
                    }
                    const isGood = !hasSupport; // Not receiving support is good
                    const actionLabel = isGood ? billActionData.goodLabel : billActionData.badLabel;
                    const checkmark = isGood ? '✓' : '✗';
                    const checkColor = isGood ? '#10B981' : '#EF4444';
                    billActionHtml = `
                      <div style="margin-top: 6px; font-size: 13px; color: ${secondaryTextColor};">
                        <span style="color: ${checkColor}; font-weight: 600;">${checkmark}</span> ${actionLabel}
                      </div>
                    `;
                  } else {
                    // Check for _cosponsor column for SUPPORT bills only
                    const actionTypes = (billActionData.meta.action_types || '').toLowerCase();
                    const position = (billActionData.meta.position_to_score || '').toUpperCase();
                    const isAgainstBill = position.includes('AGAINST') || position.includes('OPPOSE');
                    const cosponsorColumn = (actionTypes.includes('cosponsor') && !isAgainstBill) ? `${selectedBillColumn}_cosponsor` : null;
                    let rawValue = member[selectedBillColumn];
                    if (cosponsorColumn && member[cosponsorColumn] !== undefined) {
                      rawValue = member[cosponsorColumn];
                    }
                    if (rawValue !== undefined && rawValue !== null && rawValue !== '' && rawValue !== -1) {
                      const value = Number(rawValue);
                      if (!isNaN(value)) {
                        const binaryValue = value > 0 ? 1 : 0;
                        // Use consistent goodValue from billActionData
                        const isGood = binaryValue === billActionData.goodValue;
                        const actionLabel = isGood ? billActionData.goodLabel : billActionData.badLabel;
                        const checkmark = isGood ? '✓' : '✗';
                        const checkColor = isGood ? '#10B981' : '#EF4444';
                        billActionHtml = `
                          <div style="margin-top: 6px; font-size: 13px; color: ${secondaryTextColor};">
                            <span style="color: ${checkColor}; font-weight: 600;">${checkmark}</span> ${actionLabel}
                          </div>
                        `;
                      }
                    }
                  }
                }

                const html = `
                  <div style="font-family: system-ui, -apple-system, sans-serif; padding: 12px;">
                    <div style="font-size: 15px; color: ${secondaryTextColor}; margin-bottom: 6px;">
                      ${stateName} · ${districtDisplay}
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                      ${member.photo_url ? `
                        <img
                          src="${member.photo_url}"
                          alt=""
                          style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover; background-color: #475569; flex-shrink: 0;"
                        />
                      ` : `
                        <div style="width: 54px; height: 54px; border-radius: 50%; background-color: #475569; flex-shrink: 0;"></div>
                      `}
                      <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 17px; font-weight: 600; color: ${primaryTextColor}; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                          ${member.full_name}
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center;">
                          <span style="${getPartyBadgeStyle(member.party || '')}">${normalizeParty(member.party || '')}</span>
                          <span style="${getGradeChipStyle(String(member.Grade || 'N/A'))}">${member.Grade || 'N/A'}</span>
                        </div>
                        ${billActionHtml}
                      </div>
                    </div>
                  </div>
                `;

                // Show tooltip in fixed position (upper right)
                if (tooltipDiv.current) {
                  tooltipDiv.current.innerHTML = html;
                  tooltipDiv.current.style.display = 'block';
                }
              }
            }
          }
        });

        map.current.on('mouseleave', 'districts-fill', () => {
          if (!map.current) return;

          // Clear hover state
          if (hoveredFeatureId.current !== null) {
            map.current.setFeatureState(
              { source: 'districts', id: hoveredFeatureId.current },
              { hover: false }
            );
            hoveredFeatureId.current = null;
          }

          map.current.getCanvas().style.cursor = '';

          // Hide tooltip
          if (tooltipDiv.current) {
            tooltipDiv.current.style.display = 'none';
          }
        });

        // Add click handler
        map.current.on('click', 'districts-fill', (e) => {
          if (!e.features || e.features.length === 0) return;

          const feature = e.features[0];

          if (isSenate) {
            // Senate or Both mode: handle state clicks
            const stateName = feature.properties?.name;
            if (stateName) {
              // Find FIPS from state name and convert to state abbreviation
              const stateFips = Object.entries(stateToFips).find(([name, fips]) =>
                name.toLowerCase() === stateName.toLowerCase()
              )?.[1];

              if (stateFips) {
                const stateMembers = districtMembers[stateFips];
                const stateAbbr = fipsToState[stateFips];

                // If AIPAC mode is selected, navigate to scorecard AIPAC view
                if (selectedBillColumnRef.current === '__AIPAC__' && stateAbbr && onBillMapClickRef.current) {
                  onBillMapClickRef.current(stateAbbr);
                }
                // If bill is selected, open bill modal with state filter
                // Use refs to get latest values (avoids stale closures)
                else if (billActionDataRef.current && stateAbbr && onBillMapClickRef.current) {
                  onBillMapClickRef.current(stateAbbr);
                }
                // Both mode and Senate mode: navigate to state summary view
                else if (stateAbbr && onStateClick) {
                  onStateClick(stateAbbr);
                }
              }
            }
          } else {
            // House mode: click on representative
            const stateFips = feature.properties?.STATEFP;
            const cd = feature.properties?.CD118FP;

            if (stateFips && cd) {
              const districtKey = `${stateFips}${cd}`;
              const member = districtMembersRef.current[districtKey];
              const stateAbbr = fipsToState[stateFips];

              // If AIPAC mode is selected, open member modal with AIPAC section active
              if (selectedBillColumnRef.current === '__AIPAC__' && member && !Array.isArray(member) && onMemberClick) {
                onMemberClick(member);
              }
              // If bill is selected, open bill modal with state filter
              // Use refs to get latest values (avoids stale closures)
              else if (billActionDataRef.current && stateAbbr && onBillMapClickRef.current) {
                onBillMapClickRef.current(stateAbbr);
              }
              // Otherwise open member modal
              else if (member && !Array.isArray(member) && onMemberClick) {
                onMemberClick(member);
              }
            }
          }
        });

        setLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error loading districts';
        console.error('Error loading district data:', err);
        setError(errorMessage);
        setLoading(false);
      }
    });

    return () => {
      if (popup.current) {
        popup.current.remove();
        popup.current = null;
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamber, mapChamberView]); // Only rebuild map when chamber view changes, not on every members update

  // Separate effect to update map colors without recreating the map
  useEffect(() => {
    const updateColors = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;
      if (!map.current.getLayer('districts-fill')) return;

      // Determine current map view (Senate = states, House = districts)
      const mapSource = map.current.getSource('districts');
      if (!mapSource) return;

      // Build the new fill color expression
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fillColor: any;

      // Match the initial map setup logic for determining Senate vs House view
      let isSenate = chamber === 'SENATE' || !chamber;

      // If we have bill action data and no specific chamber, use the bill's effective chamber
      if (billActionData && !chamber) {
        isSenate = billActionData.effectiveChamber === 'SENATE';
      }

      if (billActionData) {
        // Check if this is partisan view
        const isPartisanView = selectedBillColumn === '__PARTISAN__';

        if (isSenate) {
          // Senate mode: color states
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const colorParts: any[] = [];
          Object.entries(billActionData.stateActions).forEach(([stateCode, actions]) => {
            const stateName = stateNameMapping[stateCode];
            if (stateName) {
              let color = '#E5E7EB';

              // Check if this is partisan view
              if (isPartisanView && 'republican' in actions) {
                // Partisan view: republican/democrat/other
                const partisanActions = actions as { republican: number; democrat: number; other: number };
                if (partisanActions.democrat === 2 || (partisanActions.democrat === 1 && partisanActions.republican === 0 && partisanActions.other === 0)) {
                  color = '#2563eb'; // Blue - Both Democrats
                } else if (partisanActions.republican === 2 || (partisanActions.republican === 1 && partisanActions.democrat === 0 && partisanActions.other === 0)) {
                  color = '#dc2626'; // Red - Both Republicans
                } else {
                  color = '#9333ea'; // Purple - Split/Mixed
                }
              } else if (!isPartisanView && 'good' in actions) {
                // Regular bill view: good/bad
                const regularActions = actions as { good: number; bad: number };
                if (regularActions.good === 2) color = GRADE_COLORS.A;
                else if (regularActions.good === 1 && regularActions.bad === 1) color = GRADE_COLORS.C;
                else if (regularActions.bad === 2) color = GRADE_COLORS.F;
                else if (regularActions.good === 1) color = GRADE_COLORS.A;
                else if (regularActions.bad === 1) color = GRADE_COLORS.F;
              }

              colorParts.push(['==', ['get', 'name'], stateName], color);
            }
          });
          colorParts.push('#E5E7EB');
          fillColor = ['case', ...colorParts];
        } else {
          // House mode: color districts
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const colorParts: any[] = [];
          Object.entries(billActionData.districtActions).forEach(([key, action]) => {
            let color: string;
            if (action === 'good') {
              color = isPartisanView ? '#2563eb' : GRADE_COLORS.A;
            } else if (action === 'bad') {
              color = isPartisanView ? '#dc2626' : GRADE_COLORS.F;
            } else {
              // Independent/Other purple (neutral)
              color = '#9333ea';
            }
            colorParts.push(['==', ['concat', ['get', 'STATEFP'], ['get', 'CD118FP']], key], color);
          });
          colorParts.push('#E5E7EB');
          fillColor = ['case', ...colorParts];
        }
      } else {
        // No bill selected - use grade colors
        const gradeColors: Record<string, string> = {
          'A+': GRADE_COLORS.A, 'A': GRADE_COLORS.A, 'A-': GRADE_COLORS.A,
          'B+': GRADE_COLORS.B, 'B': GRADE_COLORS.B, 'B-': GRADE_COLORS.B,
          'C+': GRADE_COLORS.C, 'C': GRADE_COLORS.C, 'C-': GRADE_COLORS.C,
          'D+': GRADE_COLORS.D, 'D': GRADE_COLORS.D, 'D-': GRADE_COLORS.D,
          'F': GRADE_COLORS.F
        };

        // Build grade color expression
        const districtGrades: Record<string, string> = {};

        if (isSenate) {
          // For Senate/All view: aggregate member grades by state
          const membersByState: Record<string, Row[]> = {};

          members.forEach(member => {
            const state = stateCodeOf(member.state);
            const stateName = stateNameMapping[state];
            if (stateName) {
              if (!membersByState[stateName]) {
                membersByState[stateName] = [];
              }
              membersByState[stateName].push(member);
            }
          });

          // Calculate average grade for each state
          const gradeValues: Record<string, number> = {
            'A+': 100, 'A': 95, 'A-': 90,
            'B+': 87, 'B': 83, 'B-': 80,
            'C+': 77, 'C': 73, 'C-': 70,
            'D+': 67, 'D': 63, 'D-': 60,
            'F': 50
          };

          // Also build member mapping for tooltips
          const districtMembers: Record<string, Row[]> = {};

          Object.entries(membersByState).forEach(([stateName, stateMembers]) => {
            const validGrades = stateMembers
              .map(m => gradeValues[String(m.Grade || '')])
              .filter(v => v !== undefined);

            if (validGrades.length > 0) {
              const avg = validGrades.reduce((a, b) => a + b, 0) / validGrades.length;

              // Convert back to letter grade
              let avgGrade = 'N/A';
              if (avg >= 98) avgGrade = 'A+';
              else if (avg >= 93) avgGrade = 'A';
              else if (avg >= 88.5) avgGrade = 'A-';
              else if (avg >= 85) avgGrade = 'B+';
              else if (avg >= 81.5) avgGrade = 'B';
              else if (avg >= 78.5) avgGrade = 'B-';
              else if (avg >= 75) avgGrade = 'C+';
              else if (avg >= 71.5) avgGrade = 'C';
              else if (avg >= 68.5) avgGrade = 'C-';
              else if (avg >= 65) avgGrade = 'D+';
              else if (avg >= 61.5) avgGrade = 'D';
              else if (avg >= 55) avgGrade = 'D-';
              else avgGrade = 'F';

              districtGrades[stateName] = avgGrade;

              // Store members by FIPS for tooltip access
              const stateAbbr = Object.entries(stateNameMapping).find(([abbr, name]) => name === stateName)?.[0];
              const fips = stateAbbr ? stateToFips[stateAbbr] : undefined;
              if (fips) {
                districtMembers[fips] = stateMembers;
              }
            }
          });

          // Update refs for tooltip access
          districtGradesRef.current = {};
          districtMembersRef.current = districtMembers;
          Object.entries(districtGrades).forEach(([stateName, grade]) => {
            const stateAbbr = Object.entries(stateNameMapping).find(([abbr, name]) => name === stateName)?.[0];
            const fips = stateAbbr ? stateToFips[stateAbbr] : undefined;
            if (fips) {
              districtGradesRef.current[fips] = grade;
            }
          });
        } else {
          // For House view: use individual member grades
          const districtMembers: Record<string, Row> = {};

          members.forEach(member => {
            if (member.chamber === 'HOUSE') {
              const grade = String(member.Grade || '');
              const state = stateCodeOf(member.state);
              const district = String(member.district || '00').padStart(2, '0');
              const fips = stateToFips[state];
              if (fips && grade) {
                const districtKey = `${fips}${district}`;
                districtGrades[districtKey] = grade;
                districtMembers[districtKey] = member;
              }
            }
          });

          // Update refs for tooltip access
          districtGradesRef.current = districtGrades;
          districtMembersRef.current = districtMembers;
        }

        if (Object.keys(districtGrades).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const matchExpression: any[] = [
            'match',
            isSenate ? ['get', 'name'] : ['concat', ['get', 'STATEFP'], ['get', 'CD118FP']]
          ];
          Object.entries(districtGrades).forEach(([key, grade]) => {
            matchExpression.push(key);
            matchExpression.push(gradeColors[grade] || '#9ca3af');
          });
          matchExpression.push('#e5e7eb');
          fillColor = matchExpression;
        } else {
          fillColor = '#e5e7eb';
        }
      }

      // Update the paint property
      try {
        map.current.setPaintProperty('districts-fill', 'fill-color', fillColor);
      } catch {
        // Layer may not exist yet, ignore
      }
    };

    // Try to update immediately
    updateColors();

    // Also set up a listener to update when the map finishes loading
    // This ensures colors are updated even if members data was available before map loaded
    if (map.current && !map.current.isStyleLoaded()) {
      const handleLoad = () => {
        updateColors();
      };
      map.current.once('idle', handleLoad);
    }
  }, [billActionData, chamber, members]);


  return (
    <div className="relative w-full h-[400px] md:h-[600px] rounded-xl overflow-hidden border border-[#E7ECF2] dark:border-slate-900">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-[#0B1220] z-10">
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading {chamber === 'SENATE' ? 'state map' : chamber === 'HOUSE' ? 'congressional districts' : 'state map'}...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-[#0B1220] z-10">
          <div className="text-center p-4">
            <div className="text-sm text-red-600 dark:text-red-400 mb-2">Error loading district map</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{error}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">Check browser console for details</div>
          </div>
        </div>
      )}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Fixed tooltip in upper right corner */}
      <div
        ref={tooltipDiv}
        className="absolute top-4 right-4 z-20 rounded-xl border border-white/30 dark:border-slate-900 bg-white/75 dark:bg-[#1a2332]/75 backdrop-blur-md shadow-xl max-w-sm"
        style={{ display: 'none' }}
      />

      {/* Bill action legend */}
      {billActionData && (() => {
        const isPartisanView = selectedBillColumn === '__PARTISAN__';
        return (
          <div className="absolute bottom-4 left-4 z-20 rounded-lg border border-white/30 dark:border-slate-900 bg-white/90 dark:bg-[#1a2332]/90 backdrop-blur-md shadow-lg p-3 max-w-md">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
              {billActionData.meta.display_name || billActionData.meta.short_title || selectedBillColumn}
            </div>
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-600 dark:text-slate-400">
              {billActionData.effectiveChamber === 'SENATE' ? (
                <>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: isPartisanView ? '#2563eb' : GRADE_COLORS.A }} />
                    <span>Both: {billActionData.goodLabel} ({billActionData.stats.senateBothGood})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: isPartisanView ? '#9333ea' : GRADE_COLORS.C }} />
                    <span>Split ({billActionData.stats.senateSplit})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: isPartisanView ? '#dc2626' : GRADE_COLORS.F }} />
                    <span>Both: {billActionData.badLabel} ({billActionData.stats.senateBothBad})</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: isPartisanView ? '#2563eb' : GRADE_COLORS.A }} />
                    <span>{billActionData.goodLabel} ({billActionData.stats.houseGood})</span>
                  </div>
                  {(() => {
                    const stats = billActionData.stats as { houseGood: number; houseBad: number; houseNeutral?: number };
                    const neutralLabel = 'neutralLabel' in billActionData ? (billActionData as { neutralLabel: string }).neutralLabel : 'Independent/Other';
                    return isPartisanView && stats.houseNeutral && stats.houseNeutral > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#9333ea' }} />
                        <span>{neutralLabel} ({stats.houseNeutral})</span>
                      </div>
                    );
                  })()}
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: isPartisanView ? '#dc2626' : GRADE_COLORS.F }} />
                    <span>{billActionData.badLabel} ({billActionData.stats.houseBad})</span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders when props haven't changed
export default memo(DistrictMap);
