import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ExtractedFile } from "./extract/analyze";

// Stored PDFs ("<hash>.pdf") and photos pulled from them ("<hash>-p3.jpg", "<hash>-p3-i2.jpg")
// live in R2, served by /files/[name]. Names are content-based, so files never change.
export const FILE_NAME = /^[a-f0-9]{16}(\.pdf|-p\d+(-i\d+)?\.jpg)$/;

const bucket = () => getCloudflareContext().env.FILES;
const contentType = (name: string) => (name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

export async function putFile(name: string, data: ArrayBuffer | Uint8Array) {
  await bucket().put(name, data, { httpMetadata: { contentType: contentType(name) } });
}

export function getFile(name: string) {
  return bucket().get(name);
}

/** Saves the JPEGs the extractor made. */
export async function putExtracted(files: ExtractedFile[]) {
  await Promise.all(files.map((f) => putFile(f.name, Buffer.from(f.data, "base64"))));
}

// Small JSON records kept beside the files (not served by /files).
export async function getJson<T>(key: string): Promise<T | null> {
  const obj = await bucket().get(key);
  return obj ? obj.json<T>() : null;
}

export async function putJson(key: string, value: unknown) {
  await bucket().put(key, JSON.stringify(value), { httpMetadata: { contentType: "application/json" } });
}
