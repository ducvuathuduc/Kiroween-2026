// These callbacks are serialized into generateSW: keep them self-contained.
export function cacheNavigation({ url, request }: { url: URL; request: Request }): boolean {
  return url.origin === self.location.origin && request.mode === 'navigate' &&
    !/^\/(?:api|mcp|a2a|rss|atom|json|\.well-known)(?:\/|$)/i.test(url.pathname)
}

export function cacheRss({ url }: { url: URL }): boolean {
  return url.origin === self.location.origin && url.pathname === '/api/rss'
}

export function cacheAsset({ url, request }: { url: URL; request: Request }): boolean {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/') &&
    ['font', 'script', 'style'].includes(request.destination)
}
