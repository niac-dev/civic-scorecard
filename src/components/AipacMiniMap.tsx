"use client";

import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Row } from '@/lib/types';
import { stateCodeOf, GRADE_COLORS } from '@/lib/utils';

interface AipacMiniMapProps {
  supported: Row[];
  notSupported: Row[];
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

export function AipacMiniMap({ supported, notSupported }: AipacMiniMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate district coloring data
  const actionData = useMemo(() => {
    const districtActions: Record<string, 'supported' | 'notSupported'> = {};

    // Mark supported districts
    supported.forEach(member => {
      if (member.chamber === 'HOUSE') {
        const state = stateCodeOf(member.state);
        const district = String(member.district || '00').padStart(2, '0');
        const fips = stateToFips[state];
        if (fips) {
          const key = `${fips}-${district}`;
          districtActions[key] = 'supported';
        }
      }
    });

    // Mark not supported districts (only if not already marked)
    notSupported.forEach(member => {
      if (member.chamber === 'HOUSE') {
        const state = stateCodeOf(member.state);
        const district = String(member.district || '00').padStart(2, '0');
        const fips = stateToFips[state];
        if (fips) {
          const key = `${fips}-${district}`;
          if (!districtActions[key]) {
            districtActions[key] = 'notSupported';
          }
        }
      }
    });

    return districtActions;
  }, [supported, notSupported]);

  // Calculate stats
  const stats = useMemo(() => {
    let supportedCount = 0;
    let notSupportedCount = 0;

    Object.values(actionData).forEach(status => {
      if (status === 'supported') supportedCount++;
      else if (status === 'notSupported') notSupportedCount++;
    });

    return { supportedCount, notSupportedCount };
  }, [actionData]);

  useEffect(() => {
    if (!mapContainer.current) return;

    if (map.current) {
      map.current.remove();
      map.current = null;
    }

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
        layers: [{ id: 'carto', type: 'raster', source: 'carto' }]
      },
      center: [-98.5795, 39.8283],
      zoom: 2.5,
      interactive: false,
      attributionControl: false
    });

    map.current.on('load', async () => {
      if (!map.current) return;

      try {
        const response = await fetch('/data/districts/congressional-districts-simplified.geojson');
        if (!response.ok) throw new Error('Failed to load district data');

        const geoJsonData = await response.json();

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

        const colorParts: unknown[] = [];

        Object.entries(actionData).forEach(([key, status]) => {
          // Supported = F color (bad), Not Supported = A color (good)
          const color = status === 'supported' ? GRADE_COLORS.F : GRADE_COLORS.A;
          colorParts.push(['==', ['get', 'customId'], key], color);
        });

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

        // Add state boundaries
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

        setLoading(false);
      } catch (err) {
        console.error('Error loading AIPAC map:', err);
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
          Geographic Distribution (House Districts)
        </h3>
        <div
          className="relative w-full h-[200px] rounded-lg overflow-hidden border border-[#E7ECF2] dark:border-slate-700 bg-slate-50 dark:bg-white/5 cursor-pointer hover:border-[#4B8CFB] transition-colors"
          onClick={() => {
            // Open main map view in a new tab (like bill modals do)
            window.open('/?view=map', '_blank');
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
            Click to expand map
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-[10px] text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GRADE_COLORS.F }} />
            <span>Supported by AIPAC/DMFI ({stats.supportedCount})</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GRADE_COLORS.A }} />
            <span>Not supported ({stats.notSupportedCount})</span>
          </div>
        </div>
      </div>
    </>
  );
}
