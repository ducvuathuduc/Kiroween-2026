import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { FOOTER_ROUTES, routeToPath, type NavigableRoute } from '../lib/routes'
import { ScrollArea } from './ui/scroll-area'

interface PageShellProps {
  label: string
  children: ReactNode
  currentRoute: NavigableRoute | 'not-found'
  onNavigate: (route: NavigableRoute) => void
  maxWidth?: 'max-w-4xl' | 'max-w-5xl' | 'max-w-6xl'
}

export default function PageShell({
  label,
  children,
  currentRoute,
  onNavigate,
  maxWidth = 'max-w-4xl',
}: PageShellProps) {
  return (
    <main aria-label={label} className="min-h-0 flex-1 bg-white">
      <ScrollArea className="h-full">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className={`mx-auto flex min-h-full flex-col justify-between px-6 py-8 sm:px-8 ${maxWidth}`}
        >
          <div className="space-y-8">{children}</div>

          <footer className="mt-14 border-t border-zinc-200 pt-6 pb-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-zinc-500">
                Resurrected Reader · Kiroween 2026 · MIT License
              </p>
              <nav
                aria-label="Site directory"
                className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
              >
                {FOOTER_ROUTES.map((item) => {
                  const active = currentRoute === item.route
                  return (
                    <a
                      key={item.route}
                      href={routeToPath(item.route)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                          return
                        }
                        e.preventDefault()
                        onNavigate(item.route)
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={`whitespace-nowrap transition-colors ${
                        active
                          ? 'font-semibold text-zinc-950 underline underline-offset-4'
                          : 'text-zinc-500 hover:text-zinc-950'
                      }`}
                    >
                      {item.label}
                    </a>
                  )
                })}
              </nav>
            </div>
          </footer>
        </motion.div>
      </ScrollArea>
    </main>
  )
}
