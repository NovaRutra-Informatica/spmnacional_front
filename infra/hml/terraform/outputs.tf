output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "zone" {
  value = var.zone
}

output "instance_name" {
  description = "Nome para deploy/SSH gcloud compute com --zone e --tunnel-through-iap."
  value       = google_compute_instance.hml.name
}

output "external_ip" {
  description = "IPv4 para DNS. Fixo por padrão; efêmero muda após desligar/iniciar."
  value       = google_compute_instance.hml.network_interface[0].access_config[0].nat_ip
}

output "static_ip_enabled" {
  value = var.use_static_ip
}

output "proposed_hml_domain" {
  description = "Domínio temporário candidato para TLS/OAuth após validar DNS e certificado; cadastrar em config.env."
  value       = "spm-hml-${replace(google_compute_instance.hml.network_interface[0].access_config[0].nat_ip, ".", "-")}.sslip.io"
}

output "uploads_bucket" {
  value = google_storage_bucket.uploads.name
}

output "backups_bucket" {
  value = google_storage_bucket.backups.name
}

output "runtime_service_account" {
  value = google_service_account.vm.email
}

output "artifact_registry_repo" {
  description = "Prefixo regional Docker; o computador autenticado publica aqui."
  value       = local.repo_url
}

output "app_image" {
  value = "${local.repo_url}/${var.name_prefix}-site:${var.image_tag}"
}

output "migrator_image" {
  value = "${local.repo_url}/${var.name_prefix}-migrate:${var.image_tag}"
}

output "secret_ids" {
  description = "Mapa de variável => cofre. Não contém valores nem versões de segredos."
  value       = local.secret_ids
}

output "schedule" {
  value = {
    policy       = google_compute_resource_policy.schedule.name
    time_zone    = "America/Sao_Paulo"
    start_cron   = "45 8 * * 0,1,3,5,6"
    stop_cron    = "15 17 * * 0,1,3,5,6"
    access_hours = "09:00–17:00 seg/qua/sex/sáb/dom; proxy aplica esta janela"
  }
}

output "ssh_command" {
  description = "Requer IAM do operador IAP tunnelResourceAccessor, compute.osAdminLogin e serviceAccountUser na SA desta VM."
  value       = "gcloud compute ssh ${google_compute_instance.hml.name} --configuration=spm-site-hml --project ${var.project_id} --zone ${var.zone} --tunnel-through-iap"
}
