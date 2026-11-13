import { ExternalLink } from 'lucide-react'
import { routeToPath, type NavigableRoute } from '../lib/routes'
import PageShell from './PageShell'
import { Button } from './ui/button'
import { Separator } from './ui/separator'

interface AboutPageProps {
  onNavigate: (route: NavigableRoute) => void
}

const REPO_URL = 'https://github.com/ducvuathuduc/Kiroween-2026'

export default function AboutPage({ onNavigate }: AboutPageProps) {
  return (
    <PageShell
      label="About Resurrected Reader"
      currentRoute="about"
      onNavigate={onNavigate}
    >
      <div className="border-b border-zinc-200 pb-6">
        <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
          About · /about
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
          Google Reader died in 2013. Builders still need signal.
        </h1>
        <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-zinc-600">
          Resurrected Reader is a <strong>Kiroween 2026 (Resurrection)</strong>{' '}
          entry built by <strong>Huỳnh Diệu Thành (VTech Studio)</strong>. It
          brings back the calm 3-pane speed of classic Google Reader—reborn as a
          deterministic AI reading radar that turns high-signal engineering
          posts into ready-to-ship Kiro specs.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs font-medium">
            <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
              View GitHub repository
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 border-zinc-200 text-xs shadow-none"
          >
            <a
              href={routeToPath('docs')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                onNavigate('docs')
              }}
            >
              Read documentation
            </a>
          </Button>
        </div>
      </div>

      <section aria-label="Why this exists" className="space-y-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          The resurrection thesis
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              step: '01. Classic calm',
              detail:
                'No algorithmic engagement feed, no infinite scroll traps, no ads. Subscriptions remain plain RSS/Atom and OPML 2.0 files you control.',
            },
            {
              step: '02. Transparent signal',
              detail:
                'Every item gets a reproducible 0–100 score across Relevance, Recency, Authority, and Novelty. Click any score to inspect exact weights and matched rules.',
            },
            {
              step: '03. Reading into shipping',
              detail:
                'High-signal reads convert directly into Gemini TL;DRs and downloadable 3-file Kiro spec bundles (.zip) ready for .kiro/specs/ and aws-docs MCP.',
            },
          ].map((card) => (
            <div
              key={card.step}
              className="rounded-lg border border-zinc-200 bg-white p-4"
            >
              <h3 className="text-xs font-semibold text-zinc-950">
                {card.step}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                {card.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section aria-label="Technical architecture summary" className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          Built cleanly on open web standards
        </h2>
        <dl className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-xs">
          {[
            ['Interface', 'React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui (Radix)'],
            ['Typography & Motion', 'Self-hosted Geist & Geist Mono Variable · motion/react · @ui-sdk/react Listbox'],
            ['Server Proxy & AI', 'Express (/api/rss, /api/og-images, /api/summarize via @google/genai)'],
            ['Visualizations & Specs', 'Recharts · Mermaid · PKZIP CRC-32 export · Spec Kit & Kiro (.kiro/)'],
            ['License & Author', 'MIT License · Huỳnh Diệu Thành (VTech Studio)'],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <dt className="font-medium text-zinc-500">{k}</dt>
              <dd className="font-mono text-zinc-900">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </PageShell>
  )
}
