import { ArrowUpRight, Keyboard } from 'lucide-react'
import { routeToPath, type NavigableRoute } from '../lib/routes'
import { KEYBOARD_SHORTCUTS, type ShortcutEntry } from '../lib/shortcuts'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'

interface KeyboardShortcutsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (route: NavigableRoute) => void
}

const SCOPES: ReadonlyArray<ShortcutEntry['scope']> = [
  'Navigation',
  'Item Actions',
  'Global',
]

export default function KeyboardShortcutsModal({
  open,
  onOpenChange,
  onNavigate,
}: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-200/90 bg-white/90 p-0 shadow-[0_16px_48px_rgba(0,0,0,0.12)] backdrop-blur-xl sm:max-w-xl">
        <DialogHeader className="border-b border-zinc-200 px-6 py-4 text-left">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
            <Keyboard aria-hidden="true" className="size-3.5" />
            Keyboard Reference
          </div>
          <DialogTitle className="text-base font-semibold tracking-tight text-zinc-950">
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="text-[13px] text-zinc-500">
            Single-key navigation works whenever focus is outside text inputs
            and dialogs.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] px-6 py-4">
          <div className="space-y-5">
            {SCOPES.map((scope) => {
              const rows = KEYBOARD_SHORTCUTS.filter((s) => s.scope === scope)
              return (
                <section key={scope} aria-label={`${scope} shortcuts`}>
                  <h3 className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
                    {scope}
                  </h3>
                  <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
                    {rows.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between gap-4 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-zinc-950">
                            {entry.label}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {entry.description}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {entry.keys.map((k) => (
                            <kbd
                              key={k}
                              className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-800"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="items-center justify-between border-t border-zinc-200 px-6 py-3 sm:justify-between">
          <a
            href={routeToPath('shortcuts')}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
              e.preventDefault()
              onOpenChange(false)
              onNavigate('shortcuts')
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-950"
          >
            Open full /shortcuts reference
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
          <Button
            type="button"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
