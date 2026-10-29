# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------- build frontend
FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY vite.config.js ./
COPY web ./web
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    TZ=Europe/Rome \
    DATA_DIR=/data \
    APP_VERSION=1.0.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends tini gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY server ./server
COPY --from=build /app/dist ./dist
COPY docker/entrypoint.sh /usr/local/bin/ghibiri-entrypoint

RUN chmod +x /usr/local/bin/ghibiri-entrypoint \
    && mkdir -p /data/uploads /data/tmp \
    && chown -R node:node /data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/ghibiri-entrypoint"]
CMD ["node", "server/index.js"]
