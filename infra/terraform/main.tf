# =========================================================
# SPM Nacional — infraestrutura no Google Cloud
#
# Desenho geral:
#
#   GitHub Actions ──(OIDC, sem chave JSON)──> Workload Identity Federation
#         │
#         ├── push da imagem ──> Artifact Registry
#         ├── executa o job  ──> Cloud Run Job (prisma migrate deploy)
#         └── novo revision  ──> Cloud Run Service (site + painel)
#                                     │
#                                     ├── socket /cloudsql ──> Cloud SQL (Postgres 17)
#                                     ├── Secret Manager (segredos da aplicação)
#                                     └── Cloud Storage (uploads)
#
#   Cloud Scheduler ──(header com CRON_SECRET)──> /api/cron/agenda
#                                            └──> /api/cron/retencao
#
# Princípio de custo: tudo que consegue escalar a zero escala a zero. O único
# item que cobra 24 horas por dia é o Cloud SQL — ver a tabela em
# infra/README.md e a alternativa de Postgres serverless registrada lá.
#
# NADA aqui é aplicado automaticamente. Este diretório existe para que o
# `terraform apply` seja uma decisão da organização, não um efeito colateral.
# =========================================================

# ---------------------------------------------------------
# Valores derivados
# ---------------------------------------------------------

locals {
  service_name = "${var.name_prefix}-site"
  job_name     = "${var.name_prefix}-migrate"
  repo_id      = "${var.name_prefix}-docker"
  bucket_name  = "${var.project_id}-uploads"

  repo_url       = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repo_id}"
  app_image      = "${local.repo_url}/${var.name_prefix}-site:${var.image_tag}"
  migrator_image = "${local.repo_url}/${var.name_prefix}-migrate:${var.image_tag}"

  # Ovo e galinha: o Cloud Run recusa criar um serviço apontando para imagem
  # inexistente, e o registro só passa a ter imagem depois do primeiro
  # deploy. A imagem de exemplo resolve a criação; o pipeline troca depois.
  app_image_inicial      = var.use_bootstrap_image ? var.bootstrap_image : local.app_image
  migrator_image_inicial = var.use_bootstrap_image ? var.bootstrap_image : local.migrator_image

  # Enquanto não houver domínio apontado, fica vazio e a aplicação responde
  # pela URL gerada pelo Cloud Run. Links de e-mail e o redirect do OAuth
  # exigem este valor — preencher `app_domain` antes de divulgar o site.
  app_url = var.app_domain != "" ? "https://${var.app_domain}" : ""

  # A conexão sai pelo socket do Cloud SQL montado pelo próprio Cloud Run:
  # não passa pela internet e não exige VPC connector (que custaria mais que
  # o banco). A senha é gerada sem caracteres especiais de propósito, para
  # não precisar de escape dentro da URL.
  database_url = join("", [
    "postgresql://${var.db_user}:${random_password.db.result}@localhost/${var.db_name}",
    "?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}",
    "&schema=public",
  ])

  # Segredos gerados pelo terraform (ficam no estado — por isso o backend
  # remoto com acesso restrito descrito em versions.tf).
  secrets_gerados = {
    DATABASE_URL   = local.database_url
    AUTH_SECRET    = random_bytes.auth_secret.base64
    ENCRYPTION_KEY = random_bytes.encryption_key.base64
    CRON_SECRET    = random_password.cron_secret.result
  }

  # Segredos que vêm de fora (Google, provedor de e-mail). O terraform cria o
  # cofre com um valor de espera; quem tiver a credencial adiciona a versão
  # real depois, sem passar por aqui.
  secrets_externos = [
    "SMTP_PASSWORD",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_CALENDAR_API_KEY",
  ]

  secret_names = concat(keys(local.secrets_gerados), local.secrets_externos)

  # Variáveis de ambiente em texto claro do Cloud Run.
  env_vars = merge(
    {
      NEXT_TELEMETRY_DISABLED = "1"
      STORAGE_DRIVER          = "gcs"
      GCS_BUCKET              = google_storage_bucket.uploads.name
      SEED_ADMIN_EMAIL        = var.seed_admin_email
    },
    # NEXT_PUBLIC_* só entra no bundle do cliente em tempo de build; hoje
    # nenhum componente cliente lê esta variável, ela fica aqui para o
    # servidor e para quem for gerar sitemap/metadados.
    local.app_url != "" ? {
      APP_URL              = local.app_url
      NEXT_PUBLIC_SITE_URL = local.app_url
    } : {},
    var.enable_smtp ? {
      SMTP_HOST      = var.smtp_host
      SMTP_PORT      = tostring(var.smtp_port)
      SMTP_SECURE    = var.smtp_port == 465 ? "true" : "false"
      SMTP_USER      = var.smtp_user
      MAIL_FROM      = var.mail_from
      MAIL_NOTIFY_TO = var.mail_notify_to
    } : {},
    var.enable_google_oauth ? {
      GOOGLE_OAUTH_ALLOWED_DOMAIN = var.google_oauth_allowed_domain
    } : {},
    var.enable_google_calendar ? {
      GOOGLE_CALENDAR_ID = var.google_calendar_id
    } : {},
  )

  # Variáveis de ambiente lidas do Secret Manager. Uma integração desligada
  # não recebe o segredo: assim um valor de espera não liga funcionalidade
  # quebrada (lib/server/env.ts decide pela presença do valor).
  # O nome da variável e o nome lógico do segredo são o mesmo — daí um
  # conjunto simples, e não um mapa.
  secret_env = toset(concat(
    ["DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY", "CRON_SECRET"],
    var.enable_smtp ? ["SMTP_PASSWORD"] : [],
    var.enable_google_oauth ? ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"] : [],
    var.enable_google_calendar ? ["GOOGLE_CALENDAR_API_KEY"] : [],
  ))
}

# ---------------------------------------------------------
# 1. APIs
#
# Habilitar API não custa nada; o que custa é o recurso criado nela. Ficam
# ligadas mesmo após um `terraform destroy` (`disable_on_destroy = false`)
# para não derrubar outra coisa que use a mesma API no projeto.
# ---------------------------------------------------------

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudscheduler.googleapis.com",
    "storage.googleapis.com",
    "logging.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    # Necessária para a chave de API da agenda funcionar.
    "calendar-json.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------
# 2. Artifact Registry
#
# Um repositório Docker regional. O armazenamento é cobrado por GB
# (US$ 0,10/GB-mês acima do 0,5 GB gratuito), então as políticas de limpeza
# não são zelo estético: sem elas o repositório cresce a cada deploy.
# ---------------------------------------------------------

resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = local.repo_id
  description   = "Imagens do site e do job de migração do SPM Nacional."
  format        = "DOCKER"
  labels        = var.labels

  docker_config {
    immutable_tags = false
  }

  # Guarda as 10 imagens mais recentes de cada tag.
  cleanup_policies {
    id     = "manter-recentes"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }

  # Apaga o que passou de 30 dias e não foi mantido pela regra acima
  # (políticas KEEP têm precedência sobre DELETE).
  cleanup_policies {
    id     = "apagar-antigas"
    action = "DELETE"

    condition {
      older_than = "2592000s"
      tag_state  = "ANY"
    }
  }

  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------
# 3. Cloud SQL — PostgreSQL 17
#
# É o item fixo mais caro: não tem nível gratuito e não escala a zero.
# `db-f1-micro` em São Paulo ≈ US$ 11,53/mês + 10 GB SSD ≈ US$ 2,55/mês.
#
# Alta disponibilidade (REGIONAL) dobraria a conta e não se justifica para um
# site institucional: a perda tolerável é a janela entre backups, não segundos
# de indisponibilidade.
# ---------------------------------------------------------

resource "random_password" "db" {
  length = 32
  # Sem caracteres especiais: a senha entra numa URL de conexão e escape
  # errado em connection string é fonte clássica de falha em produção.
  special = false
}

resource "google_sql_database_instance" "postgres" {
  name             = "${var.name_prefix}-postgres"
  database_version = "POSTGRES_17"
  region           = var.region

  # Trava de segurança no plano do terraform. O nome de uma instância
  # excluída fica reservado por ~1 semana, então recriar não é trivial —
  # e o dado aqui é irrecuperável se não houver backup.
  deletion_protection = true

  settings {
    tier    = var.db_tier
    edition = "ENTERPRISE"

    # Zonal: uma zona só. Ver comentário do bloco.
    availability_type = "ZONAL"

    disk_type             = "PD_SSD"
    disk_size             = var.db_disk_size_gb
    disk_autoresize       = true
    disk_autoresize_limit = 50

    # Mesma trava, agora do lado da API do Cloud SQL.
    deletion_protection_enabled = true

    user_labels = var.labels

    backup_configuration {
      enabled    = true
      start_time = var.db_backup_start_time
      location   = var.region
      # PITR exige arquivamento de WAL e mais disco; num banco desta
      # ordem de grandeza o backup diário já cobre o risco real.
      point_in_time_recovery_enabled = false

      backup_retention_settings {
        retained_backups = var.db_retained_backups
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      # IP público habilitado, mas SEM rede autorizada: ninguém alcança a
      # instância pela internet. O Cloud Run entra pelo conector do Cloud
      # SQL (socket em /cloudsql), autenticado por IAM. A alternativa —
      # IP privado — exigiria VPC + Serverless VPC Access, que custa mais
      # que o próprio banco.
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    maintenance_window {
      day          = 7 # domingo
      hour         = 6 # 03:00 em Brasília
      update_track = "stable"
    }

    # Query Insights ficaria bem aqui, mas o Cloud SQL não o oferece em
    # máquina de núcleo compartilhado (`db-f1-micro`, o padrão deste
    # projeto): a API recusa o `insights_config` e o apply falha. Se um dia
    # a instância crescer para `db-custom-*`, vale ligar:
    #
    #     insights_config {
    #         query_insights_enabled  = true
    #         query_string_length     = 1024
    #         record_application_tags = false
    #         record_client_address   = false
    #     }
  }

  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.postgres.name
  password = random_password.db.result
}

# ---------------------------------------------------------
# 4. Secret Manager
#
# Replicação gerenciada por nós, fixada em São Paulo: segredo que protege dado
# pessoal de migrante não sai do Brasil sem decisão explícita.
#
# Cobrança: US$ 0,06 por segredo ativo/mês + US$ 0,03 por 10.000 acessos.
# Com 8 segredos, isso é menos de US$ 0,50/mês.
# ---------------------------------------------------------

resource "random_bytes" "auth_secret" {
  length = 48
}

resource "random_bytes" "encryption_key" {
  # Exatamente 32 bytes: é o tamanho da chave AES-256-GCM que cifra os dados
  # pessoais do módulo de atendimentos (lib/server/crypto.ts). Perder esta
  # chave torna os registros cifrados irrecuperáveis.
  length = 32
}

resource "random_password" "cron_secret" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "app" {
  for_each  = toset(local.secret_names)
  secret_id = "${var.name_prefix}-${lower(replace(each.value, "_", "-"))}"
  labels    = var.labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "gerados" {
  for_each    = local.secrets_gerados
  secret      = google_secret_manager_secret.app[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_version" "espera" {
  for_each    = toset(local.secrets_externos)
  secret      = google_secret_manager_secret.app[each.value].id
  secret_data = "preencher-no-secret-manager"

  lifecycle {
    # A versão real é adicionada fora do terraform (`gcloud secrets
    # versions add`). Sem isto, cada apply tentaria reescrever o valor de
    # espera por cima do que a organização configurou.
    ignore_changes = [secret_data]
  }
}

# ---------------------------------------------------------
# 5. Cloud Storage — uploads
#
# Standard regional em São Paulo: US$ 0,020/GB-mês. Com alguns GB de imagens e
# PDFs, o custo é de centavos.
# ---------------------------------------------------------

resource "google_storage_bucket" "uploads" {
  name     = local.bucket_name
  location = var.region
  labels   = var.labels

  # ACL por objeto é uma fonte silenciosa de vazamento; com acesso uniforme,
  # quem pode ler é decidido só pelo IAM do bucket.
  uniform_bucket_level_access = true

  # O bucket guarda conteúdo administrado e jamais aceita concessão pública.
  # A aplicação autenticada acessa os objetos pela conta de serviço do runtime.
  public_access_prevention = "enforced"

  # Trava contra exclusão acidental de um bucket com conteúdo dentro.
  force_destroy = false

  versioning {
    enabled = true
  }

  # Apaga versões antigas depois do prazo configurado.
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = var.uploads_noncurrent_retention_days
    }
    action {
      type = "Delete"
    }
  }

  # Mesmo dentro do prazo, guarda no máximo 3 gerações de cada arquivo.
  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  # Upload interrompido vira lixo cobrado; some sozinho em 7 dias.
  lifecycle_rule {
    condition {
      age = 7
    }
    action {
      type = "AbortIncompleteMultipartUpload"
    }
  }

  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------
# 6. Contas de serviço
#
# Três identidades, cada uma com o mínimo do seu papel. Nenhuma delas tem
# chave JSON: a aplicação usa a identidade anexada ao Cloud Run e o GitHub
# usa federação OIDC.
# ---------------------------------------------------------

# 6.1 — Identidade da aplicação em execução.
resource "google_service_account" "runtime" {
  account_id   = "${var.name_prefix}-run"
  display_name = "SPM Nacional — aplicação (Cloud Run)"
  description  = "Executa o site e o painel. Lê segredos, fala com o Cloud SQL e grava uploads."
  depends_on   = [google_project_service.apis]
}

# 6.2 — Identidade do job de migração. Separada da aplicação porque altera o
# esquema do banco: se a aplicação for comprometida, ela não pode migrar nada.
resource "google_service_account" "migrator" {
  account_id   = "${var.name_prefix}-migrate"
  display_name = "SPM Nacional — migrações (Cloud Run Job)"
  description  = "Roda `prisma migrate deploy`. Só enxerga o DATABASE_URL."
  depends_on   = [google_project_service.apis]
}

# 6.3 — Identidade que o GitHub Actions assume por federação.
resource "google_service_account" "deployer" {
  account_id   = "${var.name_prefix}-deploy"
  display_name = "SPM Nacional — deploy (GitHub Actions)"
  description  = "Publica imagem, executa a migração e cria revisões do Cloud Run."
  depends_on   = [google_project_service.apis]
}

# --- Papéis da aplicação ---

# `cloudsql.client` só existe em escopo de projeto; dá permissão de conectar,
# não de administrar a instância.
resource "google_project_iam_member" "runtime_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Acesso a segredo concedido segredo a segredo — nunca no projeto inteiro.
resource "google_secret_manager_secret_iam_member" "runtime_secrets" {
  for_each  = toset(local.secret_names)
  secret_id = google_secret_manager_secret.app[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# Escrita restrita a este bucket. `objectAdmin` cobre enviar e apagar arquivo
# (lib/server/storage.ts), sem poder mexer na configuração do bucket.
resource "google_storage_bucket_iam_member" "runtime_uploads" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

# Sem `logWriter` a identidade personalizada não consegue gravar no Cloud
# Logging, e o que a aplicação escreve em stdout/stderr (inclusive as falhas de
# auditoria e de sincronização da agenda) simplesmente não aparece. Diagnóstico
# de produção depende disso — ver "Operação do dia a dia" no infra/README.md.
resource "google_project_iam_member" "runtime_logs" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# --- Papéis do job de migração ---

resource "google_project_iam_member" "migrator_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migrator.email}"
}

# A saída do `prisma migrate deploy` é a única evidência de o que a migração
# fez; sem log, um deploy que falhou fica sem explicação.
resource "google_project_iam_member" "migrator_logs" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.migrator.email}"
}

resource "google_secret_manager_secret_iam_member" "migrator_database_url" {
  secret_id = google_secret_manager_secret.app["DATABASE_URL"].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migrator.email}"
}

# --- Papéis do deploy ---

# Escrita só neste repositório de imagens.
resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

# Papel mínimo de projeto que o `gcloud` exige para usar o projeto como cota
# nas chamadas de API. Sem ele, o deploy falha com "caller does not have
# permission to use project" mesmo tendo permissão em cada recurso.
resource "google_project_iam_member" "deployer_service_usage" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# `run.developer` no recurso, não no projeto: o pipeline atualiza este serviço
# e executa este job, e nada mais.
resource "google_cloud_run_v2_service_iam_member" "deployer_service" {
  project  = var.project_id
  location = google_cloud_run_v2_service.site.location
  name     = google_cloud_run_v2_service.site.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_cloud_run_v2_job_iam_member" "deployer_job" {
  project  = var.project_id
  location = google_cloud_run_v2_job.migrate.location
  name     = google_cloud_run_v2_job.migrate.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

# Para implantar um serviço que roda como outra identidade, o deploy precisa
# poder "usar" essa identidade — mas só essas duas.
resource "google_service_account_iam_member" "deployer_usa_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_usa_migrator" {
  service_account_id = google_service_account.migrator.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# ---------------------------------------------------------
# 7. Cloud Run — site e painel
#
# Nível gratuito mensal: 180.000 vCPU-s, 360.000 GiB-s e 2 milhões de
# requisições. Ele é aplicado como desconto calculado com o preço do Tier 1, e
# São Paulo é Tier 2 — ou seja, cobre a maior parte do consumo de um site
# institucional, mas não exatamente 100% dele.
#
# `min_instance_count = 0` significa cold start de alguns segundos na primeira
# visita depois de um período parado. É o preço de não pagar instância ociosa;
# para o volume desta organização, é o trade-off certo.
# ---------------------------------------------------------

resource "google_cloud_run_v2_service" "site" {
  name        = local.service_name
  location    = var.region
  description = "Site institucional e painel administrativo do SPM Nacional."
  labels      = var.labels
  ingress     = "INGRESS_TRAFFIC_ALL"

  # O serviço é descartável: o que não pode ser perdido é o banco e o bucket,
  # e esses estão protegidos. Manter false evita ter que editar o terraform
  # para desfazer um ambiente de teste.
  deletion_protection = false

  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = var.request_concurrency
    timeout                          = "60s"

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }

    # Conector do Cloud SQL: o Cloud Run monta o socket e cuida do TLS e da
    # autenticação IAM. Sem senha trafegando pela internet, sem VPC.
    volumes {
      name = "cloudsql"

      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }

    containers {
      image = local.app_image_inicial

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }

        # CPU só é cobrada durante a requisição.
        cpu_idle = true
        # Turbina o cold start do Next.js sem custo adicional relevante.
        startup_cpu_boost = true
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      dynamic "env" {
        for_each = local.env_vars

        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.secret_env

        content {
          name = env.value

          value_source {
            secret_key_ref {
              secret = google_secret_manager_secret.app[env.value].secret_id
              # "latest" faz a troca de um segredo valer na
              # próxima instância, sem novo deploy.
              version = "latest"
            }
          }
        }
      }

      # Sonda TCP, e não HTTP em /api/health: aquela rota responde 503
      # quando o banco não responde, e sonda de inicialização que depende
      # do banco transforma manutenção do Cloud SQL em deploy travado.
      # Para "está de pé?" o socket basta; a saúde do banco é assunto de
      # monitoramento, não de inicialização.
      startup_probe {
        tcp_socket {
          port = 3000
        }

        initial_delay_seconds = 5
        timeout_seconds       = 3
        period_seconds        = 5
        failure_threshold     = 6
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    # A imagem em produção é decidida pelo GitHub Actions. Sem isto, um
    # `terraform apply` faria rollback silencioso para a tag do plano.
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.gerados,
    google_secret_manager_secret_iam_member.runtime_secrets,
  ]
}

# O site é público. O painel é protegido pela sessão da própria aplicação
# (cookie httpOnly + registro no banco), não pelo IAM do Cloud Run.
resource "google_cloud_run_v2_service_iam_member" "publico" {
  project  = var.project_id
  location = google_cloud_run_v2_service.site.location
  name     = google_cloud_run_v2_service.site.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------------------------------------------------------
# 8. Cloud Run Job — migrações
#
# Usa o estágio `migrator` do Dockerfile, que carrega só o Prisma, o schema e
# as migrações. Rodar migração como job (e não na subida do contêiner) evita
# duas instâncias migrando ao mesmo tempo durante um deploy.
#
# Job parado não custa nada: cobra-se apenas o tempo de execução.
# ---------------------------------------------------------

resource "google_cloud_run_v2_job" "migrate" {
  name     = local.job_name
  location = var.region
  labels   = var.labels

  deletion_protection = false

  template {
    # Uma tarefa, sem paralelismo: migração de esquema não é idempotente
    # em paralelo.
    task_count = 1

    template {
      service_account = google_service_account.migrator.email
      max_retries     = 1
      timeout         = "900s"

      volumes {
        name = "cloudsql"

        cloud_sql_instance {
          instances = [google_sql_database_instance.postgres.connection_name]
        }
      }

      containers {
        image = local.migrator_image_inicial

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }

        env {
          name = "DATABASE_URL"

          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app["DATABASE_URL"].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.gerados,
    google_secret_manager_secret_iam_member.migrator_database_url,
  ]
}

# ---------------------------------------------------------
# 9. Cloud Scheduler — rotinas periódicas
#
# Três jobs por conta de faturamento são gratuitos; usamos dois. A retenção é
# obrigatória e diária. A agenda só é criada quando a integração com o Calendar
# está ligada: sem ela a rota devolveria zeros e só geraria ruído no log.
# ---------------------------------------------------------

resource "google_cloud_scheduler_job" "retencao" {
  name        = "${var.name_prefix}-data-retention"
  region      = var.region
  description = "Executa o expurgo diário de dados pessoais conforme a política de retenção."
  schedule    = var.data_retention_schedule
  time_zone   = "America/Sao_Paulo"

  attempt_deadline = "320s"

  retry_config {
    retry_count          = 2
    min_backoff_duration = "30s"
    max_backoff_duration = "300s"
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.site.uri}/api/cron/retencao"

    headers = {
      # Mesmo segredo operacional forte injetado no Cloud Run. O cabeçalho
      # próprio evita conflito com os tokens reservados pelo Scheduler.
      "X-Cron-Secret" = random_password.cron_secret.result
      "Content-Type"  = "application/json"
    }

    body = base64encode("{}")
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_scheduler_job" "agenda" {
  count = var.enable_google_calendar ? 1 : 0

  name        = "${var.name_prefix}-agenda-sync"
  region      = var.region
  description = "Sincroniza a agenda pública com o Google Calendar."
  schedule    = var.agenda_sync_schedule
  time_zone   = "America/Sao_Paulo"

  attempt_deadline = "320s"

  retry_config {
    retry_count          = 2
    min_backoff_duration = "30s"
    max_backoff_duration = "300s"
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.site.uri}/api/cron/agenda"

    headers = {
      # O serviço é público, então a rota se protege pelo segredo
      # compartilhado. Usamos o cabeçalho próprio em vez de
      # `Authorization` porque o Cloud Scheduler reserva esse último para
      # os tokens OIDC/OAuth que ele mesmo injeta — a rota aceita os dois
      # formatos (ver app/api/cron/agenda/route.ts).
      "X-Cron-Secret" = random_password.cron_secret.result
      "Content-Type"  = "application/json"
    }

    body = base64encode("{}")
  }

  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------
# 10. Workload Identity Federation — GitHub Actions
#
# Substitui a chave JSON de conta de serviço. O GitHub apresenta um token OIDC
# de vida curta, o Google valida a origem e devolve credencial temporária.
# Não há segredo de longa duração para vazar, e revogar é apagar o binding.
# ---------------------------------------------------------

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${var.name_prefix}-github"
  display_name              = "GitHub Actions"
  description               = "Identidades federadas do pipeline de deploy."

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
  }

  # Sem esta condição, QUALQUER workflow do GitHub no mundo poderia pedir
  # token para este provider. Ela é o perímetro de segurança da federação:
  # repositório exato e branch exata.
  attribute_condition = join(" && ", [
    "assertion.repository == \"${var.github_repository}\"",
    "assertion.ref == \"refs/heads/${var.github_deploy_branch}\"",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_deploy" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
