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

# Bun installs dependencies; all application commands retain Node.js.
FROM base AS tooling
COPY --from=oven/bun:1.4.2-alpine /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
ENV BUN_INSTALL_GLOBAL_STORE=0

# ---------- Estágio 1: dependências ----------
FROM tooling AS deps

# O schema entra antes do install porque o postinstall roda `prisma generate`.
COPY package.json bun.lock bunfig.toml prisma.config.ts ./
COPY patches ./patches
COPY prisma ./prisma
RUN bun install --frozen-lockfile --linker hoisted

# Dependências operacionais, sem ESLint/testes e sem postinstall executado aqui.
# O client gerado continua vindo de deps, com o schema revisado do build.
FROM tooling AS migrate-deps
COPY package.json bun.lock bunfig.toml ./
COPY patches ./patches
RUN bun install --production --frozen-lockfile --ignore-scripts --linker hoisted

# ---------- Estágio 2: build ----------
FROM tooling AS builder

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
RUN bunx --no-install prisma generate
RUN bun run build

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
LABEL org.spmnacional.database-protocol="scoped-rls-v1"
ENV TZ=America/Sao_Paulo

# Os comandos operacionais usam Node diretamente; npm global não é necessário.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=migrate-deps /app/node_modules ./node_modules
# --ignore-scripts não instala a engine da CLI; copiar apenas o binário Linux
# já obtido por deps permite executar migrations sem download em produção.
COPY --from=deps /app/node_modules/@prisma/engines/schema-engine-linux-musl-openssl-3.0.x ./node_modules/@prisma/engines/schema-engine-linux-musl-openssl-3.0.x
COPY package.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY lib ./lib
COPY --from=deps /app/lib/generated ./lib/generated
# Bootstrap explícito para banco novo; não roda junto das migrações.
COPY scripts/bootstrap-production.ts ./scripts/bootstrap-production.ts
COPY scripts/retry-media-deletion.ts scripts/retry-contact-email.ts scripts/retry-generic-email.ts ./scripts/
COPY scripts/lib ./scripts/lib

ENV NEXT_TELEMETRY_DISABLED=1
USER nextjs
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# ---------- Estágio 4: runtime ----------
FROM base AS runner
LABEL org.spmnacional.database-protocol="scoped-rls-v1"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV TZ=America/Sao_Paulo

# O standalone e o healthcheck usam Node diretamente, sem npm/npx.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Diretório de uploads quando STORAGE_DRIVER=local.
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000

# Liveness não depende do banco: uma manutenção no SQL não causa reinícios em massa.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/live',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
