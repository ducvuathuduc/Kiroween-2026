# Finish Ask design

App owns the open state and optional initial question, and passes launch callbacks to TopBar and CommandPalette. AskPanel retains request state while open and aborts pending requests on dismissal. The incremental NDJSON reader validates frame order and data before publishing each event; no model text becomes HTML or an authoritative URL.

Use the existing bounded server response and explicit UTC/default-public-feed scope. Tests exercise fragmented frames, invalid or incomplete responses, errors and the mounted UI. Render and inspect representative states before delivery.

## Boundaries, decisions and tradeoffs

This detailed section was added after the original implementation. The original design above preceded implementation; this expanded account is retrospective.

`server/items.ts` independently loads and deterministically scores RSS descriptions for default feeds. `server/askPolicy.ts` owns UTC eligibility, relevance thresholding, source selection and citation policy. `server/ask.ts` orchestrates retrieval and validated generation through `server/ai.ts`; it does not access the selected article's extracted text or the browser's state. Thus the extraction, summarization and scoring flow documented in `backlog-extract/design.md` does not currently feed Ask retrieval. Full-text Ask would require bounded server-side enrichment and a separate evaluation of latency, host restrictions and grounding; it is not claimed here.

`src/lib/ask.ts` owns the wire schema and validates sources and answer citations before progressive callbacks, then rechecks source labels, citations and completion metadata before declaring success. The callback receives frame objects, so these final checks also guard against mutation of labels or citations by a caller; they do not re-parse every field. `AskPanel.tsx` owns request cancellation, discards stale or incomplete results, and renders text and server-built links. `App.tsx` owns only panel visibility and the initial question; TopBar and CommandPalette provide launch actions.

The server buffers and validates the complete generated answer before sending frames, rather than exposing live model tokens. This prevents unsafe partial model output but means progressive rendering is transport-level, not faster generation. A bounded stream reader is retained because responses can be fragmented or truncated in transit. Real provider quality and citation entailment remain separate checks, not guaranteed by syntactic validation.

For the quality follow-up, keep a single shared extraction response type in `src/lib/extract.ts` and import it as a type in `server/extract.ts`; avoid a new contract module for four fields. Keep the pre-callback and final validation checks because they protect different boundaries.
