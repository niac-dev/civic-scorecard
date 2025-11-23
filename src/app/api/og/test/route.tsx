import { ImageResponse } from 'next/og';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0B1220',
          color: 'white',
          fontSize: 48,
        }}
      >
        Test OG Image
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
