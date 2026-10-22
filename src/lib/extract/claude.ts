import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PatternSchema, type Pattern } from "../pattern";

const SYSTEM = `You convert crochet and knitting patterns into structured data for a personal project tracker.

- Copy every row/round instruction verbatim into "text", without the trailing stitch count; put the count in "stitchCount".
- Keep ranges like "Rounds 9-11" as one step with from=9, to=11.
- Directions that aren't rows (color changes, "begin stuffing", assembly, finishing) become "note" steps in order, so nothing the maker needs is lost.
- Track the yarn color in use on each step when the pattern says so.
- Each separately made piece (head, arm x2, button...) is its own section; set makeCount from "make 2" etc.
- Ignore blog chatter, ads, comments, and navigation. Put the designer's usage terms (e.g. personal use only) in notes.
- Don't fix mistakes in the pattern; record stitch counts exactly as printed.`;

export function hasClaude(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

type Source =
  | { kind: "text"; text: string; title: string; sourceUrl?: string | null }
  | { kind: "pdf"; data: Buffer; filename: string };

export async function extractWithClaude(source: Source): Promise<Pattern> {
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] =
    source.kind === "pdf"
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: source.data.toString("base64") },
          },
          { type: "text", text: `Extract this pattern. The file is named "${source.filename}".` },
        ]
      : [
          {
            type: "text",
            text: `Extract the pattern from this web page${source.sourceUrl ? ` (${source.sourceUrl})` : ""}. Page title: ${source.title}\n\n<page>\n${source.text}\n</page>`,
          },
        ];

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: betaZodOutputFormat(PatternSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to read this pattern.");
  if (response.stop_reason === "max_tokens") throw new Error("Pattern too long to extract in one pass.");
  if (!response.parsed_output) throw new Error("Claude returned a pattern that didn't match the schema.");
  const pattern = response.parsed_output;
  if (source.kind === "text" && source.sourceUrl) pattern.sourceUrl = source.sourceUrl;
  return pattern;
}
