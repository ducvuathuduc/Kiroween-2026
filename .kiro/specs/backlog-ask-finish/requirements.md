# Finish Ask requirements

Expose the existing Ask panel from TopBar and CommandPalette, with an accessible dismissible overlay and ephemeral state. Submit explicit questions to the existing API and display validated source, answer and completion frames progressively. Empty submission is disabled; 503 and 408 errors must be readable, and API abstention text must be preserved verbatim.

Test the integrated client stream and App interaction using test-only fixtures. Verify keyboard dismissal, both entry points, citations, no-match behavior and a real Gemini-backed question where available. Never fabricate an answer or claim that citations prove factual grounding.
