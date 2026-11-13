export interface ShortcutEntry {
  id: string
  keys: string[]
  label: string
  description: string
  scope: 'Navigation' | 'Item Actions' | 'Global'
}

export const KEYBOARD_SHORTCUTS: ReadonlyArray<ShortcutEntry> = [
  {
    id: 'move-next',
    keys: ['j'],
    label: 'Next item',
    description: 'Move selection down to the next item in the timeline.',
    scope: 'Navigation',
  },
  {
    id: 'move-prev',
    keys: ['k'],
    label: 'Previous item',
    description: 'Move selection up to the previous item in the timeline.',
    scope: 'Navigation',
  },
  {
    id: 'open-reader',
    keys: ['Enter'],
    label: 'Open & focus reader',
    description: 'Open the selected item and move focus to the article heading.',
    scope: 'Navigation',
  },
  {
    id: 'arrow-nav',
    keys: ['↑', '↓'],
    label: 'Listbox roving focus',
    description: 'Move focus directly across items inside the timeline listbox.',
    scope: 'Navigation',
  },
  {
    id: 'open-original',
    keys: ['o'],
    label: 'Open original post',
    description: 'Open the selected item’s canonical source URL in a new tab.',
    scope: 'Item Actions',
  },
  {
    id: 'summarize',
    keys: ['s'],
    label: 'Summarize with Gemini',
    description: 'Generate or refresh the server-side Gemini TL;DR for the current item.',
    scope: 'Item Actions',
  },
  {
    id: 'export-kiro',
    keys: ['e'],
    label: 'Export Kiro task',
    description: 'Open the Kiro Spec Preview modal for clipboard copy or .zip download.',
    scope: 'Item Actions',
  },
  {
    id: 'bookmark',
    keys: ['b'],
    label: 'Save / bookmark',
    description: 'Toggle the saved bookmark state on the currently selected item.',
    scope: 'Item Actions',
  },
  {
    id: 'search',
    keys: ['/'],
    label: 'Focus filter input',
    description: 'Focus and select the title/summary filter box in the header.',
    scope: 'Global',
  },
  {
    id: 'command-palette',
    keys: ['⌘K', 'Ctrl+K'],
    label: 'Command palette',
    description: 'Fuzzy search across all pages, feeds, Community Pulse, and articles.',
    scope: 'Global',
  },
  {
    id: 'refresh-feeds',
    keys: ['r'],
    label: 'Refresh all feeds',
    description: 'Re-fetch all subscribed RSS/Atom feeds and Community Pulse.',
    scope: 'Global',
  },
  {
    id: 'shortcuts-modal',
    keys: ['?'],
    label: 'Keyboard shortcuts',
    description: 'Open the Keyboard Shortcuts quick reference modal from anywhere.',
    scope: 'Global',
  },
]
