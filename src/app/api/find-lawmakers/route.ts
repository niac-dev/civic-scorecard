import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  try {
    // Use Who Represents Me API - free, no API key needed
    const url = `https://whoismyrepresentative.com/getall_mems.php?zip=${encodeURIComponent(address)}&output=json`;

    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch lawmakers' }, { status: response.status });
    }

    const data = await response.json();

    // Extract congressional representatives
    const lawmakers: Array<{ name: string; office: string; chamber: string }> = [];

    if (data && data.results && Array.isArray(data.results)) {
      data.results.forEach((official: any) => {
        const apiName = official.name; // e.g., "Adam Schiff"
        const district = official.district;
        const state = official.state;

        // Convert "First Last" to "Last, First" to match CSV format
        let name = apiName;
        if (apiName) {
          const parts = apiName.trim().split(' ');
          if (parts.length >= 2) {
            const lastName = parts[parts.length - 1];
            const firstName = parts.slice(0, -1).join(' ');
            name = `${lastName}, ${firstName}`;
          }
        }

        // Senators have no district, Representatives have a district number
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
  } catch (error) {
    console.error('Error fetching lawmakers:', error);
    return NextResponse.json({ error: 'Failed to fetch lawmakers' }, { status: 500 });
  }
}
