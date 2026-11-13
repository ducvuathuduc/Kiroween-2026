import { useEffect, useId, useRef, useState } from 'react'
import DOMPurify from 'dompurify'

interface MermaidDiagramProps {
  chart: string
  caption?: string
  className?: string
}

let mermaidInitialized = false

export default function MermaidDiagram({
  chart,
  caption,
  className = '',
}: MermaidDiagramProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderedFor, setRenderedFor] = useState<string>('')
  const [error, setError] = useState<string>('')

  const rendering = renderedFor !== chart && !error

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const mod = await import('mermaid')
        const mermaid = mod.default
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'neutral',
            htmlLabels: false,
            fontFamily: 'Geist Variable, system-ui, sans-serif',
            flowchart: {
              htmlLabels: false,
              curve: 'basis',
              nodeSpacing: 36,
              rankSpacing: 44,
            },
            themeVariables: {
              primaryColor: '#fafafa',
              primaryBorderColor: '#d4d4d8',
              primaryTextColor: '#09090b',
              lineColor: '#52525b',
              secondaryColor: '#f4f4f5',
              tertiaryColor: '#ffffff',
              fontFamily: 'Geist Variable, system-ui, sans-serif',
              fontSize: '12px',
            },
          })
          mermaidInitialized = true
        }

        const uniqueId = `rr-mermaid-${reactId}-${Date.now()}`
        const { svg } = await mermaid.render(uniqueId, chart)
        if (cancelled || !containerRef.current) return

        const cleanSvg = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true, html: true },
          ADD_TAGS: ['foreignObject'],
          HTML_INTEGRATION_POINTS: { foreignobject: true },
        })
        containerRef.current.innerHTML = cleanSvg
        const svgEl = containerRef.current.querySelector('svg')
        if (svgEl) {
          svgEl.style.maxWidth = '100%'
          svgEl.style.height = 'auto'
        }
        setError('')
        setRenderedFor(chart)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : 'Diagram render unavailable.',
        )
        setRenderedFor(chart)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chart, reactId])

  return (
    <figure
      className={`overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50/50 ${className}`}
    >
      {error ? (
        <pre className="overflow-x-auto p-4 font-mono text-xs text-zinc-700">
          <code>{chart}</code>
        </pre>
      ) : (
        <div className="relative min-h-32 overflow-x-auto p-4">
          {rendering && (
            <div className="skeleton-shimmer h-28 w-full rounded-md" />
          )}
          <div
            ref={containerRef}
            className={`flex items-center justify-center transition-opacity duration-150 ${
              rendering ? 'opacity-0' : 'opacity-100'
            }`}
          />
        </div>
      )}
      {caption && (
        <figcaption className="border-t border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-500">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
