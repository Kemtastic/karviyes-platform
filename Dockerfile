# syntax=docker/dockerfile:1.7
# Uygulama imajı: Next standalone çıktısı, root olmayan kullanıcı.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

# Kurulum ve bakım komutları (göç, ilk yönetici, örnek veri) için tam kaynaklı araç imajı.
FROM deps AS tools
COPY . .
USER node

FROM node:22-alpine AS app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/src/core/pdf/fonts ./src/core/pdf/fonts
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/saglik || exit 1
CMD ["node", "server.js"]
