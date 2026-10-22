import type { Pattern } from "@/lib/pattern";

// Underlines known abbreviations so a hover/long-press shows their meaning.
export function StepText({ text, abbreviations }: { text: string; abbreviations: Pattern["abbreviations"] }) {
  const map = new Map(abbreviations.map((a) => [a.abbr.replace(/\(s\)$/, "").toLowerCase(), a.meaning]));
  if (map.size === 0) return <>{text}</>;
  const keys = [...map.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${keys.join("|")})s?\\b`, "gi");
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    parts.push(text.slice(last, m.index));
    const meaning = map.get(m[1].toLowerCase());
    parts.push(
      <abbr key={m.index} title={meaning} className="cursor-help decoration-line decoration-dotted underline-offset-4">
        {m[0]}
      </abbr>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
