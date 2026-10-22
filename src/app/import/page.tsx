import { connection } from "next/server";
import { ImportForm } from "@/components/import-form";
import { hasClaude } from "@/lib/extract/claude";

export default async function ImportPage() {
  await connection();
  return (
    <div className="mx-auto max-w-xl pt-8">
      <h1 className="font-display text-4xl font-semibold">Import a pattern</h1>
      <p className="mt-2 text-muted">
        Paste a link to a pattern page or drop in PDFs. Rows, stitch counts, materials, and abbreviations are
        pulled out, and the stitch counts are checked for typos.
      </p>
      <ImportForm claude={hasClaude()} />
    </div>
  );
}
