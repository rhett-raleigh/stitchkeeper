import { z } from "zod";

// One line of a pattern. "Rounds 9-11" is a single step with from=9, to=11;
// the tracker expands it into three rows.
export const StepSchema = z.object({
  kind: z.enum(["row", "note"]),
  label: z.string().describe('e.g. "Round 5", "Rows 9-11"; empty for notes'),
  from: z.number().int().nullable().describe("first row/round number, null for notes"),
  to: z.number().int().nullable().describe("last row/round number (same as from for a single row)"),
  text: z.string().describe("the instruction, verbatim"),
  stitchCount: z.number().int().nullable().describe("stitch count stated at the end, e.g. (24)"),
  color: z.string().nullable().describe("yarn color in use for this step, if known"),
});

export const SectionSchema = z.object({
  name: z.string().describe('e.g. "Button", "Ball", "Assembly"'),
  makeCount: z.number().int().describe("how many of this piece to make, usually 1"),
  steps: z.array(StepSchema),
});

export const PatternSchema = z.object({
  title: z.string(),
  designer: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  craft: z.enum(["crochet", "knitting", "other"]),
  yarns: z.array(z.string()).describe("yarn lines and colors"),
  hooks: z.array(z.string()).describe('e.g. "G (4.0 mm)"'),
  notions: z.array(z.string()).describe("stuffing, needle, markers, eyes..."),
  gauge: z.string().nullable(),
  finishedSize: z.string().nullable(),
  abbreviations: z.array(z.object({ abbr: z.string(), meaning: z.string() })),
  notes: z.array(z.string()).describe("designer notes, usage terms, tips"),
  sections: z.array(SectionSchema),
});

export type Step = z.infer<typeof StepSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Pattern = z.infer<typeof PatternSchema>;

// A single trackable row after expanding ranges like "Rounds 9-11".
export type TrackRow = {
  sectionIndex: number;
  stepIndex: number;
  number: number | null;
  label: string;
  text: string;
  stitchCount: number | null;
  color: string | null;
  kind: "row" | "note";
};

export const rowsOf = (p: Pattern) => p.sections.flatMap((s) => s.steps).filter((s) => s.kind === "row");

// Rule-based parsing is free and instant, so importers try it first and only call
// Claude when it didn't find a usable pattern.
export function looksComplete(p: Pattern): boolean {
  const rows = rowsOf(p);
  return rows.length >= 3 && rows.filter((r) => r.stitchCount != null).length >= rows.length / 2;
}

export function expandRows(pattern: Pattern): TrackRow[] {
  const rows: TrackRow[] = [];
  pattern.sections.forEach((section, sectionIndex) => {
    section.steps.forEach((step, stepIndex) => {
      const base = { sectionIndex, stepIndex, text: step.text, color: step.color, kind: step.kind };
      if (step.kind === "row" && step.from != null && step.to != null && step.to > step.from) {
        const word = /^rows?\b/i.test(step.label) ? "Row" : "Round";
        for (let n = step.from; n <= step.to; n++) {
          rows.push({ ...base, number: n, label: `${word} ${n}`, stitchCount: step.stitchCount });
        }
      } else {
        rows.push({ ...base, number: step.from, label: step.label, stitchCount: step.stitchCount });
      }
    });
  });
  return rows;
}
