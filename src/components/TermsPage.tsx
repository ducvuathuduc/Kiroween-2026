import { routeToPath, type NavigableRoute } from '../lib/routes'
import PageShell from './PageShell'
import { Separator } from './ui/separator'

interface TermsPageProps {
  onNavigate: (route: NavigableRoute) => void
}

export default function TermsPage({ onNavigate }: TermsPageProps) {
  return (
    <PageShell
      label="Terms of Service"
      currentRoute="terms"
      onNavigate={onNavigate}
    >
      <div className="border-b border-zinc-200 pb-6">
        <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
          Terms of Service · /terms
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
          Terms of Service &amp; Open-Source License
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-zinc-600">
          Resurrected Reader is free, open-source software released under the MIT
          License for Kiroween 2026 by Huỳnh Diệu Thành (VTech Studio). By using
          this web application or running your own deployment, you agree to the
          straightforward terms below.
        </p>
      </div>

      <div className="space-y-6 text-[13.5px] leading-relaxed text-zinc-700">
        <section aria-label="Open-source license" className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            1. MIT License &amp; Free Access
          </h2>
          <p>
            The Resurrected Reader source code is licensed under the{' '}
            <strong>MIT License</strong>. There are no paid tiers, user
            subscriptions, or commercial lock-in in this project. You may read,
            fork, self-host, or modify the codebase in accordance with the{' '}
            <code className="font-mono">LICENSE</code> file in the repository.
          </p>
        </section>

        <Separator />

        <section aria-label="Local-first data responsibility" className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            2. Local-First State &amp; User Backups
          </h2>
          <p>
            Because Resurrected Reader provides no user accounts or hosted user
            database, your feed list, read/saved status, Second Brain history,
            and preferences live in your browser (<code className="font-mono">localStorage</code>,{' '}
            <code className="font-mono">IndexedDB</code>, and Cache Storage).
            Clearing browser site data erases that state permanently unless you
            export a <code className="font-mono">.json</code> or{' '}
            <code className="font-mono">.opml</code> backup beforehand from{' '}
            <a
              href={routeToPath('settings')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                onNavigate('settings')
              }}
              className="font-medium text-zinc-950 underline underline-offset-4"
            >
              Settings
            </a>
            .
          </p>
        </section>

        <Separator />

        <section aria-label="Third-party feeds and content" className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            3. Third-Party Feeds, Content &amp; Proxies
          </h2>
          <p>
            All articles, RSS/Atom feeds, Hacker News stories, GitHub
            repositories, and pasted newsletters belong to their respective
            authors and publishers. Resurrected Reader fetches public feeds on
            demand and displays excerpts or extracted readability views strictly
            for personal reading and workflow organization. Do not use the feed
            proxy (<code className="font-mono">/api/rss</code>) or article
            extractor (<code className="font-mono">/api/extract</code>) to bypass
            paywalls, violate publisher terms, or abuse upstream rate limits.
          </p>
        </section>

        <Separator />

        <section aria-label="AI features and read-only endpoints" className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            4. Optional AI Features, Scoring &amp; Read-Only MCP
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-zinc-600">
            <li>
              <strong>Deterministic scores:</strong> Signal scores (0–100) are
              computed mathematically from explicit rules in{' '}
              <code className="font-mono">explainScore()</code> and do not use
              AI or represent endorsement of any third-party post.
            </li>
            <li>
              <strong>Optional AI &amp; TTS:</strong> When the deployment
              operator configures server-side API keys (such as Gemini, OpenAI,
              Anthropic, Bedrock, or Workers AI), generated TL;DRs, Ask Q&amp;A
              answers, and spoken briefing audio are automated outputs—always
              verify technical commands, IAM policies, and code against official
              source documentation before deploying.
            </li>
            <li>
              <strong>Public read-only MCP &amp; A2A demo scope:</strong> The{' '}
              <code className="font-mono">/mcp</code> and{' '}
              <code className="font-mono">/a2a</code> endpoints expose read-only
              access to public default feeds for interoperability demos without
              authentication. Rate limits or availability are best-effort.
            </li>
          </ul>
        </section>

        <Separator />

        <section aria-label="No warranty" className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            5. Disclaimer of Warranty &amp; Contact
          </h2>
          <p>
            Consistent with the MIT License, Resurrected Reader is provided{' '}
            <strong>&ldquo;AS IS&rdquo;</strong> without warranty of any kind,
            express or implied, including uptime guarantees, service-level
            agreements (SLAs), or fitness for a particular purpose. Questions or
            takedown/support requests may be directed to{' '}
            <a
              href="mailto:huynhthanh@vtechstudio.tech"
              className="font-medium text-zinc-950 underline underline-offset-4"
            >
              huynhthanh@vtechstudio.tech
            </a>{' '}
            or via{' '}
            <a
              href={routeToPath('contact')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                onNavigate('contact')
              }}
              className="font-medium text-zinc-950 underline underline-offset-4"
            >
              Contact &amp; Support
            </a>
            .
          </p>
        </section>
      </div>
    </PageShell>
  )
}
