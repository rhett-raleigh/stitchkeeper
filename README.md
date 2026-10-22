# Stitchkeeper

Import crochet patterns (links or PDFs) and keep your place in every project.

```bash
npm install
npm run dev                         # http://localhost:3000
npm run import -- ~/Downloads/crochet   # bulk-import a folder of PDFs (recursive)
npm run import -- https://example.com/pattern another.pdf
npm run import -- --claude file.pdf     # always use Claude instead of the quick parser
```

## How importing works

1. **Quick parser** (`src/lib/extract/heuristic.ts`): free, offline. Handles the common
   `Round 5: [inc, sc] 6 times (18)` layout from web pages and text PDFs (via `pdftotext`).
2. **Claude** (`src/lib/extract/claude.ts`): used when the quick parser finds too little, or
   with `--claude`. Reads PDFs directly, so scanned patterns and odd layouts work. Needs
   `ANTHROPIC_API_KEY` in `.env.local`.
3. **Stitch-count check** (`src/lib/stitchcheck.ts`): simulates each round and flags any where
   the stated count doesn't match what the instructions make.

Re-importing the same link or the same PDF is skipped. Data is stored in `data/`
(SQLite plus the original PDFs).
