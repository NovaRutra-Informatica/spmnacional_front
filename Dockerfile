# =========================================================
# SPM Nacional — imagem de produção (Next.js standalone + Prisma)
#
# O Prisma 7 usa o query compiler em WebAssembly com driver adapter,
# então não há binário nativo de engine para carregar — a imagem final
# continua sendo Alpine e enxuta.
# =========================================================

# O CLI de migrações ainda precisa de OpenSSL. Mantemos musl no Alpine,
# sem libc6-compat, conforme os requisitos do Prisma.
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

# ---------- Estágio 1: dependências ----------
FROM base AS deps

# O schema entra antes do install porque o postinstall roda `prisma generate`.
COPY package.json package-lock.json* prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---------- Estágio 2: build ----------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Defesa em profundidade: o .dockerignore deve impedir esses arquivos, mas o
# build também falha caso um contexto mal configurado deixe algum segredo passar.
RUN if find /app -path /app/node_modules -prune -o -type f \( -name '.env' -o -name '.env.*' \) -print -quit | grep -q .; then \
        echo "ERRO: arquivo de ambiente detectado no contexto de build." >&2; \
        exit 1; \
    fi

ENV NEXT_TELEMETRY_DISABLED=1
# O client do Prisma é gerado em lib/generated/prisma e entra no bundle.
RUN npx prisma generate
RUN npm run build

# O artefato standalone é exatamente o que entra na imagem final. Esta checagem
# evita que uma mudança futura no build volte a empacotar arquivos de ambiente.
RUN if find /app/.next/standalone -type f \( -name '.env' -o -name '.env.*' \) -print -quit | grep -q .; then \
        echo "ERRO: arquivo de ambiente detectado no artefato standalone." >&2; \
        exit 1; \
    fi

# ---------- Estágio 3: migrações ----------
# Imagem separada, usada para rodar `prisma migrate deploy` antes de subir
# a aplicação (docker compose run --rm migrate, ou um Cloud Run Job).
FROM base AS migrator

COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY lib ./lib

ENV NEXT_TELEMETRY_DISABLED=1
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- Estágio 4: runtime ----------
FROM base AS runner

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
