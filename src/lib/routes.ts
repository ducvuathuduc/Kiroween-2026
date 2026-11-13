export type AppRoute =
  | 'feed'
  | 'briefing'
  | 'radar'
  | 'system'
  | 'docs'
  | 'shortcuts'
  | 'about'
  | 'changelog'
  | 'privacy'
  | 'settings'
  | 'not-found'

export type NavigableRoute = Exclude<AppRoute, 'not-found'>

export interface RouteMeta {
  id: NavigableRoute
  path: string
  label: string
  description: string
  documentTitle: string
}

export const ROUTES: ReadonlyArray<RouteMeta> = [
  {
    id: 'feed',
    path: '/',
    label: 'Feed',
    description: '3-pane live RSS & Community Pulse reader',
    documentTitle: 'Resurrected Reader — AI reading radar for AWS builders',
  },
  {
    id: 'briefing',
    path: '/briefing',
    label: 'Daily Briefing',
    description: 'Top 5 highest-signal reads distilled into Gemini TL;DRs',
    documentTitle: 'Daily Briefing — Resurrected Reader',
  },
  {
    id: 'radar',
    path: '/radar',
    label: 'Signal Radar',
    description: 'Score distribution, feed yield & 4D radar charts',
    documentTitle: 'Signal Radar — Resurrected Reader',
  },
  {
    id: 'system',
    path: '/system',
    label: 'System & Health',
    description: 'Feed health dashboard, pipeline diagram & 4D rubric',
    documentTitle: 'System & Feed Health — Resurrected Reader',
  },
  {
    id: 'docs',
    path: '/docs',
    label: 'Docs',
    description: 'Getting started, scoring model, OPML, Kiro export & MCP',
    documentTitle: 'Documentation — Resurrected Reader',
  },
  {
    id: 'shortcuts',
    path: '/shortcuts',
    label: 'Keyboard Shortcuts',
    description: 'Complete keyboard navigation & action reference',
    documentTitle: 'Keyboard Shortcuts — Resurrected Reader',
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    description: 'Density, default filter, alerts, reduced motion & JSON export',
    documentTitle: 'Settings — Resurrected Reader',
  },
  {
    id: 'about',
    path: '/about',
    label: 'About',
    description: 'The Google Reader resurrection story & Kiroween 2026 entry',
    documentTitle: 'About — Resurrected Reader',
  },
  {
    id: 'changelog',
    path: '/changelog',
    label: 'Changelog',
    description: 'Real engineering milestones shipped in Resurrected Reader',
    documentTitle: 'Changelog — Resurrected Reader',
  },
  {
    id: 'privacy',
    path: '/privacy',
    label: 'Privacy Policy',
    description: 'Local-first storage, RSS proxies, server-side Gemini & zero tracking',
    documentTitle: 'Privacy Policy — Resurrected Reader',
  },
]

const PATH_TO_ROUTE = new Map<string, NavigableRoute>(
  ROUTES.map((r) => [r.path, r.id]),
)

const ROUTE_TO_META = new Map<NavigableRoute, RouteMeta>(
  ROUTES.map((r) => [r.id, r]),
)

export function normalizePathname(rawPathname: string): string {
  const clean = (rawPathname || '/').split(/[?#]/)[0].trim() || '/'
  if (clean.length > 1 && clean.endsWith('/')) {
    return clean.slice(0, -1).toLowerCase()
  }
  return clean.toLowerCase()
}

export function parseRoutePath(pathname: string): AppRoute {
  const normalized = normalizePathname(pathname)
  return PATH_TO_ROUTE.get(normalized) ?? 'not-found'
}

export function routeToPath(route: AppRoute): string {
  if (route === 'not-found') return '/404'
  return ROUTE_TO_META.get(route)?.path ?? '/'
}

export function getRouteMeta(route: AppRoute): RouteMeta | null {
  if (route === 'not-found') return null
  return ROUTE_TO_META.get(route) ?? null
}
