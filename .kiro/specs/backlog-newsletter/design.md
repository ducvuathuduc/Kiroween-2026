# Design — Newsletter-to-Feed Bridge (`workers/newsletter/` + Reader Integration)

## Architecture

### 1. Shared Data Model & Pure MIME/Feed Logic (`src/lib/newsletter.ts`)
Models directly after `leafac/kill-the-newsletter` (decoupled feed ID vs inbound address, email-as-entry) and `juherr/kill-the-news` (128-bit base64url `FeedId`, separate friendly `MailboxId`, multi-format RSS/Atom/JSON Feed serialization, XML control-char sanitization, ETag generation, `postal-mime` parsing):

- **`FeedSource` extension (`src/lib/feeds.ts`)**:
  - Add optional `kind?: 'rss' | 'newsletter'` (`undefined` treated as `'rss'` for full backward compatibility with saved `rr.feeds` / OPML).
  - Add optional `inboundAddress?: string` and `createdAt?: string`.
- **Interfaces (`src/lib/newsletter.ts`)**:
  - `NewsletterEntry`: `{ id: string; messageId?: string; contentHash: string; subject: string; from: string; fromName?: string; fromAddress?: string; receivedAt: string; html?: string; text: string; link: string }`
  - `NewsletterFeedRecord`: `{ id: string; mailboxId: string; title: string; inboundAddress: string; createdAt: string; entries: NewsletterEntry[] }`
- **Identity Generation**:
  - `generateFeedId()`: 16 CSPRNG bytes via `crypto.getRandomValues(new Uint8Array(16))` encoded as 22-char unpadded base64url (`[A-Za-z0-9_-]{22}`). Zero sequential counters.
  - `generateMailboxId()`: `<noun1>.<noun2>.<10..99>` friendly local part (matching `juherr/kill-the-news`) combined with default placeholder domain `newsletter.resurrected-reader.invalid` (or configured `INBOUND_DOMAIN` env var on the sibling Worker). Note `mailboxId` is independent of `feedId`.
- **Email Parsing (`parseRawEmail`)**:
  - Uses `PostalMime.parse(raw)` (`postal-mime@4.2.1`) so RFC 822 headers, RFC 2047 UTF-8 encoded words, quoted-printable, base64, and `multipart/alternative` (`text/html` + `text/plain`) decode accurately in Node, Cloudflare Workers, and browsers.
  - Normalizes `subject`, `from` (`Name <addr>`), `date` via `normalizeDate()`, `messageId`, `html` (if any), and `text` (`email.text` or HTML→clean plain text via `htmlToPlainText()` stripping `<style>`, `<script>`, tags, and collapsing whitespace).
  - Extracts first safe `http(s)` canonical link (`extractFirstSafeLink()`) if present in HTML/text, avoiding tracking pixels or `javascript:` URLs.
  - Rejects empty/unparseable payloads with an explicit validation error (`Raw email must include a subject or body content.`).
  - Deduplicates entries on `(messageId || contentHash)`.
- **Feed Serialization (`renderRssFeed`, `renderAtomFeed`, `renderJsonFeed`, `computeFeedEtag`)**:
  - Strips XML 1.0 illegal control characters (`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`) and escapes XML entities safely.
  - Produces standards-compliant RSS 2.0 (`/rss/:feedId`), Atom 1.0 (`/atom/:feedId`), and JSON Feed 1.1 (`/json/:feedId`) documents plus deterministic SHA/FNV-style strong `ETag` and `Last-Modified` header support (`304 Not Modified` when `If-None-Match` matches).
- **Reader Conversion (`newsletterEntryToFeedItem`, `scoreNewsletterFeedItems`)**:
  - Converts each `NewsletterEntry` into a standard `FeedItem` (`feedId: feed.id`, `feedTitle: feed.title`, `pubDate: entry.receivedAt`, `description: entry.text`, `descriptionHtml: entry.html`, `imageUrl: extractImageFromHtml(entry.html ?? '')`, `link: entry.link || `${origin}/rss/${feed.id}#${entry.id}``) and passes it directly through `explainScore()` in `src/lib/scoring.ts` without altering `scoreItem`.

### 2. Sibling Cloudflare Worker (`workers/newsletter/`)
- **`workers/newsletter/wrangler.toml`**: Separate Worker config (`name = "resurrected-reader-newsletter"`, `main = "src/index.ts"`, `compatibility_date = "2026-11-13"`, `compatibility_flags = ["nodejs_compat"]`), with commented/isolated `NEWSLETTER_KV` + `INBOUND_DOMAIN` template instructions — completely decoupled from root `wrangler.jsonc`.
- **`workers/newsletter/src/index.ts`**:
  - Exposes `createNewsletterWorkerApp(store)` (testable Hono app) + default Worker `fetch` & `email(message, env)` handlers.
  - `email(message, env)` resolves `MailboxId` from `message.to` via `inbound:<mailboxId>` index, reads `message.raw` (`new Response(message.raw).arrayBuffer()`), calls `parseRawEmail()`, stores entry in `NEWSLETTER_KV` (or memory store in dev), and drops unknown recipients safely (`message.setReject('Unknown newsletter address')`).
  - HTTP routes: `GET /`, `GET /api/v1/feeds`, `POST /api/v1/feeds`, `DELETE /api/v1/feeds/:feedId`, `POST /api/v1/feeds/:feedId/import`, `GET /rss/:feedId`, `GET /atom/:feedId`, `GET /json/:feedId`.

### 3. Main-Origin Local/Preview Bridge (`server.ts` & `wrangler.jsonc`)
- **Zero new bindings** in `wrangler.jsonc` or `server.ts`. Only add `"/rss/*"`, `"/atom/*"`, `"/json/*"` to `run_worker_first` in `wrangler.jsonc` (and exclude `rss|atom|json` from Workbox `cacheNavigation` in `src/lib/pwa/cachePolicy.ts`) so `GET /rss/:feedId` reaches the Worker instead of SPA `index.html`.
- `server.ts` mounts lightweight routes backed by a pure isolate-local `NewsletterStore` (`createMemoryNewsletterStore()` using `src/lib/newsletter.ts`):
  - `GET /api/newsletter/feeds`, `POST /api/newsletter/feeds`, `DELETE /api/newsletter/feeds/:feedId`, `POST /api/newsletter/feeds/:feedId/import`
  - `GET /rss/:feedId`, `GET /atom/:feedId`, `GET /json/:feedId` (with `ETag` / `304 Not Modified`)
- Note: If the main app connects to a browser reload or fresh isolate, client-persisted `rr.newsletter.v1` state (`src/lib/storage.ts`) also parses imports client-side/server-side cleanly, re-hydrates `POST /api/newsletter/feeds/sync` cleanly on mount if needed so `/rss/:feedId` stays in sync during local sessions, and keeps newsletter entries flowing through the exact same `fetchFeed()` (`kind: 'newsletter'`), `explainScore()`, `POST /api/summarize`, and Kiro export pipeline!

### 4. Monochrome Admin UI (`src/components/NewsletterModal.tsx` + `FeedList.tsx` / `ReaderPane.tsx`)
- Accessible from `FeedList` sidebar (`Newsletter` button next to Subscriptions + `+ Newsletter` action) and `Settings` / `System`.
- Uses existing black-and-white `shadcn/ui` primitives (`Dialog`, `Button`, `Input`, `Badge`, `ScrollArea`, `Separator`).
- **Create feed**: `<form>` with `<label htmlFor>` title input -> generates `feedId` + copyable `inboundAddress` + `/rss/:feedId` URL -> adds `{ id, title, url: '/rss/' + id, kind: 'newsletter', inboundAddress, createdAt }` to `rr.feeds`.
- **List & Delete feeds**: Shows each newsletter feed, entry count, copyable inbound address, direct `/rss/:feedId` link (`target="_blank" rel="noreferrer noopener"`), and `Delete` button (`aria-label="Delete newsletter feed <title>"`).
- **Manual Import (Paste Raw Email or Upload `.eml`)**: `<textarea>` with `<label htmlFor>` + `<input type="file" accept=".eml,message/rfc822,.txt">` -> submits to `POST /api/newsletter/feeds/:feedId/import` (plus client `parseRawEmail` fallback if offline/isolated) -> adds parsed `FeedItem` scored via `explainScore()`, selects it in the Reader pane, and updates `FeedList` counts immediately!

## Error Cases
- Empty/malformed raw email (no subject/body/headers): inline `role="alert"` validation error; zero partial feed entries added.
- Oversized email (> 1 MiB): rejected with HTTP `413` / inline validation error.
- Unknown or deleted `:feedId` on `/rss/:feedId`, `/atom/:feedId`, `/json/:feedId`: returns HTTP `404` (`Feed not found`).
- Duplicate `Message-ID` or content hash import: idempotent (`200 { duplicate: true }`), avoids duplicate timeline rows.

## Out of Scope / Explicitly Excluded
- No DNS records (MX/SPF/DKIM/DMARC) or Cloudflare Email Routing activation.
- No KV/D1/Email bindings added to root `wrangler.jsonc`.
- No modification to `scoreItem()` or `explainScore()`.
- No fake newsletters or fabricated email addresses in production UI (only a clearly labeled sample/paste action if user triggers it or pastes real email).

## Modern-Web Guidance Applied
- `docs/modern-web-guidance/guides/forms/forms.md` & `validate-input-after-interaction.md`: Proper `<form>`, explicit `<label htmlFor>` above inputs, `aria-invalid` + `aria-describedby` linked only when invalid, live `role="status"`/`role="alert"` announcements, no auto-submit on change.
- `docs/modern-web-guidance/guides/security/sanitize-untrusted-html.md`: Untrusted newsletter HTML is sanitized through existing `SafeHtml.tsx` (`Element.setHTML` / DOMPurify fallback) before rendering in `ReaderPane`.
- `docs/modern-web-guidance/guides/ui-components/copy-button.md` & `dialog.md`: Accessible copy button with short live-region feedback (`"Copied"`), native/Radix dialog focus management and explicit accessible names.
- `docs/modern-web-guidance/guides/accessibility/accessibility.md`: Unique specific `aria-label`s (`Delete newsletter feed ...`, `Copy inbound address for ...`), semantic lists, 24px+ touch targets.

## Verified Reference APIs
- `postal-mime@4.2.1` (MIT, verified on npm): `PostalMime.parse(raw: string | ArrayBuffer | Uint8Array)` returning `{ subject, from, to, date, messageId, text, html, headers, attachments }`.
- `leafac/kill-the-newsletter` (MIT) & `juherr/kill-the-news` (MIT, verified via GitHub `src/domain/value-objects/feed-id.ts`, `mailbox-id.ts`, `email-parser.ts`): 128-bit base64url `FeedId` decoupled from `MailboxId`, XML control-char stripping, RSS/Atom/JSON Feed outputs with `ETag` / `304`.
