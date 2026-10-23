import type { Pattern, Section, Step } from "../pattern";

// Rule-based parser for written amigurumi/crochet patterns. Handles the common
// layouts ("Round 5: ... (24)", "R5: ...", "Rnd 5) ...", "5.- ... (24 sc)"),
// colon and colon-less section headings, and glossaries. Works offline; the
// Claude extractor handles anything messier (charts, scans, prose).

const RANGE = String.raw`(\d+)(?:\s*(?:-|–|to)\s*(?:r|rnds?|rounds?|rows?)?\s*(\d+))?`;
const PREFIX = String.raw`(rounds?|rnds?|rows?|r)`;
// "Round 5: ...", "R6 - R8: ...", "Rnd 1) ...", "Row 1 – ...", "Round 4 to 8- ..."
const ROW_RE = new RegExp(String.raw`^${PREFIX}\s*${RANGE}\s*(?:[:.)]\s*-?|[-–])\s*(.*)$`, "i");
// "Round 2 inc x 6 (12)", "R10 (Sc7, Inc) x2 [18]": no separator, but the text clearly starts an instruction.
const ROW_NOSEP_RE = new RegExp(
  String.raw`^${PREFIX}\s*${RANGE}\s+((?:[\d[(]|(?:sc|inc|dec|ch|hdc|dc|sl|blo|flo|mr|magic|start)\b).*)$`,
  "i",
);
// "5.- text" and "5 to 18.- text"
const NUM_DASH_RE = new RegExp(String.raw`^()${RANGE}\s*\.-\s*(.*)$`);
// "5. text (24)": bare numbers only count when the line ends in a stitch count.
const NUM_RE = new RegExp(String.raw`^()${RANGE}\s*[.)]\s+(.*[([]\d+(?:\s*\w+)?[)\]]\s*\.?)$`);
const LABEL_ONLY_RE = new RegExp(String.raw`^(?:${PREFIX}\s*)?${RANGE}\s*[.:)]?$`, "i");
const COUNT_RE = /\s*[([](\d+)(?:\s*(?:sts?|stitches|sc|hdc|dc))?[)\]](?:\s*\([^)]*\))?\s*\.?\s*$/i;
const COUNT_ONLY_RE = /^[([](\d+)(?:\s*(?:sts?|stitches|sc|hdc|dc))?[)\]]$/i;

const HEADER_RE = /^([A-Z][\w' &/()’-]{1,40}?)\s*:\s*(.*)$/;
const MAKE_RE = /\s*(?:[(,]\s*)?(?:make|x)\s*(\d+)\s*\)?\s*$/i;
const ABBR_RE = /^([a-z][\w()/ .-]{0,9}?)\s*(?::|=|–|—|\s-\s)\s*(.+)$/i;
const NOT_A_HEADING = /^(i|start|stuff|tie|sew|fasten|attach|insert|use|using|with|switch|change|finish|begin|embroider|repeat|turn|place|cut|leave|continue|cont|then|if|note|tip|in|join|weave|crochet|make|work|do|don|you|this|it|for|and|or|the|a|an|to|ch|sc|inc|dec|sl|hdc|dc|mr|blo|flo|r|rnd|round|row|please|email|instagram|copyright|designed|all rows|all rounds)\b/i;
const COLOR_RES = [
  /\b(?:with|switch to|change to|join)\s+(?:the\s+)?(?:colou?r\s+)?([a-z]+(?:\s[a-z]+)?)\s+yarn\b/i,
  /\b(?:start with|switch to|change to|using)\s+colou?r\s+([a-z]+(?:\s(?!yarn)[a-z]+)?)/i,
  /^(?:in|using)\s+([a-z]+)(?:\s+yarn)?\.?$/i,
  /^\(([a-z]+(?:\s[a-z]+)?) yarn\)/i,
  // "Blue and white yarn", "Pink yarn. Make two.", "Main Colour", "Black"
  /^([a-z]+)(?: and [a-z]+)? yarn\b/i,
  /^((?:main|contrast) colou?r|black|white|red|blue|green|yellow|pink|purple|orange|brown|grey|gray|cream|beige|tan)$/i,
];
const END_RE = /^(\d+\s+comments?|leave a (reply|comment)|subscribe to my|want to make sure you don't miss|\*{3}you may not)/i;

const GLOSSARY_NAMES = /^(stitch glossary|abbreviations?( \(.*\))?|glossary|stitches used|terms to know|stitch guide|special stitches)$/i;
const MATERIAL_NAMES = /^(materials?|supplies|you will need|you'll need|materials needed|what you(?:'|’)ll need|colou?r amounts|tools|tools and materials)$/i;
const NOTE_ONLY_SECTIONS = /^(assembly|assembling|finishing|making up|construction|final touches|putting it together)$/i;
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12 };

type RowMatch = { from: number; to: number; word: "Row" | "Round"; text: string };

function matchRow(line: string, rWord: "Row" | "Round"): RowMatch | null {
  const m = line.match(ROW_RE) ?? line.match(ROW_NOSEP_RE) ?? line.match(NUM_DASH_RE) ?? line.match(NUM_RE);
  if (!m) return null;
  const from = Number(m[2]);
  const to = m[3] ? Number(m[3]) : from;
  if (to < from || to - from > 200) return null;
  const word = !m[1] ? "Round" : /^r$/i.test(m[1]) ? rWord : /^row/i.test(m[1]) ? "Row" : "Round";
  return { from, to, word, text: m[4] };
}

function cleanLines(raw: string): string[] {
  const lines = raw
    .split(/\n/)
    .map((l) =>
      l
        .replace(/[​ ]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        // "*R5: ..." marks a row the designer wants you to notice.
        .replace(/^\*+\s*(?=(?:r|rnds?|rounds?|rows?)\s*\d)/i, "")
        // Letter-spaced headings: "S N O U T", "E Y E PA TCH"
        .replace(/^[A-Z ]+$/, (s) => (s.split(" ").filter((w) => w.length <= 2).length * 2 >= s.split(" ").length ? s.replace(/ /g, "") : s)),
    )
    .filter((l) => l && !/^\d+\s*\/\s*\d+$/.test(l));
  // Re-join a bare label ("Rnd 1.") or count ("(6)") with its instruction line.
  const out: string[] = [];
  for (const line of lines) {
    const prev = out.at(-1);
    if (prev && LABEL_ONLY_RE.test(prev) && /\D/.test(prev) && !LABEL_ONLY_RE.test(line)) out[out.length - 1] = `${prev} ${line}`;
    else if (prev && COUNT_ONLY_RE.test(line) && !COUNT_RE.test(prev) && matchRow(prev, "Row")) out[out.length - 1] = `${prev} ${line}`;
    // A row that wraps: "R8: 2 sc, invdec, [4 sc, invdec] 2 times," + "2 sc (15)"
    // Or a row with no count whose next line ends with one: "R1: Ch 7, turn, starting in 2nd" + "chain from hook ... (16)"
    else if (
      prev && !COUNT_RE.test(prev) && matchRow(prev, "Row") && !matchRow(line, "Row") &&
      (/(,|\band|\bthen)$/.test(prev) || (COUNT_RE.test(line) && !LABEL_ONLY_RE.test(line)))
    ) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

function headingName(line: string): { name: string; rest: string } | null {
  const h = line.match(HEADER_RE);
  const name = (h ? h[1] : line).trim();
  const rest = h ? h[2].trim() : "";
  if (name.length < 2 || name.length > 40 || name.split(/\s+/).length > 6) return null;
  // Wrapped sentence fragments start lowercase or have unbalanced parentheses.
  if (!/^[A-Z]/.test(name) || NOT_A_HEADING.test(name)) return null;
  if ((name.match(/\(/g) ?? []).length !== (name.match(/\)/g) ?? []).length) return null;
  if (!h && /[.,;!?]$/.test(name)) return null;
  // Digits only in "(make 2)", "x2", "ver 1", "Part 2" style names.
  const stripped = name.replace(MAKE_RE, "").replace(/\b(?:ver(?:sion)?s?|part|piece|no\.?)\s*[\d, &]+/gi, "");
  if (/\d/.test(stripped)) return null;
  return { name, rest };
}

export function parsePatternText(raw: string, meta: { title: string; sourceUrl?: string | null }): Pattern {
  const lines = cleanLines(raw);
  const rWord = /\b(in the round|continuous rounds|magic ring|magic loop|rnds?)\b/i.test(raw) ? "Round" : "Row";

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

  const rows = lines.map((l) => matchRow(l, rWord));
  // A heading starts a section only if a row follows before the next heading.
  const startsSection = (i: number) => {
    for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
      if (rows[j]) return true;
      if (headingName(lines[j]) && !COLOR_RES.some((re) => re.test(lines[j]))) return false;
    }
    return false;
  };

  let mode: "preamble" | "glossary" | "materials" | "section" | "done" = "preamble";
  let section: Section | null = null;
  let color: string | null = null;

  // Materials are sorted into yarn/hooks/notions at the end, once wrapped
  // lines ("Black medium-weight" + "yarn (16 yds)") have been glued together.
  const materials: string[] = [];
  const addMaterial = (text: string) => {
    const bullet = /^[-*•·–]\s*/.test(text);
    text = text.replace(/^[-*•·–]\s*/, "").trim();
    if (!text || text.endsWith(":")) return;
    if (!bullet && materials.length && /^[a-z(]/.test(text)) materials[materials.length - 1] += ` ${text}`;
    else materials.push(text);
  };
  const addStep = (step: Step) => {
    if (!section) {
      section = { name: "Pattern", makeCount: 1, steps: [] };
      pattern.sections.push(section);
    }
    // PDFs break paragraphs into lines; join a note onto one that hasn't finished its sentence.
    const last = section.steps.at(-1);
    if (step.kind === "note" && last?.kind === "note" && !/[.!?:)]$/.test(last.text)) {
      last.text += ` ${step.text}`;
      return;
    }
    section.steps.push(step);
  };
  const lastRowTo = (s: Section | undefined) => s?.steps.findLast((st) => st.kind === "row")?.to ?? null;

  lines.forEach((line, i) => {
    if (mode === "done") return;
    // Blog footers ("9 Comments", mailing-list boxes) end the pattern once it has started.
    if (mode !== "preamble" && END_RE.test(line)) { mode = "done"; return; }

    if (/personal use only|single person use/i.test(line) && mode === "preamble") {
      pattern.notes.push("Designer asks: for personal use only; do not sell or share the pattern.");
      return;
    }
    const gauge = line.match(/^gauge\s*:\s*(.+)$/i);
    if (gauge) { pattern.gauge = gauge[1]; return; }
    const size = line.match(/^(finished size|approximate size|size|dimensions|final measure)\s*:\s*(.+)$/i);
    if (size && !/hook/i.test(size[2])) { pattern.finishedSize = size[2]; return; }

    // Pattern-book header lines: "Hook: 4.0mm (G)", "Eye: 6 mm", "Difficulty: Easy"
    const spec = line.match(/^(hooks?|eyes?|safety eyes|yarn|difficulty)\s*:\s*(.+)$/i);
    if (spec) {
      const [, key, value] = spec;
      if (/^hook/i.test(key)) pattern.hooks.push(value);
      else if (/^yarn/i.test(key)) pattern.yarns.push(value);
      else if (/eye/i.test(key)) pattern.notions.push(`Safety eyes: ${value}`);
      else pattern.notes.push(`Difficulty: ${value}`);
      return;
    }

    const row = rows[i];
    if (row && mode !== "glossary") {
      let text = row.text;
      const count = text.match(COUNT_RE);
      if (count) text = text.slice(0, count.index).trim();
      for (const re of COLOR_RES) { const c = text.match(re); if (c) color = c[1].toLowerCase(); }
      // A heading that just continues the previous piece's numbering ("Body"
      // again after "Cont. on next page") belongs to that piece.
      const prev = pattern.sections.at(-2);
      if (section && prev && !section.steps.some((s) => s.kind === "row") && row.from > 1 && lastRowTo(prev) === row.from - 1) {
        prev.steps.push(...section.steps);
        pattern.sections.pop();
        section = prev;
      }
      addStep({
        kind: "row",
        label: row.to > row.from ? `${row.word}s ${row.from}-${row.to}` : `${row.word} ${row.from}`,
        from: row.from,
        to: row.to,
        text: text.replace(/[,\s]+$/, ""),
        stitchCount: count ? Number(count[1]) : null,
        color,
      });
      mode = "section";
      return;
    }

    const bare = line.replace(/\s*:$/, "");
    // "PATTERN" marks where the real instructions begin; anything before it
    // with a row or two was an example ("How to read this pattern").
    if (/^(the )?pattern$/i.test(bare)) {
      pattern.sections = pattern.sections.filter((s) => s.steps.filter((st) => st.kind === "row").length !== 1);
      section = pattern.sections.at(-1) ?? null;
      mode = "section";
      return;
    }
    if (GLOSSARY_NAMES.test(bare)) { mode = "glossary"; return; }
    if (MATERIAL_NAMES.test(bare)) { mode = "materials"; return; }
    const header = line.match(HEADER_RE);
    if (header && MATERIAL_NAMES.test(header[1].trim())) { mode = "materials"; addMaterial(header[2]); return; }

    if (mode === "glossary") {
      const abbr = line.match(ABBR_RE);
      if (abbr && !startsSection(i)) { pattern.abbreviations.push({ abbr: abbr[1].trim(), meaning: abbr[2].trim() }); return; }
    }

    const heading = headingName(line);
    const isColorLine = COLOR_RES.some((re) => re.test(line));
    const noteOnly = mode === "section" && NOTE_ONLY_SECTIONS.test(heading?.name ?? "") && section?.name !== heading?.name;
    if (heading && !isColorLine && (startsSection(i) || noteOnly)) {
      const make = heading.name.match(MAKE_RE);
      section = {
        name: make ? heading.name.slice(0, make.index).trim() : heading.name,
        makeCount: make ? Number(make[1]) : 1,
        steps: [],
      };
      pattern.sections.push(section);
      color = null;
      mode = "section";
      if (heading.rest) addStep(noteStep(heading.rest, color));
      return;
    }

    if (mode === "materials") {
      // An all-caps line ("HOW TO READ A WOOBLES PATTERN") ends the list.
      if (/^[A-Z][A-Z &'’-]{3,}$/.test(line)) mode = "preamble";
      else addMaterial(line);
      return;
    }
    if (mode !== "section") return;

    for (const re of COLOR_RES) { const c = line.match(re); if (c) color = c[1].toLowerCase(); }
    // "Make two." / "(Crochet two pieces ...)" before the first row sets the piece count.
    const s = section as Section | null;
    if (s && s.makeCount === 1 && !s.steps.some((st) => st.kind === "row")) {
      const n = line.match(/\b(?:make|crochet)\s+(\d+|one|two|three|four|five|six|eight|ten|twelve)\b(?:\s+(?:pieces|of them))?/i);
      if (n) s.makeCount = Number(n[1]) || NUMBER_WORDS[n[1].toLowerCase()] || 1;
    }
    addStep(noteStep(line, color));
  });

  for (const text of materials) {
    if (/\bhook\b|\d\s*mm\b(?!.*\b(eyes?|yarn)\b)/i.test(text)) pattern.hooks.push(text);
    else if (/\byarn\b|\bcolou?r [a-z]\b|\bweight\b/i.test(text)) pattern.yarns.push(text);
    else pattern.notions.push(text);
  }
  return pattern;
}

function noteStep(text: string, color: string | null): Step {
  return { kind: "note", label: "", from: null, to: null, text, stitchCount: null, color };
}

// Pattern books (Knotmonsters and similar) put many patterns in one PDF, each
// starting with a title followed by a "Difficulty:" line.
export function splitCollection(raw: string): { title: string; text: string; pages: { first: number; last: number } }[] | null {
  const lines = raw.split("\n");
  // Page number of each line (pages are separated by form-feed lines).
  const pageOf: number[] = [];
  let page = 1;
  for (const l of lines) { if (l === "\f") page++; pageOf.push(page); }
  const starts: number[] = [];
  lines.forEach((l, i) => { if (/^\s*difficulty\s*:/i.test(l)) starts.push(i); });
  if (starts.length < 2) return null;
  // The title is the block of lines just above "Difficulty:" (it may wrap: "Watermelon Slice" / "& Wedge").
  const titleAt = (i: number) => {
    let end = i - 1;
    while (end >= 0 && !lines[end].trim()) end--;
    let top = end;
    while (top > 0 && lines[top - 1].trim() && end - top < 2) top--;
    return { top, end };
  };
  const titles = starts.map(titleAt);
  return titles.map(({ top, end }, k) => ({
    title: lines.slice(top, end + 1).map((l) => l.trim()).join(" ") || `Pattern ${k + 1}`,
    text: lines.slice(end + 1, titles[k + 1]?.top ?? lines.length).join("\n"),
    pages: { first: pageOf[top], last: titles[k + 1] ? pageOf[titles[k + 1].top] : page },
  }));
}
