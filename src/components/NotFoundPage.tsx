import { ArrowLeft, BookOpen, Command } from 'lucide-react'
import { routeToPath, type NavigableRoute } from '../lib/routes'
import PageShell from './PageShell'
import { Button } from './ui/button'

interface NotFoundPageProps {
  pathname: string
  onNavigate: (route: NavigableRoute) => void
  onOpenCommandPalette: () => void
}

export default function NotFoundPage({
  pathname,
  onNavigate,
  onOpenCommandPalette,
}: NotFoundPageProps) {
  return (
    <PageShell
      label="Page not found"
      currentRoute="not-found"
      onNavigate={onNavigate}
    >
      <div className="flex min-h-[55vh] flex-col items-start justify-center py-10">
        <p className="font-mono text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          404 · Route Not Found
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          This route does not exist
        </h1>
        <p className="mt-2.5 max-w-lg text-[14px] leading-relaxed text-zinc-600">
          No view matched{' '}
          <code className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-900">
            {pathname}
          </code>
          . Jump back to the live reader, open documentation, or use{' '}
          <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-800">
            ⌘K
          </kbd>{' '}
          to search all pages and articles.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Button asChild size="sm" className="h-9 gap-1.5 text-xs font-medium">
            <a
              href={routeToPath('feed')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                onNavigate('feed')
              }}
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              Back to Feed
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-zinc-200 text-xs shadow-none"
          >
            <a
              href={routeToPath('docs')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                onNavigate('docs')
              }}
            >
              <BookOpen aria-hidden="true" className="size-3.5" />
              Read Docs
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenCommandPalette}
            className="h-9 gap-1.5 border-zinc-200 text-xs shadow-none"
          >
            <Command aria-hidden="true" className="size-3.5" />
            Command palette
          </Button>
        </div>
      </div>
    </PageShell>
  )
}
