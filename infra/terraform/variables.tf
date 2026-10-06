# =========================================================
# SPM Nacional — variáveis
#
# Os valores padrão são os que fazem sentido para uma organização pequena:
# a máquina mais barata do Cloud SQL, escala a zero no Cloud Run e nenhuma
# integração opcional ligada antes de existir credencial para ela.
# =========================================================

variable "project_id" {
  description = "ID do projeto no Google Cloud (ex.: spm-nacional-prod)."
  type        = string
}

variable "region" {
  description = "Região dos recursos regionais; não garante residência de todos os metadados/logs."
  type        = string
  default     = "southamerica-east1"
}

variable "name_prefix" {
  description = "Prefixo aplicado ao nome de todos os recursos."
  type        = string
  default     = "spm"
}

variable "app_domain" {
  description = <<-EOT
        Domínio público do site, sem protocolo (ex.: spmnacional.org.br).
        Vira APP_URL e NEXT_PUBLIC_SITE_URL. Deixe vazio para usar a URL
        gerada pelo Cloud Run (útil antes de o domínio estar apontado).
    EOT
  type        = string
  default     = ""
}

# ---------------------------------------------------------
# Aplicação
# ---------------------------------------------------------

variable "image_tag" {
  description = <<-EOT
        Tag da imagem publicada no Artifact Registry. O deploy do dia a dia é
        feito pelo GitHub Actions, que substitui a imagem sem passar pelo
        terraform (ver `lifecycle.ignore_changes` no main.tf).
    EOT
  type        = string
  default     = "latest"
}

variable "use_bootstrap_image" {
  description = <<-EOT
        No primeiro apply o Artifact Registry ainda está vazio, e o Cloud Run
        recusa criar um serviço apontando para imagem que não existe. Com esta
        opção ligada, o serviço nasce com uma imagem pública de exemplo e o
        primeiro deploy do pipeline a substitui.

        Depois disso o valor é irrelevante: a imagem em produção é decidida
        pelo GitHub Actions e o terraform ignora esse campo
        (`lifecycle.ignore_changes`).
    EOT
  type        = bool
  default     = true
}

variable "bootstrap_image" {
  description = "Imagem pública usada apenas na criação do serviço e do job."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "max_instances" {
  description = "Teto de instâncias, sujeito aos limites operacionais do provedor. Não é teto financeiro."
  type        = number
  default     = 4
}

variable "cpu_limit" {
  description = "CPU por instância do Cloud Run."
  type        = string
  default     = "1"
}

variable "memory_limit" {
  description = "Memória por instância; validar com teste de carga antes do lançamento."
  type        = string
  default     = "512Mi"
}

variable "request_concurrency" {
  description = "Requisições HTTP simultâneas por instância, NÃO usuários. Ponto inicial conservador; validar com perfil audience e homologação."
  type        = number
  default     = 16
  validation {
    condition     = var.request_concurrency >= 1 && var.request_concurrency <= 80 && floor(var.request_concurrency) == var.request_concurrency
    error_message = "request_concurrency deve ser inteiro entre 1 e 80."
  }
}

# ---------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------

variable "db_tier" {
  description = "Máquina Cloud SQL. Padrão compartilhado inicial: dimensionar carga/SLA antes de lançar."
  type        = string
  default     = "db-f1-micro"
}

variable "db_disk_size_gb" {
  description = "Disco inicial em GB; autoresize até 50GB. Acompanhar capacidade e custos."
  type        = number
  default     = 10
}

variable "db_name" {
  description = "Nome do banco dentro da instância."
  type        = string
  default     = "spmnacional"
}

variable "db_user" {
  description = "Usuário da aplicação no Postgres."
  type        = string
  default     = "spm"
}

variable "db_backup_start_time" {
  description = "Horário UTC do backup diário. Confirmar o RPO da organização."
  type        = string
  default     = "06:00"
}

variable "db_retained_backups" {
  description = "Quantidade de backups diários mantidos."
  type        = number
  default     = 7
}

variable "uploads_noncurrent_retention_days" {
  description = <<-EOT
        Dias que uma versão antiga de arquivo sobrevive antes de ser apagada.
        O versionamento protege contra exclusão acidental; a regra de ciclo de
        vida impede que essas versões virem custo permanente.
    EOT
  type        = number
  default     = 30
}

# ---------------------------------------------------------
# Rotinas agendadas (Cloud Scheduler)
# ---------------------------------------------------------

variable "data_retention_schedule" {
  description = <<-EOT
        Horário do expurgo diário de dados pessoais, em formato cron e no fuso
        America/Sao_Paulo. O padrão roda às 04:30, depois da janela de backup.
    EOT
  type        = string
  default     = "30 4 * * *"
}

variable "agenda_sync_schedule" {
  description = "Frequência de sincronização com Google Calendar em formato cron."
  type        = string
  default     = "0 */6 * * *"
}

# ---------------------------------------------------------
# Integrações opcionais
#
# Ficam desligadas até existir credencial. O código já degrada sozinho
# (ver lib/server/env.ts), mas manter a variável fora do Cloud Run evita que
# um valor de espera no Secret Manager ligue uma funcionalidade quebrada.
# ---------------------------------------------------------

variable "enable_google_oauth" {
  description = "Liga o único login do painel: Google Workspace. Obrigatório antes de publicar a aplicação real."
  type        = bool
  default     = false
}

variable "google_workspace_mfa_enforced" {
  description = "Declara que o responsável conferiu 2FA obrigatório no Workspace e recuperação de contas. Não é prova de MFA por sessão; não habilita 2FA no Google."
  type        = bool
  default     = false
}

variable "enable_translation" {
  description = "Habilita Cloud Translation para conteúdo público, API e IAM do runtime. Aprovar custo antes de ativar."
  type        = bool
  default     = false
}

variable "translation_location" {
  description = "Endpoint/modelo NMT de tradução. global não promete residência dos dados no Brasil."
  type        = string
  default     = "global"
  validation {
    condition     = var.translation_location == "global"
    error_message = "Esta configuração foi preparada para NMT global; uma região diferente exige validação explícita."
  }
}

variable "translation_daily_character_limit" {
  description = "Reserva diária de caracteres da aplicação, dia UTC. Zero permite só cache. Não substitui quotas/alertas do provedor nem limita outros consumidores do projeto."
  type        = number
  default     = 50000
  validation {
    condition     = var.translation_daily_character_limit >= 0 && var.translation_daily_character_limit <= 10000000 && floor(var.translation_daily_character_limit) == var.translation_daily_character_limit
    error_message = "Limite diário deve ser inteiro entre zero e 10000000 caracteres."
  }
}

variable "enable_google_calendar" {
  description = "Liga a sincronização da agenda (exige calendário público e chave de API)."
  type        = bool
  default     = false
}

variable "enable_smtp" {
  description = "Liga o envio de e-mail (exige SMTP_PASSWORD preenchido no Secret Manager)."
  type        = bool
  default     = false
}

variable "smtp_host" {
  description = "Servidor SMTP do provedor contratado. Verificar quotas e autorização para envio transacional."
  type        = string
  default     = "smtp.gmail.com"
}

variable "smtp_port" {
  description = "Porta SMTP (587 com STARTTLS, 465 com SSL direto)."
  type        = number
  default     = 587
}

variable "smtp_user" {
  description = "Conta que autentica no SMTP (ex.: contato@spmnacional.org.br)."
  type        = string
  default     = ""
}

variable "mail_from" {
  description = "Remetente exibido nos e-mails enviados pelo site."
  type        = string
  default     = "SPM Nacional <contato@spmnacional.org.br>"
}

variable "mail_notify_to" {
  description = "Caixa que recebe aviso de nova mensagem do Fale Conosco."
  type        = string
  default     = "contato@spmnacional.org.br"
}

variable "google_oauth_allowed_domain" {
  description = <<-EOT
        Domínio exato do Workspace aceito no login. Conta pré-cadastrada também
        é obrigatória; o site nunca aceita qualquer conta Google ou autoinscrição.
    EOT
  type        = string
  default     = "spmnacional.org.br"
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.google_oauth_allowed_domain))
    error_message = "Informe o domínio institucional exato, sem protocolo, @, caminho ou curinga."
  }
}

variable "google_calendar_id" {
  description = "ID do calendário público da organização (não é segredo)."
  type        = string
  default     = ""
}

# ---------------------------------------------------------
# GitHub Actions (Workload Identity Federation)
# ---------------------------------------------------------

variable "github_repository" {
  description = <<-EOT
        Repositório autorizado a fazer deploy, no formato "dono/repositorio".
        É a única coisa que separa o pipeline legítimo de qualquer outro
        workflow do GitHub: a condição de atributo do provider compara com
        este valor exato.
    EOT
  type        = string
}

variable "github_deploy_branch" {
  description = "Branch autorizada a fazer deploy."
  type        = string
  default     = "prod"
}

variable "seed_admin_email" {
  description = "E-mail da conta administrativa criada pelo seed."
  type        = string
  default     = "admin@spmnacional.org.br"
}

variable "labels" {
  description = "Rótulos aplicados aos recursos que aceitam rótulo (ajudam no relatório de custo)."
  type        = map(string)
  default = {
    aplicacao = "spmnacional"
    ambiente  = "producao"
    gestao    = "terraform"
  }
}


variable "app_url_override" {
  description = "URL HTTPS canônica, inclusive run.app em homologação sem domínio próprio."
  type        = string
  default     = ""
  validation {
    condition     = var.app_url_override == "" || can(regex("^https://[^/]+$", var.app_url_override))
    error_message = "Use uma origem HTTPS sem caminho/barra final."
  }
}

variable "external_secret_versions" {
  description = "Versões numéricas de credenciais externas após adicionar a versão real; nunca latest."
  type        = map(string)
  default     = {}
  validation {
    condition     = alltrue([for version in values(var.external_secret_versions) : can(regex("^[1-9][0-9]*$", version))])
    error_message = "As versões de segredo devem ser números inteiros positivos."
  }
}

variable "db_availability_type" {
  description = "ZONAL ou REGIONAL (HA). Decidir segundo disponibilidade e orçamento aprovados."
  type        = string
  default     = "ZONAL"
  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.db_availability_type)
    error_message = "Disponibilidade deve ser ZONAL ou REGIONAL."
  }
}

variable "db_pitr_enabled" {
  description = "Habilita recuperação pontual (PITR); gera armazenamento adicional de logs de transação."
  type        = bool
  default     = true
}

variable "db_pool_max" {
  description = "Conexões por instância; max_instances * pool + migração/admin deve caber no limite SQL."
  type        = number
  default     = 5
  validation {
    condition     = var.db_pool_max >= 1 && var.db_pool_max <= 20 && floor(var.db_pool_max) == var.db_pool_max
    error_message = "Pool deve ser inteiro entre 1 e 20."
  }
}

variable "github_repository_id" {
  description = "ID numérico imutável do repositório GitHub; protege contra reutilização de nomes."
  type        = string
  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "Informe o ID numérico do repositório GitHub."
  }
}

variable "github_repository_owner_id" {
  description = "ID numérico imutável da organização/conta proprietária do repositório."
  type        = string
  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_owner_id))
    error_message = "Informe o ID numérico do proprietário no GitHub."
  }
}
variable "enable_analytics" {
  description = "Ativa GA4 com consentimento explícito; desativado por padrão."
  type        = bool
  default     = false
}

variable "ga_measurement_id" {
  description = "ID de medição público GA4. Não é chave de API nem credencial."
  type        = string
  default     = ""
  validation {
    condition     = var.ga_measurement_id == "" || can(regex("^G-[A-Z0-9]{6,20}$", var.ga_measurement_id))
    error_message = "Informe um ID GA4 válido."
  }
}
variable "ga_enhanced_measurement_disabled" {
  description = "Confirmar após desativar Enhanced Measurement no stream GA4: coleta somente page_view manual público."
  type        = bool
  default     = false
}
