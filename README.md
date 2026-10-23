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

1. **PDF text** (`src/lib/extract/pdf.ts`): reads word positions from `pdftotext -bbox-layout`
   so two-column pages read column by column, table-style rounds (label beside instruction)
   are rejoined, and running headers/footers are dropped. `npx tsx scripts/dump-text.ts <outdir> <pdfs...>`
   shows exactly what the parser sees.
2. **Quick parser** (`src/lib/extract/heuristic.ts`): free, offline. Handles `Round 5: ... (18)`,
   `R5: ...`, `Rnd 5) ...`, `5.- ... (18 sc)` and friends, headings with or without colons,
   glossaries and materials lists. Pattern books with a `Difficulty:` line per pattern
   (Knotmonsters and similar) are split into one library entry per pattern.
3. **Claude** (`src/lib/extract/claude.ts`): used when the quick parser finds too little, or
   with `--claude`. Reads PDFs directly, so scanned patterns and odd layouts work. Needs
   `ANTHROPIC_API_KEY` in `.env.local`.
4. **Stitch-count check** (`src/lib/stitchcheck.ts`): simulates each round and flags any where
   the stated count doesn't match what the instructions make.

5. **Cover photos** (`src/lib/extract/images.ts`): pulls embedded photos out with `pdfimages`,
   applies their transparency masks with `sharp`, and picks the biggest photo-shaped image near
   the start (for pattern books, the photo page just before each pattern's title). Logos and
   decorations are skipped because they repeat across pages or are mostly transparent. Pick a
   different one at `/patterns/<id>/photo`.

Re-importing the same link or the same PDF is skipped. Data is stored in `data/`
(SQLite plus the original PDFs).
