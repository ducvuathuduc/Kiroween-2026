import { useState } from 'react'
import { feedMonogram, safeHttpUrl } from '../lib/format'

interface ItemThumbnailProps {
  src?: string
  title: string
  feedTitle: string
  variant?: 'thumb' | 'cover'
  className?: string
}

export default function ItemThumbnail({
  src,
  title,
  feedTitle,
  variant = 'thumb',
  className = '',
}: ItemThumbnailProps) {
  const safeSrc = src ? safeHttpUrl(src) : null
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)

  const canShowImage = Boolean(safeSrc) && failedSrc !== safeSrc
  const isLoaded = Boolean(safeSrc) && loadedSrc === safeSrc
  const monogram = feedMonogram(feedTitle)

  if (variant === 'cover') {
    if (!canShowImage || !safeSrc) {
      return (
        <div
          aria-hidden="true"
          className={`monogram-tile-pattern relative flex h-32 w-full items-center justify-between overflow-hidden rounded-lg border border-zinc-200 px-6 ${className}`}
        >
          <div className="min-w-0">
            <span className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              {feedTitle}
            </span>
            <p className="mt-1 line-clamp-1 max-w-md text-xs text-zinc-600">
              {title}
            </p>
          </div>
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white font-mono text-base font-semibold text-zinc-900 shadow-xs">
            {monogram}
          </span>
        </div>
      )
    }

    return (
      <div
        className={`relative h-48 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50/70 sm:h-56 ${className}`}
      >
        {!isLoaded && (
          <div
            aria-hidden="true"
            className="skeleton-shimmer absolute inset-0"
          />
        )}
        <img
          src={safeSrc}
          alt={title}
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="async"
          onLoad={() => setLoadedSrc(safeSrc)}
          onError={() => setFailedSrc(safeSrc)}
          className={`h-full w-full object-contain p-2 transition-opacity duration-200 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
    )
  }

  return (
    <div
      className={`relative size-12 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 ${className}`}
    >
      {canShowImage && safeSrc ? (
        <>
          {!isLoaded && (
            <div
              aria-hidden="true"
              className="skeleton-shimmer absolute inset-0"
            />
          )}
          <img
            src={safeSrc}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onLoad={() => setLoadedSrc(safeSrc)}
            onError={() => setFailedSrc(safeSrc)}
            className={`h-full w-full object-cover transition-opacity duration-200 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      ) : (
        <span
          aria-hidden="true"
          className="monogram-tile-pattern flex h-full w-full items-center justify-center font-mono text-xs font-semibold tracking-tight text-zinc-700"
        >
          {monogram}
        </span>
      )}
    </div>
  )
}
