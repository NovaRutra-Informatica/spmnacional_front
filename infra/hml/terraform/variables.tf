variable "project_id" {
  description = "ID técnico do projeto existente Site institucional, nunca o nome de exibição."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Informe um ID de projeto Google Cloud válido."
  }
}

variable "region" {
  description = "Região HML aprovada em São Paulo."
  type        = string
  default     = "southamerica-east1"
  validation {
    condition     = var.region == "southamerica-east1"
    error_message = "Este ambiente HML foi aprovado para southamerica-east1."
  }
}

variable "zone" {
  description = "Zona da VM e do disco persistente."
  type        = string
  default     = "southamerica-east1-a"
  validation {
    condition     = contains(["southamerica-east1-a", "southamerica-east1-b", "southamerica-east1-c"], var.zone)
    error_message = "A zona deve pertencer à região de São Paulo."
  }
}

variable "name_prefix" {
  description = "Prefixo exclusivo de homologação; também compõe nomes de secrets e imagens."
  type        = string
  default     = "spm-hml"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,19}[a-z0-9]$", var.name_prefix))
    error_message = "Use de 3 a 21 caracteres minúsculos/dígitos/hífens, começando por letra."
  }
}

variable "machine_type" {
  description = "Começar com e2-micro; e2-small é alternativa após medir memória/custo."
  type        = string
  default     = "e2-micro"
  validation {
    condition     = contains(["e2-micro", "e2-small"], var.machine_type)
    error_message = "HML econômica suporta e2-micro ou e2-small."
  }
}

variable "disk_size_gb" {
  description = "Tamanho persistente total para SO, contêineres e PostgreSQL. Acompanhar espaço."
  type        = number
  default     = 20
  validation {
    condition     = var.disk_size_gb >= 20 && var.disk_size_gb <= 100 && floor(var.disk_size_gb) == var.disk_size_gb
    error_message = "Use um inteiro entre 20 e 100 GiB; ampliar aumenta o custo."
  }
}

variable "use_static_ip" {
  description = "IP fixo estabiliza DNS/OAuth; é cobrado também com VM desligada. false exige atualização de DNS e pode alterar origem OAuth."
  type        = bool
  default     = true
}

variable "subnet_cidr" {
  description = "CIDR privado da sub-rede exclusiva de HML."
  type        = string
  default     = "10.20.0.0/24"
  validation {
    condition     = can(cidrhost(var.subnet_cidr, 1))
    error_message = "Informe um CIDR IPv4 válido."
  }
}

variable "image_tag" {
  description = "Tag de imagem já construída localmente e publicada; preferir identificador imutável de commit."
  type        = string
  default     = "hml"
  validation {
    condition     = can(regex("^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$", var.image_tag))
    error_message = "Informe uma tag Docker válida."
  }
}

variable "app_config" {
  description = "Configuração de runtime NÃO SECRETA em JSON para startup. Credenciais somente nos cofres listados em secret_ids."
  type        = map(string)
  default     = {}
  validation {
    condition = alltrue([
      for key in keys(var.app_config) : !can(regex("(?i)(password|secret|private|token|key|database_url)", key))
    ])
    error_message = "app_config vai para metadata pública à VM: não informe senhas, segredos, tokens, chaves ou DATABASE_URL."
  }
}

variable "labels" {
  description = "Rótulos de identificação e cobrança."
  type        = map(string)
  default = {
    aplicacao = "spmnacional"
    ambiente  = "hml"
    gestao    = "terraform"
  }
}
