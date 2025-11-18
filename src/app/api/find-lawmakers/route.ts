import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');

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

    // Step 3: Look up representatives AND senators for this specific district/state
    // Fetch both in parallel
    const [repResponse, senResponse] = await Promise.all([
      fetch(`https://whoismyrepresentative.com/getall_reps_bystate.php?state=${stateAbbrev}&output=json`),
      fetch(`https://whoismyrepresentative.com/getall_sens_bystate.php?state=${stateAbbrev}&output=json`)
    ]);

    if (!repResponse.ok) {
      console.error('Representatives API error:', repResponse.status, await repResponse.text());
      return NextResponse.json({ error: 'Failed to fetch representatives' }, { status: 500 });
    }

    const repText = await repResponse.text();
    const senText = senResponse.ok ? await senResponse.text() : '{"results":[]}';

    let repData;
    let senData;
    try {
      repData = JSON.parse(repText);
      senData = JSON.parse(senText);
    } catch (e) {
      console.error('JSON parse error:', e);
      return NextResponse.json({ error: 'Invalid response from representatives API' }, { status: 500 });
    }

    // Extract lawmakers - filter House reps to exact district, include all Senators
    const lawmakers: Array<{ name: string; office: string; chamber: string }> = [];

    // Process House Representatives - filter to exact district
    if (repData && repData.results && Array.isArray(repData.results)) {
      repData.results.forEach((official: { name: string; district?: string; state: string }) => {
        const apiName = official.name;
        const officialDistrict = official.district;

        // Convert both to integers for comparison (TIGERweb returns "08", API returns "8")
        const targetDistrictNum = parseInt(String(districtNumber), 10);
        const officialDistrictNum = officialDistrict ? parseInt(officialDistrict, 10) : 0;
        const isCorrectDistrict = officialDistrictNum === targetDistrictNum;

        if (!isCorrectDistrict) {
          return; // Skip this rep
        }

        let name = apiName;
        if (apiName) {
          const parts = apiName.trim().split(' ');
          if (parts.length >= 2) {
            const lastName = parts[parts.length - 1];
            const firstName = parts.slice(0, -1).join(' ');
            name = `${lastName}, ${firstName}`;
          }
        }

        if (name) {
          lawmakers.push({
            name,
            office: `U.S. Representative - District ${officialDistrict}`,
            chamber: 'HOUSE'
          });
        }
      });
    }

    // Process Senators - include all from the state
    if (senData && senData.results && Array.isArray(senData.results)) {
      senData.results.forEach((official: { name: string; state: string }) => {
        const apiName = official.name;
        const officialState = official.state;

        let name = apiName;
        if (apiName) {
          const parts = apiName.trim().split(' ');
          if (parts.length >= 2) {
            const lastName = parts[parts.length - 1];
            const firstName = parts.slice(0, -1).join(' ');
            name = `${lastName}, ${firstName}`;
          }
        }

        if (name) {
          lawmakers.push({
            name,
            office: `U.S. Senator from ${officialState}`,
            chamber: 'SENATE'
          });
        }
      });
    }

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
