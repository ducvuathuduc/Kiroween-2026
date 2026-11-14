# Finish Ask design

App owns the open state and optional initial question, and passes launch callbacks to TopBar and CommandPalette. AskPanel retains request state while open and aborts pending requests on dismissal. The incremental NDJSON reader validates frame order and data before publishing each event; no model text becomes HTML or an authoritative URL.

Use the existing bounded server response and explicit UTC/default-public-feed scope. Tests exercise fragmented frames, invalid or incomplete responses, errors and the mounted UI. Render and inspect representative states before delivery.
