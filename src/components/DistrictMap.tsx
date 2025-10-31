"use client";

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Row } from '@/lib/types';

interface DistrictMapProps {
  members: Row[];
  onMemberClick?: (member: Row) => void;
  onStateClick?: (stateCode: string) => void;
  chamber?: string; // "HOUSE" or "SENATE"
}

export default function DistrictMap({ members, onMemberClick, onStateClick, chamber }: DistrictMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

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

    // Initialize map
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm'
          }
        ]
      },
      center: [-98.5795, 39.8283], // Center of US
      zoom: 3.5,
      maxZoom: 10,
      minZoom: 2
    });

    // Load congressional district or state boundaries based on chamber
    map.current.on('load', async () => {
      if (!map.current) return;

      try {
        const isSenate = chamber === 'SENATE' || !chamber; // Both mode (no chamber) shows states too
        const isBothMode = !chamber; // Both mode when chamber is empty/undefined
        console.log(`Starting to load ${isSenate ? 'state' : 'district'} data... (Both mode: ${isBothMode})`);

        // Load appropriate GeoJSON file based on chamber
        const dataUrl = isSenate
          ? 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'  // State boundaries GeoJSON for Senate
          : '/data/districts/congressional-districts-118th.geojson';    // District boundaries for House

        const response = await fetch(dataUrl);
        console.log('Fetch response status:', response.status, response.ok);

        if (!response.ok) {
          throw new Error(`Failed to load ${isSenate ? 'state' : 'district'} data: ${response.status} ${response.statusText}`);
        }

        const geoJsonData = await response.json();

        console.log('Loaded geo data:', {
          type: geoJsonData.type,
          featureCount: geoJsonData.features?.length,
          firstFeature: geoJsonData.features?.[0],
          sampleFeatureProperties: geoJsonData.features?.[0]?.properties,
          sampleFeatureId: geoJsonData.features?.[0]?.id
        });

        // Add data source
        map.current.addSource('districts', {
          type: 'geojson',
          data: geoJsonData
        });

        // Create a grade color map for districts (matching main app color scheme)
        const gradeColors: Record<string, string> = {
          'A+': '#050a30',  // dark navy blue
          'A': '#050a30',   // dark navy blue
          'A-': '#050a30',  // dark navy blue
          'B+': '#93c5fd',  // light blue
          'B': '#93c5fd',   // light blue
          'B-': '#93c5fd',  // light blue
          'C+': '#b6dfcc',  // mint green
          'C': '#b6dfcc',   // mint green
          'C-': '#b6dfcc',  // mint green
          'D+': '#D4B870',  // tan/gold
          'D': '#D4B870',   // tan/gold
          'D-': '#D4B870',  // tan/gold
          'F': '#C38B32',   // bronze/gold
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
          'VI': '78', 'U.S. VIRGIN ISLANDS': '78'
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

        // 2024 Presidential election projections by state (FIPS code)
        // Colors: Dark Blue (Safe D), Light Blue (Likely D), Purple (Toss-up), Light Red (Likely R), Dark Red (Safe R)
        const presidentialColors: Record<string, string> = {
          // Dark Blue - Safe Democratic
          '06': '#1e40af', // California
          '09': '#1e40af', // Connecticut
          '10': '#1e40af', // Delaware
          '11': '#1e40af', // DC
          '15': '#1e40af', // Hawaii
          '17': '#1e40af', // Illinois
          '24': '#1e40af', // Maryland
          '25': '#1e40af', // Massachusetts
          '36': '#1e40af', // New York
          '44': '#1e40af', // Rhode Island
          '50': '#1e40af', // Vermont
          '53': '#1e40af', // Washington

          // Light Blue - Likely Democratic
          '08': '#60a5fa', // Colorado
          '23': '#60a5fa', // Maine
          '27': '#60a5fa', // Minnesota
          '33': '#60a5fa', // New Hampshire
          '34': '#60a5fa', // New Jersey
          '35': '#60a5fa', // New Mexico
          '41': '#60a5fa', // Oregon
          '51': '#60a5fa', // Virginia

          // Purple - Toss-up
          '04': '#7c3aed', // Arizona
          '13': '#7c3aed', // Georgia
          '26': '#7c3aed', // Michigan
          '32': '#7c3aed', // Nevada
          '37': '#7c3aed', // North Carolina
          '42': '#7c3aed', // Pennsylvania
          '55': '#7c3aed', // Wisconsin

          // Light Red - Likely Republican
          '01': '#f87171', // Alabama
          '12': '#f87171', // Florida
          '19': '#f87171', // Iowa
          '18': '#f87171', // Indiana
          '20': '#f87171', // Kansas
          '22': '#f87171', // Louisiana
          '28': '#f87171', // Mississippi
          '29': '#f87171', // Missouri
          '30': '#f87171', // Montana
          '31': '#f87171', // Nebraska
          '39': '#f87171', // Ohio
          '45': '#f87171', // South Carolina
          '46': '#f87171', // South Dakota
          '47': '#f87171', // Tennessee
          '48': '#f87171', // Texas

          // Dark Red - Safe Republican
          '02': '#b91c1c', // Alaska
          '05': '#b91c1c', // Arkansas
          '16': '#b91c1c', // Idaho
          '21': '#b91c1c', // Kentucky
          '38': '#b91c1c', // North Dakota
          '40': '#b91c1c', // Oklahoma
          '49': '#b91c1c', // Utah
          '54': '#b91c1c', // West Virginia
          '56': '#b91c1c', // Wyoming
        };

        // Create district/state-to-member mapping
        const districtGrades: Record<string, string> = {};
        const districtMembers: Record<string, Row | Row[]> = {};

        if (isSenate) {
          // For Senate or Both mode: group members by state and calculate average grade
          const membersByState: Record<string, Row[]> = {};

          console.log('Processing members for state view. Total members:', members.length);
          const senateMembersCount = members.filter(m => m.chamber === 'SENATE').length;
          const houseMembersCount = members.filter(m => m.chamber === 'HOUSE').length;
          console.log('Senate members found:', senateMembersCount, 'House members found:', houseMembersCount);

          members.forEach((member) => {
            // In Both mode, include all members; in Senate mode, only senators
            if (isBothMode || member.chamber === 'SENATE') {
              const state = member.state;
              const fips = getStateFips(state);

              console.log('Processing member:', member.full_name, 'Chamber:', member.chamber, 'State:', state, 'FIPS:', fips, 'Grade:', member.Grade);

              if (fips) {
                if (!membersByState[fips]) {
                  membersByState[fips] = [];
                }
                membersByState[fips].push(member);
              }
            }
          });

          console.log('States with members:', Object.keys(membersByState).length);

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
              console.log('Mapped state:', fips, 'Avg Grade:', avgGrade, 'Members:', stateMembers.map(m => `${m.full_name} (${m.chamber})`));
            }
          });

          console.log('State grades mapped:', Object.keys(districtGrades).length);
        } else {
          // For House: map districts to individual representatives
          members.forEach((member) => {
            if (member.chamber === 'HOUSE') {
              const state = member.state;
              const district = String(member.district || '');

              console.log('Processing member:', member.full_name, 'State:', state, 'District:', district);

              const fips = getStateFips(state);
              console.log('State:', state, 'FIPS:', fips);
              if (fips) {
                const districtNum = district === '' ? '00' : district.padStart(2, '0');
                const districtKey = `${fips}${districtNum}`;
                const grade = String(member.Grade || 'N/A');
                districtGrades[districtKey] = grade;
                districtMembers[districtKey] = member;
                console.log('Mapped district:', districtKey, 'Grade:', grade);
              }
            }
          });

          console.log('District grades mapped:', Object.keys(districtGrades).length);
          console.log('Sample mappings:', Object.entries(districtGrades).slice(0, 5));
        }

        // Create FIPS to state abbr reverse lookup for Senate matching
        const fipsToStateAbbr: Record<string, string> = {};
        Object.entries(stateToFips).forEach(([abbr, fips]) => {
          if (abbr.length === 2) {
            fipsToStateAbbr[fips] = abbr;
          }
        });

        // Add fill layer for districts/states with colors based on grades or presidential projections
        let fillColor: any;

        if (isBothMode) {
          // Both mode: Use presidential election colors
          const matchExpression: any[] = [
            'match',
            ['get', 'name']  // For states GeoJSON, use the 'name' property (state name)
          ];

          // Add all states with presidential colors
          Object.entries(presidentialColors).forEach(([fips, color]) => {
            // Convert FIPS to state name for matching
            const stateAbbr = fipsToStateAbbr[fips];
            const stateEntry = Object.entries(stateToFips).find(([name]) =>
              name.length === 2 && name === stateAbbr
            );
            if (stateEntry) {
              const fullNameEntry = Object.entries(stateToFips).find(([name, fipsCode]) =>
                fipsCode === fips && name.length > 2
              );
              const matchKey = fullNameEntry ? fullNameEntry[0].toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : stateAbbr;
              matchExpression.push(matchKey);
              matchExpression.push(color);
              console.log(`Added state to presidential match:`, matchKey, '→', color);
            }
          });

          // Add fallback color (required)
          matchExpression.push('#e5e7eb'); // default gray

          console.log('Presidential match expression has', (matchExpression.length - 3) / 2, 'states');
          fillColor = matchExpression;
        } else if (Object.keys(districtGrades).length > 0) {
          // Senate or House mode: Use grade colors
          const matchExpression: any[] = [
            'match',
            isSenate
              ? ['get', 'name']  // For states GeoJSON, use the 'name' property (state name)
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
            console.log(`Added ${isSenate ? 'state' : 'district'} to match:`, matchKey, '→', grade, '→', gradeColors[grade]);
          });

          // Add fallback color (required)
          matchExpression.push('#e5e7eb'); // default gray for areas without data

          console.log('Match expression has', (matchExpression.length - 3) / 2, isSenate ? 'states' : 'districts');
          console.log('Full match expression:', JSON.stringify(matchExpression, null, 2));
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

        console.log('Added districts-fill layer with fillColor:', typeof fillColor === 'string' ? fillColor : 'expression');

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

          if (isSenate) {
            // Senate or Both mode: show state and all lawmakers
            const stateName = feature.properties?.name;
            if (stateName && popup.current) {
              // Find FIPS from state name
              const stateFips = Object.entries(stateToFips).find(([name, fips]) =>
                name.toLowerCase() === stateName.toLowerCase()
              )?.[1];

              if (stateFips) {
                const stateMembers = districtMembers[stateFips];
                const stateAbbr = fipsToState[stateFips] || stateName;

                if (stateMembers && Array.isArray(stateMembers)) {
                  const avgGrade = districtGrades[stateFips] || 'N/A';

                  // Helper function to get grade chip styling
                  const getGradeChipStyle = (grade: string) => {
                    const color = grade.startsWith("A") ? "#050a30"
                      : grade.startsWith("B") ? "#93c5fd"
                      : grade.startsWith("C") ? "#b6dfcc"
                      : grade.startsWith("D") ? "#D4B870"
                      : "#C38B32";
                    const textColor = grade.startsWith("A") ? "#ffffff"
                      : "#4b5563";
                    return `background: ${color}; color: ${textColor}; display: inline-flex; align-items: center; justify-content: center; border-radius: 9999px; padding: 4px 10px; font-size: 11px; font-weight: 700; min-width: 44px;`;
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

                  // Helper function to get party badge styling
                  const getPartyBadgeStyle = (party: string) => {
                    const label = (party || '').toLowerCase();
                    const baseColor = label.startsWith("rep") ? "#EF4444"
                      : label.startsWith("dem") ? "#3B82F6"
                      : label.startsWith("ind") ? "#10B981"
                      : "#94A3B8";
                    return `color: ${baseColor}; background-color: ${baseColor}1A; border: 1px solid ${baseColor}66; display: inline-flex; align-items: center; border-radius: 6px; padding: 2px 6px; font-size: 11px; font-weight: 500;`;
                  };

                  let html = '';

                  if (isBothMode) {
                    // Both mode: Just show state and average grade
                    html = `
                      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 12px; min-width: 200px;">
                        <div style="font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 8px;">
                          ${stateName}
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <span style="font-size: 12px; color: #64748b; font-weight: 500;">Average Grade:</span>
                          <span style="${getGradeChipStyle(avgGrade)}">${avgGrade}</span>
                        </div>
                      </div>
                    `;
                  } else {
                    // Senate mode: Show senators with details
                    const senators = stateMembers.filter(m => m.chamber === 'SENATE');
                    const senatorsHtml = senators.map(senator => `
                      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                          ${senator.photo_url ? `
                            <img
                              src="${senator.photo_url}"
                              alt=""
                              style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background-color: #e5e7eb;"
                            />
                          ` : `
                            <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #e5e7eb;"></div>
                          `}
                          <div style="font-size: 13px; font-weight: 600; color: #1e293b;">
                            ${senator.full_name}
                          </div>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                          <span style="${getPartyBadgeStyle(senator.party || '')}">${normalizeParty(senator.party || '')}</span>
                          <span style="${getGradeChipStyle(String(senator.Grade || 'N/A'))}">${senator.Grade || 'N/A'}</span>
                        </div>
                      </div>
                    `).join('');

                    html = `
                      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 12px; min-width: 220px;">
                        <div style="font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">
                          ${stateName}
                        </div>
                        ${senatorsHtml}
                      </div>
                    `;
                  }

                  popup.current
                    .setLngLat(e.lngLat)
                    .setHTML(html)
                    .addTo(map.current);
                }
              }
            }
          } else {
            // House mode: show district and representative
            const stateFips = feature.properties?.STATEFP;
            const cd = feature.properties?.CD118FP;

            if (stateFips && cd && popup.current) {
              const districtKey = `${stateFips}${cd}`;
              const member = districtMembers[districtKey];
              const stateAbbr = fipsToState[stateFips] || 'Unknown';

              // Get full state name
              const stateName = Object.entries(stateToFips).find(([name, fips]) =>
                fips === stateFips && name.length > 2
              )?.[0] || stateAbbr;

              // Format district number (00 = At-Large, otherwise show number)
              const districtDisplay = cd === '00' ? 'At-Large' : `District ${parseInt(cd, 10)}`;

              if (member && !Array.isArray(member)) {
                // Helper function to get grade chip styling
                const getGradeChipStyle = (grade: string) => {
                  const color = grade.startsWith("A") ? "#050a30"
                    : grade.startsWith("B") ? "#93c5fd"
                    : grade.startsWith("C") ? "#b6dfcc"
                    : grade.startsWith("D") ? "#D4B870"
                    : "#C38B32";
                  const textColor = grade.startsWith("A") ? "#ffffff"
                    : "#4b5563";
                  return `background: ${color}; color: ${textColor}; display: inline-flex; align-items: center; justify-content: center; border-radius: 9999px; padding: 4px 10px; font-size: 11px; font-weight: 700; min-width: 44px;`;
                };

                // Helper function to get party badge styling
                const getPartyBadgeStyle = (party: string) => {
                  const label = (party || '').toLowerCase();
                  const baseColor = label.startsWith("rep") ? "#EF4444"
                    : label.startsWith("dem") ? "#3B82F6"
                    : label.startsWith("ind") ? "#10B981"
                    : "#94A3B8";
                  return `color: ${baseColor}; background-color: ${baseColor}1A; border: 1px solid ${baseColor}66; display: inline-flex; align-items: center; border-radius: 6px; padding: 2px 6px; font-size: 11px; font-weight: 500;`;
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

                const html = `
                  <div style="font-family: system-ui, -apple-system, sans-serif; padding: 12px; min-width: 200px;">
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 2px;">
                      ${stateName}
                    </div>
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">
                      ${districtDisplay}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                      ${member.photo_url ? `
                        <img
                          src="${member.photo_url}"
                          alt=""
                          style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background-color: #e5e7eb;"
                        />
                      ` : `
                        <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #e5e7eb;"></div>
                      `}
                      <div style="font-size: 13px; font-weight: 600; color: #1e293b;">
                        ${member.full_name}
                      </div>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                      <span style="${getPartyBadgeStyle(member.party || '')}">${normalizeParty(member.party || '')}</span>
                      <span style="${getGradeChipStyle(String(member.Grade || 'N/A'))}">${member.Grade || 'N/A'}</span>
                    </div>
                  </div>
                `;

                popup.current
                  .setLngLat(e.lngLat)
                  .setHTML(html)
                  .addTo(map.current);
              }
            }
          }
        });

        map.current.on('mouseleave', 'districts-fill', () => {
          if (!map.current) return;

          map.current.getCanvas().style.cursor = '';
          if (popup.current) {
            popup.current.remove();
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

                console.log('Clicked state:', stateName, 'FIPS:', stateFips, 'Abbr:', stateAbbr, 'Members:', Array.isArray(stateMembers) ? stateMembers.map(m => m.full_name) : 'none');

                // Both mode and Senate mode: navigate to state summary view
                if (stateAbbr && onStateClick) {
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
              const member = districtMembers[districtKey];

              console.log('Clicked district:', districtKey, 'Member:', !Array.isArray(member) ? member?.full_name : 'error');

              if (member && !Array.isArray(member) && onMemberClick) {
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
  }, [members, onMemberClick, onStateClick, chamber]);

  return (
    <div className="relative w-full h-[600px] rounded-xl overflow-hidden border border-[#E7ECF2] dark:border-white/10">
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
    </div>
  );
}
