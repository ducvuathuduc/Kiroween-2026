import { useEffect, useRef } from 'react'
import { safeSetFeedHtml } from '../lib/sanitize'

interface SafeHtmlProps {
  html: string
  className?: string
}

export default function SafeHtml({ html, className }: SafeHtmlProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false

    void safeSetFeedHtml(el, html).catch(() => {
      if (!cancelled) el.textContent = ''
    })

    return () => {
      cancelled = true
    }
  }, [html])

  return <div ref={ref} className={className} />
}
