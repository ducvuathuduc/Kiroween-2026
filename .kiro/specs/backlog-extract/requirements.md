# Full-text extraction requirements

Extract real article content with Defuddle and use Readability when extraction fails. Preserve the RSS summary when both fail. Feed extracted text into existing summarization and deterministic scoring without changing the scoring formula. Display a sanitized reader view protected by CSP.

The Worker fetches only allowed public article URLs, revalidates redirects, and enforces time and byte limits. Never execute upstream scripts or allow extraction libraries to fetch unguarded third-party resources. Return title, Markdown and metadata through a bounded client interface.

Verify fixture-based extraction and fallback, SSRF restrictions, ten real AWS/HN article URLs, reader rendering, and three real before/after summary comparisons. If credentials or quota prevent a comparison, report it as not run rather than inventing results.
