// Detects whether the browser can actually create a WebGL rendering context.
// Some browsers report the "webgl" API as present but fail to create a context
// (e.g. hardware acceleration disabled, managed/locked-down profiles), which
// crashes map libraries like maplibre-gl with an uncaught
// "Could not create a WebGL context" error. Checking this up front lets us
// skip map rendering entirely instead of letting that error take down the page.
let cachedSupport: boolean | null = null;

export function isWebGLSupported(): boolean {
  if (cachedSupport !== null) return cachedSupport;

  if (typeof document === 'undefined') {
    // Not in a browser (SSR); treat as unsupported until checked client-side.
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    cachedSupport = !!gl;
  } catch {
    cachedSupport = false;
  }

  return cachedSupport;
}
