import { useState } from 'react'
import { Keyboard } from 'lucide-react'
import type { NavigableRoute } from '../lib/routes'
import { KEYBOARD_SHORTCUTS, type ShortcutEntry } from '../lib/shortcuts'
import PageShell from './PageShell'
import { Button } from './ui/button'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'

interface ShortcutsPageProps {
  onNavigate: (route: NavigableRoute) => void
  onOpenModal: () => void
}

type ScopeFilter = 'all' | ShortcutEntry['scope']

export default function ShortcutsPage({
  onNavigate,
  onOpenModal,
}: ShortcutsPageProps) {
  const [scope, setScope] = useState<ScopeFilter>('all')

  const filtered =
    scope === 'all'
      ? KEYBOARD_SHORTCUTS
      : KEYBOARD_SHORTCUTS.filter((s) => s.scope === scope)

  return (
    <PageShell
      label="Keyboard shortcuts reference"
      currentRoute="shortcuts"
      onNavigate={onNavigate}
    >
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
            Reference · /shortcuts
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
            Keyboard Shortcuts
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-zinc-600">
            Every shortcut listed below is wired globally when focus is outside
            inputs and modal dialogs. Press{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-800">
              ?
            </kbd>{' '}
            at any time to open the quick overlay.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenModal}
          className="h-8 gap-1.5 border-zinc-200 text-xs shadow-none"
        >
          <Keyboard aria-hidden="true" className="size-3.5" />
          Test ? modal
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={scope}
          onValueChange={(v) => setScope(v as ScopeFilter)}
        >
          <TabsList className="h-8 bg-zinc-100/80 p-0.5">
            <TabsTrigger value="all" className="h-7 px-3 text-xs">
              All ({KEYBOARD_SHORTCUTS.length})
            </TabsTrigger>
            <TabsTrigger value="Navigation" className="h-7 px-3 text-xs">
              Navigation
            </TabsTrigger>
            <TabsTrigger value="Item Actions" className="h-7 px-3 text-xs">
              Item Actions
            </TabsTrigger>
            <TabsTrigger value="Global" className="h-7 px-3 text-xs">
              Global
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <span className="font-mono text-xs tabular-nums text-zinc-500">
          {filtered.length} shortcut{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              <th className="px-4 py-2.5">Shortcut</th>
              <th className="px-4 py-2.5">Action</th>
              <th className="hidden px-4 py-2.5 sm:table-cell">Scope</th>
              <th className="px-4 py-2.5">Behavior</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-[13px]">
            {filtered.map((entry) => (
              <tr key={entry.id} className="hover:bg-zinc-50/60">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    {entry.keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs font-medium text-zinc-900"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-zinc-950">
                  {entry.label}
                </td>
                <td className="hidden px-4 py-3 text-xs text-zinc-500 sm:table-cell">
                  {entry.scope}
                </td>
                <td className="px-4 py-3 text-xs leading-relaxed text-zinc-600">
                  {entry.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
