# Full-text extraction design

The article endpoint shares the existing guarded fetch pattern but applies an exact hostname allowlist derived from `DEFAULT_FEEDS` to every redirect, a timeout and a byte cap. Article links on other domains, including most Hacker News destinations, fall back to RSS summaries. Parse inert HTML with a Workers-compatible DOM, use Defuddle's Markdown extraction with asynchronous remote fallbacks disabled, and use Readability on a fresh document if necessary. Never trust extracted HTML: sanitize before rendering, and use a compatible CSP as defense in depth.

The client lazily obtains content for selected articles, retains RSS fallback on any failure, passes extracted text to existing summary and score inputs, and preserves the existing score algorithm. Tests use offline fixture HTML and exercise both extraction paths and transport restrictions. Check actual Worker compatibility and CSP behavior with the built app.
