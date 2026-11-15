export type AppRoute =
  | 'feed'
  | 'briefing'
  | 'radar'
  | 'system'
  | 'guide'
  | 'docs'
  | 'shortcuts'
  | 'about'
  | 'changelog'
  | 'faq'
  | 'privacy'
  | 'terms'
  | 'contact'
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
    id: 'guide',
    path: '/guide',
    label: 'User Guide',
    description: 'Step-by-step guide for Feed, Briefing audio, Radar, Second Brain, Newsletters, MCP & Settings',
    documentTitle: 'User Guide — Resurrected Reader',
  },
  {
    id: 'docs',
    path: '/docs',
    label: 'Docs',
    description: 'Technical reference: scoring model, OPML, Kiro export, MCP & A2A',
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
    id: 'faq',
    path: '/faq',
    label: 'FAQ',
    description: 'Answers on deterministic scoring, local storage, AI keys, audio fallback & MCP',
    documentTitle: 'FAQ — Resurrected Reader',
  },
  {
    id: 'privacy',
    path: '/privacy',
    label: 'Privacy Policy',
    description: 'Local-first storage, RSS proxies, server-side AI & zero tracking',
    documentTitle: 'Privacy Policy — Resurrected Reader',
  },
  {
    id: 'terms',
    path: '/terms',
    label: 'Terms of Service',
    description: 'MIT open-source license, feed attribution, and no-warranty terms',
    documentTitle: 'Terms of Service — Resurrected Reader',
  },
  {
    id: 'contact',
    path: '/contact',
    label: 'Contact & Support',
    description: 'Project email support, GitHub repository & self-service diagnostics',
    documentTitle: 'Contact & Support — Resurrected Reader',
  },
]

export const FOOTER_ROUTES: ReadonlyArray<{ route: NavigableRoute; label: string }> = [
  { route: 'feed', label: 'Feed' },
  { route: 'briefing', label: 'Briefing' },
  { route: 'radar', label: 'Signal Radar' },
  { route: 'system', label: 'System & Health' },
  { route: 'guide', label: 'User Guide' },
  { route: 'docs', label: 'Docs' },
  { route: 'shortcuts', label: 'Shortcuts' },
  { route: 'settings', label: 'Settings' },
  { route: 'about', label: 'About' },
  { route: 'changelog', label: 'Changelog' },
  { route: 'faq', label: 'FAQ' },
  { route: 'privacy', label: 'Privacy Policy' },
  { route: 'terms', label: 'Terms of Service' },
  { route: 'contact', label: 'Contact' },
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
