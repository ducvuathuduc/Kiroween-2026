import { useState } from 'react'
import { Activity, BookOpen, Check, Copy, ExternalLink, HelpCircle, Mail } from 'lucide-react'
import { routeToPath, type NavigableRoute } from '../lib/routes'
import PageShell from './PageShell'
import { Button } from './ui/button'
import { Separator } from './ui/separator'

interface ContactPageProps {
  onNavigate: (route: NavigableRoute) => void
}

const CONTACT_EMAIL = 'huynhthanh@vtechstudio.tech'
const REPO_URL = 'https://github.com/ducvuathuduc/Kiroween-2026'
const ISSUES_URL = 'https://github.com/ducvuathuduc/Kiroween-2026/issues'

export default function ContactPage({ onNavigate }: ContactPageProps) {
  const [copied, setCopied] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL)
      setCopied(true)
      setCopyStatus(`Copied ${CONTACT_EMAIL} to clipboard.`)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyStatus(`Email address: ${CONTACT_EMAIL}`)
    }
  }

  return (
    <PageShell
      label="Contact and support"
      currentRoute="contact"
      onNavigate={onNavigate}
    >
      <div className="border-b border-zinc-200 pb-6">
        <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
          Support · /contact
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
          Contact &amp; Support
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-zinc-600">
          Resurrected Reader is maintained by{' '}
          <strong>Huỳnh Diệu Thành (VTech Studio)</strong> for Kiroween 2026. Use
          the real project channels below for bug reports, feed proxy feedback,
          or questions.
        </p>
      </div>

      <section aria-label="Direct contact channels" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col justify-between rounded-lg border border-zinc-200 bg-white p-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-950">
              <Mail aria-hidden="true" className="size-4 text-zinc-700" />
              <h2>Email Maintainer</h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              For direct questions, security disclosures, or Kiroween 2026
              feedback, write to the project maintainer:
            </p>
            <p className="mt-3 font-mono text-xs font-medium text-zinc-950">
              {CONTACT_EMAIL}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="h-8 gap-1.5 text-xs font-medium">
              <a href={`mailto:${CONTACT_EMAIL}?subject=Resurrected%20Reader%20Support`}>
                <Mail aria-hidden="true" className="size-3.5" />
                Send email
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleCopyEmail()}
              className="h-8 gap-1.5 border-zinc-200 text-xs shadow-none"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-3.5" />
              ) : (
                <Copy aria-hidden="true" className="size-3.5" />
              )}
              {copied ? 'Copied' : 'Copy email'}
            </Button>
          </div>
          {copyStatus && (
            <p role="status" aria-live="polite" className="mt-2.5 text-[11px] text-zinc-600">
              {copyStatus}
            </p>
          )}
        </div>

        <div className="flex flex-col justify-between rounded-lg border border-zinc-200 bg-white p-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-950">
              <ExternalLink aria-hidden="true" className="size-4 text-zinc-700" />
              <h2>GitHub Repository &amp; Issues</h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              Inspect the source code, Kiro specifications under{' '}
              <code className="font-mono">.kiro/specs/</code>, or file a bug
              report directly on GitHub:
            </p>
            <p className="mt-3 truncate font-mono text-xs text-zinc-800">
              github.com/ducvuathuduc/Kiroween-2026
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 border-zinc-200 text-xs shadow-none">
              <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
                Open GitHub Issues
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-zinc-700">
              <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
                Source repository
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      <section aria-label="Self-service diagnostics" className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          Self-Service Diagnostics &amp; Help
        </h2>
        <p className="text-[13px] leading-relaxed text-zinc-600">
          Because feed parsing, scoring, and reading state run locally or
          through your deployment&apos;s Worker, most questions can be checked in
          one click:
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              route: 'system' as const,
              icon: Activity,
              title: 'System & Feed Health',
              body: 'Inspect live RSS fetch status, last refresh clock, item counts, and upstream errors.',
            },
            {
              route: 'guide' as const,
              icon: BookOpen,
              title: 'User Guide',
              body: 'Follow step-by-step instructions for Feed, Briefing Audio, Second Brain, and MCP.',
            },
            {
              route: 'faq' as const,
              icon: HelpCircle,
              title: 'FAQ',
              body: 'Review common answers on deterministic scoring, local backups, and AI keys.',
            },
          ].map((card) => {
            const Icon = card.icon
            return (
              <a
                key={card.route}
                href={routeToPath(card.route)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                  e.preventDefault()
                  onNavigate(card.route)
                }}
                className="flex flex-col justify-between rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50/50"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-950">
                    <Icon aria-hidden="true" className="size-3.5 text-zinc-600" />
                    <span>{card.title}</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
                    {card.body}
                  </p>
                </div>
                <span className="mt-3 font-mono text-[11px] font-medium text-zinc-700">
                  {routeToPath(card.route)} →
                </span>
              </a>
            )
          })}
        </div>
      </section>
    </PageShell>
  )
}
