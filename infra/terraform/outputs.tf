# =========================================================
# SPM Nacional — saídas
#
# São os valores que alguém precisa copiar para outro lugar: os segredos do
# GitHub, o comando de conexão ao banco, a URL para apontar o domínio.
#
# Nada de senha aqui. O que é sensível fica no Secret Manager; quem tiver
# permissão lê de lá com `gcloud secrets versions access latest`.
# =========================================================

output "cloud_run_url" {
  description = "URL gerada pelo Cloud Run. É para cá que o domínio deve apontar."
  value       = google_cloud_run_v2_service.site.uri
}

output "cloud_run_service" {
  description = "Nome do serviço do Cloud Run (usado no workflow de deploy)."
  value       = google_cloud_run_v2_service.site.name
}

output "cloud_run_job" {
  description = "Nome do job de migração (usado no workflow de deploy)."
  value       = google_cloud_run_v2_job.migrate.name
}

output "region" {
  description = "Região de todos os recursos."
  value       = var.region
}

output "artifact_registry_repo" {
  description = "Caminho do repositório Docker — prefixo das imagens."
  value       = local.repo_url
}

output "app_image" {
  description = "Nome completo da imagem da aplicação."
  value       = local.app_image
}

output "migrator_image" {
  description = "Nome completo da imagem de migração (estágio `migrator` do Dockerfile)."
  value       = local.migrator_image
}

output "sql_instance_connection_name" {
  description = "Identificador da instância no formato projeto:região:instância."
  value       = google_sql_database_instance.postgres.connection_name
}

output "uploads_bucket" {
  description = "Bucket dos uploads (valor de GCS_BUCKET)."
  value       = google_storage_bucket.uploads.name
}

output "runtime_service_account" {
  description = "Conta de serviço da aplicação."
  value       = google_service_account.runtime.email
}

output "migrator_service_account" {
  description = "Conta de serviço do job de migração."
  value       = google_service_account.migrator.email
}

# --- Configuração do GitHub Actions ---

output "deployer_service_account" {
  description = "Vai no segredo GCP_DEPLOY_SERVICE_ACCOUNT do repositório."
  value       = google_service_account.deployer.email
}

output "workload_identity_provider" {
  description = "Vai no segredo GCP_WORKLOAD_IDENTITY_PROVIDER do repositório."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_actions_config" {
  description = <<-EOT
        O que preencher em Settings > Secrets and variables > Actions.

        A separação não é decorativa: o GitHub mascara o valor de um secret em
        todo o log, então nome de projeto e de serviço vão como *variables*,
        para que a saída do deploy continue legível. Os dois valores de
        identidade vão como *secrets*.
    EOT
  value = {
    variables = {
      GCP_PROJECT_ID      = var.project_id
      GCP_REGION          = var.region
      GCP_ARTIFACT_REPO   = google_artifact_registry_repository.docker.repository_id
      GCP_RUN_SERVICE     = google_cloud_run_v2_service.site.name
      GCP_RUN_MIGRATE_JOB = google_cloud_run_v2_job.migrate.name
    }
    secrets = {
      GCP_WORKLOAD_IDENTITY_PROVIDER = google_iam_workload_identity_pool_provider.github.name
      GCP_DEPLOY_SERVICE_ACCOUNT     = google_service_account.deployer.email
    }
  }
}

# --- Secret Manager ---

output "secret_ids" {
  description = "Nome de cada segredo no Secret Manager, por variável de ambiente."
  value       = { for nome in local.secret_names : nome => google_secret_manager_secret.app[nome].secret_id }
}

output "secrets_a_preencher" {
  description = <<-EOT
        Segredos criados com valor de espera. Preencha com
        `gcloud secrets versions add <id> --data-file=-` antes de ligar a
        integração correspondente.
    EOT
  value       = [for nome in local.secrets_externos : google_secret_manager_secret.app[nome].secret_id]
}

output "agenda_scheduler_job" {
  description = "Job do Cloud Scheduler da agenda (nulo quando a integração está desligada)."
  value       = one(google_cloud_scheduler_job.agenda[*].name)
}

# --- Próximos passos ---

output "proximos_passos" {
  description = "Lembrete do que fazer depois do apply (detalhado em infra/README.md)."
  value = join("\n", [
    "1. Publique a primeira imagem: ver infra/README.md, seção 'Primeiro deploy'.",
    "2. Rode a migração: gcloud run jobs execute ${google_cloud_run_v2_job.migrate.name} --region ${var.region} --wait",
    "3. Rode o seed uma única vez, a partir de uma máquina com Cloud SQL Auth Proxy.",
    "4. Aponte ${var.app_domain != "" ? var.app_domain : "o domínio"} para ${google_cloud_run_v2_service.site.uri} e defina app_domain.",
    "5. Preencha os segredos de espera e ligue as integrações (enable_smtp, enable_google_oauth, enable_google_calendar).",
  ])
}
