---
inclusion: always
---

# Resurrected Reader — Structure

```
resurrected-reader/
├── .kiro/
│   ├── steering/   # product.md, tech.md, structure.md
│   ├── specs/resurrected-reader-v1/  # requirements.md, design.md, tasks.md
│   ├── hooks/      # verify-on-save.json
│   └── settings/mcp.json
├── src/
│   ├── App.tsx
│   ├── lib/feeds.ts      # fetch + parse RSS/Atom
│   ├── lib/scoring.ts    # deterministic signal score
│   ├── lib/sampleData.ts # offline fallback items
│   └── components/       # FeedList, ItemList, ReaderPane, TopBar, KiroTaskModal
├── index.html
├── README.md
└── LICENSE (MIT)
```

## Naming
- Components PascalCase, lib files camelCase.
- Keep files focused; no giant files, no duplicated logic.
