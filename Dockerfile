# =========================================================
# SPM Nacional — imagem de produção (Next.js standalone + Prisma)
#
# O Prisma 7 usa o query compiler em WebAssembly com driver adapter,
# então não há binário nativo de engine para carregar — a imagem final
# continua sendo Alpine e enxuta.
# =========================================================

# ---------- Estágio 1: dependências ----------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# O schema entra antes do install porque o postinstall roda `prisma generate`.
COPY package.json package-lock.json* prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---------- Estágio 2: build ----------
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# O client do Prisma é gerado em lib/generated/prisma e entra no bundle.
RUN npx prisma generate
RUN npm run build

# ---------- Estágio 3: migrações ----------
# Imagem separada, usada para rodar `prisma migrate deploy` antes de subir
# a aplicação (docker compose run --rm migrate, ou um Cloud Run Job).
FROM node:22-alpine AS migrator
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY lib ./lib

ENV NEXT_TELEMETRY_DISABLED=1
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- Estágio 4: runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Diretório de uploads quando STORAGE_DRIVER=local.
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
