# Infraestrutura — Google Cloud

Tudo aqui está **pronto para aplicar, mas não aplicado**. Nenhum recurso foi
criado na nuvem: o `terraform apply` é uma decisão da organização, com conta de
faturamento e responsável definidos.

O que este diretório provisiona, todo na região **`southamerica-east1`
(São Paulo)**:

| Recurso                      | Para quê                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Artifact Registry            | Guarda as imagens Docker do site e das migrações               |
| Cloud Run (service)          | Roda o site e o painel; escala a zero                          |
| Cloud Run (job)              | Roda `prisma migrate deploy` a cada deploy                     |
| Cloud SQL PostgreSQL 17      | Banco de dados                                                 |
| Secret Manager               | `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, SMTP e Google |
| Cloud Storage                | Uploads (capas, PDFs de editais, materiais)                    |
| Cloud Scheduler              | Executa a retenção diária e sincroniza a agenda                |
| Workload Identity Federation | Deploy pelo GitHub Actions sem chave JSON                      |

```
GitHub Actions ──(OIDC)──> Workload Identity Federation
      │
      ├── push da imagem ──> Artifact Registry
      ├── executa o job  ──> Cloud Run Job (prisma migrate deploy)
      └── nova revisão   ──> Cloud Run Service
                                  │
                                  ├── socket /cloudsql ──> Cloud SQL
                                  ├── Secret Manager
                                  └── Cloud Storage

Cloud Scheduler ──(X-Cron-Secret)──┬──> /api/cron/retencao
                                   └──> /api/cron/agenda
```

---

## Antes de começar

Você precisa de:

- Uma **conta de faturamento** ativa no Google Cloud.
- `gcloud` instalado e autenticado (`gcloud auth login`).
- `terraform` 1.9 ou mais novo.
- Papel de **Owner** (ou Editor + Security Admin + Project IAM Admin) no
  projeto — o terraform cria contas de serviço e concede papéis.

> Se a organização for aprovada no **Google for Nonprofits**, ela também recebe
> crédito do Google Cloud para organizações sem fins lucrativos. Isso não muda
> nada do que está aqui, só quem paga a conta. Ver `docs/INTEGRACOES-GOOGLE.md`.

---

## Passo 1 — Criar o projeto

```bash
gcloud projects create spm-nacional-prod --name="SPM Nacional"
gcloud billing projects link spm-nacional-prod \
    --billing-account=XXXXXX-XXXXXX-XXXXXX
gcloud config set project spm-nacional-prod
```

Duas APIs precisam existir **antes** do terraform, porque são elas que
permitem ligar as outras:

```bash
gcloud services enable \
    cloudresourcemanager.googleapis.com \
    serviceusage.googleapis.com
```

As demais (Run, Cloud SQL, Secret Manager, Artifact Registry, Scheduler,
Storage, IAM, STS e Calendar) são habilitadas pelo próprio terraform.

---

## Passo 2 — Bucket do estado do terraform

O estado guarda a senha do banco, o `AUTH_SECRET` e a `ENCRYPTION_KEY`. Ele
**não pode** ficar na máquina de ninguém nem no git.

```bash
gcloud storage buckets create gs://spm-tfstate \
    --location=southamerica-east1 \
    --uniform-bucket-level-access \
    --public-access-prevention
gcloud storage buckets update gs://spm-tfstate --versioning
```

Depois, descomente o bloco `backend "gcs"` em `versions.tf`.

---

## Passo 3 — Aplicar o terraform

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# edite: project_id e github_repository são obrigatórios

terraform init
terraform plan -out=plano.tfplan
terraform apply plano.tfplan
```

Leia o plano antes de aplicar. O apply demora **10 a 15 minutos** — a maior
parte é o Cloud SQL sendo criado.

No primeiro apply, deixe `app_domain = ""`. A URL do Cloud Run só existe depois
que o serviço é criado; assim que o domínio estiver mapeado (passo 8),
preencha a variável e rode `terraform apply` de novo.

---

## Passo 4 — Preencher os segredos de espera

O terraform gera sozinho os segredos que são só dele (`DATABASE_URL`,
`AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`). Os que vêm de fora nascem com
um valor de espera:

```bash
terraform output secrets_a_preencher
```

Preencha cada um com uma nova versão:

```bash
printf '%s' 'SENHA-DE-APP-DO-GMAIL' | \
    gcloud secrets versions add spm-smtp-password --data-file=-

printf '%s' 'CLIENT-ID.apps.googleusercontent.com' | \
    gcloud secrets versions add spm-google-oauth-client-id --data-file=-
```

O `printf` (em vez de `echo`) evita gravar um `\n` no fim do segredo — uma
quebra de linha invisível na senha do SMTP é uma tarde perdida.

Só depois de preencher, ligue a integração no `terraform.tfvars`
(`enable_smtp`, `enable_google_oauth`, `enable_google_calendar`) e aplique de
novo. Enquanto estiver desligada, a variável nem chega ao Cloud Run e a
aplicação simplesmente opera sem aquele recurso — é assim que
`lib/server/env.ts` foi escrito.

> **A `ENCRYPTION_KEY` não pode ser perdida nem trocada.** É ela que cifra
> nome e contato nas fichas de atendimento. Trocar a chave torna os registros
> existentes ilegíveis para sempre. Guarde uma cópia em cofre físico ou
> gerenciador de senhas da coordenação, fora do Google Cloud.

---

## Passo 5 — Configurar o GitHub

```bash
terraform output github_actions_config
```

Em **Settings > Secrets and variables > Actions**:

| Onde      | Nome                             | Valor                                 |
| --------- | -------------------------------- | ------------------------------------- |
| Variables | `GCP_PROJECT_ID`                 | ID do projeto                         |
| Variables | `GCP_REGION`                     | `southamerica-east1`                  |
| Variables | `GCP_ARTIFACT_REPO`              | `spm-docker`                          |
| Variables | `GCP_RUN_SERVICE`                | `spm-site`                            |
| Variables | `GCP_RUN_MIGRATE_JOB`            | `spm-migrate`                         |
| Secrets   | `GCP_WORKLOAD_IDENTITY_PROVIDER` | saída do terraform                    |
| Secrets   | `GCP_DEPLOY_SERVICE_ACCOUNT`     | `spm-deploy@…iam.gserviceaccount.com` |

Não existe chave JSON. O GitHub prova quem é por OIDC e o Google devolve uma
credencial de minutos. A federação só aceita **este repositório** e **a branch
`prod`** — é o que está na `attribute_condition` do provider.

---

## Passo 6 — Primeiro deploy

Nesse ponto o Cloud Run já existe, servindo a **imagem pública de exemplo**
(`use_bootstrap_image = true`). Isso é proposital: o Cloud Run recusa criar um
serviço apontando para imagem que ainda não foi publicada, e o registro só
ganha imagem no primeiro deploy. Abrir a URL agora mostra a página "hello" do
Google — é o esperado.

O primeiro deploy substitui as duas imagens. Depois disso, quem decide a
imagem é sempre o pipeline: o terraform ignora esse campo
(`lifecycle.ignore_changes`), justamente para não fazer rollback silencioso a
cada `apply`.

**Opção A — pelo pipeline (recomendada):**

```bash
git checkout -b prod
git push origin prod
```

**Opção B — da sua máquina, se precisar destravar antes:**

```bash
gcloud auth configure-docker southamerica-east1-docker.pkg.dev

BASE=southamerica-east1-docker.pkg.dev/spm-nacional-prod/spm-docker

docker build --target runner   -t "$BASE/spm-site:manual"    .
docker build --target migrator -t "$BASE/spm-migrate:manual" .
docker push "$BASE/spm-site:manual"
docker push "$BASE/spm-migrate:manual"

gcloud run jobs update spm-migrate \
    --region southamerica-east1 --image "$BASE/spm-migrate:manual"
gcloud run jobs execute spm-migrate --region southamerica-east1 --wait

gcloud run deploy spm-site \
    --region southamerica-east1 --image "$BASE/spm-site:manual"
```

---

## Passo 7 — Migrações e carga inicial

As **migrações** rodam sozinhas a cada deploy, no Cloud Run Job. Para rodar
fora de um deploy:

```bash
gcloud run jobs execute spm-migrate --region southamerica-east1 --wait
gcloud run jobs executions list --job spm-migrate --region southamerica-east1
```

O **seed** roda uma única vez e não faz parte do pipeline (ele cria a conta
administrativa e o conteúdo institucional inicial). Use o Cloud SQL Auth
Proxy a partir de uma máquina autorizada:

```bash
# baixe o cloud-sql-proxy em https://github.com/GoogleCloudPlatform/cloud-sql-proxy
./cloud-sql-proxy --port 5433 \
    "$(terraform output -raw sql_instance_connection_name)" &

# A URL guardada no segredo aponta para o socket do Cloud Run (/cloudsql/...),
# que não existe na sua máquina. Leia só para copiar a senha:
gcloud secrets versions access latest --secret=spm-database-url

# e reescreva o host apontando para o proxy local:
export DATABASE_URL="postgresql://spm:<senha>@localhost:5433/spmnacional?schema=public"
export SEED_ADMIN_EMAIL="admin@spmnacional.org.br"
export SEED_ADMIN_PASSWORD="<senha forte, trocada no primeiro acesso>"

npm run db:seed
```

Depois do primeiro acesso, **troque a senha do administrador** e apague a
variável do seu histórico de shell.

---

## Passo 8 — Domínio

Tente primeiro o mapeamento nativo do Cloud Run:

```bash
gcloud beta run domain-mappings create \
    --service spm-site \
    --domain spmnacional.org.br \
    --region southamerica-east1
```

O comando devolve os registros DNS a criar no provedor do domínio. O
certificado TLS é emitido e renovado pelo Google, sem custo.

Se a região não aceitar mapeamento de domínio (é um recurso com
disponibilidade limitada), há dois caminhos:

- **Barato:** colocar o Cloudflare na frente, com um `CNAME` proxiado para a
  URL `*.run.app`. Custa zero e ainda dá cache e proteção contra abuso.
- **Caro:** Application Load Balancer externo (~US$ 18/mês só de regra de
  encaminhamento). Só se justifica se houver várias origens ou Cloud Armor.

Com o domínio no ar, preencha `app_domain` no `terraform.tfvars` e aplique de
novo — é isso que faz o `APP_URL` correto chegar aos links de e-mail e ao
redirect do OAuth.

---

## Passo 9 — OAuth com Google Workspace

1. **APIs e serviços > Tela de consentimento OAuth** — tipo **Interno**
   (só contas do domínio da organização).
2. **Credenciais > Criar credencial > ID do cliente OAuth**, tipo
   _Aplicativo da Web_.
3. Origem autorizada: `https://spmnacional.org.br`.
   URI de redirecionamento: `https://spmnacional.org.br/api/auth/google/callback`.
4. Guarde o Client ID e o Client Secret nos segredos correspondentes
   (passo 4) e ligue `enable_google_oauth = true`.

O parâmetro `hd=<domínio>` restringe o seletor de contas, mas **não é
garantia**: a verificação que vale é a do claim `hd` no `id_token`, feita no
servidor. Detalhes em `docs/INTEGRACOES-GOOGLE.md`.

Para a agenda, crie uma **chave de API restrita à Google Calendar API** e
torne o calendário público. Não há OAuth nem escopo envolvido: `events.list`
aceita autorização opcional em calendário público, e é só isso que
`lib/server/google-calendar.ts` usa (o equivalente em escopo, se um dia a
integração exigir OAuth, seria `calendar.readonly`).

### Rotinas automáticas

O Cloud Scheduler cria sempre o job de retenção, que envia `POST` para
`/api/cron/retencao` diariamente às 04:30 no fuso de São Paulo. O job da agenda
é opcional e só existe com `enable_google_calendar = true`. Ambos usam o mesmo
`CRON_SECRET` forte no cabeçalho `X-Cron-Secret`; as rotas recusam chamadas sem
esse segredo.

---

## Custo mensal estimado

Valores de lista pesquisados em **14/08/2026**, para a região
`southamerica-east1` (São Paulo), sem crédito promocional e sem desconto de
organização sem fins lucrativos.

| Serviço                       | Como é cobrado                    | Estimativa/mês   |
| ----------------------------- | --------------------------------- | ---------------- |
| **Cloud SQL — `db-f1-micro`** | US$ 0,0158/hora, 24×7             | **US$ 11,53**    |
| **Cloud SQL — disco SSD**     | US$ 0,255/GiB-mês, mínimo 10 GB   | **US$ 2,55**     |
| Cloud SQL — backup            | por GB retido                     | ~US$ 0,20        |
| Cloud Run — serviço           | vCPU-s, GiB-s e requisições       | US$ 0 a 3        |
| Cloud Run — job de migração   | segundos de execução por deploy   | ~US$ 0           |
| Artifact Registry             | 0,5 GB grátis, depois US$ 0,10/GB | ~US$ 0,20        |
| Cloud Storage (uploads)       | ~US$ 0,020/GB-mês                 | ~US$ 0,10        |
| Secret Manager                | US$ 0,06 por segredo ativo × 8    | ~US$ 0,48        |
| Cloud Scheduler               | 3 jobs grátis por conta           | US$ 0            |
| Saída de dados (egress)       | por GB servido                    | US$ 0,50 a 2     |
| **Total**                     |                                   | **~US$ 16 a 20** |

Em reais, algo entre **R$ 90 e R$ 115 por mês**, dependendo do câmbio.

### Por que o Cloud Run quase não aparece na conta

O nível gratuito mensal do Cloud Run é de **180.000 vCPU-segundos, 360.000
GiB-segundos e 2 milhões de requisições**. Um site institucional com algumas
centenas de visitas por dia fica bem abaixo disso.

Duas ressalvas honestas:

1. O nível gratuito é aplicado como **desconto calculado com o preço do
   Tier 1**, e **São Paulo é Tier 2** (mais caro). Ou seja, ele cobre a maior
   parte do consumo, mas não exatamente 100% dele — daí a faixa "US$ 0 a 3".
2. `min_instances = 0` significa **cold start**: a primeira visita depois de um
   período parado espera alguns segundos. Manter uma instância sempre quente
   custaria mais que o banco.

### Por que o Cloud SQL é o item caro

**Cloud SQL não tem nível gratuito e não escala a zero.** A instância é cobrada
por hora enquanto existir, mesmo sem ninguém acessando o site. É por isso que
ele sozinho responde por ~85% da conta: **US$ 14 a 15/mês** entre máquina e
disco.

Não há como reduzir dentro do Cloud SQL: `db-f1-micro` já é a menor máquina, e
10 GB já é o disco mínimo cobrado.

### Alternativa: Postgres serverless no começo

Se o orçamento inicial for apertado, dá para começar com um **Postgres
gerenciado serverless** — [Neon](https://neon.tech) ou
[Supabase](https://supabase.com) — que têm plano gratuito e escalam a zero, e
migrar para o Cloud SQL quando o uso justificar.

A migração é barata porque **nos dois casos é PostgreSQL puro**:

- o `schema.prisma` não muda;
- as migrações são as mesmas;
- só o `DATABASE_URL` muda (e no Cloud Run isso é uma nova versão de segredo);
- a passagem é `pg_dump` + `pg_restore`.

O que se perde no começo: a latência é maior (o banco fica fora do Brasil nos
planos gratuitos) e **os dados saem do país** — o que, para o módulo de
atendimentos, precisa de decisão consciente e registro no ROPA
(ver `docs/PRIVACIDADE.md`). Para rodar só o site institucional enquanto o
módulo de atendimentos não entra em produção, é uma escolha defensável.

### Por que São Paulo e não us-central1

`southamerica-east1` custa **cerca de 1,5x** o preço de `us-central1`. Em
valores absolutos, a diferença nesta infraestrutura é de poucos dólares por
mês — e em troca **os dados ficam no Brasil**.

A LGPD não proíbe transferência internacional, mas exige base legal e
salvaguardas específicas para ela. Manter tudo em território nacional é o
caminho de menor atrito de conformidade, e isso pesa mais do que a diferença de
preço num sistema que registra atendimento a pessoas migrantes.

---

## Operação do dia a dia

**Logs da aplicação:**

```bash
gcloud run services logs read spm-site \
    --region southamerica-east1 --limit 100
```

**Voltar para a revisão anterior:**

```bash
gcloud run revisions list --service spm-site --region southamerica-east1
gcloud run services update-traffic spm-site \
    --region southamerica-east1 --to-revisions spm-site-00007-abc=100
```

Rollback de código é imediato; **rollback de migração não existe**. Por isso
toda migração precisa ser compatível com a versão anterior da aplicação
(adicionar coluna, nunca remover; renomear em dois passos).

**Backups do banco:**

```bash
gcloud sql backups list --instance spm-postgres
gcloud sql backups restore <ID> --restore-instance=spm-postgres
```

**Trocar um segredo:** adicione uma nova versão. O Cloud Run lê `latest`, então
a próxima instância já pega o valor novo — sem deploy.

```bash
printf '%s' 'novo-valor' | gcloud secrets versions add spm-smtp-password --data-file=-
```

---

## Desfazer

```bash
terraform destroy
```

O Cloud SQL **não vai ser removido**: `deletion_protection` está ligado nos
dois níveis (terraform e API). Isso é proposital. Para realmente apagar, é
preciso desligar a proteção explicitamente — o que obriga alguém a parar e
pensar antes de destruir o banco.

O bucket de uploads também resiste (`force_destroy = false`) enquanto tiver
arquivo dentro.

---

## Convenções deste diretório

- Indentação de 4 espaços, seguindo o `.editorconfig` do repositório (o
  `terraform fmt` usa 2 — não rode ele aqui sem combinar com o time).
- Comentários em português explicando **por quê**, não o quê.
- `terraform.tfvars` e o estado local estão no `.gitignore` deste diretório;
  o `.terraform.lock.hcl` **deve** ser versionado.
