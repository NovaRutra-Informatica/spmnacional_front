# Plano com provider simulado: não autentica nem cria recursos GCP.
mock_provider "google" {
  mock_data "google_project" {
    defaults = {
      number = "114929512155"
    }
  }
}

variables {
  project_id = "spm-offline-hml"
}

run "economical_private_hml" {
  command = plan

  assert {
    condition     = google_compute_instance.hml.machine_type == "e2-micro" && google_compute_disk.boot.size == 20 && google_compute_disk.boot.type == "pd-balanced" && !google_compute_instance.hml.boot_disk[0].auto_delete
    error_message = "A configuração padrão deve ser VM e2-micro e SSD persistente 20 GiB sem auto-delete."
  }

  assert {
    condition     = google_compute_instance.hml.deletion_protection && google_compute_instance.hml.shielded_instance_config[0].enable_secure_boot && google_compute_instance.hml.metadata["enable-oslogin"] == "TRUE"
    error_message = "A VM HML precisa de proteção de exclusão, secure boot e OS Login."
  }

  assert {
    condition     = google_compute_resource_policy.schedule.instance_schedule_policy[0].time_zone == "America/Sao_Paulo" && google_compute_resource_policy.schedule.instance_schedule_policy[0].vm_start_schedule[0].schedule == "45 8 * * 0,1,3,5,6" && google_compute_resource_policy.schedule.instance_schedule_policy[0].vm_stop_schedule[0].schedule == "15 17 * * 0,1,3,5,6"
    error_message = "HML deve preparar às 08:45 e parar às 17:15 seg/qua/sex/sáb/dom, Brasília."
  }

  assert {
    condition     = toset(one(google_compute_firewall.web.allow).ports) == toset(["80", "443"]) && toset(google_compute_firewall.iap_ssh.source_ranges) == toset(["35.235.240.0/20"]) && toset(one(google_compute_firewall.iap_ssh.allow).ports) == toset(["22"])
    error_message = "Só HTTP/HTTPS ficam públicos; SSH deve ser exclusivamente IAP."
  }

  assert {
    condition     = google_storage_bucket.uploads.public_access_prevention == "enforced" && google_storage_bucket.backups.public_access_prevention == "enforced" && google_storage_bucket.uploads.uniform_bucket_level_access && google_storage_bucket.backups.uniform_bucket_level_access && !google_storage_bucket.uploads.force_destroy && !google_storage_bucket.backups.force_destroy
    error_message = "Buckets precisam ser privados, sem ACL por objeto e sem force_destroy."
  }

  assert {
    condition     = one(google_storage_bucket.uploads.versioning).enabled && one(one(google_storage_bucket.uploads.lifecycle_rule).condition).days_since_noncurrent_time == 30 && one(one(google_storage_bucket.backups.lifecycle_rule).condition).age == 30 && one(google_storage_bucket.backups.soft_delete_policy).retention_duration_seconds == 0
    error_message = "Uploads precisam de histórico 30 dias e backups de expurgo 30 dias sem retenção extra por soft-delete."
  }

  assert {
    condition     = google_storage_bucket_iam_member.vm_backup_create.role == "roles/storage.objectCreator" && google_storage_bucket_iam_member.vm_uploads.role == "roles/storage.objectUser" && google_artifact_registry_repository_iam_member.vm_pull.role == "roles/artifactregistry.reader"
    error_message = "A VM só pode criar backups, trabalhar nos uploads e ler as imagens."
  }

  assert {
    condition     = toset(google_project_iam_custom_role.vm_apis.permissions) == toset(["cloudtranslate.generalModels.predict", "serviceusage.services.use"]) && toset(google_project_iam_custom_role.schedule.permissions) == toset(["compute.instances.start", "compute.instances.stop"]) && strcontains(google_project_iam_member.schedule.condition[0].expression, "projects/spm-offline-hml/zones/southamerica-east1-a/instances/spm-hml-vm")
    error_message = "Tradução e start/stop precisam dos papéis mínimos; agendamento restrito à VM HML."
  }

  assert {
    condition     = google_compute_instance.hml.metadata["hml-secret-map"] == jsonencode(local.secret_ids) && alltrue([for key, secret in local.secret_ids : secret == "spm-hml-${lower(replace(key, "_", "-"))}"])
    error_message = "Metadata só recebe mapa de identificadores de cofres, preservando nomes exclusivos HML."
  }

  assert {
    condition     = alltrue([for policy in google_artifact_registry_repository.docker.cleanup_policies : policy.id != "keep-protected-deployments" || try(toset(one(policy.condition).tag_prefixes) == toset(["protected-"]), false)])
    error_message = "Somente tags protected- devem impedir expurgo; preservar hml-* permitiria acumulação ilimitada."
  }
}

run "ephemeral_ip_is_explicit" {
  command = plan
  variables {
    use_static_ip = false
  }
  assert {
    condition     = length(google_compute_address.hml) == 0
    error_message = "Desligar IP fixo deve remover a reserva; operação precisa atualizar DNS quando o IPv4 mudar."
  }
}

run "reject_metadata_credentials" {
  command = plan
  variables {
    app_config = {
      DATABASE_URL = "must-not-be-in-metadata"
    }
  }
  expect_failures = [var.app_config]
}
