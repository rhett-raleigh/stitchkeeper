import { readFile } from "node:fs/promises";
import path from "node:path";
import { FILES_DIR } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/files/[name]">) {
  const { name } = await ctx.params;
  if (!/^[a-f0-9]{16}\.pdf$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(FILES_DIR, name));
    return new Response(data, { headers: { "content-type": "application/pdf" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
