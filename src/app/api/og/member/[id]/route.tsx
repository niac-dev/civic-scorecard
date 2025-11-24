import { ImageResponse } from 'next/og';

// Fetch external image and convert to base64 data URL (with fallback)
async function fetchImageAsDataUrl(url: string, fallbackUrl?: string): Promise<string | null> {
  const fetchWithTimeout = async (fetchUrl: string, timeoutMs = 10000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'NIAC-Scorecard/1.0'
        }
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  };

  try {
    console.log('[OG Image] Fetching primary photo:', url);
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.log('[OG Image] Primary photo failed:', response.status);
      // Try fallback if primary fails
      if (fallbackUrl) {
        console.log('[OG Image] Trying fallback photo:', fallbackUrl);
        const fallbackResponse = await fetchWithTimeout(fallbackUrl);
        if (!fallbackResponse.ok) {
          console.log('[OG Image] Fallback photo failed:', fallbackResponse.status);
          return null;
        }
        const arrayBuffer = await fallbackResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const contentType = fallbackResponse.headers.get('content-type') || 'image/jpeg';
        console.log('[OG Image] Fallback photo loaded successfully');
        return `data:${contentType};base64,${base64}`;
      }
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    console.log('[OG Image] Primary photo loaded successfully');
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('[OG Image] Error fetching primary photo:', error);
    // Try fallback on error
    if (fallbackUrl) {
      try {
        console.log('[OG Image] Trying fallback photo after error:', fallbackUrl);
        const fallbackResponse = await fetchWithTimeout(fallbackUrl);
        if (!fallbackResponse.ok) {
          console.log('[OG Image] Fallback photo failed:', fallbackResponse.status);
          return null;
        }
        const arrayBuffer = await fallbackResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const contentType = fallbackResponse.headers.get('content-type') || 'image/jpeg';
        console.log('[OG Image] Fallback photo loaded successfully after error');
        return `data:${contentType};base64,${base64}`;
      } catch (fallbackError) {
        console.error('[OG Image] Error fetching fallback photo:', fallbackError);
        return null;
      }
    }
    return null;
  }
}

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
    const photoUrl = url.searchParams.get('photo') || '';
    const photoFallback = url.searchParams.get('photoFallback') || '';

    console.log('[OG Image] Photo URLs - Primary:', photoUrl, 'Fallback:', photoFallback);

    // Determine which photo URLs to use (prefer photoFallback if both exist, as it's from congress.gov)
    const primaryPhotoUrl = photoFallback || photoUrl;
    const fallbackPhotoUrl = photoFallback && photoUrl && photoFallback !== photoUrl ? photoUrl : undefined;

    console.log('[OG Image] Using primary:', primaryPhotoUrl, 'fallback:', fallbackPhotoUrl);

    // Fetch all resources in parallel
    const [handwritingFont, interFont, photo] = await Promise.all([
      loadHandwritingFont(),
      loadInterFont(),
      primaryPhotoUrl ? fetchImageAsDataUrl(primaryPhotoUrl, fallbackPhotoUrl) : Promise.resolve(null),
    ]);

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

    // Use more intense vignette for D and F grades
    const isLowGrade = grade.toUpperCase().startsWith('D') || grade.toUpperCase().startsWith('F');
    const vignetteSize = isLowGrade ? { topBottom: '240px', leftRight: '110px' } : { topBottom: '120px', leftRight: '80px' };
    const vignetteOpacity = isLowGrade
      ? { edge: 0.98, mid: 0.55, midPoint: '35%' }
      : { edge: 0.95, mid: 0.4, midPoint: '50%' };

    // Calculate dynamic font size based on number of sentences (30% larger)
    const sentenceFontSize = sentences.length > 5 ? 23 : sentences.length > 3 ? 26 : 29;
    const lineHeight = sentences.length > 5 ? 1.25 : 1.35;

    return new ImageResponse(
      (
        <div style={{
          width: '672px',
          height: '672px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0B1220 0%, #1a2744 50%, #0B1220 100%)',
          fontFamily: 'sans-serif',
          padding: '18px 23px',
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
              width: '672px',
              height: '672px',
              objectFit: 'cover',
              objectPosition: 'center',
              opacity: 0.18,
            }}
          />
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '9px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: '1' }}>
              <div style={{ display: 'flex', fontFamily: 'Inter', fontSize: '47px', fontWeight: 'bold', color: '#ffffff', lineHeight: '1.1', justifyContent: 'center' }}>
                {name}
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#94a3b8', marginTop: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <span style={{ display: 'flex' }}>{chamber === 'Senator' ? 'Senate' : 'House'}</span>
                <span style={{ display: 'flex' }}>•</span>
                <span style={{ display: 'flex' }}>{party}</span>
                <span style={{ display: 'flex' }}>•</span>
                <span style={{ display: 'flex' }}>{(() => {
                  // Format location: "New York-15" -> "New York 15th District", "New York" -> "New York"
                  const parts = location.split('-');
                  if (parts.length === 2) {
                    const state = parts[0];
                    const district = parseInt(parts[1], 10);
                    const suffix = district === 1 ? 'st' : district === 2 ? 'nd' : district === 3 ? 'rd' : 'th';
                    return `${state} ${district}${suffix} District`;
                  }
                  return location;
                })()}</span>
              </div>
            </div>

            {/* Grade - right side */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ display: 'flex', fontFamily: 'Inter', fontSize: '14px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Grade
              </span>
              <span style={{
                display: 'flex',
                fontFamily: 'Permanent Marker',
                fontSize: '85px',
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
            {/* Member Photo - wider with more horizontal space */}
            {photo && (
              <div style={{
                display: 'flex',
                position: 'absolute',
                left: '-52px',
                top: '0',
                bottom: '0',
                width: '275px',
                overflow: 'hidden',
                backgroundColor: '#0B1220',
                zIndex: 10,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt=""
                  width={267}
                  height={468}
                  style={{
                    width: '267px',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                {/* Vignette - top edge */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: vignetteSize.topBottom,
                  background: `linear-gradient(to bottom, rgba(11, 18, 32, ${vignetteOpacity.edge}) 0%, rgba(11, 18, 32, ${vignetteOpacity.mid}) ${vignetteOpacity.midPoint}, transparent 100%)`,
                  display: 'flex',
                }} />
                {/* Vignette - left edge */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: vignetteSize.leftRight,
                  background: `linear-gradient(to right, rgba(11, 18, 32, ${vignetteOpacity.edge}) 0%, rgba(11, 18, 32, ${vignetteOpacity.mid - 0.1}) 60%, transparent 100%)`,
                  display: 'flex',
                }} />
                {/* Vignette - right edge */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: vignetteSize.leftRight,
                  background: `linear-gradient(to left, rgba(11, 18, 32, ${vignetteOpacity.edge}) 0%, rgba(11, 18, 32, ${vignetteOpacity.mid - 0.1}) 60%, transparent 100%)`,
                  display: 'flex',
                }} />
                {/* Vignette - bottom edge */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: vignetteSize.topBottom,
                  background: `linear-gradient(to top, rgba(11, 18, 32, ${vignetteOpacity.edge}) 0%, rgba(11, 18, 32, ${vignetteOpacity.mid}) ${vignetteOpacity.midPoint}, transparent 100%)`,
                  display: 'flex',
                }} />
              </div>
            )}

            {/* Sentences list - narrower to give photo more space */}
            <div style={{
              flex: '1',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '9px',
              backgroundColor: 'rgba(11, 18, 32, 0.55)',
              borderRadius: '0',
              padding: '14px 18px 14px 18px',
              overflow: 'hidden',
              marginLeft: photo ? '216px' : '0',
              marginRight: '-23px',
              position: 'relative',
            }}>
              {/* Gradient fade on left edge to blend with photo */}
              {photo && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: '40px',
                  background: 'linear-gradient(to right, rgba(11, 18, 32, 0.7) 0%, rgba(11, 18, 32, 0.3) 50%, transparent 100%)',
                  display: 'flex',
                  zIndex: 5,
                }} />
              )}
              {sentences.length > 0 ? (
                sentences.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      fontSize: `${sentenceFontSize}px`,
                      lineHeight: lineHeight,
                      color: '#e2e8f0',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      flexShrink: '0',
                      width: '33px',
                      height: '33px',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {s.isGood ? (
                        <svg width="29" height="29" viewBox="0 0 24 24" fill="none">
                          <path d="M5 13l4 4L19 7" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                          <path d="M6 6l12 12M18 6L6 18" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{ flex: '1', fontFamily: 'Inter' }}>{s.text}</span>
                  </div>
                ))
              ) : (
                <div style={{ display: 'flex', fontSize: '23px', color: '#94a3b8', alignItems: 'center', justifyContent: 'center', flex: '1' }}>
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
            marginTop: '0px',
            padding: '12px 23px',
            marginLeft: '-23px',
            marginRight: '-23px',
            marginBottom: '-18px',
            backgroundColor: 'rgba(11, 18, 32, 0.95)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${baseUrl}/niac-action-100px.png`}
                alt=""
                width={59}
                height={59}
                style={{ width: '59px', height: '59px', objectFit: 'contain' }}
              />
              <span style={{ display: 'flex', fontFamily: 'Inter', fontSize: '17px', color: '#94a3b8' }}>Congressional Scorecard</span>
            </div>
            <div style={{ display: 'flex', fontFamily: 'Inter', fontSize: '17px', color: '#60a5fa' }}>scorecard.niacaction.org</div>
          </div>
        </div>
      ),
      {
        width: 672,
        height: 672,
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
