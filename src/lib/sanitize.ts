import { safeHttpUrl } from './format'

const ALLOWED_ELEMENTS = [
  'p',
  'h2',
  'h3',
  'h4',
  'b',
  'i',
  'strong',
  'em',
  'a',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'br',
]

const ALLOWED_ATTRIBUTES = ['href']

let domPurifyPromise: Promise<typeof import('dompurify')['default']> | null =
  null

function loadDOMPurify() {
  domPurifyPromise ??= import('dompurify').then((mod) => mod.default)
  return domPurifyPromise
}

type SetHtmlCapableElement = HTMLElement & {
  setHTML: (
    html: string,
    options?: {
      sanitizer?: {
        elements?: string[]
        attributes?: string[]
      }
    },
  ) => void
}

function hasNativeSetHTML(el: HTMLElement): el is SetHtmlCapableElement {
  return 'setHTML' in el && typeof (el as { setHTML?: unknown }).setHTML === 'function'
}

function hardenLinks(container: HTMLElement): void {
  const anchors = container.querySelectorAll('a')
  for (const anchor of anchors) {
    const rawHref = anchor.getAttribute('href') ?? ''
    const safeHref = safeHttpUrl(rawHref)
    if (!safeHref) {
      const text = document.createTextNode(anchor.textContent ?? '')
      anchor.replaceWith(text)
    } else {
      anchor.setAttribute('href', safeHref)
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noreferrer noopener')
    }
  }
}

/**
 * Sanitize untrusted feed HTML following Modern Web Guidance (sanitize-untrusted-html):
 * uses native Element.setHTML() when available and lazily loads DOMPurify as fallback.
 */
export async function safeSetFeedHtml(
  el: HTMLElement,
  html: string,
): Promise<void> {
  if (!html.trim()) {
    el.textContent = ''
    return
  }

  if (hasNativeSetHTML(el)) {
    el.setHTML(html, {
      sanitizer: {
        elements: ALLOWED_ELEMENTS,
        attributes: ALLOWED_ATTRIBUTES,
      },
    })
  } else {
    const DOMPurify = await loadDOMPurify()
    el.innerHTML = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [...ALLOWED_ELEMENTS, '#text'],
      ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      KEEP_CONTENT: false,
    })
  }

  hardenLinks(el)
}
