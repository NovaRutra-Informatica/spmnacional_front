# =========================================================
# SPM Nacional — versões e backend do estado
#
# O provider Google é fixado na linha 6.x: é a que traz os recursos v2 do
# Cloud Run (serviço e job) estáveis, sem precisar do provider beta. Prender a
# linha maior evita que um `terraform init` daqui a um ano mude o plano sozinho.
# =========================================================

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # -----------------------------------------------------
  # Estado remoto
  #
  # O estado contém a senha do banco, o AUTH_SECRET e a ENCRYPTION_KEY
  # gerados aqui. Ele NÃO pode ficar no computador de ninguém nem no git.
  #
  # Antes do primeiro `terraform init`, crie o bucket de estado à mão
  # (ele não pode ser gerenciado por este mesmo estado):
  #
  #   gcloud storage buckets create gs://spm-tfstate \
  #       --project=<PROJECT_ID> \
  #       --location=southamerica-east1 \
  #       --uniform-bucket-level-access \
  #       --public-access-prevention
  #   gcloud storage buckets update gs://spm-tfstate --versioning
  #
  # Informe o nome somente durante a inicialização, sem gravar credenciais ou
  # nomes específicos do ambiente no repositório:
  #
  #   terraform init -backend-config="bucket=<BUCKET_PRIVADO>"
  #
  # Se já existir estado local, acrescente `-migrate-state` nesse primeiro uso.
  # -----------------------------------------------------
  backend "gcs" {
    prefix = "spmnacional/prod"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
