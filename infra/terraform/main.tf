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
# Custos, disponibilidade e retenção devem ser aprovados antes da criação.
# Consulte infra/OPERACAO-PRODUCAO.md; não existe promessa de custo fixo.
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
  app_url = var.app_url_override != "" ? var.app_url_override : (var.app_domain != "" ? "https://${var.app_domain}" : "")

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
    "RUNTIME_DATABASE_URL",
    "SMTP_PASSWORD",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_CALENDAR_API_KEY",
  ]

  secret_names = concat(keys(local.secrets_gerados), local.secrets_externos)

  # Variáveis de ambiente em texto claro do Cloud Run.
  env_vars = merge(
    {
      NEXT_TELEMETRY_DISABLED           = "1"
      DEPLOYMENT_TARGET                 = "gcp"
      DB_POOL_MAX                       = tostring(var.db_pool_max)
      STORAGE_DRIVER                    = "gcs"
      GCS_BUCKET                        = google_storage_bucket.uploads.name
      SEED_ADMIN_EMAIL                  = var.seed_admin_email
      GOOGLE_WORKSPACE_MFA_ENFORCED     = tostring(var.google_workspace_mfa_enforced)
      TRANSLATION_ENABLED               = tostring(var.enable_translation)
      ANALYTICS_ENABLED                 = tostring(var.enable_analytics)
      GA_MEASUREMENT_ID                 = var.ga_measurement_id
      GA_ENHANCED_MEASUREMENT_DISABLED  = tostring(var.ga_enhanced_measurement_disabled)
      GOOGLE_CLOUD_PROJECT              = var.project_id
      TRANSLATION_LOCATION              = var.translation_location
      TRANSLATION_DAILY_CHARACTER_LIMIT = tostring(var.translation_daily_character_limit)
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
  for_each = toset(concat([
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
  ], var.enable_translation ? ["translate.googleapis.com"] : []))

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------
# 2. Artifact Registry
#
# Repositório regional com limpeza de versões antigas e tags de release imutáveis.
# ---------------------------------------------------------

resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = local.repo_id
  description   = "Imagens do site e do job de migração do SPM Nacional."
  format        = "DOCKER"
  labels        = var.labels

  docker_config {
    immutable_tags = true
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
# Disponibilidade (zonal/regional) e capacidade dependem dos requisitos aprovados.
# PITR e backup são habilitados, mas restauração precisa ser ensaiada.
# ---------------------------------------------------------

resource "random_password" "db" {
  length = 32
  # Sem caracteres especiais: a senha entra numa URL de conexão e escape
  # errado em connection string é fonte clássica de falha em produção.
  special = false
}

resource "google_sql_database_instance" "postgres" {
  name             = "${var.name_prefix}-postgres"
  database_version = "POSTGRES_18"
  region           = var.region

  # Trava de segurança no plano do terraform. O nome de uma instância
  # excluída fica reservado por ~1 semana, então recriar não é trivial —
  # e o dado aqui é irrecuperável se não houver backup.
  deletion_protection = true

  settings {
    tier    = var.db_tier
    edition = "ENTERPRISE"

    # Zonal: uma zona só. Ver comentário do bloco.
    availability_type = var.db_availability_type

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
      # PITR reduz a janela de perda entre backups; há custo de retenção dos logs.
      point_in_time_recovery_enabled = var.db_pitr_enabled
      transaction_log_retention_days = var.db_pitr_enabled ? 7 : null

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
# Objetos privados, versionados e com exclusão recuperável por prazo definido.
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

  soft_delete_policy {
    retention_duration_seconds = 604800
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

# 6.2 — Migração usa o proprietário SQL. Runtime recebe segredo/usuário distinto
# após provisionamento aprovado de infra/sql/provision-runtime-role.sql.
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

# Somente tradução síncrona NMT: sem papéis de admin, batch, datasets ou glossários.
# API e permissões ficam ausentes enquanto a integração estiver desligada.
resource "google_project_iam_custom_role" "runtime_translation" {
  count       = var.enable_translation ? 1 : 0
  project     = var.project_id
  role_id     = "${replace(var.name_prefix, "-", "_")}_translate_text"
  title       = "SPM public text translation"
  description = "Tradução de conteúdo público pelo runtime; sem administração de modelos."
  permissions = ["cloudtranslate.generalModels.predict", "serviceusage.services.use"]
  depends_on  = [google_project_service.apis]
}

resource "google_project_iam_member" "runtime_translation" {
  count   = var.enable_translation ? 1 : 0
  project = var.project_id
  role    = google_project_iam_custom_role.runtime_translation[0].name
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Acesso a segredo concedido segredo a segredo — nunca no projeto inteiro.
resource "google_secret_manager_secret_iam_member" "runtime_secrets" {
  # O runtime não recebe a credencial DDL do migrador.
  for_each  = setunion(setsubtract(local.secret_env, toset(["DATABASE_URL"])), toset(["RUNTIME_DATABASE_URL"]))
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

# Permite chamadas explícitas à Logging API. Captura de stdout/stderr do Cloud
# Run é gerenciada pela plataforma e não depende deste papel no runtime.
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
# Escala a zero envolve cold start; medir latência antes de escolher min_instances.
# Nenhuma configuração de escala substitui orçamento/alertas de faturamento.
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
    # Notificações usam lote de 120s e podem concluir um SMTP já iniciado.
    timeout = "185s"

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
        # CPU extra na inicialização; medir latência e custo no ambiente real.
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
              secret = google_secret_manager_secret.app[env.value == "DATABASE_URL" ? "RUNTIME_DATABASE_URL" : env.value].secret_id
              # Versões fixas evitam instâncias da mesma revisão usando segredos diferentes.
              version = env.value == "DATABASE_URL" ? lookup(var.external_secret_versions, "RUNTIME_DATABASE_URL", "1") : (contains(keys(local.secrets_gerados), env.value) ? google_secret_manager_secret_version.gerados[env.value].version : lookup(var.external_secret_versions, env.value, "1"))
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
        failure_threshold     = 24
      }

      # Bootstrap não contém estas rotas; o pipeline ativa a sonda ao publicar a app.
      dynamic "liveness_probe" {
        for_each = var.use_bootstrap_image ? [] : [1]
        content {
          http_get {
            path = "/api/health/live"
            port = 3000
          }
          timeout_seconds   = 5
          period_seconds    = 30
          failure_threshold = 3
        }
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
      template[0].containers[0].liveness_probe,
      # O pipeline controla promoção/rollback; apply não pode promover latest.
      traffic,
      client,
      client_version,
    ]
    precondition {
      condition     = !var.enable_analytics || (var.ga_measurement_id != "" && var.ga_enhanced_measurement_disabled)
      error_message = "Analytics ativado exige um ID GA4 real."
    }
    precondition {
      condition     = var.use_bootstrap_image || local.app_url != ""
      error_message = "Defina app_domain ou app_url_override HTTPS antes do deploy real."
    }
    precondition {
      condition     = var.use_bootstrap_image || (var.enable_google_oauth && var.google_workspace_mfa_enforced && var.google_oauth_allowed_domain != "")
      error_message = "Produção exige login Workspace configurado e confirmação operacional de 2FA obrigatório na organização. A variável não comprova MFA no token."
    }
    precondition {
      condition     = var.use_bootstrap_image || try(tonumber(var.external_secret_versions["RUNTIME_DATABASE_URL"]) > 1, false)
      error_message = "Provisione usuário SQL sem DDL e fixe RUNTIME_DATABASE_URL > 1 antes de produção."
    }
    precondition {
      condition     = alltrue([for name in setsubtract(local.secret_env, toset(keys(local.secrets_gerados))) : try(tonumber(var.external_secret_versions[name]) > 1, false)])
      error_message = "Integrações ligadas exigem external_secret_versions > 1; versão 1 é placeholder."
    }
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
      max_retries     = 0
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
              version = google_secret_manager_secret_version.gerados["DATABASE_URL"].version
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
# A retenção é obrigatória e diária. Agenda e notificações só são criadas
# quando as respectivas integrações estão habilitadas.
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

resource "google_cloud_scheduler_job" "notificacoes" {
  count = var.enable_smtp ? 1 : 0

  name        = "${var.name_prefix}-notification-email"
  region      = var.region
  description = "Processa as filas duráveis de contato, convites e confirmação do boletim."
  schedule    = "*/5 * * * *"
  time_zone   = "America/Sao_Paulo"

  # Maior que o timeout HTTP de 185s do serviço; menor que o intervalo de 5min.
  attempt_deadline = "200s"

  retry_config {
    retry_count          = 2
    min_backoff_duration = "60s"
    max_backoff_duration = "300s"
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.site.uri}/api/cron/notificacoes"

    headers = {
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
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_owner"    = "assertion.repository_owner"
    "attribute.ref"                 = "assertion.ref"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
  }

  # Sem esta condição, QUALQUER workflow do GitHub no mundo poderia pedir
  # token para este provider. Ela é o perímetro de segurança da federação:
  # repositório exato e branch exata.
  attribute_condition = join(" && ", [
    "assertion.repository == \"${var.github_repository}\"",
    "assertion.repository_id == \"${var.github_repository_id}\"",
    "assertion.repository_owner_id == \"${var.github_repository_owner_id}\"",
    "assertion.ref == \"refs/heads/${var.github_deploy_branch}\"",
    "assertion.sub == \"repo:${var.github_repository}:environment:production\"",
    "assertion.workflow_ref == \"${var.github_repository}/.github/workflows/deploy-gcp.yml@refs/heads/${var.github_deploy_branch}\"",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_deploy" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}
