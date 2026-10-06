terraform {
  required_version = ">= 1.9.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.50"
    }
  }

  # Bucket privado de estado é criado fora deste módulo. O prefixo não compartilha
  # estado com produção. init -backend-config="bucket=<BUCKET_PRIVADO>".
  backend "gcs" {
    prefix = "spmnacional/hml"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
