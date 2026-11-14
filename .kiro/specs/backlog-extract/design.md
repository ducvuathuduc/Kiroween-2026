# Full-text extraction design

The article endpoint shares the existing guarded fetch pattern but applies an exact hostname allowlist derived from `DEFAULT_FEEDS` to every redirect, a timeout and a byte cap. Article links on other domains, including most Hacker News destinations, fall back to RSS summaries. Parse inert HTML with a Workers-compatible DOM, use Defuddle's Markdown extraction with asynchronous remote fallbacks disabled, and use Readability on a fresh document if necessary. Never trust extracted HTML: sanitize before rendering, and use a compatible CSP as defense in depth.

The client lazily obtains content for selected articles, retains RSS fallback on any failure, passes extracted text to existing summary and score inputs, and preserves the existing score algorithm. Tests use offline fixture HTML and exercise both extraction paths and transport restrictions. Check actual Worker compatibility and CSP behavior with the built app.

## Module boundaries and actual data flow

This section records the shipped design retrospectively; it was expanded after implementation in response to the owner's quality bar, not written before the original implementation.

- `src/lib/feeds.ts` defines the default feed URLs and parses feed items. The Worker route in `server.ts` derives exact allowed HTTPS hostnames from those URLs, validates the initial URL and every redirect using the existing guarded fetch, and enforces timeout, HTML content type and response size limits. No user-supplied destination is implicitly trusted.
- `server/extract.ts` converts a detached document with Defuddle, then retries Readability on a fresh document when needed. The route bounds the resulting Markdown and HTML and returns them with title and author. `src/lib/extract.ts` validates the response and converts transport or extraction failures to `null`.
- In `src/App.tsx`, selection triggers extraction; successful Markdown (up to 5,000 characters) feeds the existing `explainScore` without changing its formula. Summarization uses extracted Markdown when available and the RSS description otherwise; the server bounds the content before provider calls. `ReaderPane` renders extracted HTML only through the existing sanitized HTML path. Stale selection responses are ignored.
- Ask is a separate server flow: `server/items.ts` loads default RSS feed items and scores their descriptions; `server/ask.ts` embeds titles and RSS descriptions, selects sources, then generates and validates a cited answer. **It does not consume the browser's extracted article cache or full text.** Browser scoring or summary enrichment therefore does not change Ask retrieval or answer context. Any future full-text Ask integration needs its own design, bounded fetching and acceptance tests; it is not implied by this feature.

## Decisions and tradeoffs

The Worker extraction route was chosen over parsing arbitrary article HTML in a live browser document to keep transport restrictions and extraction together. The cost is Worker parsing and bundle size; detached parsing, disabled async extraction and CSP reduce the exposure. Exact default-feed hostnames on each redirect deliberately exclude external article hosts, including most Hacker News links, in exchange for a narrow proxy boundary. Failed or unsupported extraction silently preserves the RSS description. This allowlist does not claim DNS-rebinding protection.

Reuse the existing summary and scoring interfaces instead of changing the deterministic scoring algorithm or introducing a separate ranking system. The selected item's enriched score can change the visible feed ordering, whereas unselected items retain their RSS-based score. Ask remains on server-loaded RSS rather than trusting browser-supplied extracted content or doing potentially many extraction requests per question; this bounds work but limits answer context.
