import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { PageRange } from "./extract/images";
import type { PdfAnalysis, PhotoChoices } from "./extract/analyze";

// Client for the PDF extractor (extractor/server.ts). Deployed, it's the Extractor container
// behind a Durable Object; under `next dev` it's the local process `npm run dev` starts.

async function call<T>(path: string, query: Record<string, string>, pdf: ArrayBuffer | Uint8Array): Promise<T> {
  const target = `${path}?${new URLSearchParams(query)}`;
  const init = { method: "POST", body: pdf as BodyInit };
  const res =
    process.env.NODE_ENV === "development"
      ? await fetch(`${process.env.EXTRACTOR_URL ?? "http://localhost:8788"}${target}`, init)
      : await getCloudflareContext().env.EXTRACTOR.getByName("extractor").fetch(`http://extractor${target}`, init);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`PDF extractor failed: ${(json as { error?: string } | null)?.error ?? `HTTP ${res.status}`}`);
  return json as T;
}

export function analyzePdf(
  pdf: ArrayBuffer | Uint8Array,
  hash: string,
  filename: string,
  opts: { forceClaude?: boolean; claude: boolean },
): Promise<PdfAnalysis> {
  return call("/pdf", { hash, filename, forceClaude: opts.forceClaude ? "1" : "0", claude: opts.claude ? "1" : "0" }, pdf);
}

export function photoChoices(pdf: ArrayBuffer | Uint8Array, hash: string, range: PageRange): Promise<PhotoChoices> {
  return call("/photos", { hash, first: String(range.first), last: String(range.last) }, pdf);
}
