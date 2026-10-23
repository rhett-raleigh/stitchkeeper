import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // No cacheComponents/partialPrefetching: on Cloudflare (workerd) they hang every page
  // (opennextjs-cloudflare#1450). Every page reads D1 per request anyway.
  experimental: {
    // Pattern PDFs uploaded through the import form.
    serverActions: { bodySizeLimit: "60mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Gives `next dev` the D1/R2 bindings from wrangler.jsonc (local miniflare state in .wrangler/).
initOpenNextCloudflareForDev();
