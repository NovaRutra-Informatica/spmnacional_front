locals {
  instance_name = "${var.name_prefix}-vm"
  repo_id       = "${var.name_prefix}-docker"
  repo_url      = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repo_id}"
  vm_resource   = "projects/${var.project_id}/zones/${var.zone}/instances/${local.instance_name}"

  # Somente cofres; valores/versões entram por Secret Manager fora do Terraform.
  # DATABASE_URL administra/migra, RUNTIME_DATABASE_URL pertence ao usuário SQL
  # limitado da aplicação. Ambas nunca são serializadas em metadata/estado.
  secret_names = toset([
    "POSTGRES_PASSWORD",
    "DATABASE_URL",
    "RUNTIME_DATABASE_URL",
    "AUTH_SECRET",
    "ENCRYPTION_KEY",
    "CRON_SECRET",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_CALENDAR_API_KEY",
    "SMTP_PASSWORD",
    "HML_BASIC_AUTH_HASH",
  ])
  secret_ids = { for name in local.secret_names : name => google_secret_manager_secret.app[name].secret_id }
}

resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
    "storage.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "serviceusage.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "translate.googleapis.com",
    "calendar-json.googleapis.com",
    "apikeys.googleapis.com",
    "iap.googleapis.com",
    "oslogin.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

data "google_project" "current" {
  project_id = var.project_id
  depends_on = [google_project_service.apis]
}

resource "google_compute_network" "hml" {
  name                    = "${var.name_prefix}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "hml" {
  name                     = "${var.name_prefix}-subnet"
  region                   = var.region
  network                  = google_compute_network.hml.id
  ip_cidr_range            = var.subnet_cidr
  private_ip_google_access = true
}

resource "google_compute_firewall" "web" {
  name          = "${var.name_prefix}-https"
  network       = google_compute_network.hml.name
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["${var.name_prefix}-web"]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

resource "google_compute_firewall" "iap_ssh" {
  name          = "${var.name_prefix}-iap-ssh"
  network       = google_compute_network.hml.name
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["${var.name_prefix}-web"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_address" "hml" {
  count        = var.use_static_ip ? 1 : 0
  name         = "${var.name_prefix}-ipv4"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "STANDARD"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "vm" {
  account_id   = "${var.name_prefix}-vm"
  display_name = "SPM HML VM runtime sem chave JSON"
  depends_on   = [google_project_service.apis]
}

resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = local.repo_id
  format        = "DOCKER"
  description   = "Imagens HML construídas localmente; sem Cloud Build/VM build."
  labels        = var.labels

  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }
  cleanup_policies {
    id     = "delete-old-images"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "2592000s"
    }
  }
  cleanup_policies {
    id     = "keep-protected-deployments"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["protected-"]
    }
  }
  cleanup_policies {
    id     = "keep-recent-images"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_artifact_registry_repository_iam_member" "vm_pull" {
  project    = var.project_id
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_storage_bucket" "uploads" {
  name                        = "${var.project_id}-${var.name_prefix}-uploads"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = var.labels
  versioning {
    enabled = true
  }
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      days_since_noncurrent_time = 30
      with_state                 = "ARCHIVED"
    }
  }
  # Versionamento já oferece recuperação durante 30 dias. Desativar soft delete
  # evita guardar versões novamente após seu expurgo e duplicar custo HML.
  soft_delete_policy {
    retention_duration_seconds = 0
  }
  lifecycle {
    prevent_destroy = true
  }
  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket" "backups" {
  name                        = "${var.project_id}-${var.name_prefix}-backups"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = var.labels
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 30
    }
  }
  # Nomes únicos por execução; o runtime só cria objetos e não pode apagar os
  # backups. Lifecycle mantém 30 dias sem uma semana extra cobrada por soft delete.
  soft_delete_policy {
    retention_duration_seconds = 0
  }
  lifecycle {
    prevent_destroy = true
  }
  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "vm_uploads" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_storage_bucket_iam_member" "vm_backup_create" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_secret_manager_secret" "app" {
  for_each  = local.secret_names
  secret_id = "${var.name_prefix}-${lower(replace(each.value, "_", "-"))}"
  labels    = var.labels
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  lifecycle {
    prevent_destroy = true
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "vm_secrets" {
  for_each  = local.secret_names
  secret_id = google_secret_manager_secret.app[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_project_iam_custom_role" "vm_apis" {
  role_id     = "${replace(var.name_prefix, "-", "_")}_translate"
  title       = "SPM HML text translation"
  description = "Somente tradução NMT pública e consumo de APIs do projeto."
  permissions = ["cloudtranslate.generalModels.predict", "serviceusage.services.use"]
  depends_on  = [google_project_service.apis]
}

resource "google_project_iam_member" "vm_apis" {
  project = var.project_id
  role    = google_project_iam_custom_role.vm_apis.name
  member  = "serviceAccount:${google_service_account.vm.email}"
}

# O agente Google do Compute agenda start/stop. Seu papel só contém as duas
# permissões necessárias e a condição limita sua concessão à VM desta HML.
resource "google_project_iam_custom_role" "schedule" {
  role_id     = "${replace(var.name_prefix, "-", "_")}_schedule"
  title       = "SPM HML start stop"
  description = "Somente iniciar e parar a VM HML por ResourcePolicy."
  permissions = ["compute.instances.start", "compute.instances.stop"]
  depends_on  = [google_project_service.apis]
}

resource "google_project_iam_member" "schedule" {
  project = var.project_id
  role    = google_project_iam_custom_role.schedule.name
  member  = "serviceAccount:service-${data.google_project.current.number}@compute-system.iam.gserviceaccount.com"
  condition {
    title       = "only-hml-vm"
    description = "Agendamento somente da VM de homologação."
    expression  = "resource.type == 'compute.googleapis.com/Instance' && resource.name == '${local.vm_resource}'"
  }
}

resource "google_compute_resource_policy" "schedule" {
  name        = "${var.name_prefix}-schedule"
  region      = var.region
  description = "Preparar 08:45 e parar 17:15 seg/qua/sex/sáb/dom, Brasília. Acesso web permitido pelo proxy 09h–17h."
  instance_schedule_policy {
    vm_start_schedule {
      schedule = "45 8 * * 0,1,3,5,6"
    }
    vm_stop_schedule {
      schedule = "15 17 * * 0,1,3,5,6"
    }
    time_zone = "America/Sao_Paulo"
  }
  depends_on = [google_project_iam_member.schedule]
}

resource "google_compute_disk" "boot" {
  name   = "${var.name_prefix}-disk"
  type   = "pd-balanced"
  zone   = var.zone
  size   = var.disk_size_gb
  image  = "projects/debian-cloud/global/images/family/debian-12"
  labels = var.labels
  lifecycle {
    prevent_destroy = true
  }
  depends_on = [google_project_service.apis]
}

resource "google_compute_instance" "hml" {
  name                      = local.instance_name
  zone                      = var.zone
  machine_type              = var.machine_type
  allow_stopping_for_update = true
  deletion_protection       = true
  tags                      = ["${var.name_prefix}-web"]
  labels                    = var.labels
  resource_policies         = [google_compute_resource_policy.schedule.id]

  boot_disk {
    source      = google_compute_disk.boot.id
    auto_delete = false
  }
  network_interface {
    subnetwork = google_compute_subnetwork.hml.id
    access_config {
      nat_ip       = var.use_static_ip ? google_compute_address.hml[0].address : null
      network_tier = "STANDARD"
    }
  }
  service_account {
    email  = google_service_account.vm.email
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  # Este script só instala/runtime. Nenhuma credencial entra em metadata;
  # Secret Manager é consultado usando a identidade da VM, em arquivos root 0600.
  metadata_startup_script = replace(file("${path.module}/../vm/startup.sh"), "\r\n", "\n")
  metadata = {
    enable-oslogin         = "TRUE"
    block-project-ssh-keys = "TRUE"
    hml-project-id         = var.project_id
    hml-region             = var.region
    hml-prefix             = var.name_prefix
    hml-timezone           = "America/Sao_Paulo"
    hml-uploads-bucket     = google_storage_bucket.uploads.name
    hml-backups-bucket     = google_storage_bucket.backups.name
    hml-artifact-repo      = local.repo_id
    hml-secret-map         = jsonencode(local.secret_ids)
    hml-app-config         = jsonencode(var.app_config)
  }
  depends_on = [
    google_secret_manager_secret_iam_member.vm_secrets,
    google_storage_bucket_iam_member.vm_uploads,
    google_storage_bucket_iam_member.vm_backup_create,
    google_artifact_registry_repository_iam_member.vm_pull,
    google_project_iam_member.vm_apis,
    google_compute_firewall.web,
    google_compute_firewall.iap_ssh,
  ]
}
