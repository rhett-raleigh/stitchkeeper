# Stitchkeeper

Import crochet patterns (links or PDFs) and keep your place in every project.

Runs on Cloudflare: Next.js via [OpenNext](https://opennext.js.org/cloudflare) in a Worker, D1 for the
database, R2 for PDFs and photos, and a Container (`extractor/`, Node + poppler + sharp) for the PDF work.

```bash
npm install
npm run db:migrate                  # create the local D1 tables (.wrangler/)
npm run dev                         # http://localhost:3000, plus the extractor on :8788
npm run import -- ~/Downloads/crochet   # bulk-import a folder of PDFs (recursive) into the running app
npm run import -- https://example.com/pattern another.pdf
npm run import -- --claude file.pdf     # always use Claude instead of the quick parser
npm run preview                     # production build in workerd, extractor in Docker (port 8787)
```

`npm run import` posts to `STITCHKEEPER_URL` (default `http://localhost:3000`). For the deployed app,
which sits behind Cloudflare Access, also set `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`
(an Access service token).

The old `data/` folder (node:sqlite + PDFs) is copied into D1/R2 with `npx tsx scripts/migrate-data.ts`
(add `--remote` for the deployed app). It refuses to overwrite a database that already has patterns.

## Deploying

1. `npx wrangler login`; the account needs Workers Paid (Containers).
2. `npx wrangler d1 create stitchkeeper` and put the `database_id` in `wrangler.jsonc`;
   `npx wrangler r2 bucket create stitchkeeper-files`.
3. `npx tsx scripts/migrate-data.ts --remote` (creates the tables, then copies the data).
4. `npx wrangler secret put ANTHROPIC_API_KEY` (optional, for Claude extraction).
5. `npm run deploy`. The app is only served at https://stitchkeeper.rhettraleigh.com (workers.dev and
   preview URLs are off), behind a Cloudflare Access application: the patterns are paid, personal-use files.
   Keep Access in place before attaching any other hostname.

### Deploying on merge (Workers Builds)

Merges to `main` deploy through Cloudflare Workers Builds (Workers → stitchkeeper → Settings → Build):

- Git repository `rhett-raleigh/stitchkeeper`, production branch `main`, root directory `/`.
- Build command: empty. Deploy command: `npm run deploy:ci`, which applies D1 migrations, then builds
  and deploys (including the extractor container image).
- API token: a user token with Workers Scripts, R2, D1 and Workers Routes edit (and Containers, if
  listed). The default build token has no D1 access, so migrations would fail with it.
- Non-production branch builds: off. They only upload Worker code (no container image), and Workers
  with Durable Objects get no preview URLs.

The Worker goes live before the container rollout finishes, so a change that touches both the app and
the extractor can briefly run new app code against the old extractor.

## How importing works

PDF steps 1, 2 and 5 run in the extractor (`src/lib/extract/analyze.ts`, served by `extractor/server.ts`);
the Worker stores what it returns and calls Claude itself.

1. **PDF text** (`src/lib/extract/pdf.ts`): reads word positions from `pdftotext -bbox-layout`
   so two-column pages read column by column, table-style rounds (label beside instruction)
   are rejoined, and running headers/footers are dropped. `npx tsx scripts/dump-text.ts <outdir> <pdfs...>`
   shows exactly what the parser sees.
2. **Quick parser** (`src/lib/extract/heuristic.ts`): free, offline. Handles `Round 5: ... (18)`,
   `R5: ...`, `Rnd 5) ...`, `5.- ... (18 sc)` and friends, headings with or without colons,
   glossaries and materials lists. Pattern books with a `Difficulty:` line per pattern
   (Knotmonsters and similar) are split into one library entry per pattern.
3. **Claude** (`src/lib/extract/claude.ts`): used when the quick parser finds too little, or
   with `--claude`. Reads PDFs directly, so scanned patterns and odd layouts work.
4. **Stitch-count check** (`src/lib/stitchcheck.ts`): simulates each round and flags any where
   the stated count doesn't match what the instructions make.

5. **Cover photos** (`src/lib/extract/images.ts`): pulls embedded photos out with `pdfimages`,
   applies their transparency masks with `sharp`, and picks the biggest photo-shaped image near
   the start (for pattern books, the photo page just before each pattern's title). Logos and
   decorations are skipped because they repeat across pages or are mostly transparent. Pick a
   different one at `/patterns/<id>/photo`.

Re-importing the same link or the same PDF is skipped. Patterns and projects are in D1;
original PDFs and photos are in R2, served by `/files/<name>`.

Claude needs `ANTHROPIC_API_KEY`: in `.env.local` for `npm run dev`, `.dev.vars` for `npm run preview`,
and a Worker secret when deployed.
