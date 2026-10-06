# SPM Nacional — site e painel administrativo

Next.js 16, React 19, TypeScript, SCSS, Prisma 7 e PostgreSQL. O site completo precisa de servidor e banco; GitHub Pages é apenas uma demonstração estática.

Esta base está preparada para homologação e implantação controlada no Google Cloud. **Código testado não equivale a produção homologada nem a ausência de vulnerabilidades.** Consulte [prontidão e limitações](docs/PRONTIDAO-PRODUCAO.md) e o [guia operacional](infra/OPERACAO-PRODUCAO.md).

A HML está publicada em [spm-hml.35.215.232.88.sslip.io](https://spm-hml.35.215.232.88.sslip.io), com entrada do painel em `/atendente` e login Google Workspace. A atualização `hml-20261003-logo` restaurou a logo institucional original e importou 141 registros editoriais e um arquivo local, após backup privado. A baseline auditada `hml-20261002-76-04` terminou com EXIT 0 em 3/10/2026 UTC (2/10 Brasília): PostgreSQL 18.6, 13 migrações, seis tabelas FORCE RLS, prontidão HTTP 200 e backup/restauração real confirmados. O site público abre sem Basic Auth dentro da janela autorizada. A atualização preservou o corte excepcional das 06h de Brasília. Horários, limites e evidências estão no [guia HML](infra/hml/README.md), no [registro da atualização](infra/hml/vm/README.md) e na [auditoria dos 76 itens](docs/auditoria-76-resumo.json).

## Desenvolvimento

Use Node.js 22.12 ou superior compatível com as dependências, Bun 1.4.2 e Docker Desktop com containers Linux. Preserve o `.env` e os volumes de uma instalação existente. O lockfile é `bun.lock`; não gerar um segundo lockfile npm.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Preencha os segredos indicados em `.env.example`. `DATABASE_URL` e `POSTGRES_PASSWORD` devem usar a mesma senha local. Não altere `ENCRYPTION_KEY` de um banco existente: dados cifrados dependem dessa chave.

```sh
bun install --frozen-lockfile
bun run setup
bun run dev
```

O login fica em `/atendente`, o painel em `/admin`. A porta padrão é 3000; Postgres local usa 55432. Para outra porta, configure `APP_URL` e `NEXT_PUBLIC_SITE_URL` com a mesma origem do navegador. Chamadas de escrita de outra origem são recusadas.

`bun run setup` inicia o Postgres e aplica migrações — não cria usuários ou conteúdo. Em um banco novo de produção, use o bootstrap abaixo. `bun run db:seed` serve somente para demonstração e sobrescreve dados/permissões; não faz parte do deploy.

## Inicialização sem conteúdo de demonstração

Depois de aplicar as migrações em um **banco novo e identificado**, configure `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` e `GOOGLE_OAUTH_ALLOWED_DOMAIN` na sessão operacional. O e-mail deve pertencer ao domínio institucional. Na nuvem não existe senha local, link mágico nem conta de contingência que contorne o Workspace.

```sh
bun run db:bootstrap
```

Cria apenas permissões, cinco perfis e a primeira conta autorizada para Google Workspace. Recusa banco que já contenha usuários e não publica notícias fictícias. A identidade Google é vinculada no primeiro login validado. Variáveis antigas `BOOTSTRAP_ADMIN_PASSWORD`, `USER_PASSWORD` e `SEED_ADMIN_PASSWORD` são recusadas; remova-as da configuração, sem alterar as chaves de criptografia/autenticação existentes.

Para provisionamento posterior, `bun run user:create --email pessoa@exemplo.org --nome "Pessoa" --perfil editor`, com `GOOGLE_OAUTH_ALLOWED_DOMAIN=exemplo.org`, autoriza o e-mail, sem senha. Alterar conta existente exige `--atualizar` e revoga sessões na mesma transação. O painel também permite autorizar usuários e enviar instruções por e-mail.

## Workspace, idiomas e capacidade

Para testar no próprio computador enquanto o Google não está configurado, existe uma exceção explícita e desligada por padrão: [acesso local de teste](docs/ACESSO-LOCAL.md). O servidor exige origem loopback, conta ativa fixada por ID e nenhuma credencial OAuth. Esse modo não funciona no GCP; as ações gravam de verdade no banco local.

A preparação de 22/09/2026 está descrita em [INTEGRACOES-SPM.md](docs/INTEGRACOES-SPM.md). O login usa exclusivamente Workspace. Cloud Run exige a declaração de 2FA global no provedor; a HML `gcp-vm` admite a exceção administrativa restrita a uma única conta com 2FA individual confirmada, conforme o [guia HML](infra/hml/README.md). Essa declaração não é inferida do ID token. A tradução pública para inglês, francês, espanhol e árabe depende da configuração Cloud Translation; instalações sem essa configuração a mantêm desligada. Nenhuma preparação local ativa recursos na nuvem automaticamente. A migração de autenticação encerra sessões antigas; confirmar acesso Google antes de atualizar a instalação usada pela equipe.

Ao alterar textos em componentes públicos, execute `bun run i18n:catalog` e inclua o catálogo gerado na revisão. `bun run i18n:check` e a CI recusam catálogo desatualizado. Posts e demais textos editoriais são traduzidos pela versão atual, sob demanda, sem recatalogação manual.

**Decisão de 3/10/2026, com implementação adiada:** após a atualização dos textos, os textos fixos serão pré-traduzidos para todos os idiomas suportados pelo Google NMT e servidos sem chamadas de tradução durante a navegação. A tradução dinâmica ficará para o conteúdo editorial publicado pela SPM, com cache por versão e idioma. Estratégia, custos e critérios de aceite estão em [TRADUCAO.md](docs/TRADUCAO.md#decisão-de-03102026--estratégia-futura-ainda-não-implementada).

## Qualidade e regressão

| Comando                    | Verificação                                            |
| -------------------------- | ------------------------------------------------------ |
| `bun run lint`             | ESLint, React, TypeScript e convenções Next            |
| `bun run typecheck`        | Tipos da aplicação, scripts e testes                   |
| `bun run test`             | Testes unitários e regressões de segurança             |
| `bun run test:coverage`    | Relatórios em `coverage/` e limiares de cobertura      |
| `bun run test:integration` | Migrações e concorrência em PostgreSQL descartável     |
| `bun run build`            | Build de produção                                      |
| `bun run test:e2e`         | Home, login, sessão, mídia e headers em desktop/mobile |
| `bun run test:load`        | Carga HTTP em Docker isolado, com dados sintéticos     |
| `bun run security:audit`   | Vulnerabilidades conhecidas das dependências npm       |
| `bun run check`            | Lint, tipos, cobertura, audit e build                  |
| `bun run check:production` | Validação offline do ambiente pretendido               |

Para E2E, execute `bun run build` e `bunx playwright install chromium` antes. Integração/E2E exigem Docker, criam seu próprio PostgreSQL em porta aleatória e removem somente esse container e os uploads sintéticos. **Não reutilizam DATABASE_URL do usuário.** O navegador usa `localhost:3147` e recusa reutilizar servidor já aberto nessa porta. Não apontar esses testes para produção.

O teste de carga é separado da CI comum: veja [cenários, recursos e limites de interpretação](docs/TESTE-DE-CARGA.md). Ele não testa a instalação atualmente aberta nem faz chamadas de carga ao domínio público.

Em 2/10/2026, a auditoria completa reporta **1 HIGH de desenvolvimento em `braces@3.0.3`**, ainda sem release oficial corrigida. A [patch Bun local](patches/README.md) limita profundidade, preserva a semântica anterior e passou 11 regressões reais; o achado não foi suprimido e o gate HIGH da CI continua bloqueado. O migrador instala somente dependências de produção, com Prisma/tsx operacionais e sem ESLint/braces. Auditoria de produção e scans locais dos digests finais do app, migrador e PostgreSQL endurecido não encontraram vulnerabilidades conhecidas. Caddy 2.11.6 mantém **1 UNKNOWN** em `x/crypto/openpgp`, com alcance não comprovado e sem correção upstream identificada. Scans são fotografias temporais, não um atestado de ausência de falhas.

O preflight não carrega `.env` implicitamente, não revela valores e não acessa serviços. Para conferir o arquivo local explicitamente:

```sh
node --env-file=.env --import tsx scripts/check-production.ts
```

No Cloud Run, use `DEPLOYMENT_TARGET=gcp`; a HML em VM usa `DEPLOYMENT_TARGET=gcp-vm`, seguindo o [guia próprio](infra/hml/README.md). Ambos exigem HTTPS, GCS e credenciais reais via Secret Manager. O servidor valida a configuração na inicialização; o build permanece sem segredos.

## Docker e implantação

```sh
docker compose up --build -d
```

Esse comando altera a instalação local e aplica migrações; revise backup e `.env` antes de atualizar uma base existente. Não use `down -v`, `db:reset` ou seed como procedimento de atualização.

- `/api/health/live`: processo responde, sem depender do banco.
- `/api/health/ready` e `/api/health`: prontidão do banco, com prazo limitado e sem informações internas.
- Migrações e runtime têm imagens separadas, ambas sem root. O contexto Docker exclui segredos, estado Terraform e documentos.
- CI executa testes, audit, builds e validação de infraestrutura sem segredos de produção.
- Deploy GCP é manual, pela branch `prod` e environment `production`, com aprovação a configurar no GitHub, OIDC, imagens por digest, migrações, candidata sem tráfego principal, smoke e promoção/rollback de tráfego.
- Terraform prepara SQL protegido/PITR, bucket privado/versionado, identidades e segredos. **Não foi aplicado nesta entrega.** Domínio, monitoramento, orçamento e restauração precisam de homologação real.

Siga [infra/OPERACAO-PRODUCAO.md](infra/OPERACAO-PRODUCAO.md), especialmente a separação do usuário SQL de migração e do runtime. O Compose local usa um usuário único por conveniência e não representa todos os controles da nuvem.

## Organização

`app/` contém páginas, Server Actions e APIs; `lib/server/` concentra autenticação, criptografia, acesso a dados e integrações; `prisma/migrations/` versiona o schema; `tests/` contém regressões; `infra/` reúne deploy e operação; `docs/` registra a prontidão. `devdocs/` são documentos locais de trabalho, não artefatos publicados.
