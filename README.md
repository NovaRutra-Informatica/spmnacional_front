# SPM Nacional — site e painel administrativo

Sistema do **Serviço Pastoral dos Migrantes**, organismo da Pastoral Social da CNBB que, desde 1985,
acolhe, organiza e defende os direitos de migrantes e refugiados no Brasil.

**Next.js 16 · React 19 · TypeScript · SCSS · Prisma 7 · PostgreSQL · Docker**, preparado para rodar
no Google Cloud (Cloud Run + Cloud SQL) e integrado ao Google Workspace da organização.

---

## Começar

```bash
cp .env.example .env      # ajuste o que precisar
npm install
npm run setup             # sobe o Postgres, aplica migrações e carrega os dados
npm run dev
```

Acesse <http://localhost:3000>. O painel fica em `/atendente`.

O `npm run setup` sobe o Postgres em contêiner na porta **55432** do host (porta alta para não
conflitar com outros bancos na máquina) e carrega os dados institucionais reais.

### Docker (aplicação inteira)

```bash
docker compose run --rm migrate    # aplica as migrações
docker compose up -d db web        # sobe banco e aplicação
```

Para mudar as portas do host: `WEB_HOST_PORT=3300 DB_HOST_PORT=55433 docker compose up`.

### Docker (desenvolvimento com hot reload)

```bash
docker compose --profile dev up
```

---

## Scripts

| Comando              | O que faz                                         |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Servidor de desenvolvimento                       |
| `npm run build`      | Build de produção                                 |
| `npm run typecheck`  | Checagem de tipos                                 |
| `npm run format`     | Prettier                                          |
| `npm run setup`      | Banco + migrações + seed, em um comando           |
| `npm run db:studio`  | Prisma Studio (interface visual do banco)         |
| `npm run db:migrate` | Cria e aplica uma migração a partir do schema     |
| `npm run db:reset`   | Recria o banco do zero (apaga tudo) e roda o seed |

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

Login em `/atendente`. A conta inicial vem das variáveis `SEED_ADMIN_*` do `.env`
(por padrão `admin@spmnacional.org.br` / `soufoda` — **troque em produção**).

O painel cobre notícias, biblioteca de mídia, editais, testemunhos, documentos, Semana do Migrante,
agenda, mensagens do site, atendimentos, usuários, perfis e permissões, e configurações.

### Autenticação

Real, não de demonstração:

- Senha em **scrypt** (`node:crypto`, sem dependência externa), com salt por usuário.
- Sessão em banco, com token opaco; o cookie é `httpOnly`, `sameSite=lax` e `secure` em produção.
  No banco guardamos só o HMAC do token, então um vazamento não permite assumir sessões.
- Expiração absoluta de 12 h e inatividade de 30 min.
- Bloqueio de conta por 15 min após 5 tentativas malsucedidas.
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

## Deploy no GCP

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
