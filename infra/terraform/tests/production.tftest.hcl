# Apenas providers simulados: nunca cria recursos nem precisa de conta GCP.
mock_provider "google" {}
mock_provider "random" {}

variables {
  project_id                 = "spm-offline-test"
  github_repository          = "spm/example"
  github_repository_id       = "123456789"
  github_repository_owner_id = "987654321"
}

run "production_controls" {
  command = plan
  assert {
    condition     = google_sql_database_instance.postgres.database_version == "POSTGRES_18" && local.env_vars.ANALYTICS_ENABLED == "false" && local.env_vars.GA_MEASUREMENT_ID == ""
    error_message = "SQL deve usar PostgreSQL 18 estável e Analytics deve iniciar desativado."
  }

  assert {
    condition     = google_sql_database_instance.postgres.deletion_protection && google_sql_database_instance.postgres.settings[0].backup_configuration[0].enabled && google_sql_database_instance.postgres.settings[0].backup_configuration[0].point_in_time_recovery_enabled
    error_message = "SQL deve ter proteção de exclusão, backups e PITR por padrão."
  }

  assert {
    condition     = google_storage_bucket.uploads.public_access_prevention == "enforced" && google_storage_bucket.uploads.uniform_bucket_level_access && google_storage_bucket.uploads.versioning[0].enabled
    error_message = "Uploads devem ser privados e versionados."
  }

  assert {
    condition     = google_artifact_registry_repository.docker.docker_config[0].immutable_tags
    error_message = "Tags de release devem ser imutáveis."
  }

  assert {
    condition     = !contains(keys(google_secret_manager_secret_iam_member.runtime_secrets), "DATABASE_URL")
    error_message = "Runtime não deve ler a credencial DDL do migrador."
  }

  assert {
    condition     = strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.repository_id") && strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "environment:production") && strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "deploy-gcp.yml")
    error_message = "Federação exige IDs imutáveis, environment protegido e workflow exato."
  }

  assert {
    condition     = !contains(keys(google_project_service.apis), "translate.googleapis.com") && length(google_project_iam_custom_role.runtime_translation) == 0 && length(google_project_iam_member.runtime_translation) == 0
    error_message = "Tradução não deve habilitar API ou IAM sem aprovação explícita."
  }

  assert {
    condition     = local.env_vars.TRANSLATION_ENABLED == "false" && local.env_vars.GOOGLE_WORKSPACE_MFA_ENFORCED == "false" && var.request_concurrency == 16
    error_message = "Configuração inicial não pode declarar integrações/MFA prontas; concorrência HTTP inicial é conservadora."
  }

  assert {
    condition     = length(google_cloud_scheduler_job.notificacoes) == 0 && !contains(keys(local.env_vars), "SMTP_HOST") && !contains(local.secret_env, "SMTP_PASSWORD")
    error_message = "SMTP desligado não deve criar agendamento, configuração ou acesso à senha do provedor."
  }
}

run "notification_worker_schedule" {
  command = plan
  override_resource {
    target          = google_cloud_run_v2_service.site
    override_during = plan
    values = {
      uri = "https://notification-worker.example.test"
    }
  }
  override_resource {
    target          = random_password.cron_secret
    override_during = plan
    values = {
      result = "synthetic-cron-fixture-not-a-credential"
    }
  }
  variables {
    enable_smtp = true
    external_secret_versions = {
      SMTP_PASSWORD = "2"
    }
  }

  assert {
    condition     = length(google_cloud_scheduler_job.notificacoes) == 1 && google_cloud_scheduler_job.notificacoes[0].schedule == "*/5 * * * *" && google_cloud_scheduler_job.notificacoes[0].time_zone == "America/Sao_Paulo"
    error_message = "SMTP habilitado precisa de um worker de notificações a cada cinco minutos, em Brasília."
  }

  assert {
    condition     = google_cloud_scheduler_job.notificacoes[0].http_target[0].http_method == "POST" && google_cloud_scheduler_job.notificacoes[0].http_target[0].uri == "${google_cloud_run_v2_service.site.uri}/api/cron/notificacoes" && google_cloud_scheduler_job.notificacoes[0].http_target[0].headers["X-Cron-Secret"] == random_password.cron_secret.result && google_cloud_scheduler_job.notificacoes[0].http_target[0].body == base64encode("{}")
    error_message = "O worker deve chamar somente a rota de notificações do serviço, por POST com o segredo cron existente."
  }

  assert {
    condition     = google_cloud_run_v2_service.site.template[0].timeout == "185s" && google_cloud_scheduler_job.notificacoes[0].attempt_deadline == "200s" && google_cloud_scheduler_job.notificacoes[0].retry_config[0].retry_count == 2
    error_message = "Serviço/deadline devem acomodar o lote SMTP, com retentativas limitadas."
  }
}

run "reject_analytics_without_measurement_id" {
  command = plan
  variables {
    enable_analytics = true
  }
  expect_failures = [google_cloud_run_v2_service.site]
}

run "reject_smtp_placeholder_secret" {
  command = plan
  variables {
    enable_smtp = true
    external_secret_versions = {
      SMTP_PASSWORD = "1"
    }
  }
  expect_failures = [google_cloud_run_v2_service.site]
}

run "analytics_optional_config" {
  command = plan
  variables {
    enable_analytics                 = true
    ga_measurement_id                = "G-TEST123456"
    ga_enhanced_measurement_disabled = true
  }
  assert {
    condition     = local.env_vars.ANALYTICS_ENABLED == "true" && local.env_vars.GA_MEASUREMENT_ID == "G-TEST123456"
    error_message = "Analytics opcional deve receber somente o ID público validado."
  }
}

run "reject_unconfigured_production" {
  command = plan
  variables {
    use_bootstrap_image = false
  }
  expect_failures = [google_cloud_run_v2_service.site]
}

run "translation_least_privilege" {
  command = plan
  variables {
    enable_translation = true
  }
  assert {
    condition     = contains(keys(google_project_service.apis), "translate.googleapis.com") && toset(google_project_iam_custom_role.runtime_translation[0].permissions) == toset(["cloudtranslate.generalModels.predict", "serviceusage.services.use"])
    error_message = "Runtime só pode traduzir texto; não deve receber administração de modelos/datasets."
  }
  assert {
    condition     = local.env_vars.GOOGLE_CLOUD_PROJECT == "spm-offline-test" && local.env_vars.TRANSLATION_ENABLED == "true" && local.env_vars.TRANSLATION_LOCATION == "global" && local.env_vars.TRANSLATION_DAILY_CHARACTER_LIMIT == "50000"
    error_message = "API, local e limite diário devem ser passados explicitamente ao runtime."
  }
}

run "reject_production_without_workspace_mfa" {
  command = plan
  variables {
    use_bootstrap_image           = false
    app_url_override              = "https://spm.example.test"
    enable_google_oauth           = true
    google_workspace_mfa_enforced = false
    external_secret_versions = {
      RUNTIME_DATABASE_URL       = "2"
      GOOGLE_OAUTH_CLIENT_ID     = "2"
      GOOGLE_OAUTH_CLIENT_SECRET = "2"
    }
  }
  expect_failures = [google_cloud_run_v2_service.site]
}

run "reject_invalid_character_limit" {
  command = plan
  variables {
    translation_daily_character_limit = -1
  }
  expect_failures = [var.translation_daily_character_limit]
}
