Execute antes de instalar a nova release e de fornecer os dois ACKs da manutenção. Use o `common.sh`/Compose/configuração que estão rodando na VM. Copie somente `backup-verify.sh`, `backup-verify.py` e `backup-integrity.sql` para `/opt/spm-hml`, com proprietário root. Os diretórios `/opt/spm-hml`, `state` e `backups` devem ser root:root 0700; metadata, locks e marcador existente, 0600.

Se quiser também o backup remoto do procedimento antigo, execute `backup.sh` **antes** desta operação: ele depende do marcador de prontidão. Pare o timer/serviço cron no procedimento de manutenção, confira o desligamento excepcional e o monitor de orçamento e execute:

```bash
sudo bash /opt/spm-hml/backup-verify.sh
```

O script toma a trava exclusiva de deploy e de backup, apaga `deployment-ready`, para gateway/web e confirma que não estão rodando. O apagamento ocorre antes do dump: a assinatura antiga não inclui scripts operacionais, portanto instalar novos scripts não basta para invalidar uma release antiga. O cron/gateway que usam a trava compartilhada não podem executar durante a verificação. Não execute outro operador SQL ou publicação em paralelo.

O dump custom do PostgreSQL permanece em `backups/pre-76-<UTC>-<UUID>/database.dump`, root 0600. A restauração ocorre em `spm_verify_<UUID>`, criado com template0, nunca no banco live. Antes de remover esse banco, o script exige nome exato, OID e comentário de identidade; não usa DROP forçado. Os três retratos comparam todos os dados locais de tabelas, materialized views e sequências: origem antes, banco restaurado e origem depois. São registrados apenas nomes de objetos, contagens e hashes SHA-256 de linhas JSONB ordenadas, em blocos de 1024 hashes. A ordem física das linhas não interfere e duplicatas entram no hash. Dados de foreign tables e large objects exigem outro procedimento e fazem esta verificação falhar.

Sucesso produz um JSON com os caminhos do dump e de `proof.json`, `verified:true`, restauração correspondente, origem sem mudanças e banco temporário removido. Não imprime dados, senhas, URLs SQL ou mensagens do provedor; erros detalhados ficam em `operations.log`, 0600. A prova é de conteúdo restaurado: não mede recuperação em infraestrutura nova, aplicação, permissões/ACL ou disponibilidade. O dump usa `--no-owner --no-acl`, portanto uma recuperação completa precisa reaplicar as permissões do procedimento versionado.

Após sucesso **gateway/web continuam parados e readiness continua ausente**. Revise o JSON e o dump antes de fornecer `SPM_MAINTENANCE_CONFIRMED=true` e `SPM_DATABASE_BACKUP_VERIFIED=true` ao deploy de manutenção. Não recrie o marcador manualmente. O script não altera config, versão do PostgreSQL ou esquema/dados do banco live e não inicia nenhum serviço.

Falha ou interrupção não autoriza os ACKs. Os arquivos protegidos são preservados; se o shutdown excepcional interromper a remoção, `request.json` registra o nome/token do banco temporário e `temporary.identity.json` registra seu OID/comentário após a criação. O operador deve conferir nome, OID e comentário `SPM backup verification:<token>` antes de qualquer limpeza, sem remover outros bancos. Se a criação tiver sido interrompida antes do registro de identidade, não existe comprovação automática de limpeza e é necessário diagnóstico manual. Uma recuperação do dump no live é uma operação separada, destrutiva e exige diagnóstico/decisão do operador. O backup local não substitui cópia fora da VM/disco.

Há uma reserva mínima de espaço de `3 × pg_database_size + 256 MiB`, verificada no local do dump e no volume do PostgreSQL. Isso reduz falhas comuns, sem garantir espaço para qualquer extensão/tabela externa. As consultas têm timeout de 180 s; dump e restauração, 900 s cada. O desligamento excepcional continua tendo prioridade. Esta verificação local adiciona CPU, tempo de VM e uso temporário de disco; não cria recursos GCP nem envia tráfego ao GCS. O monitor de 512 MiB, shaping de 10 Mbit/s e prazo de 03/10 06h BRT são limites operacionais, **não um hard cap de faturamento de R$20**: disco/IP/APIs, uso prévio, atraso de desligamento e demais cobranças permanecem relevantes.

Validação local sem GCP:

```bash
sudo python3 infra/hml/vm/check-backup-verify.py
# PostgreSQL 18.6 já cacheado, container descartável sem rede/portas:
sudo python3 infra/hml/vm/check-backup-verify.py --real-postgres
```
