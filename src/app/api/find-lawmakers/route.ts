import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';

// STATE FIPS code to abbreviation mapping
const STATE_FIPS_TO_ABBREV: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR',
  '78': 'VI'
};

// State name to abbreviation mapping
const STATE_NAME_TO_ABBREV: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'district of columbia': 'DC', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI',
  'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME',
  'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN',
  'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE',
  'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX',
  'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
  'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
};

function normalizeState(state: string): string {
  const trimmed = state.trim();
  // If already 2-letter code, return uppercase
  if (trimmed.length === 2) return trimmed.toUpperCase();
  // Try to match full name
  return STATE_NAME_TO_ABBREV[trimmed.toLowerCase()] || trimmed.toUpperCase();
}

interface MemberRow {
  full_name: string;
  chamber: string;
  state: string;
  district?: string;
}

// Cache for member data
let memberDataCache: MemberRow[] | null = null;
let memberDataCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadMemberData(): Promise<MemberRow[]> {
  const now = Date.now();
  if (memberDataCache && (now - memberDataCacheTime) < CACHE_TTL) {
    return memberDataCache;
  }

  // Get the base URL for fetching
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const res = await fetch(`${baseUrl}/data/scores_wide.csv`, { cache: 'no-store' });
  const text = await res.text();
  const parsed = Papa.parse<MemberRow>(text, { header: true, skipEmptyLines: true });

  memberDataCache = (parsed.data || []).filter(r => r.full_name && r.chamber && r.state);
  memberDataCacheTime = now;
  return memberDataCache;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  return handleFindLawmakers(address);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const address = body.address;
  return handleFindLawmakers(address);
}

async function handleFindLawmakers(address: string | null) {

  console.log('Find lawmakers API called with address:', address);

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  try {
    const normalizedAddress = address.trim();

    // Check if it's a simple zipcode
    const isZipcode = /^\d{5}(-\d{4})?$/.test(normalizedAddress);

    // Step 1: Geocode the address/ZIP using OpenStreetMap Nominatim (free, no API key)
    const geocodeResponse = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({
        q: normalizedAddress,
        format: 'json',
        countrycodes: 'us',
        addressdetails: '1',
        limit: '1'
      }),
      {
        headers: {
          'User-Agent': 'CivicScorecard/1.0'
        }
      }
    );

    if (!geocodeResponse.ok) {
      console.error('Geocode error:', geocodeResponse.status, await geocodeResponse.text());
      return NextResponse.json({ error: 'Unable to geocode address' }, { status: 500 });
    }

    const geocodeData = await geocodeResponse.json();

    if (!geocodeData || geocodeData.length === 0) {
      return NextResponse.json({
        error: isZipcode ? 'ZIP code not found' : 'Address not found'
      }, { status: 404 });
    }

    const lat = geocodeData[0].lat;
    const lon = geocodeData[0].lon;

    if (!lat || !lon) {
      return NextResponse.json({ error: 'Unable to determine coordinates' }, { status: 404 });
    }

    // Step 2: Use Census Bureau TIGERweb API to get exact congressional district
    // Layer 54 = 119th Congressional Districts (current)
    const tigerwebResponse = await fetch(
      `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/54/query?` +
      new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelWithin',
        returnGeometry: 'false',
        f: 'json',
        outFields: 'STATE,CD119,NAME,GEOID'
      })
    );

    if (!tigerwebResponse.ok) {
      console.error('TIGERweb API error:', tigerwebResponse.status, await tigerwebResponse.text());
      return NextResponse.json({ error: 'Failed to determine congressional district' }, { status: 500 });
    }

    const tigerwebData = await tigerwebResponse.json();

    console.log('TIGERweb API response:', JSON.stringify(tigerwebData, null, 2));

    if (!tigerwebData || !tigerwebData.features || tigerwebData.features.length === 0) {
      return NextResponse.json({
        error: 'No congressional district found for this location. This may be a territory or non-voting district.'
      }, { status: 404 });
    }

    const districtFeature = tigerwebData.features[0];
    const stateFips = districtFeature.attributes?.STATE;
    const districtNumber = districtFeature.attributes?.CD119;

    if (!stateFips || districtNumber === undefined || districtNumber === null) {
      return NextResponse.json({
        error: 'Unable to determine district information',
        debug: { stateFips, districtNumber, tigerwebData }
      }, { status: 404 });
    }

    // Convert STATE FIPS to state abbreviation
    const stateAbbrev = STATE_FIPS_TO_ABBREV[stateFips];

    if (!stateAbbrev) {
      return NextResponse.json({
        error: `Unknown state FIPS code: ${stateFips}`
      }, { status: 404 });
    }

    console.log('District info:', { stateAbbrev, stateFips, districtNumber });

    // Step 3: Look up representatives AND senators from our CSV data
    const memberData = await loadMemberData();

    // Extract lawmakers - filter House reps to exact district, include all Senators
    const lawmakers: Array<{ name: string; office: string; chamber: string }> = [];

    // Find the representative for this specific district
    const targetDistrictNum = parseInt(String(districtNumber), 10);

    memberData.forEach((member) => {
      const memberState = normalizeState(member.state);

      if (memberState !== stateAbbrev) {
        return; // Skip members from other states
      }

      if (member.chamber === 'HOUSE') {
        // Check if this rep is in the correct district
        const memberDistrictNum = member.district ? parseInt(member.district, 10) : 0;
        if (memberDistrictNum !== targetDistrictNum) {
          return; // Skip reps from other districts
        }

        lawmakers.push({
          name: member.full_name,
          office: `U.S. Representative - District ${member.district}`,
          chamber: 'HOUSE'
        });
      } else if (member.chamber === 'SENATE') {
        // Include all senators from this state
        lawmakers.push({
          name: member.full_name,
          office: `U.S. Senator from ${stateAbbrev}`,
          chamber: 'SENATE'
        });
      }
    });

    if (lawmakers.length === 0) {
      return NextResponse.json({
        error: `No lawmakers found for ${stateAbbrev} district ${districtNumber}`
      }, { status: 404 });
    }

    const result = {
      lawmakers,
      // Include district info for debugging/display
      district: {
        state: stateAbbrev,
        number: districtNumber,
        name: districtFeature.attributes?.NAME
      }
    };

    console.log('Returning success:', JSON.stringify(result, null, 2));
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching lawmakers:', error);
    return NextResponse.json({ error: 'Failed to fetch lawmakers' }, { status: 500 });
  }
}
