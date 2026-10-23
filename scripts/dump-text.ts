// Debug helper: write the text the importer sees for each PDF into an output folder.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pdfText } from "../src/lib/extract/pdf";

async function main() {
  const [outDir, ...files] = process.argv.slice(2);
  for (const f of files) {
    await writeFile(path.join(outDir, path.basename(f, ".pdf") + ".txt"), (await pdfText(f)) ?? "(no text)");
  }
}
main();
