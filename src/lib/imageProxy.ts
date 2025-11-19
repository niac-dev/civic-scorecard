/**
 * Converts an external image URL to use our proxy API route to avoid CORS issues
 */
export function getProxiedImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  // If it's already a relative URL or our proxy, don't proxy again
  if (url.startsWith('/') || url.includes('/api/proxy-image')) {
    return url;
  }

  // Proxy external URLs (like congress.gov)
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}
