// PDF extraction service (poppler + sharp). Runs in the Cloudflare container behind the
// Extractor Durable Object (worker.ts), and locally beside `next dev` (npm run dev).
//
//   POST /pdf?hash=&filename=&forceClaude=1&claude=1   body: PDF  -> PdfAnalysis
//   POST /photos?hash=&first=&last=                    body: PDF  -> PhotoChoices
import { createServer, type IncomingMessage } from "node:http";
import { analyzePdf, photoChoices } from "../src/lib/extract/analyze";

const PORT = Number(process.env.EXTRACTOR_PORT ?? 8080);

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://extractor");
  const q = url.searchParams;
  const send = (status: number, value: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
  try {
    if (req.method !== "POST") return send(200, { ok: true });
    const hash = q.get("hash") ?? "";
    if (!/^[a-f0-9]{16}$/.test(hash)) return send(400, { error: "bad hash" });
    if (url.pathname === "/pdf") {
      const opts = { forceClaude: q.get("forceClaude") === "1", claude: q.get("claude") === "1" };
      return send(200, await analyzePdf(await body(req), hash, q.get("filename") ?? "pattern.pdf", opts));
    }
    if (url.pathname === "/photos") {
      const range = { first: Number(q.get("first") ?? 1), last: Number(q.get("last") ?? 1) };
      return send(200, await photoChoices(await body(req), hash, range));
    }
    send(404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(500, { error: e instanceof Error ? e.message : String(e) });
  }
}).listen(PORT, () => console.log(`extractor listening on :${PORT}`));
