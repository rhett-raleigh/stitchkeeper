import type { Pattern } from "./pattern";

// Simulates amigurumi-style rounds to catch stitch-count typos, which are
// common in free patterns. Each instruction is reduced to how many stitches
// it works into (consumed) and how many it makes (produced). Anything we
// don't understand returns null so we never flag a false positive.

type Count = { consumed: number; produced: number };

const BASIC = "(?:sc|hdc|dc|tr|sl st|ss|blo sc|flo sc)";

// Parts that don't change the stitch count of a joined round.
const IGNORABLE = [
  /^ch \d+$/,
  /^(ss|sl st|slip stitch) to (join|first)/,
  /^(pull|finish|fasten|turn|join)\b/,
  /^make a magic (circle|ring)$/,
  /^working in /,
];

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "[" || ch === "(") depth++;
    if (ch === "]" || ch === ")") depth--;
    if ((ch === "," || ch === ";") && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function add(a: Count, b: Count, times = 1): Count {
  return { consumed: a.consumed + b.consumed * times, produced: a.produced + b.produced * times };
}

function countPart(part: string, previous: number | null): Count | null {
  const p = part.toLowerCase().replace(/\s+/g, " ").trim();
  if (IGNORABLE.some((re) => re.test(p))) return { consumed: 0, produced: 0 };

  // "work 6 sc into the circle" / "6 sc in magic ring"
  let m = p.match(new RegExp(`^(?:work )?(\\d+) ${BASIC} (?:into|in) (?:the |a )?(?:magic )?(?:circle|ring)`));
  if (m) return { consumed: 0, produced: Number(m[1]) };

  // "[inc, sc] 6 times" / "(sc, inc) x6"
  m = p.match(/^[[(](.+)[\])] (?:(\d+) times|x ?(\d+))$/);
  if (m) {
    const inner = countSequence(m[1], null);
    return inner && { consumed: inner.consumed * Number(m[2] ?? m[3]), produced: inner.produced * Number(m[2] ?? m[3]) };
  }

  // "inc around" / "sc around" — repeat until the previous round is used up.
  m = p.match(/^(.+?) (?:around|in each st around|in each st)$/);
  if (m) {
    const inner = countSequence(m[1], null);
    if (!inner || previous == null || inner.consumed === 0 || previous % inner.consumed !== 0) return null;
    const times = previous / inner.consumed;
    return { consumed: previous, produced: inner.produced * times };
  }

  if (/^(inc|2 sc in (?:the )?next st)$/.test(p)) return { consumed: 1, produced: 2 };
  if (/^(dec|sc2tog|invdec)$/.test(p)) return { consumed: 2, produced: 1 };

  // "sc", "sc in the next 3 sts", "sc in next 5", "3 sc"
  m = p.match(new RegExp(`^${BASIC}(?: in (?:the )?next (\\d+)(?: sts?)?)?$`));
  if (m) {
    const n = Number(m[1] ?? 1);
    return { consumed: n, produced: n };
  }
  // "3 sc" or Knotmonsters-style "SC 3"
  m = p.match(new RegExp(`^(\\d+) ${BASIC}$`)) ?? p.match(new RegExp(`^${BASIC} (\\d+)$`));
  if (m) return { consumed: Number(m[1]), produced: Number(m[1]) };

  return null;
}

function countSequence(text: string, previous: number | null): Count | null {
  let total: Count = { consumed: 0, produced: 0 };
  for (const part of splitTopLevel(text.replace(/\s+and\s+/gi, ", "))) {
    const c = countPart(part, previous);
    if (!c) return null;
    total = add(total, c);
  }
  return total;
}

export type StitchIssue = {
  sectionIndex: number;
  stepIndex: number;
  label: string;
  stated: number;
  computed: number;
  message: string;
};

function countRow(text: string, previous: number | null): Count | null {
  // Loop placement ("BLO", "in FLO,") doesn't change the count.
  const t = text.toLowerCase().replace(/\s+/g, " ").trim().replace(/^(?:in )?(?:blo|flo|back loops? only|front loops? only)[,:]?\s+/, "");
  if (!t) return null;
  // A foundation chain: "ch 34" / "chain 9, turn" makes the stitches the next row works into.
  const chain = t.match(/^(?:ch|chain) (\d+)(?:,? turn\.?)?$/);
  if (chain) return { consumed: 0, produced: Number(chain[1]) };
  const result = countSequence(t, previous);
  // "(sc, inc) (18)" / "dec (6)" with no repeat count means "repeat around".
  const single = splitTopLevel(t).length === 1 && !/\b(times|x ?\d+|around)\b/.test(t);
  if (result && single && previous != null && result.consumed > 0 && result.consumed < previous && previous % result.consumed === 0) {
    const times = previous / result.consumed;
    return { consumed: previous, produced: result.produced * times };
  }
  return result;
}

export function checkStitchCounts(pattern: Pattern): StitchIssue[] {
  const issues: StitchIssue[] = [];
  pattern.sections.forEach((section, sectionIndex) => {
    // After a mismatch we don't know whether the stated or the computed count
    // is the real one, so carry both and use whichever the next row agrees with.
    // That way one typo produces one flag, not a cascade down the piece.
    let previous: number[] = [];
    let lastFrom = 0;
    section.steps.forEach((step, stepIndex) => {
      if (step.kind !== "row") return;
      // Numbering starting over means a new part of the piece.
      if ((step.from ?? 0) <= lastFrom) previous = [];
      lastFrom = step.to ?? step.from ?? lastFrom;

      const tries = (previous.length ? previous : [null]).map((prev) => ({ prev, result: countRow(step.text, prev) }));
      const problem = ({ prev, result }: (typeof tries)[number]) => {
        if (!result || step.stitchCount == null) return null;
        if (result.produced !== step.stitchCount) return `${step.label} says (${step.stitchCount}) but the instructions make ${result.produced} sts.`;
        // Using fewer stitches than exist is normal for short rows and partial
        // shaping; using more than exist is always a mistake somewhere.
        if (prev != null && result.consumed > prev) return `${step.label} works into ${result.consumed} sts, but the previous round has ${prev}.`;
        return null;
      };
      const ok = tries.find((t) => t.result && !problem(t));
      const pick = ok ?? tries.find((t) => t.result) ?? tries[0];
      const message = ok ? null : problem(pick);
      if (message && pick.result) {
        issues.push({ sectionIndex, stepIndex, label: step.label, stated: step.stitchCount!, computed: pick.result.produced, message });
      }
      previous = [...new Set([step.stitchCount, pick.result?.produced].filter((n): n is number => n != null))];
    });
  });
  return issues;
}
