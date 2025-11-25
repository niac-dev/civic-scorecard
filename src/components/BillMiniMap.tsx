"use client";

import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Row, Meta } from '@/lib/types';
import { stateCodeOf, inferChamber, GRADE_COLORS } from '@/lib/utils';

interface BillMiniMapProps {
  meta: Meta;
  column: string;
  rows: Row[];
  firstSection: Row[];
  secondSection: Row[];
  firstIsGood: boolean;
  secondIsGood: boolean | 'partial';
  firstLabel: string;
  secondLabel: string;
  manualScoringMeta?: Map<string, string>;
}

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

const fipsToState: Record<string, string> = Object.entries(stateToFips).reduce((acc, [state, fips]) => {
  acc[fips] = state;
  return acc;
}, {} as Record<string, string>);

// State name mapping
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

const stateNameToCode: Record<string, string> = Object.entries(stateNameMapping).reduce((acc, [code, name]) => {
  acc[name] = code;
  return acc;
}, {} as Record<string, string>);

export function BillMiniMap({ meta, column, rows, firstSection, secondSection, firstIsGood, secondIsGood, firstLabel, secondLabel }: BillMiniMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine if this is a House or Senate bill
  const billChamber = inferChamber(meta, column);

  // Calculate action data for coloring
  const actionData = useMemo(() => {
    if (billChamber === 'SENATE') {
      // For Senate bills: group by state and determine if both senators took action
      const stateActions: Record<string, { good: number; bad: number }> = {};

      // Initialize all states
      Object.keys(stateToFips).forEach(state => {
        if (state !== 'AS' && state !== 'GU' && state !== 'MP' && state !== 'PR' && state !== 'VI') {
          stateActions[state] = { good: 0, bad: 0 };
        }
      });

      // Count good actions by state
      firstSection.forEach(member => {
        if (member.chamber === 'SENATE') {
          const state = stateCodeOf(member.state);
          if (stateActions[state]) {
            if (firstIsGood) {
              stateActions[state].good++;
            } else {
              stateActions[state].bad++;
            }
          }
        }
      });

      // Count bad actions by state
      secondSection.forEach(member => {
        if (member.chamber === 'SENATE') {
          const state = stateCodeOf(member.state);
          if (stateActions[state]) {
            if (secondIsGood === true) {
              stateActions[state].good++;
            } else {
              stateActions[state].bad++;
            }
          }
        }
      });

      return { type: 'senate' as const, stateActions };
    } else {
      // For House bills: map each district to action
      const districtActions: Record<string, 'good' | 'bad' | 'none'> = {};

      firstSection.forEach(member => {
        if (member.chamber === 'HOUSE') {
          const state = stateCodeOf(member.state);
          const district = String(member.district || '00').padStart(2, '0');
          const fips = stateToFips[state];
          if (fips) {
            const key = `${fips}-${district}`;
            districtActions[key] = firstIsGood ? 'good' : 'bad';
          }
        }
      });

      secondSection.forEach(member => {
        if (member.chamber === 'HOUSE') {
          const state = stateCodeOf(member.state);
          const district = String(member.district || '00').padStart(2, '0');
          const fips = stateToFips[state];
          if (fips) {
            const key = `${fips}-${district}`;
            districtActions[key] = secondIsGood === true ? 'good' : 'bad';
          }
        }
      });

      return { type: 'house' as const, districtActions };
    }
  }, [billChamber, firstSection, secondSection, firstIsGood, secondIsGood]);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Clean up existing map
    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    // Initialize map centered on US
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'carto': {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: ''
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
      zoom: 2.5,
      interactive: false,
      attributionControl: false
    });

    map.current.on('load', async () => {
      if (!map.current) return;

      try {
        if (actionData.type === 'senate') {
          // Load state boundaries for Senate
          const response = await fetch('https://cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json');
          if (!response.ok) throw new Error('Failed to load state data');

          const geoJsonData = await response.json();

          // Color states based on senator actions
          const colorParts: unknown[] = [];

          Object.entries(actionData.stateActions).forEach(([state, actions]) => {
            const stateName = stateNameMapping[state];
            if (stateName) {
              if (actions.good === 2) {
                // Both senators good - A grade color
                colorParts.push(['==', ['get', 'name'], stateName], GRADE_COLORS.A);
              } else if (actions.good === 1 && actions.bad === 1) {
                // One good, one bad - C grade color
                colorParts.push(['==', ['get', 'name'], stateName], GRADE_COLORS.C);
              } else if (actions.bad === 2) {
                // Both senators bad - F grade color
                colorParts.push(['==', ['get', 'name'], stateName], GRADE_COLORS.F);
              } else if (actions.good === 1 || actions.bad === 1) {
                // Only one senator has data - use the same color (MapLibre doesn't handle 8-digit hex well)
                colorParts.push(
                  ['==', ['get', 'name'], stateName],
                  actions.good === 1 ? GRADE_COLORS.A : GRADE_COLORS.F
                );
              }
            }
          });

          // Default color for states with no data
          colorParts.push('#E5E7EB');

          const colorExpression = ['case', ...colorParts] as maplibregl.ExpressionSpecification;

          map.current.addSource('states', {
            type: 'geojson',
            data: geoJsonData
          });

          map.current.addLayer({
            id: 'states-fill',
            type: 'fill',
            source: 'states',
            paint: {
              'fill-color': colorExpression,
              'fill-opacity': 0.8
            }
          });

          map.current.addLayer({
            id: 'states-border',
            type: 'line',
            source: 'states',
            paint: {
              'line-color': '#64748B',
              'line-width': 0.5
            }
          });
        } else {
          // Load congressional districts for House
          const response = await fetch('/data/districts/congressional-districts-simplified.geojson');
          if (!response.ok) throw new Error('Failed to load district data');

          const geoJsonData = await response.json();

          // Add custom ID to each feature for easier matching
          const processedGeoJson = {
            ...geoJsonData,
            features: geoJsonData.features.map((feature: { properties?: { STFIPS?: string; CDFIPS?: string } }) => ({
              ...feature,
              properties: {
                ...feature.properties,
                customId: `${feature.properties?.STFIPS || ''}-${feature.properties?.CDFIPS || ''}`
              }
            }))
          };

          // Color districts based on member actions
          const colorParts: unknown[] = [];

          Object.entries(actionData.districtActions).forEach(([key, action]) => {
            const color = action === 'good' ? GRADE_COLORS.A : action === 'bad' ? GRADE_COLORS.F : '#E5E7EB';
            colorParts.push(['==', ['get', 'customId'], key], color);
          });

          // Default color for districts with no data
          colorParts.push('#E5E7EB');

          const colorExpression = ['case', ...colorParts] as maplibregl.ExpressionSpecification;

          map.current.addSource('districts', {
            type: 'geojson',
            data: processedGeoJson
          });

          map.current.addLayer({
            id: 'districts-fill',
            type: 'fill',
            source: 'districts',
            paint: {
              'fill-color': colorExpression,
              'fill-opacity': 0.8
            }
          });

          map.current.addLayer({
            id: 'districts-border',
            type: 'line',
            source: 'districts',
            paint: {
              'line-color': '#64748B',
              'line-width': 0.3
            }
          });

          // Also add state boundaries for context
          try {
            const stateResponse = await fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json');
            if (stateResponse.ok && map.current) {
              const stateData = await stateResponse.json();
              map.current.addSource('state-boundaries', {
                type: 'geojson',
                data: stateData
              });

              map.current.addLayer({
                id: 'state-boundaries-line',
                type: 'line',
                source: 'state-boundaries',
                paint: {
                  'line-color': '#334155',
                  'line-width': 1
                }
              });
            }
          } catch {
            // Continue without state boundaries
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading bill map:', err);
        setError('Failed to load map');
        setLoading(false);
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [actionData]);

  // Calculate stats
  const stats = useMemo(() => {
    if (actionData.type === 'senate') {
      let bothGood = 0;
      let oneGood = 0;
      let bothBad = 0;
      let noData = 0;

      Object.values(actionData.stateActions).forEach(actions => {
        if (actions.good === 2) bothGood++;
        else if (actions.good === 1 && actions.bad === 1) oneGood++;
        else if (actions.bad === 2) bothBad++;
        else if (actions.good === 0 && actions.bad === 0) noData++;
        else if (actions.good === 1) oneGood++;
        else if (actions.bad === 1) bothBad++;
      });

      return { type: 'senate' as const, bothGood, oneGood, bothBad, noData };
    } else {
      let good = 0;
      let bad = 0;

      Object.values(actionData.districtActions).forEach(action => {
        if (action === 'good') good++;
        else if (action === 'bad') bad++;
      });

      return { type: 'house' as const, good, bad };
    }
  }, [actionData]);

  // Determine which label is for good actions and which is for bad
  const goodLabel = firstIsGood ? firstLabel : secondLabel;
  const badLabel = firstIsGood ? secondLabel : firstLabel;

  if (error) {
    return (
      <div className="w-full h-[200px] rounded-lg overflow-hidden border border-[#E7ECF2] dark:border-slate-700 bg-slate-50 dark:bg-white/5 flex items-center justify-center">
        <div className="text-xs text-slate-400 text-center px-2">Map unavailable</div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Geographic Distribution
        </h3>
        <div
          className="relative w-full h-[200px] rounded-lg overflow-hidden border border-[#E7ECF2] dark:border-slate-700 bg-slate-50 dark:bg-white/5 cursor-pointer hover:border-[#4B8CFB] transition-colors"
          onClick={() => {
            // Open main map view with this bill selected in a new tab
            const url = `/?view=map&bill=${encodeURIComponent(column)}`;
            window.open(url, '_blank');
          }}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-xs text-slate-400">Loading map...</div>
            </div>
          )}
          <div ref={mapContainer} className="w-full h-full" />

          {/* Open in new tab hint */}
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded text-[10px] text-slate-600 dark:text-slate-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Click to open in map view
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-[10px] text-slate-600 dark:text-slate-400">
          {stats.type === 'senate' ? (
            <>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GRADE_COLORS.A }} />
                <span>Both: {goodLabel} ({stats.bothGood})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GRADE_COLORS.C }} />
                <span>Split ({stats.oneGood})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GRADE_COLORS.F }} />
                <span>Both: {badLabel} ({stats.bothBad})</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GRADE_COLORS.A }} />
                <span>{goodLabel} ({stats.good})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GRADE_COLORS.F }} />
                <span>{badLabel} ({stats.bad})</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
