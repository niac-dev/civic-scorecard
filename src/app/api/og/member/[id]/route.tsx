import { ImageResponse } from 'next/og';

// Load fonts
async function loadHandwritingFont() {
  const response = await fetch(
    'https://cdn.jsdelivr.net/fontsource/fonts/permanent-marker@latest/latin-400-normal.ttf'
  );
  return response.arrayBuffer();
}

async function loadInterFont() {
  const response = await fetch(
    'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf'
  );
  return response.arrayBuffer();
}

const GRADE_COLORS: Record<string, string> = {
  A: '#5BA66B',
  B: '#8BC574',
  C: '#E6C84A',
  D: '#D4A843',
  F: '#ef4444',
};

function getGradeColor(grade: string): string {
  return GRADE_COLORS[grade.charAt(0).toUpperCase()] || GRADE_COLORS.F;
}

type Sentence = { text: string; isGood: boolean };


export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [, handwritingFont, interFont] = await Promise.all([
      params,
      loadHandwritingFont(),
      loadInterFont(),
    ]);
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    // Get data from URL search params
    const name = url.searchParams.get('name') || 'Unknown Member';
    const grade = url.searchParams.get('grade') || 'N/A';
    const total = url.searchParams.get('total') || '0';
    const max = url.searchParams.get('max') || '0';
    const chamber = url.searchParams.get('chamber') || 'Representative';
    const party = url.searchParams.get('party') || 'I';
    const location = url.searchParams.get('location') || '';
    const photo = url.searchParams.get('photo') || '';

    // Parse sentences from JSON param
    let sentences: Sentence[] = [];
    const sentencesParam = url.searchParams.get('sentences');
    if (sentencesParam) {
      try {
        sentences = JSON.parse(decodeURIComponent(sentencesParam));
      } catch {
        sentences = [];
      }
    }

    const gradeColor = getGradeColor(grade);

    // Calculate dynamic font size based on number of sentences
    const sentenceFontSize = sentences.length > 5 ? 16 : sentences.length > 3 ? 18 : 20;
    const lineHeight = sentences.length > 5 ? 1.25 : 1.35;

    return new ImageResponse(
      (
        <div style={{
          width: '574px',
          height: '459px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0B1220 0%, #1a2744 50%, #0B1220 100%)',
          fontFamily: 'sans-serif',
          padding: '16px 20px',
          position: 'relative',
        }}>
          {/* Capitol background - behind entire card */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${baseUrl}/capitol.png`}
            alt=""
            style={{
              position: 'absolute',
              top: '0',
              left: '0',
              width: '574px',
              height: '459px',
              objectFit: 'cover',
              objectPosition: 'center',
              opacity: 0.18,
            }}
          />
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: '1' }}>
              <div style={{ display: 'flex', fontFamily: 'Inter', fontSize: '40px', fontWeight: 'bold', color: '#ffffff', lineHeight: '1.1' }}>
                {name}
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '16px', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'flex' }}>{chamber === 'Senator' ? 'U.S. Senator' : 'U.S. Representative'}</span>
                <span style={{ display: 'flex' }}>•</span>
                <span style={{ display: 'flex' }}>{party}</span>
                <span style={{ display: 'flex' }}>•</span>
                <span style={{ display: 'flex' }}>{location}</span>
              </div>
            </div>

            {/* Grade - right side */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ display: 'flex', fontFamily: 'Inter', fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Grade
              </span>
              <span style={{
                display: 'flex',
                fontFamily: 'Permanent Marker',
                fontSize: '72px',
                color: gradeColor,
                lineHeight: '0.85',
              }}>
                {grade}
              </span>
            </div>
          </div>

          {/* Main content: Photo with sentences overlay */}
          <div style={{
            flex: '1',
            display: 'flex',
            position: 'relative',
          }}>
            {/* Member Photo - smaller for better resolution */}
            {photo && (
              <div style={{
                display: 'flex',
                position: 'absolute',
                left: '-20px',
                top: '0',
                bottom: '0',
                width: '180px',
                borderRadius: '0',
                overflow: 'hidden',
                backgroundColor: '#0B1220',
                zIndex: 10,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt=""
                  width={180}
                  height={400}
                  style={{
                    width: '180px',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            )}

            {/* Sentences list - overlays photo */}
            <div style={{
              flex: '1',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              backgroundColor: 'rgba(11, 18, 32, 0.55)',
              borderRadius: '0',
              padding: '12px 16px 12px 16px',
              overflow: 'hidden',
              marginLeft: photo ? '160px' : '0',
              marginRight: '-20px',
              position: 'relative',
            }}>
              {sentences.length > 0 ? (
                sentences.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      fontSize: `${sentenceFontSize}px`,
                      lineHeight: lineHeight,
                      color: '#e2e8f0',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      flexShrink: '0',
                      width: '28px',
                      height: '28px',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {s.isGood ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M5 13l4 4L19 7" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M6 6l12 12M18 6L6 18" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{ flex: '1', fontFamily: 'Inter' }}>{s.text}</span>
                  </div>
                ))
              ) : (
                <div style={{ display: 'flex', fontSize: '20px', color: '#94a3b8', alignItems: 'center', justifyContent: 'center', flex: '1' }}>
                  View full scorecard for detailed voting record
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '6px',
            paddingTop: '6px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${baseUrl}/niac-action-100px.png`}
                alt=""
                width={50}
                height={50}
                style={{ width: '50px', height: '50px', objectFit: 'contain' }}
              />
              <span style={{ display: 'flex', fontFamily: 'Inter', fontSize: '14px', color: '#94a3b8' }}>Congressional Scorecard</span>
            </div>
            <div style={{ display: 'flex', fontFamily: 'Inter', fontSize: '14px', color: '#60a5fa' }}>scorecard.niacaction.org</div>
          </div>
        </div>
      ),
      {
        width: 574,
        height: 459,
        fonts: [
          {
            name: 'Permanent Marker',
            data: handwritingFont,
            style: 'normal',
          },
          {
            name: 'Inter',
            data: interFont,
            style: 'normal',
            weight: 600,
          },
        ],
      }
    );
  } catch (error) {
    console.error('OG Error:', error);
    return new Response(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, { status: 500 });
  }
}
