"use client";

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Row } from '@/lib/types';
import { stateCodeOf } from '@/lib/utils';

interface MiniDistrictMapProps {
  member: Row;
  onExpand?: () => void;
}

// State centers for centering Senate maps - zoom levels very low to show almost entire country
const stateCenters: Record<string, [number, number, number]> = {
  'AL': [-86.9023, 32.3182, 3], 'AK': [-152.4044, 61.3707, 1.5], 'AZ': [-111.0937, 34.0489, 3],
  'AR': [-92.3731, 34.7465, 3], 'CA': [-119.4179, 36.7783, 2.5], 'CO': [-105.5478, 39.5501, 3],
  'CT': [-72.7554, 41.6032, 3.5], 'DE': [-75.5277, 38.9108, 3.5], 'FL': [-81.5158, 27.6648, 3],
  'GA': [-83.5007, 32.1656, 3], 'HI': [-156.3319, 20.2927, 3], 'ID': [-114.7420, 44.0682, 3],
  'IL': [-89.3985, 40.6331, 3], 'IN': [-86.1349, 40.2672, 3], 'IA': [-93.0977, 41.8780, 3],
  'KS': [-98.4842, 39.0119, 3], 'KY': [-84.2700, 37.8393, 3], 'LA': [-91.9623, 30.9843, 3],
  'ME': [-69.4455, 45.2538, 3], 'MD': [-76.6413, 39.0458, 3.5], 'MA': [-71.3824, 42.4072, 3.5],
  'MI': [-85.6024, 44.3148, 3], 'MN': [-94.6859, 46.7296, 3], 'MS': [-89.3985, 32.3547, 3],
  'MO': [-92.6038, 37.9643, 3], 'MT': [-110.3626, 46.8797, 2.5], 'NE': [-99.9018, 41.4925, 3],
  'NV': [-116.4194, 38.8026, 3], 'NH': [-71.5724, 43.1939, 3.5], 'NJ': [-74.4057, 40.0583, 3.5],
  'NM': [-105.8701, 34.5199, 3], 'NY': [-75.5268, 43.2994, 3], 'NC': [-79.0193, 35.7596, 3],
  'ND': [-101.0020, 47.5515, 3], 'OH': [-82.9071, 40.4173, 3], 'OK': [-97.5164, 35.4676, 3],
  'OR': [-120.5542, 43.8041, 3], 'PA': [-77.1945, 41.2033, 3], 'RI': [-71.4774, 41.5801, 3.5],
  'SC': [-81.1637, 33.8361, 3], 'SD': [-100.2263, 43.9695, 3], 'TN': [-86.5804, 35.5175, 3],
  'TX': [-99.9018, 31.9686, 2.5], 'UT': [-111.0937, 39.3210, 3], 'VT': [-72.5778, 44.5588, 3.5],
  'VA': [-78.6569, 37.4316, 3], 'WA': [-120.7401, 47.7511, 3], 'WV': [-80.4549, 38.5976, 3],
  'WI': [-89.6385, 43.7844, 3], 'WY': [-107.2903, 43.0750, 3], 'DC': [-77.0369, 38.9072, 5]
};

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

export function MiniDistrictMap({ member, onExpand }: MiniDistrictMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) {
      console.error('MiniDistrictMap: mapContainer ref is null');
      return;
    }

    // Get state code - handle both full names and abbreviations
    const stateRaw = String(member.state || '').trim();
    if (!stateRaw) {
      console.error('MiniDistrictMap: No state data for member', member);
      setError('No state data');
      setLoading(false);
      return;
    }

    // Convert to state code if it's a full name
    const nameToCode: Record<string, string> = {
      "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
      "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
      "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
      "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
      "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME",
      "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
      "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
      "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
      "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
      "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
      "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
      "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
      "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY"
    };

    const lowerState = stateRaw.toLowerCase();
    const stateCode = nameToCode[lowerState] || stateRaw.toUpperCase();

    // Clean up existing map
    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    const isSenate = member.chamber === 'SENATE';
    const stateCenter = stateCenters[stateCode];

    if (!stateCenter) {
      console.error('MiniDistrictMap: State not found in stateCenters', stateCode, 'from', stateRaw);
      setError('State not found');
      setLoading(false);
      return;
    }

    // For Senate, use state center. For House, we'll center on the district after loading
    const initialCenter: [number, number] = [stateCenter[0], stateCenter[1]];
    const initialZoom = stateCenter[2];

    // Initialize map with detailed basemap (includes labels, roads, landmarks)
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'carto': {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
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
      center: initialCenter,
      zoom: initialZoom,
      interactive: true, // Enable interaction - zoom and pan
      attributionControl: false
    });

    // Load boundaries
    map.current.on('load', async () => {
      if (!map.current) return;

      try {
        const dataUrl = isSenate
          ? 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'
          : '/data/districts/congressional-districts-118th.geojson';

        console.log('MiniDistrictMap: Loading', dataUrl);
        const response = await fetch(dataUrl);
        if (!response.ok) {
          throw new Error(`Failed to load data: ${response.status}`);
        }

        const geoJsonData = await response.json();
        console.log('MiniDistrictMap: Data loaded successfully');

        map.current.addSource('districts', {
          type: 'geojson',
          data: geoJsonData
        });

        // For House districts, also load state boundaries to show context
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
              }
            }
          } catch (err) {
            console.error('MiniDistrictMap: Failed to load state boundaries', err);
            // Continue without state boundaries - not critical
          }
        }

        // State code to full name mapping
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

        // Use consistent green color for all districts
        const color = '#b6dfcc';

        if (isSenate) {
          // Filter for just this state
          const stateName = stateNameMapping[stateCode];

          map.current.addLayer({
            id: 'districts-fill',
            type: 'fill',
            source: 'districts',
            paint: {
              'fill-color': color,
              'fill-opacity': 0.8
            },
            filter: ['==', ['get', 'name'], stateName]
          });
        } else {
          // House: highlight specific district
          const fips = stateToFips[stateCode];
          const district = String(member.district || '');
          const districtNum = district === '' ? '00' : district.padStart(2, '0');

          map.current.addLayer({
            id: 'districts-fill',
            type: 'fill',
            source: 'districts',
            paint: {
              'fill-color': color,
              'fill-opacity': 0.8
            },
            filter: ['all', ['==', ['get', 'STATEFP'], fips], ['==', ['get', 'CD118FP'], districtNum]]
          });
        }

        // Add state/district border (black outline)
        if (isSenate) {
          // For Senate, show state border
          const stateName = stateNameMapping[stateCode];
          map.current.addLayer({
            id: 'state-border',
            type: 'line',
            source: 'districts',
            paint: {
              'line-color': '#000000',
              'line-width': 3
            },
            filter: ['==', ['get', 'name'], stateName]
          });

          // Add thin border around state
          map.current.addLayer({
            id: 'state-thin-border',
            type: 'line',
            source: 'districts',
            paint: {
              'line-color': '#000000',
              'line-width': 1.5
            },
            filter: ['==', ['get', 'name'], stateName]
          });

          // Add state label on the map for Senate
          const stateCenter = stateCenters[stateCode];
          if (stateCenter) {
            map.current.addSource('state-label', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  geometry: {
                    type: 'Point',
                    coordinates: [stateCenter[0], stateCenter[1]]
                  },
                  properties: {
                    label: stateCode
                  }
                }]
              }
            });

            map.current.addLayer({
              id: 'state-label-layer',
              type: 'symbol',
              source: 'state-label',
              layout: {
                'text-field': ['get', 'label'],
                'text-size': 18,
                'text-allow-overlap': true
              },
              paint: {
                'text-color': '#000000',
                'text-halo-color': '#ffffff',
                'text-halo-width': 3,
                'text-halo-blur': 1
              }
            });
            console.log('Added state label for:', stateCode);
          }
        } else {
          // For House, show the state boundary from state-boundaries source
          const fips = stateToFips[stateCode];
          const district = String(member.district || '');
          const districtNum = district === '' ? '00' : district.padStart(2, '0');

          if (map.current.getSource('state-boundaries')) {
            const stateName = stateNameMapping[stateCode];
            map.current.addLayer({
              id: 'state-border',
              type: 'line',
              source: 'state-boundaries',
              paint: {
                'line-color': '#000000',
                'line-width': 3
              },
              filter: ['==', ['get', 'name'], stateName]
            });
          }

          // Add thin border around district
          map.current.addLayer({
            id: 'district-thin-border',
            type: 'line',
            source: 'districts',
            paint: {
              'line-color': '#000000',
              'line-width': 1.5
            },
            filter: ['all', ['==', ['get', 'STATEFP'], fips], ['==', ['get', 'CD118FP'], districtNum]]
          });
        }

        // For House districts, center the map on the specific district
        if (!isSenate && map.current) {
          const fips = stateToFips[stateCode];
          const district = String(member.district || '');
          const districtNum = district === '' ? '00' : district.padStart(2, '0');

          // Find the district feature in the GeoJSON
          const features = geoJsonData.features || [];
          const districtFeature = features.find((f: { properties?: { STATEFP?: string; CD118FP?: string } }) =>
            f.properties?.STATEFP === fips && f.properties?.CD118FP === districtNum
          );

          if (districtFeature && districtFeature.geometry) {
            // Calculate the bounding box of the district
            const coordinates = districtFeature.geometry.type === 'Polygon'
              ? districtFeature.geometry.coordinates[0]
              : districtFeature.geometry.coordinates.flat(2);

            if (coordinates && coordinates.length > 0) {
              const bounds = coordinates.reduce(
                (bounds: [[number, number], [number, number]], coord: [number, number]) => {
                  return [
                    [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
                    [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])]
                  ];
                },
                [[coordinates[0][0], coordinates[0][1]], [coordinates[0][0], coordinates[0][1]]]
              );

              // Fit the map to the district bounds with padding
              map.current.fitBounds(bounds as [[number, number], [number, number]], {
                padding: 20,
                duration: 0 // No animation
              });

              // Add district label on the map
              const centerLng = (bounds[0][0] + bounds[1][0]) / 2;
              const centerLat = (bounds[0][1] + bounds[1][1]) / 2;

              const districtLabel = `${stateCode}-${district || '1'}`;

              map.current.addSource('district-label', {
                type: 'geojson',
                data: {
                  type: 'FeatureCollection',
                  features: [{
                    type: 'Feature',
                    geometry: {
                      type: 'Point',
                      coordinates: [centerLng, centerLat]
                    },
                    properties: {
                      label: districtLabel
                    }
                  }]
                }
              });

              map.current.addLayer({
                id: 'district-label-layer',
                type: 'symbol',
                source: 'district-label',
                layout: {
                  'text-field': ['get', 'label'],
                  'text-size': 18,
                  'text-allow-overlap': true
                },
                paint: {
                  'text-color': '#000000',
                  'text-halo-color': '#ffffff',
                  'text-halo-width': 3,
                  'text-halo-blur': 1
                }
              });
              console.log('Added district label:', districtLabel);
            }
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading map:', err);
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
  }, [member]);

  // Handle resize to recalculate map when container changes
  useEffect(() => {
    if (!map.current) return;

    const handleResize = () => {
      if (map.current) {
        map.current.resize();
      }
    };

    // Trigger resize when component mounts or container changes
    const resizeObserver = new ResizeObserver(handleResize);
    if (mapContainer.current) {
      resizeObserver.observe(mapContainer.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  if (error) {
    return (
      <div className="w-[200px] h-[150px] rounded overflow-hidden border border-[#E7ECF2] dark:border-slate-700 bg-slate-50 dark:bg-white/5 flex items-center justify-center">
        <div className="text-[10px] text-slate-400 text-center px-2">Map unavailable</div>
      </div>
    );
  }

  // Format the district/state label
  const isSenate = member.chamber === 'SENATE';
  const stateRaw = String(member.state || '').trim();
  const district = member.district ? String(member.district) : '';
  const districtLabel = isSenate
    ? stateRaw
    : district
      ? `${stateRaw} ${district}`
      : stateRaw;

  return (
    <>
      <div className="w-[200px] h-[150px] rounded overflow-hidden border border-[#E7ECF2] dark:border-slate-700 bg-slate-50 dark:bg-white/5 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-[10px] text-slate-400">Loading...</div>
            </div>
          )}
          <div ref={mapContainer} className="w-full h-full" />

        {/* Expand button */}
        <button
          onClick={() => setIsExpanded(true)}
          className="absolute bottom-2 right-2 p-1.5 bg-white dark:bg-slate-800 rounded shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
          title="Expand map"
        >
          <svg className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* Fullscreen map modal */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="relative w-full h-full max-w-6xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setIsExpanded(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-white dark:bg-slate-800 rounded-full shadow-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Info overlay */}
            <div className="absolute top-4 left-4 z-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {member.full_name}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {member.chamber === 'HOUSE' ?
                  (member.district ? `${stateCodeOf(member.state)}-${member.district}` : `${stateCodeOf(member.state)}-At Large`) :
                  stateCodeOf(member.state)
                }
              </div>
            </div>

            {/* Map fills the container - creates a new map instance */}
            <FullscreenMap member={member} />
          </div>
        </div>
      )}
    </>
  );
}

// Fullscreen map component - replicates all features from mini map
function FullscreenMap({ member }: { member: Row }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const stateRaw = String(member.state || '').trim();
    if (!stateRaw) return;

    const nameToCode: Record<string, string> = {
      "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
      "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
      "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
      "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
      "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME",
      "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
      "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
      "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
      "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
      "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
      "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
      "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
      "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY"
    };

    const lowerState = stateRaw.toLowerCase();
    const stateCode = nameToCode[lowerState] || stateRaw.toUpperCase();
    const stateCenter = stateCenters[stateCode];

    if (!stateCenter) return;

    const isSenate = member.chamber === 'SENATE';

    // Create fullscreen map with different zoom for House vs Senate
    const fullscreenZoom = isSenate ? stateCenter[2] : stateCenter[2] + 2; // House districts more zoomed in

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'carto': {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: ''
          }
        },
        layers: [{ id: 'carto', type: 'raster', source: 'carto' }]
      },
      center: [stateCenter[0], stateCenter[1]],
      zoom: fullscreenZoom,
      interactive: true,
      attributionControl: false
    });

    // Load boundaries and colors (same as mini map)
    map.current.on('load', async () => {
      if (!map.current) return;

      try {
        const dataUrl = isSenate
          ? 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'
          : '/data/districts/congressional-districts-118th.geojson';

        const response = await fetch(dataUrl);
        if (!response.ok) throw new Error(`Failed to load data: ${response.status}`);

        const geoJsonData = await response.json();

        map.current.addSource('districts', {
          type: 'geojson',
          data: geoJsonData
        });

        // Load state boundaries for House
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
              }
            }
          } catch (err) {
            console.error('Failed to load state boundaries', err);
          }
        }

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

        // Use consistent green color for all districts
        const color = '#b6dfcc';

        if (isSenate) {
          const stateName = stateNameMapping[stateCode];
          map.current.addLayer({
            id: 'districts-fill',
            type: 'fill',
            source: 'districts',
            paint: {
              'fill-color': color,
              'fill-opacity': ['case', ['==', ['get', 'name'], stateName], 0.8, 0]
            },
            filter: ['==', ['get', 'name'], stateName]
          });
        } else {
          const fips = stateToFips[stateCode];
          const district = String(member.district || '');
          const districtNum = district === '' ? '00' : district.padStart(2, '0');

          map.current.addLayer({
            id: 'districts-fill',
            type: 'fill',
            source: 'districts',
            paint: {
              'fill-color': color,
              'fill-opacity': 0.8
            },
            filter: ['all', ['==', ['get', 'STATEFP'], fips], ['==', ['get', 'CD118FP'], districtNum]]
          });
        }

        // Add state border
        if (isSenate) {
          const stateName = stateNameMapping[stateCode];
          map.current.addLayer({
            id: 'state-border',
            type: 'line',
            source: 'districts',
            paint: { 'line-color': '#000000', 'line-width': 3 },
            filter: ['==', ['get', 'name'], stateName]
          });

          // Add thin border around state
          map.current.addLayer({
            id: 'state-thin-border-fullscreen',
            type: 'line',
            source: 'districts',
            paint: {
              'line-color': '#000000',
              'line-width': 1.5
            },
            filter: ['==', ['get', 'name'], stateName]
          });
        } else {
          const fips = stateToFips[stateCode];
          const district = String(member.district || '');
          const districtNum = district === '' ? '00' : district.padStart(2, '0');

          if (map.current.getSource('state-boundaries')) {
            const stateName = stateNameMapping[stateCode];
            map.current.addLayer({
              id: 'state-border',
              type: 'line',
              source: 'state-boundaries',
              paint: { 'line-color': '#000000', 'line-width': 3 },
              filter: ['==', ['get', 'name'], stateName]
            });
          }

          // Add thin border around district
          map.current.addLayer({
            id: 'district-thin-border-fullscreen',
            type: 'line',
            source: 'districts',
            paint: {
              'line-color': '#000000',
              'line-width': 1.5
            },
            filter: ['all', ['==', ['get', 'STATEFP'], fips], ['==', ['get', 'CD118FP'], districtNum]]
          });
        }

        // Note: We don't fitBounds on the fullscreen map - we want to show the whole state

        // Add labels on fullscreen map
        if (isSenate) {
          // Add state label for Senate
          const stateCenter = stateCenters[stateCode];
          if (stateCenter && map.current) {
            map.current.addSource('state-label-fullscreen', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  geometry: {
                    type: 'Point',
                    coordinates: [stateCenter[0], stateCenter[1]]
                  },
                  properties: {
                    label: stateCode
                  }
                }]
              }
            });

            map.current.addLayer({
              id: 'state-label-layer-fullscreen',
              type: 'symbol',
              source: 'state-label-fullscreen',
              layout: {
                'text-field': ['get', 'label'],
                'text-size': 24,
                'text-allow-overlap': true
              },
              paint: {
                'text-color': '#000000',
                'text-halo-color': '#ffffff',
                'text-halo-width': 3,
                'text-halo-blur': 1
              }
            });
          }
        } else {
          // Add district label for House - calculate district center from bounds
          const fips = stateToFips[stateCode];
          const district = String(member.district || '');
          const districtNum = district === '' ? '00' : district.padStart(2, '0');
          const districtLabel = `${stateCode}-${district || '1'}`;

          // Find the district feature to calculate center
          const features = geoJsonData.features || [];
          const districtFeature = features.find((f: { properties?: { STATEFP?: string; CD118FP?: string } }) =>
            f.properties?.STATEFP === fips && f.properties?.CD118FP === districtNum
          );

          if (districtFeature && districtFeature.geometry && map.current) {
            const coordinates = districtFeature.geometry.type === 'Polygon'
              ? districtFeature.geometry.coordinates[0]
              : districtFeature.geometry.coordinates.flat(2);

            if (coordinates && coordinates.length > 0) {
              const bounds = coordinates.reduce(
                (bounds: [[number, number], [number, number]], coord: [number, number]) => {
                  return [
                    [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
                    [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])]
                  ];
                },
                [[coordinates[0][0], coordinates[0][1]], [coordinates[0][0], coordinates[0][1]]]
              );

              const centerLng = (bounds[0][0] + bounds[1][0]) / 2;
              const centerLat = (bounds[0][1] + bounds[1][1]) / 2;

              map.current.addSource('district-label-fullscreen', {
                type: 'geojson',
                data: {
                  type: 'FeatureCollection',
                  features: [{
                    type: 'Feature',
                    geometry: {
                      type: 'Point',
                      coordinates: [centerLng, centerLat]
                    },
                    properties: {
                      label: districtLabel
                    }
                  }]
                }
              });

              map.current.addLayer({
                id: 'district-label-layer-fullscreen',
                type: 'symbol',
                source: 'district-label-fullscreen',
                layout: {
                  'text-field': ['get', 'label'],
                  'text-size': 24,
                  'text-allow-overlap': true
                },
                paint: {
                  'text-color': '#000000',
                  'text-halo-color': '#ffffff',
                  'text-halo-width': 3,
                  'text-halo-blur': 1
                }
              });
            }
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading fullscreen map:', err);
        setLoading(false);
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [member]);

  return (
    <div className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50">
          <div className="text-sm text-slate-600 dark:text-slate-400">Loading map...</div>
        </div>
      )}
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
