# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY web web
COPY public public
RUN npm run build

FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 # onnxruntime ships binaries for every platform: keep only this one
 && arch="$(node -p process.arch)" \
 && find node_modules/onnxruntime-node/bin/napi-v6 -mindepth 2 -maxdepth 2 ! -path "*/linux/$arch" -exec rm -rf {} +

FROM node:24-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends imagemagick tesseract-ocr tesseract-ocr-eng openssl tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    HTTP_HOST=0.0.0.0
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/public public
COPY package.json ./
COPY src src
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8443 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/server.ts"]
