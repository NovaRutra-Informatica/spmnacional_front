# Terraform da HML

Módulo independente de `infra/terraform` (produção). Usa o projeto existente
`site-institucional-510319`; o nome de exibição **Site institucional** não é um
ID aceito pelo provider. Não há valores de segredos, geração de senhas ou versões
de Secret Manager neste módulo.

O backend é GCS com prefixo `spmnacional/hml`. O bucket de estado deve existir,
ser privado, ter acesso restrito aos operadores e ser informado no `init`:

```powershell
terraform "-chdir=infra/hml/terraform" init "-backend-config=bucket=<BUCKET_PRIVADO>"
terraform "-chdir=infra/hml/terraform" plan -out=hml.tfplan
```

Para verificação sem autenticação/backend:

```powershell
terraform "-chdir=infra/hml/terraform" init -backend=false
terraform "-chdir=infra/hml/terraform" fmt -check
terraform "-chdir=infra/hml/terraform" validate
terraform "-chdir=infra/hml/terraform" test
```

O startup depende de `../vm/startup.sh`. Antes de executar plano/aplicação, definir
`project_id` em arquivo local ignorado ou `TF_VAR_project_id`. Autenticação do
provider vem de ADC; configuração ativa do CLI não substitui ADC. Os scripts
operacionais usam `--configuration=spm-site-hml` para não alterar outra conta
Google usada no computador.

Recursos: VM `e2-micro`, Debian 12, disco `pd-balanced` 20 GiB, VPC/sub-rede próprias,
IP externo, Artifact Registry, cofres HML e buckets privados de uploads/backups.
Não usa Cloud SQL, Cloud Run, Cloud Build, Cloud NAT ou balanceador. Buckets,
disco e cofres têm `prevent_destroy`; disco não é apagado com a VM. VM tem
`deletion_protection`, a ser removida deliberadamente antes de uma substituição.

IP fixo é padrão para preservar DNS e a origem OAuth. Ele continua sendo cobrado
quando a VM para. `use_static_ip=false` reduz estabilidade: IP efêmero pode mudar
em cada start; atualizar DNS/HTTPS/OAuth passa a ser parte da operação. Disco,
objetos de Storage, imagens e demais serviços também podem custar com a VM
desligada. A margem de 08:45 a 17:15 acrescenta computação ao orçamento original.

O agendamento Compute Engine é 08:45–17:15 seg/qua/sex/sáb/dom, em
`America/Sao_Paulo`. O proxy da VM impõe a janela de acesso web 09:00–17:00;
agendamento da VM sozinho não fornece um bloqueio de acesso exato. Operações
agendadas podem atrasar até 15 minutos e não garantem capacidade. O service agent
do Compute recebe apenas start/stop, restritos por condição à VM HML.
[Documentação do agendamento](https://docs.cloud.google.com/compute/docs/instances/schedule-instance-start-stop).

SSH só entra pela faixa IAP `35.235.240.0/20`. O operador precisa de acesso IAP,
OS Login administrativo e `serviceAccountUser` sobre a identidade desta VM.
Não há SSH aberto ao público, chaves JSON ou porta pública PostgreSQL.

Os uploads usam versionamento, com expurgo de versões antigas após 30 dias;
os backups usam nomes únicos e expurgo após 30 dias. Soft delete é desabilitado
para evitar armazenamento adicional após esse expurgo. A VM pode criar backups,
mas não ler, apagar ou sobrescrever objetos existentes nesse bucket. Uma restauração
requer a identidade autorizada de um operador. Bucket `prevent_destroy` protege
contra remoção pelo Terraform, mas não substitui uma política de recuperação.

Artifact Registry apaga imagens antigas após 30 dias e imagens sem tag após 7
dias, mantendo as 10 versões mais recentes e tags `protected-*`. Mover
`protected-current` e `protected-previous` para os digests do deploy atual e do
rollback; não adicionar uma tag protegida nova a cada release. As imagens são
construídas fora da VM.

Saídas relevantes: `instance_name`, `external_ip`, `uploads_bucket`,
`backups_bucket`, `runtime_service_account`, `artifact_registry_repo`,
`app_image`, `migrator_image`, `secret_ids`, `schedule`, `ssh_command`.

Contrato de metadata (apenas identificadores/configuração pública):
`hml-project-id`, `hml-region`, `hml-prefix`, `hml-timezone`,
`hml-uploads-bucket`, `hml-backups-bucket`, `hml-artifact-repo` (ID simples
`spm-hml-docker`, não URL completa),
`hml-secret-map` (JSON de variável para ID de cofre), `hml-app-config`
(JSON de configuração pública opcional). Digests de release são publicados em
`/opt/spm-hml/release.env`, sem modificar startup ou recriar a VM.

Cofres: `POSTGRES_PASSWORD`, `DATABASE_URL`, `RUNTIME_DATABASE_URL`, `AUTH_SECRET`,
`ENCRYPTION_KEY`, `CRON_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_CALENDAR_API_KEY`, `SMTP_PASSWORD`,
`HML_BASIC_AUTH_HASH`. O ID é `spm-hml-` seguido do nome em minúsculas com `_`
trocado por `-`. Versões reais devem ser acrescentadas diretamente ao Secret
Manager e os arquivos locais de runtime protegidos, sem passar pelo Terraform.

`app_config` é pública à VM: a validação rejeita nomes comuns de credenciais,
mas o operador deve conferir todos os valores. Não preencher aliases de segredos
nesse mapa. A integração de tradução recebe somente
`cloudtranslate.generalModels.predict` e `serviceusage.services.use`.
