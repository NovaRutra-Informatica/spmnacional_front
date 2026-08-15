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
  description = <<-EOT
        Região de todos os recursos. São Paulo custa cerca de 1,5x us-central1,
        mas mantém os dados no Brasil — caminho de menor atrito para a LGPD,
        que é decisivo num sistema que registra atendimento a migrantes.
    EOT
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
  description = <<-EOT
        Teto de instâncias do Cloud Run. Serve mais como trava de gasto do que
        como meta de capacidade: uma instância dá conta do tráfego do site, e o
        teto impede que um pico (ou um robô) gere uma conta inesperada.
    EOT
  type        = number
  default     = 4
}

variable "cpu_limit" {
  description = "CPU por instância do Cloud Run."
  type        = string
  default     = "1"
}

variable "memory_limit" {
  description = <<-EOT
        Memória por instância. 512Mi cobre o Next.js em modo standalone com o
        Prisma 7 (query compiler em WASM, sem engine nativa carregada).
    EOT
  type        = string
  default     = "512Mi"
}

variable "request_concurrency" {
  description = <<-EOT
        Requisições simultâneas por instância. 80 é o padrão do Cloud Run e é
        adequado a uma aplicação Node, que é I/O-bound: quanto maior a
        concorrência, menos instâncias e menor a conta.
    EOT
  type        = number
  default     = 80
}

# ---------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------

variable "db_tier" {
  description = <<-EOT
        Máquina do Cloud SQL. `db-f1-micro` é a mais barata (compartilhada,
        0,6 GB de RAM): ~US$ 0,0158/hora em São Paulo, ~US$ 11,53/mês.
        Cloud SQL não tem nível gratuito e não escala a zero — é o item fixo
        mais caro desta infraestrutura.
    EOT
  type        = string
  default     = "db-f1-micro"
}

variable "db_disk_size_gb" {
  description = <<-EOT
        Disco do Cloud SQL em GB. 10 GB é o mínimo cobrado; SSD custa
        US$ 0,255/GiB-mês em São Paulo (~US$ 2,55/mês). O autoresize está
        ligado, então o disco cresce sozinho se faltar espaço.
    EOT
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
  description = <<-EOT
        Horário UTC do backup automático diário. 06:00 UTC = 03:00 em Brasília,
        janela de menor uso. Backup automático é cobrado por GB retido, mas com
        um banco desta ordem de grandeza o valor é de centavos.
    EOT
  type        = string
  default     = "06:00"
}

variable "db_retained_backups" {
  description = "Quantidade de backups diários mantidos."
  type        = number
  default     = 7
}

# ---------------------------------------------------------
# Armazenamento de arquivos
# ---------------------------------------------------------

variable "uploads_bucket_public" {
  description = <<-EOT
        Concede leitura anônima ao bucket de uploads. É o modo como o site
        entrega capas de notícia e PDFs de editais direto do Cloud Storage
        (STORAGE_DRIVER=gcs), sem passar pelo servidor.

        ATENÇÃO: só vale porque nada de dado pessoal do módulo de atendimentos
        vai para arquivo — atendimento é só linha de banco, com os campos que
        identificam a pessoa cifrados. Se um dia entrar anexo em atendimento,
        isto tem que virar `false` e o download passar pela aplicação.
    EOT
  type        = bool
  default     = true
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
# Agenda (Cloud Scheduler)
# ---------------------------------------------------------

variable "agenda_sync_schedule" {
  description = <<-EOT
        Frequência da sincronização com o Google Calendar, em formato cron.
        De 6 em 6 horas é suficiente: a agenda muda pouco e o Cloud Scheduler
        dá 3 jobs gratuitos por conta de faturamento.
    EOT
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
  description = "Liga o login com Google Workspace (exige os segredos preenchidos)."
  type        = bool
  default     = false
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
  description = <<-EOT
        Servidor SMTP. Com Google Workspace for Nonprofits há dois caminhos:
        `smtp-relay.gmail.com` (autenticação por IP, 10.000 destinatários por
        usuário/dia) ou `smtp.gmail.com` (2.000 mensagens/dia, exige Senha de
        App). O Cloud Run não tem IP fixo de saída sem NAT, então o padrão aqui
        é o segundo.
    EOT
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
        Domínio do Workspace aceito no login com Google. Vazio permite qualquer
        conta Google, o que não deve acontecer num painel com dado pessoal.
    EOT
  type        = string
  default     = "spmnacional.org.br"
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
