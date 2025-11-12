"use client";

import { useEffect, useRef, useState, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Row } from '@/lib/types';

interface DistrictMapProps {
  members: Row[];
  onMemberClick?: (member: Row) => void;
  onStateClick?: (stateCode: string) => void;
  chamber?: string; // "HOUSE" or "SENATE"
}

function DistrictMap({ members, onMemberClick, onStateClick, chamber }: DistrictMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const hoveredFeatureId = useRef<string | number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltipContent, setTooltipContent] = useState<string>('');

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

        // Load appropriate GeoJSON file based on chamber
        const dataUrl = isSenate
          ? 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'  // State boundaries GeoJSON for Senate
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

        // Create district/state-to-member mapping
        const districtGrades: Record<string, string> = {};
        const districtMembers: Record<string, Row | Row[]> = {};

        if (isSenate) {
          // For Senate or Both mode: group members by state and calculate average grade
          const membersByState: Record<string, Row[]> = {};

          const senateMembersCount = members.filter(m => m.chamber === 'SENATE').length;
          const houseMembersCount = members.filter(m => m.chamber === 'HOUSE').length;

          members.forEach((member) => {
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

        } else {
          // For House: map districts to individual representatives
          members.forEach((member) => {
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

        // Create FIPS to state abbr reverse lookup for Senate matching
        const fipsToStateAbbr: Record<string, string> = {};
        Object.entries(stateToFips).forEach(([abbr, fips]) => {
          if (abbr.length === 2) {
            fipsToStateAbbr[fips] = abbr;
          }
        });

        // Add fill layer for districts/states with colors based on grades or presidential projections
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fillColor: any;

        if (Object.keys(districtGrades).length > 0) {
          // Senate or House mode: Use grade colors
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            const stateResponse = await fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json');
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
            console.log('Hovering feature ID:', feature.id, 'Properties:', feature.properties);
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
                      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 12px; min-width: 200px;">
                        <div style="font-size: 16px; font-weight: 700; color: ${primaryTextColor}; margin-bottom: 8px;">
                          ${stateName}
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <span style="font-size: 12px; color: ${secondaryTextColor}; font-weight: 500;">Average Grade:</span>
                          <span style="${getGradeChipStyle(avgGrade)}">${avgGrade}</span>
                        </div>
                      </div>
                    `;
                  } else {
                    // Senate mode: Show senators with details
                    const senators = stateMembers.filter(m => m.chamber === 'SENATE');
                    const senatorsHtml = senators.map(senator => `
                      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #475569;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                          ${senator.photo_url ? `
                            <img
                              src="${senator.photo_url}"
                              alt=""
                              style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background-color: #475569;"
                            />
                          ` : `
                            <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #475569;"></div>
                          `}
                          <div style="font-size: 13px; font-weight: 600; color: ${primaryTextColor};">
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
                        <div style="font-size: 16px; font-weight: 700; color: ${primaryTextColor}; margin-bottom: 4px;">
                          ${stateName}
                        </div>
                        ${senatorsHtml}
                      </div>
                    `;
                  }

                  setTooltipContent(html);
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

                // Detect theme - check both class and computed background color
                const hasDarkClass = document.documentElement.classList.contains('dark');
                const bodyBg = window.getComputedStyle(document.body).backgroundColor;
                const isDarkMode = hasDarkClass || bodyBg.includes('11, 18, 32'); // Check for dark bg color
                // Dark mode needs white text, light mode needs dark text
                const primaryTextColor = isDarkMode ? '#ffffff' : '#334155';
                const secondaryTextColor = isDarkMode ? '#ffffff' : '#475569';

                const html = `
                  <div style="font-family: system-ui, -apple-system, sans-serif; padding: 12px; min-width: 200px;">
                    <div style="font-size: 16px; font-weight: 700; color: ${primaryTextColor}; margin-bottom: 2px;">
                      ${stateName}
                    </div>
                    <div style="font-size: 12px; color: ${secondaryTextColor}; margin-bottom: 8px;">
                      ${districtDisplay}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                      ${member.photo_url ? `
                        <img
                          src="${member.photo_url}"
                          alt=""
                          style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background-color: #475569;"
                        />
                      ` : `
                        <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #475569;"></div>
                      `}
                      <div style="font-size: 13px; font-weight: 600; color: ${primaryTextColor};">
                        ${member.full_name}
                      </div>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                      <span style="${getPartyBadgeStyle(member.party || '')}">${normalizeParty(member.party || '')}</span>
                      <span style="${getGradeChipStyle(String(member.Grade || 'N/A'))}">${member.Grade || 'N/A'}</span>
                    </div>
                  </div>
                `;

                setTooltipContent(html);
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
          setTooltipContent('');
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
    <div className="relative w-full h-[600px] rounded-xl overflow-hidden border border-[#E7ECF2] dark:border-slate-900">
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
      {tooltipContent && (
        <div
          className="absolute top-4 right-4 z-20 rounded-xl border border-white/30 dark:border-slate-900 bg-white/75 dark:bg-[#1a2332]/75 backdrop-blur-md shadow-xl max-w-2xl"
          style={{ transform: 'scale(1.5)', transformOrigin: 'top right' }}
          dangerouslySetInnerHTML={{ __html: tooltipContent }}
        />
      )}
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders when props haven't changed
export default memo(DistrictMap);
