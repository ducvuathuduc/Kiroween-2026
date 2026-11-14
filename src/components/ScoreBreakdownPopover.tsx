import { Activity } from 'lucide-react'
import type { FeedItem } from '../lib/feeds'
import { scoreBadgeClass } from '../lib/format'
import { explainBoost, personalBoost, type TasteProfile } from '../lib/personalize'
import { explainScore, SIGNAL_DIMENSION_META } from '../lib/scoring'
import AnimatedScore from './AnimatedScore'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Separator } from './ui/separator'

interface ScoreBreakdownPopoverProps {
  item: FeedItem
  animate?: boolean
  showLabel?: boolean
  align?: 'start' | 'center' | 'end'
  onOpenRadar?: () => void
  onSelectItem?: (id: string) => void
  profile?: TasteProfile
}

export default function ScoreBreakdownPopover({
  item,
  animate = false,
  showLabel = false,
  align = 'start',
  onOpenRadar,
  onSelectItem,
  profile,
}: ScoreBreakdownPopoverProps) {
  const breakdown = explainScore(item.title, item.scoreText ?? item.description, item.pubDate, {
    feedId: item.feedId,
    feedTitle: item.feedTitle,
    link: item.link,
  })
  const score = item.score ?? breakdown.score
  const dims = item.scoreDimensions ?? breakdown.dimensions
  const boost = profile ? personalBoost(item, profile) : 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Why this score: ${score} of 100 for ${item.title}`}
          title="Why this score"
          className="inline-flex shrink-0 cursor-pointer items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
        >
          <Badge
            variant="outline"
            className={`gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums transition-transform hover:scale-[1.03] ${scoreBadgeClass(score)}`}
          >
            {animate ? <AnimatedScore value={score} /> : score}
            {showLabel && ' signal'}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        onClick={(e) => e.stopPropagation()}
        className="w-80"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-zinc-950">
              Why this score
            </p>
            <p className="text-[11px] text-zinc-500">
              Deterministic 4D signal · base score
            </p>
          </div>
          <span className="font-mono text-sm font-semibold tabular-nums text-zinc-950">
            {score}/100
          </span>
        </div>

        <div className="mt-3 space-y-2.5">
          {SIGNAL_DIMENSION_META.map((meta) => {
            const val = dims[meta.key]
            const weighted = Math.round((val * meta.weight) / 100)
            return (
              <div key={meta.key} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-zinc-800">
                    {meta.label}{' '}
                    <span className="font-mono text-zinc-400">
                      ({meta.weight}%)
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-zinc-600">
                    <strong className="font-semibold text-zinc-950">
                      {val}
                    </strong>
                    /100 · +{weighted} pts
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-zinc-900 transition-[width] duration-200"
                    style={{ width: `${val}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <Separator className="my-3" />

        {profile && <div className="mb-3 text-xs text-zinc-700">
          <p className="font-semibold">{boost >= 0 ? '+' : ''}{boost} personal</p>
          <p className="mt-1 text-zinc-500">{explainBoost(item, profile)}</p>
        </div>}

        {breakdown.reasons.length === 0 ? (
          <p className="text-[11px] text-zinc-500">
            Baseline source and recency weights applied.
          </p>
        ) : (
          <ul className="space-y-1 text-[11px]">
            {breakdown.reasons.slice(0, 6).map((r) => (
              <li
                key={`${r.dimension}-${r.label}`}
                className="flex items-center justify-between text-zinc-700"
              >
                <span className="truncate">{r.label}</span>
                <span className="ml-2 shrink-0 font-mono font-medium tabular-nums text-zinc-950">
                  +{r.points} {r.dimension.slice(0, 3)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {onOpenRadar && (
          <div className="mt-3 border-t border-zinc-100 pt-2.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                onSelectItem?.(item.id)
                onOpenRadar()
              }}
              className="h-7 w-full justify-center gap-1.5 text-[11px] text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
            >
              <Activity aria-hidden="true" className="size-3" />
              Open in 4D Signal Radar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
