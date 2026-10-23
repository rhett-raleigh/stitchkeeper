import { FILE_NAME, getFile } from "@/lib/files";

export async function GET(_req: Request, ctx: RouteContext<"/files/[name]">) {
  const { name } = await ctx.params;
  if (!FILE_NAME.test(name)) return new Response("Not found", { status: 404 });
  const file = await getFile(name);
  if (!file) return new Response("Not found", { status: 404 });
  // Files are named by content, so they never change.
  return new Response(file.body, {
    headers: {
      "content-type": file.httpMetadata?.contentType ?? (name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      "cache-control": "private, max-age=31536000, immutable",
      etag: file.httpEtag,
    },
  });
}
