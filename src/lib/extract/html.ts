// Turns a pattern web page into plain text plus a few bits of metadata.

export type FetchedPage = { title: string; text: string; images: string[]; url: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m);
}

function meta(html: string, property: string): string[] {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "gi");
  return [...html.matchAll(re)].map((m) => decode(m[1]));
}

export function htmlToText(html: string): string {
  // Some CMSes double-encode (&amp;eacute;), so decode twice.
  return decode(decode(
    html
      .replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  ))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export async function fetchPage(url: string): Promise<FetchedPage> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Stitchkeeper pattern importer)" } });
  if (!res.ok) throw new Error(`Couldn't fetch ${url} (HTTP ${res.status})`);
  const html = await res.text();
  const title = meta(html, "og:title")[0] ?? html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? url;
  return { title: decode(title), text: htmlToText(html), images: meta(html, "og:image"), url };
}
