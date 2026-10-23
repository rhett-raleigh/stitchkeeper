import { importPdf, importUrl } from "@/lib/importer";

// Bulk import (scripts/import.ts): one link or one PDF per request.
export async function POST(req: Request) {
  // A custom header can't be sent cross-site without a CORS preflight, which this route never answers.
  if (req.headers.get("x-stitchkeeper-import") !== "1") return Response.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData();
  const forceClaude = form.get("forceClaude") === "1";
  const url = form.get("url");
  const pdf = form.get("pdf");
  try {
    if (typeof url === "string" && url) return Response.json({ results: [await importUrl(url, { forceClaude })] });
    if (pdf instanceof File) {
      return Response.json({ results: await importPdf(Buffer.from(await pdf.arrayBuffer()), pdf.name, { forceClaude }) });
    }
    return Response.json({ error: "Send a url or a pdf." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
