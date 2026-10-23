# Built by wrangler with the repo root as context (see wrangler.jsonc).
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY extractor/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src/lib ./src/lib
COPY extractor/server.ts ./extractor/
ENV NODE_ENV=production EXTRACTOR_PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "extractor/server.ts"]
