# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:24-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:24-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    ASSETS_DIR=/app/dist

WORKDIR /app

# The server bundle is self-contained (Node built-ins only), so no node_modules are needed here.
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts/seed-demo.mjs ./scripts/seed-demo.mjs
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data && chown -R node:node /data /app
USER node

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/server.mjs"]
