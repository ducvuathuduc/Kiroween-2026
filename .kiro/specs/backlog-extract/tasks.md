# Full-text extraction tasks

- [x] Read existing architecture, safety guidance and upstream APIs.
- [x] Implement guarded extraction and fallback with offline regression tests.
- [x] Integrate reader, summary and unchanged scoring pipeline; sanitize and apply CSP.
- [x] Verify final types, lint, tests, build, ten real pages and rendered reader.
- [x] Verify real before/after summaries or document actual credential or quota blocker.
- [ ] Review and deliver extraction separately without deploying.

The local Worker returned title and Markdown for ten live AWS News Blog articles; a disallowed hostname returned 400. Chromium showed extracted article text after allowing safe semantic wrapper elements in the existing sanitizer. The final built Worker returned 13,098 Markdown characters for the AWS Emulator article, rejected an unrelated host, and served the CSP header. Chromium rendered 26,159 characters of another extracted article with no script, iframe or image nodes in the reader section. Both typechecks, lint, 81 tests and build passed; three existing lint warnings remain. Gemini credentials are absent in this orb, so real before/after model comparisons have not run.
