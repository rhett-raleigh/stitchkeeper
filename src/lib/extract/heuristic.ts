import type { Pattern, Section, Step } from "../pattern";

// Rule-based parser for the common "Round 5: ... (24)" pattern layout.
// Works offline; the Claude extractor handles anything messier.

const ROW_RE = /^(rounds?|rnds?|rows?|r)\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*[:.)]\s*(.*)$/i;
const COUNT_RE = /\s*[([](\d+)(?:\s*sts?)?[)\]]\s*\.?\s*$/i;
const HEADER_RE = /^([A-Z][\w' &/()-]{1,40}):\s*(.*)$/;
const MAKE_RE = /\s*[(,]?\s*make\s+(\d+)\)?\s*$/i;
const ABBR_RE = /^([a-z][\w()/ ]{0,12}?)\s*[=–-]\s+(.+)$/i;
const COLOR_RE = /\b(?:with|switch to|change to|join)\s+(?:the\s+)?(\w+)\s+yarn\b/i;
const END_RE = /^(\d+\s+comments?|leave a (reply|comment)|subscribe to my|want to make sure you don't miss|\*{3}you may not)/i;

const GLOSSARY_NAMES = /^(stitch glossary|abbreviations|glossary|stitches used)$/i;
const MATERIAL_NAMES = /^(materials|supplies|you will need|materials needed)$/i;

export function parsePatternText(raw: string, meta: { title: string; sourceUrl?: string | null }): Pattern {
  const lines = raw
    .split(/\n/)
    .map((l) => l.replace(/[​ ]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const pattern: Pattern = {
    title: meta.title,
    designer: null,
    sourceUrl: meta.sourceUrl ?? null,
    craft: "crochet",
    yarns: [],
    hooks: [],
    notions: [],
    gauge: null,
    finishedSize: null,
    abbreviations: [],
    notes: [],
    sections: [],
  };

  let mode: "preamble" | "glossary" | "materials" | "section" = "preamble";
  let section: Section | null = null;
  let color: string | null = null;

  const addMaterial = (text: string) => {
    if (!text) return;
    if (/\bhook\b/i.test(text)) pattern.hooks.push(text);
    else if (/\byarn\b/i.test(text)) pattern.yarns.push(text);
    else pattern.notions.push(text);
  };
  const addStep = (step: Step) => {
    if (!section) {
      section = { name: "Pattern", makeCount: 1, steps: [] };
      pattern.sections.push(section);
    }
    section.steps.push(step);
  };

  for (const line of lines) {
    // Blog footers ("9 Comments", mailing-list boxes) end the pattern once it has started.
    if (mode !== "preamble" && END_RE.test(line)) break;

    if (/personal use only/i.test(line) && mode === "preamble") {
      pattern.notes.push("Designer asks: for personal use only; do not sell finished items.");
      continue;
    }
    const gauge = line.match(/^gauge\s*:\s*(.+)$/i);
    if (gauge) { pattern.gauge = gauge[1]; continue; }
    const size = line.match(/^(finished size|size|dimensions)\s*:\s*(.+)$/i);
    if (size && !/hook/i.test(size[2])) { pattern.finishedSize = size[2]; continue; }

    const row = line.match(ROW_RE);
    if (row && mode !== "glossary") {
      const from = Number(row[2]);
      const to = row[3] ? Number(row[3]) : from;
      let text = row[4];
      const count = text.match(COUNT_RE);
      if (count) text = text.slice(0, count.index).trim();
      const word = /^r(ow|$)/i.test(row[1]) ? "Row" : "Round";
      addStep({
        kind: "row",
        label: to > from ? `${word}s ${from}-${to}` : `${word} ${from}`,
        from,
        to,
        text: text.replace(/[,\s]+$/, ""),
        stitchCount: count ? Number(count[1]) : null,
        color,
      });
      mode = "section";
      continue;
    }

    const header = line.match(HEADER_RE);
    // In a materials list, "Optional: stitch marker" is a material, not a section.
    const isMaterialLine = mode === "materials" && header?.[2];
    if (header && !ABBR_RE.test(line) && !isMaterialLine) {
      const name = header[1].trim();
      if (GLOSSARY_NAMES.test(name)) { mode = "glossary"; continue; }
      if (MATERIAL_NAMES.test(name)) { mode = "materials"; addMaterial(header[2]); continue; }
      if (!/^(with|switch|change|note)/i.test(name)) {
        const make = name.match(MAKE_RE);
        section = { name: make ? name.slice(0, make.index).trim() : name, makeCount: make ? Number(make[1]) : 1, steps: [] };
        pattern.sections.push(section);
        color = null;
        mode = "section";
        if (header[2]) addStep(noteStep(header[2], color));
        continue;
      }
    }

    if (mode === "glossary") {
      const abbr = line.match(ABBR_RE);
      if (abbr) { pattern.abbreviations.push({ abbr: abbr[1].trim(), meaning: abbr[2].trim() }); continue; }
    }
    if (mode === "materials") { addMaterial(line); continue; }

    const c = line.match(COLOR_RE);
    if (c) color = c[1].toLowerCase();
    if (mode === "section") addStep(noteStep(line, color));
  }

  return pattern;
}

function noteStep(text: string, color: string | null): Step {
  return { kind: "note", label: "", from: null, to: null, text, stitchCount: null, color };
}
