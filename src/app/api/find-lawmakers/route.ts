import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  try {
    const normalizedAddress = address.trim();

    // Check if it's a simple zipcode
    const isZipcode = /^\d{5}(-\d{4})?$/.test(normalizedAddress);

    // For ZIP codes, use the old API (will return multiple reps if ZIP spans districts)
    if (isZipcode) {
      const url = `https://whoismyrepresentative.com/getall_mems.php?zip=${encodeURIComponent(normalizedAddress)}&output=json`;

      const response = await fetch(url);

      if (!response.ok) {
        console.error('Lawmakers API error:', response.status, await response.text());
        return NextResponse.json({ error: 'Failed to fetch lawmakers' }, { status: response.status });
      }

      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('JSON parse error:', e, 'Response:', responseText.substring(0, 200));
        return NextResponse.json({ error: 'Invalid response from lawmakers API' }, { status: 500 });
      }

      // Extract congressional representatives
      const lawmakers: Array<{ name: string; office: string; chamber: string }> = [];

      if (data && data.results && Array.isArray(data.results)) {
        data.results.forEach((official: { name: string; district?: string; state: string }) => {
          const apiName = official.name;
          const district = official.district;
          const state = official.state;

          let name = apiName;
          if (apiName) {
            const parts = apiName.trim().split(' ');
            if (parts.length >= 2) {
              const lastName = parts[parts.length - 1];
              const firstName = parts.slice(0, -1).join(' ');
              name = `${lastName}, ${firstName}`;
            }
          }

          const chamber = district ? 'HOUSE' : 'SENATE';
          const office = chamber === 'SENATE'
            ? `U.S. Senator from ${state}`
            : `U.S. Representative - District ${district}`;

          if (name) {
            lawmakers.push({
              name,
              office,
              chamber
            });
          }
        });
      }

      if (lawmakers.length === 0) {
        return NextResponse.json({ error: 'No lawmakers found for this ZIP code' }, { status: 404 });
      }

      return NextResponse.json({ lawmakers });
    }

    // For full addresses, use free geocoding + FCC Area API for precise district lookup

    // Step 1: Geocode the address using OpenStreetMap (free, no API key)
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
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    }

    const lat = geocodeData[0].lat;
    const lon = geocodeData[0].lon;
    const state = geocodeData[0].address?.state;

    if (!lat || !lon) {
      return NextResponse.json({ error: 'Unable to determine coordinates for address' }, { status: 404 });
    }

    // Step 2: Use FCC Area API to get congressional district (free, no API key)
    const fccResponse = await fetch(
      `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lon}&format=json`
    );

    if (!fccResponse.ok) {
      console.error('FCC API error:', fccResponse.status, await fccResponse.text());
      return NextResponse.json({ error: 'Failed to determine congressional district' }, { status: 500 });
    }

    const fccData = await fccResponse.json();

    console.log('FCC API response:', JSON.stringify(fccData, null, 2));

    if (!fccData || !fccData.results || fccData.results.length === 0) {
      return NextResponse.json({ error: 'No district information found for this location' }, { status: 404 });
    }

    const districtInfo = fccData.results[0];

    // FCC API uses different field names - try multiple possibilities
    const stateCode = districtInfo.state_code || districtInfo.state_fips || districtInfo.state;
    const districtNumber = districtInfo.congressional_district ||
                          districtInfo.congressional_districts?.[0]?.district_number ||
                          districtInfo.block_fips?.substring(0, 2); // fallback to state FIPS

    console.log('Extracted:', { stateCode, districtNumber, fullInfo: districtInfo });

    if (!stateCode || districtNumber === undefined || districtNumber === null) {
      return NextResponse.json({
        error: 'Unable to determine district information',
        debug: { stateCode, districtNumber, fccData }
      }, { status: 404 });
    }

    // Step 3: Look up representatives for this specific district
    // Use whoismyrepresentative.com with state abbreviation
    const repUrl = `https://whoismyrepresentative.com/getall_reps_bystate.php?state=${stateCode}&output=json`;

    const repResponse = await fetch(repUrl);

    if (!repResponse.ok) {
      console.error('Representatives API error:', repResponse.status, await repResponse.text());
      return NextResponse.json({ error: 'Failed to fetch representatives' }, { status: 500 });
    }

    const repText = await repResponse.text();

    let repData;
    try {
      repData = JSON.parse(repText);
    } catch (e) {
      console.error('JSON parse error:', e);
      return NextResponse.json({ error: 'Invalid response from representatives API' }, { status: 500 });
    }

    // Extract lawmakers
    const lawmakers: Array<{ name: string; office: string; chamber: string }> = [];

    if (repData && repData.results && Array.isArray(repData.results)) {
      repData.results.forEach((official: { name: string; district?: string; state: string }) => {
        const apiName = official.name;
        const officialDistrict = official.district;
        const officialState = official.state;

        // For House reps, only include if they match our district
        // For Senators, include all from the state
        const isSenator = !officialDistrict;
        const isCorrectDistrict = isSenator || officialDistrict === districtNumber;

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

        const chamber = isSenator ? 'SENATE' : 'HOUSE';
        const office = chamber === 'SENATE'
          ? `U.S. Senator from ${officialState}`
          : `U.S. Representative - District ${officialDistrict}`;

        if (name) {
          lawmakers.push({
            name,
            office,
            chamber
          });
        }
      });
    }

    if (lawmakers.length === 0) {
      return NextResponse.json({ error: 'No lawmakers found for this address' }, { status: 404 });
    }

    return NextResponse.json({ lawmakers });
  } catch (error) {
    console.error('Error fetching lawmakers:', error);
    return NextResponse.json({ error: 'Failed to fetch lawmakers' }, { status: 500 });
  }
}
