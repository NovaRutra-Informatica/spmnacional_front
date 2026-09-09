# SPM Nacional — site e painel administrativo

Sistema do **Serviço Pastoral dos Migrantes**, organismo da Pastoral Social da CNBB que, desde 1985,
acolhe, organiza e defende os direitos de migrantes e refugiados no Brasil.

**Next.js 16 · React 19 · TypeScript · SCSS · Prisma 7 · PostgreSQL · Docker**, preparado para rodar
no Google Cloud (Cloud Run + Cloud SQL) e integrado ao Google Workspace da organização.

---

## Começar

Use Node.js 22 e Docker Desktop iniciado, com contêineres Linux. No PowerShell, crie o
arquivo local somente se ele ainda não existir:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Antes de iniciar, preencha os segredos do `.env`. Estes comandos geram valores novos:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" # POSTGRES_PASSWORD
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"    # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"    # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"    # CRON_SECRET
```

Use a mesma senha em `POSTGRES_PASSWORD` e no lugar de `SUA_SENHA` em `DATABASE_URL`.
Preserve os valores de uma instalação existente, especialmente `ENCRYPTION_KEY`. Não
sobrescreva o `.env` ao atualizar com `git pull`: alterar `POSTGRES_PASSWORD` no arquivo
não muda a senha de um banco já criado no volume Docker.

```powershell
npm ci
npm run setup             # espera o Postgres ficar pronto e aplica as migrações
npm run dev
```

Acesse <http://localhost:3000>. O painel fica em `/atendente`.

Se a porta 3000 já estiver ocupada, use `npm run dev -- --port 3001` e configure
`APP_URL` e `NEXT_PUBLIC_SITE_URL` como `http://localhost:3001` em
`.env.development.local`. Esse arquivo vale apenas para desenvolvimento, mantendo
as URLs de produção do `.env`. Para alternar do desenvolvimento Docker para o
Next.js no Windows, libere a porta com `docker compose stop dev`.

O Postgres usa a porta **55432** do host. Para a primeira carga de um banco vazio, defina
`SEED_ADMIN_PASSWORD` no `.env` (mínimo de 12 caracteres, sem senha padrão; pode gerar com
o primeiro comando acima) e execute `npm run db:seed` após o setup. Isso cria a conta
`SEED_ADMIN_EMAIL` e os dados iniciais. Reexecutar o seed sobrescreve conteúdo e permissões
existentes; ele não faz parte do setup.

### Docker (aplicação inteira)

Com o `.env` preenchido:

```powershell
docker compose up --build -d
```

Esse comando compila a aplicação, espera o banco, aplica as migrações e inicia o site.
Acesse <http://localhost:3000>. A carga inicial do banco continua sendo um passo explícito,
conforme descrito acima.

Para conviver com outro serviço na porta 3000, configure no `.env` antes de subir:

```dotenv
WEB_HOST_PORT="3010"
APP_URL="http://localhost:3010"
NEXT_PUBLIC_SITE_URL="http://localhost:3010"
```

Nesse caso, acesse <http://localhost:3010>. Se alterar `DB_HOST_PORT`, ajuste também a
porta de `DATABASE_URL` para os comandos npm executados no Windows.

### Docker (desenvolvimento com hot reload)

```powershell
npm run docker:dev
```

Equivale a `docker compose up --build dev`: inicia o desenvolvimento e o banco, com
migrações automáticas e atualização ao salvar arquivos. Acesse <http://localhost:3001>.
Configure `DEV_HOST_PORT` no `.env` para mudar essa porta; `DEV_APP_URL` é opcional quando
o endereço público for diferente de `http://localhost:<DEV_HOST_PORT>`.

---

## Scripts

| Comando               | O que faz                                               |
| --------------------- | ------------------------------------------------------- |
| `npm run dev`         | Servidor de desenvolvimento                             |
| `npm run build`       | Build de produção                                       |
| `npm run build:pages` | Site público estático para o GitHub Pages               |
| `npm run typecheck`   | Checagem de tipos                                       |
| `npm run format`      | Prettier                                                |
| `npm run setup`       | Espera o banco ficar pronto e aplica migrações          |
| `npm run db:seed`     | Carga inicial explícita; sobrescreve conteúdo existente |
| `npm run db:studio`   | Prisma Studio (interface visual do banco)               |
| `npm run db:migrate`  | Cria e aplica uma migração a partir do schema           |
| `npm run db:reset`    | Recria o banco do zero (apaga tudo)                     |

---

## Estrutura

```
app/                  Rotas (App Router)
  admin/              Painel administrativo — sessão obrigatória
  api/                health, arquivos, OAuth do Google, cron da agenda
  atendente/          Login
  convite/[token]/    Aceite de convite e definição de senha
components/           Header, Footer, PageHero, Animate, casca do painel
lib/
  server/             Só roda no servidor: db, auth, crypto, storage, mail, queries
  labels.ts           Rótulos dos enums e formatação de data
  markdown.ts         Renderizador de Markdown com escape na entrada
prisma/               schema.prisma, migrations/, seed.ts
styles/               Design system em SCSS
infra/terraform/      Infraestrutura GCP (não aplicada)
docs/                 Arquitetura, integrações Google, privacidade e fontes
```

---

## Painel administrativo

Login em `/atendente`. A conta inicial vem das variáveis `SEED_ADMIN_*` do `.env`.
`SEED_ADMIN_PASSWORD` é obrigatória para criar a primeira conta e não possui valor padrão.

O painel cobre notícias, biblioteca de mídia, editais, testemunhos, documentos, Semana do Migrante,
agenda, mensagens do site, atendimentos, usuários, perfis e permissões, e configurações.

### Autenticação

Real, não de demonstração:

- Senha em **scrypt** (`node:crypto`, sem dependência externa), com salt por usuário.
- Sessão em banco, com token opaco; o cookie é `httpOnly`, `sameSite=lax` e `secure` em produção.
  No banco guardamos só o HMAC do token, então um vazamento não permite assumir sessões.
- Expiração absoluta de 12 h e inatividade de 30 min.
- Limitação de tentativas por origem e identificador, sem permitir que terceiros bloqueiem a conta.
- Login opcional com **Google Workspace** (OAuth 2.0 + PKCE), restrito ao domínio da organização
  com verificação do claim `hd` no servidor. A conta precisa existir no painel: o site não cria
  usuário sozinho.
- Permissões por perfil (`noticias`, `midia`, `editais`, `atendimentos`, `usuarios`, `config`),
  verificadas no servidor em toda página e em toda Server Action.
- Log de auditoria de login, alteração de permissão, mutação de conteúdo e **leitura** de ficha de
  atendimento.

### Módulo de atendimentos

Trata dados de pessoas migrantes, parte delas em situação documental irregular. Por isso:

- **não existe campo de situação migratória** — e não deve existir;
- o que circula na tela é um **código pseudônimo** (`ATD-2026-0001`), não o nome;
- nome e contato são cifrados em repouso com **AES-256-GCM**;
- quem não é administrador só enxerga a própria regional, filtrado na consulta;
- abrir uma ficha gera registro de auditoria — a leitura é o evento que mais importa auditar;
- há data de retenção e ação de anonimização que preserva só os campos estatísticos.

O embasamento legal está em [`docs/PRIVACIDADE.md`](docs/PRIVACIDADE.md).

---

## Integrações Google

Configuráveis por variável de ambiente; **sem elas o sistema funciona normalmente**, apenas sem o
recurso. Detalhes em [`docs/INTEGRACOES-GOOGLE.md`](docs/INTEGRACOES-GOOGLE.md).

| Integração         | Variáveis                                            | Sem configurar                              |
| ------------------ | ---------------------------------------------------- | ------------------------------------------- |
| E-mail (Workspace) | `SMTP_*`, `MAIL_FROM`, `MAIL_NOTIFY_TO`              | Mensagens são gravadas, mas não notificadas |
| Login com Google   | `GOOGLE_OAUTH_CLIENT_ID`, `..._SECRET`, `..._DOMAIN` | O botão nem aparece                         |
| Agenda             | `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_API_KEY`      | A agenda usa só os eventos do painel        |
| Cloud Storage      | `STORAGE_DRIVER=gcs`, `GCS_BUCKET`                   | Uploads vão para o disco local              |

---

## Publicação no GitHub Pages

O site público vai para <https://novarutra-informatica.github.io/spmnacional_front/> pelo workflow
[`.github/workflows/pages.yml`](.github/workflows/pages.yml), a cada push na `dev` (ou pelo botão
"Run workflow" na aba Actions).

Em **Settings → Pages**, a fonte precisa estar em **"Deploy from a branch" → `gh-pages` → `/ (root)`**.
O workflow escreve o site na `gh-pages` (substituindo a branch inteira a cada publicação, o que
apagou o build Angular que estava lá) e quem serve dali é o próprio GitHub.

O Pages serve arquivo estático, e o app precisa de servidor Node. Quem faz a ponte é
[`scripts/build-pages.mjs`](scripts/build-pages.mjs): ele copia o projeto para `.pages-build/`,
tira de lá o que depende de servidor e roda um `next build` com `output: 'export'`. A árvore de
trabalho não é tocada — o build normal e a imagem Docker continuam vendo o código original.

O que **não** existe no site estático, e por quê:

| Fora                                              | Motivo                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `app/admin`                                       | Sessão em cookie e Server Actions exigem servidor                                                          |
| `app/api`                                         | Rotas dinâmicas (login Google, arquivos, cron)                                                             |
| `app/convite/[token]`, `app/newsletter/confirmar` | A URL vem do e-mail; não há como pré-gerar                                                                 |
| `proxy.ts`                                        | Não existe proxy de autenticação em export estático                                                        |
| Envio do Fale Conosco e da newsletter             | Sem banco e sem SMTP; os formulários passam a indicar o e-mail de contato (ver `scripts/pages-overrides/`) |

**O conteúdo do site é congelado no momento do build.** Publicar uma notícia pelo painel não muda o
site sozinho: é preciso rodar o workflow de novo. E, sem o segredo `PAGES_DATABASE_URL` apontando
para um Postgres acessível pela internet, o build usa um banco descartável semeado com
`prisma db seed` — ou seja, o site sai com o **conteúdo de demonstração**.

Para rodar o build localmente, usando o `DATABASE_URL` configurado no `.env`:

```powershell
npm run db:up
node --env-file=.env scripts/build-pages.mjs
# resultado em out/
```

---

## Deploy no GCP

> Desligado por ora: o workflow [`deploy-gcp.yml`](.github/workflows/deploy-gcp.yml) só roda pelo
> botão manual na aba Actions. Nenhum push dispara deploy no Cloud Run.

A infraestrutura está descrita em Terraform e **não foi aplicada**. Passo a passo, custos estimados
e decisões em [`infra/README.md`](infra/README.md).

Resumo: Cloud Run (escala a zero) + Cloud SQL PostgreSQL + Secret Manager + Cloud Storage +
Artifact Registry + Cloud Scheduler, tudo em `southamerica-east1` (São Paulo), com deploy pelo
GitHub Actions autenticado por Workload Identity Federation — sem chave JSON.

Custo aproximado: o Cloud Run cabe no nível gratuito neste porte; o Cloud SQL `db-f1-micro` em São
Paulo custa cerca de **US$ 14–15/mês** (instância + 10 GB de SSD) e **não escala a zero**. A
alternativa de menor custo inicial é um Postgres serverless (Neon/Supabase), migrando depois — é
Postgres puro nos dois casos.

---

## Dados institucionais

Os dados carregados pelo seed (17 unidades regionais em 11 UFs, composição da coordenação nacional,
edições da Semana do Migrante de 2023 a 2026, endereço e contatos) vieram de fontes públicas do
próprio SPM, da CNBB e da CEPAST. Cada informação e sua origem estão em
[`docs/FONTES.md`](docs/FONTES.md), junto com o que **não** foi possível confirmar.

Conteúdo marcado como demonstração (testemunhos e editais) está sinalizado no próprio banco e deve
ser substituído antes de publicar.
