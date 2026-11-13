# Design

`server/a2a.ts` mounts before the existing API JSON parser so A2A parse failures
retain JSON-RPC error envelopes without changing existing API/MCP contracts.
Native Hono body limiting and Zod validate the supported 0.3.0 wire subset.
Task IDs/context IDs/artifact IDs are server-generated UUIDs. No Task is stored;
terminal states are returned synchronously. Request-local transition metadata
records actual status changes, not a fabricated asynchronous event stream.

`server/readTools.ts` centralizes MCP search/top items, daily briefing, and Kiro
export; both protocol adapters call it. It delegates live loading/get-by-ID to
`server/items.ts`, UI briefing selection to `selectDailyBriefingItems`, and
Markdown generation to `buildKiroSpecBundle`. Existing five-minute live-feed
cache remains the only server state. No paid provider capability is exposed.

The card is dynamically generated at its public well-known path, not a static
file with an invented deployment URL. Wrangler explicitly runs the Worker first
for that path and `/a2a` + `/a2a/*`, avoiding SPA swallowing POSTs/discovery.
Unknown A2A paths return JSON 404. Security is empty (public), not a fake scheme.
TLS-terminating proxies may upgrade the card's request scheme with an exact
`X-Forwarded-Proto: https`; forwarded hosts are ignored and HTTPS is never downgraded.

Docs preserve existing typography/layout, using native section/headings/links
and a focusable, labeled scrolling code region per the HTML/accessibility guides.

## Official sources inspected

- https://a2a-protocol.org/v0.3.0/specification/ — sections 5.5, 6, 7.1, 8
  (AgentCard/security, Task/Message/DataPart/artifact, message/send, errors).
- https://a2a-protocol.org/v1.0.0/specification/ — successor, not the wire exposed here.
- https://github.com/a2aproject/a2a-js/blob/41335e66b6941db20065580782b909ff6e8476c0/README.md
  — current official SDK is `@a2a-js/sdk`, 1.0 stable with opt-in 0.3 compatibility.
- https://github.com/a2aproject/a2a-js/blob/41335e66b6941db20065580782b909ff6e8476c0/docs/migration-guide.md
  — breaking shapes; no SDK dependency/API guessed or added.

The requested stateless subset intentionally omits persisted tasks/get and
tasks/cancel, so documentation must not claim full A2A compliance.
