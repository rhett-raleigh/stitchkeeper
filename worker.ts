// Worker entry: the OpenNext build plus the PDF extractor container.
import { Container } from "@cloudflare/containers";
// .open-next/ only exists after `opennextjs-cloudflare build`, so the import may or may not resolve.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";

/** Runs extractor/server.ts (poppler + sharp). The app reaches it through src/lib/extractor.ts. */
export class Extractor extends Container<CloudflareEnv> {
  defaultPort = 8080;
  sleepAfter = "3m";
  // It only reads the PDFs it's sent.
  enableInternet = false;

  // OpenNext swaps globalThis.Request for a subclass, so Container's `request instanceof Request`
  // check fails on the incoming (native) request and it tries to parse "[object Request]" as a URL.
  // Hand it the parts instead.
  override fetch(request: Request): Promise<Response> {
    const { url, method, headers, body } = request;
    return this.containerFetch(url, { method, headers, body }, this.defaultPort);
  }
}

export default { fetch: handler.fetch } satisfies ExportedHandler<CloudflareEnv>;
