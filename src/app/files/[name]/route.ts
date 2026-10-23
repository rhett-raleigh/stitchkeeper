import { readFile } from "node:fs/promises";
import path from "node:path";
import { FILES_DIR } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/files/[name]">) {
  const { name } = await ctx.params;
  // Stored PDFs ("<hash>.pdf") and photos pulled from them ("<hash>-p3.jpg", "<hash>-p3-i2.jpg").
  if (!/^[a-f0-9]{16}(\.pdf|-p\d+(-i\d+)?\.jpg)$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(FILES_DIR, name));
    const type = name.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
    // Files are named by content, so they never change.
    return new Response(data, { headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
