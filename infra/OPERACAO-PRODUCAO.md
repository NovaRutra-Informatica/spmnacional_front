# Operação de produção — SPM Nacional

Revisado em 14/09/2026. Este documento prepara o lançamento; **não comprova que um ambiente real foi implantado ou homologado**. Nenhum recurso, conta, domínio ou cobrança é criado pelos testes locais.

## Arquitetura e responsabilidades

O site completo usa Cloud Run (Next.js), Cloud SQL PostgreSQL, Secret Manager e Cloud Storage privado. Um job separado executa migrações; Cloud Scheduler chama as rotinas autenticadas. GitHub Pages é somente demonstração estática: não executa painel, API, autenticação ou publicações em tempo real.

O Terraform define recursos; o pipeline define a imagem e o tráfego. O estado contém segredos e deve ficar em bucket privado com versionamento e acesso restrito. Não publicar estado, planos ou credenciais como artefatos de CI. `terraform validate` não consulta uma conta GCP nem garante quotas/permissões de um projeto real.

## Gates antes de divulgar o domínio

- [ ] Cliente aprovou conteúdo, perfis de acesso, integrações, responsáveis operacionais e política de retenção.
- [ ] Homologação está em projeto/banco/bucket separados de produção, sem cópia indiscriminada de dados pessoais.
- [ ] Orçamento, alertas de faturamento, região, capacidade SQL e escolha ZONAL/REGIONAL aprovados. O padrão compartilhado não é garantia de capacidade, SLA ou alta disponibilidade; escalonamento não é teto financeiro.
- [ ] CI verde: lint, tipos, auditoria npm, testes unitários/cobertura, integração com PostgreSQL isolado, build, E2E, imagens Docker e validação Terraform.
- [ ] `bun run check:production` passou com o ambiente pretendido, sem imprimir valores de segredos. A validação é offline: não testa permissões IAM, entrega de e-mail ou acesso ao banco.
- [ ] Runtime usa o papel SQL limitado descrito abaixo, com login, CRUD, upload e migração futura testados em homologação.
- [ ] Backups, PITR, restauração de SQL, recuperação de upload e chave de criptografia foram ensaiados; tempos medidos e responsáveis registrados.
- [ ] SMTP entregue de fato, SPF/DKIM/DMARC conferidos com o provedor; OAuth e Calendar testados se habilitados.
- [ ] Teste de carga e limites de conexão/memória; monitoramento com destinatários reais e alerta de teste entregue.
- [ ] Revisão de segurança antes do lançamento, incluindo controle de acesso por perfil, dados sensíveis, uploads e dependências/imagens. Nenhuma suíte comprova ausência de vulnerabilidades.

## 1. Preparar infraestrutura e GitHub

Com autorização da organização, usar projeto dedicado com faturamento, APIs e permissões revisadas. Copiar `terraform/terraform.tfvars.example` para configuração local protegida. Obter os IDs numéricos do repositório e proprietário pela API/UI GitHub; não usar os números ilustrativos. A federação valida esses IDs, nome, branch `prod`, workflow `deploy-gcp.yml` e environment `production`.

Criar previamente bucket privado do estado, com prevenção de acesso público e versionamento, conforme `terraform/versions.tf`. Revisar retenção e acesso às cópias de estado (também contêm segredos).

Verificações sem deploy, no diretório `infra/terraform`:

```sh
terraform init -backend=false -input=false -lockfile=readonly
terraform fmt -check -recursive
terraform validate
```

Em uma sessão operacional autorizada, inicializar o backend real com `terraform init -reconfigure -backend-config="bucket=BUCKET_PRIVADO"`; se houver estado local existente, revisar e usar migração de estado, não descartar o original. Executar e revisar `terraform plan` antes de qualquer `apply`. Não executar `destroy` como limpeza de rotina.

O primeiro provisionamento pode usar `use_bootstrap_image=true`: somente imagem demonstrativa do Google, **não o SPM pronto**. Ela recebe variáveis/segredos, portanto mantenha o projeto de bootstrap sob o mesmo controle de produção e não divulgue sua URL. Depois de criar o serviço, preencher `app_url_override` com a URL HTTPS `cloud_run_url`, ou configurar `app_domain` se o domínio já estiver preparado.

No GitHub, criar os environments `production` e `demo`. Configurar aprovação obrigatória, restrição à branch `prod` e proibição de autoaprovação quando disponíveis no plano. Proteger a branch e exigir o CI antes do merge. O arquivo do workflow por si só **não cria essas regras**. Configurar variáveis/identidades de `terraform output github_actions_config`. Não criar chave JSON de conta de serviço. As regras e disponibilidade dependem do plano GitHub. [Environments e proteção](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## 2. Separar credenciais SQL de migração e runtime

O segredo gerado `spm-database-url` continua sendo o proprietário das tabelas, exclusivo do migrador. O novo `spm-runtime-database-url` deve apontar ao **mesmo banco**, mas com usuário de aplicação sem DDL. Até preencher e homologar essa separação, o ambiente não está liberado.

Na primeira instalação:

1. Publicar a imagem do estágio `migrator` no registro e executar as migrações iniciais com uma identidade operacional autorizada. O pipeline normal não passa enquanto o runtime não estiver configurado.
2. Conectar pelo Cloud SQL Auth Proxy a partir de máquina autorizada. Verificar projeto, instância e nome do banco antes de qualquer comando. Não colocar URL/senha em argumento de processo, histórico ou chat.
3. Revisar `sql/provision-runtime-role.sql`. O arquivo assume schema `public`, tabelas já migradas e proprietário `spm`; adaptar os parâmetros se a instalação divergir. Ele cria um papel novo e falha se esse papel já existir, evitando alterar uma identidade desconhecida. A revogação de CREATE de PUBLIC precisa de revisão em bancos compartilhados.
4. Executar pelo `psql` conectado ao banco certo, como administrador SQL autorizado:

```sh
psql -v owner_role=spm -v runtime_role=spm_app -f infra/sql/provision-runtime-role.sql
psql -v runtime_role=spm_app -f infra/sql/verify-runtime-role.sql
```

5. Definir senha aleatória pelo comando interativo `\password spm_app` em sessão `psql` protegida. Guardar a URL com usuário `spm_app` como nova versão de `spm-runtime-database-url`. Usar o mesmo socket `/cloudsql/PROJETO:REGIAO:INSTANCIA` da conexão do migrador, escapando corretamente a senha na URL. Nunca copiar a senha para comando/log.
6. Preencher `external_secret_versions = { RUNTIME_DATABASE_URL = "2" }` usando o número real criado (não assumir que é sempre 2). Aplicar apenas depois de revisar o plano. A versão 1 contém placeholder e é recusada pelo gate do deploy.
7. Testar login, escrita/leitura, uploads e isolamento por perfil com a credencial runtime. Executar a verificação SQL novamente após migrações que mudem proprietário, schema ou privilégios. As permissões padrão só cobrem tabelas futuras criadas pelo proprietário informado.

Em ambiente existente, manter a revisão funcional enquanto se prepara/testa o papel novo. Não revogar a credencial antiga antes de garantir que nenhuma instância/tarefa legítima ainda depende dela. O Docker Compose local continua usando usuário único por conveniência: isso não equivale à configuração endurecida de produção.

## 3. Segredos, integrações e dados iniciais

Obrigatórios: `APP_URL` HTTPS canônica, `DATABASE_URL` do runtime, `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `STORAGE_DRIVER=gcs` e `GCS_BUCKET`. `DEPLOYMENT_TARGET=gcp` ativa os requisitos de nuvem. `DB_POOL_MAX=5` é o ponto inicial, não dimensionamento definitivo. Credenciais nunca entram no build; `.dockerignore` exclui `.env`, credenciais OIDC, Terraform e documentos.

Adicionar credenciais reais ao Secret Manager somente por sessão segura/gerenciador aprovado. Ativar cada integração apenas depois de preencher suas versões em `external_secret_versions`. Segredos externos começam desativados. O serviço usa versões numéricas fixas: para rotacionar, adicionar nova versão, revisar o plano, publicar nova revisão e testar. Instâncias antigas não são atualizadas silenciosamente. [Recomendação do Cloud Run para segredos em variáveis](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

**Não substituir nem perder `ENCRYPTION_KEY`:** registros já cifrados dependem dela. Manter cópia controlada fora do ambiente, com recuperação ensaiada. Rotação dessa chave exige migração criptográfica específica, não apenas troca no Secret Manager. Rotacionar AUTH_SECRET pode encerrar sessões; CRON_SECRET exige atualização coordenada do Scheduler.

Não executar `db:seed` de demonstração sobre produção. Em banco novo já migrado, `bun run db:bootstrap` cria somente perfis e o primeiro administrador autorizado via Workspace; recusa instalações com usuários existentes. Executar a partir de uma cópia confiável do projeto com dependências instaladas, em sessão operacional autorizada com acesso ao banco, seguindo as [instruções de bootstrap](../README.md#inicialização-sem-conteúdo-de-demonstração). Esse comando não faz parte da imagem de runtime nem é executado automaticamente pelo pipeline. Não há senha inicial nem login alternativo ao Google. Contas devem ser nominais, previamente autorizadas e com privilégio mínimo; revisar concessões periodicamente.

## 4. Publicação e rollback

O workflow `Deploy no Google Cloud` é manual e exige confirmação, branch `prod`, CI aprovado e environment `production`. As ações externas estão fixadas por SHA; o Dependabot propõe atualizações semanais, que continuam exigindo revisão/testes. [Endurecimento de GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).

Fluxo: construir imagens e SBOM/proveniência → executar `prisma migrate deploy` uma vez, sem retry automático → criar revisão candidata por **digest** sem tráfego principal → testar liveness, readiness, home e login → promover revisão exata → verificar readiness pública. A tag temporária `candidate` cria URL acessível com as mesmas regras do serviço; ela é removida ao final.

Uma falha antes da promoção mantém o tráfego anterior. Se a verificação após promover falhar, o pipeline tenta restaurar a distribuição anterior e marca falha. Verificar no Cloud Run se o rollback realmente concluiu; uma falha de infraestrutura também pode impedir o comando. Resumos registram commit, digest, revisão e distribuição anterior.

Rollback manual autorizado usa a revisão/percentuais registrados:

```sh
gcloud run services update-traffic SERVICO --region REGIAO --to-revisions REVISAO_CONHECIDA=100
```

**Rollback de imagem não desfaz migrações.** Alterações de banco precisam de estratégia expand/contract: adicionar estruturas compatíveis, migrar dados, trocar código e só remover depois da janela de rollback. Nunca usar `migrate reset`, `db push` ou seed como reparo automático. Migração que falhou precisa de diagnóstico e procedimento aprovado, não retry cego. [Revisões e tráfego no Cloud Run](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration).

O Terraform ignora imagem, tráfego e liveness gerenciados pelo deploy. Ao publicar a primeira imagem real, o pipeline ativa `/api/health/live`. Depois do bootstrap, registrar `use_bootstrap_image=false` e revisar o plano. Mudanças Terraform em ambiente real também exigem janela/revisão, pois podem criar novas revisões.

## 5. Saúde, observabilidade e capacidade

`/api/health/live` verifica processo HTTP sem depender do banco: é usado pelo Docker e liveness do Cloud Run. Startup TCP tolera inicialização lenta. `/api/health/ready` e o alias `/api/health` verificam dependências com timeout e retornam 503 sem detalhes sensíveis quando indisponíveis. Readiness faz parte do smoke de promoção; **não está configurada como sonda de roteamento contínua neste provider Terraform**. Não transformar falha SQL em liveness para evitar reinícios em massa. [Semântica oficial das sondas](https://docs.cloud.google.com/run/docs/configuring/healthchecks).

Antes de lançar, configurar uptime HTTPS para readiness, alertas de 5xx/latência, memória, conexões SQL, disco, backups falhos e execuções de Scheduler. Destinatários e limites dependem dos requisitos do cliente; ainda precisam ser configurados no projeto real. Nunca logar formulários, tokens, cookies, URLs de banco ou corpos de atendimento. Definir acesso e retenção de logs.

Planejar `max_instances × DB_POOL_MAX`, mais migrador e sessões administrativas, abaixo do limite de conexões do SQL. Testar rajadas, upload máximo, cold start, indisponibilidade temporária do SQL/SMTP/GCS e recuperação. Ajustar CPU/memória/concorrência após medir, não apenas aumentar instâncias. Validar `TRUSTED_PROXY_HOPS` contra a cadeia real de proxies antes de confiar em IP de cabeçalho.

## 6. Backup e recuperação

O Terraform habilita backup diário e PITR (7 dias de logs quando ligado), proteção contra exclusão do SQL, bucket privado/versionado, retenção das versões não atuais e soft delete de 7 dias. São controles de recuperação, não cópia independente nem promessa de RPO/RTO. Alterações de retenção geram custos e devem considerar o ciclo completo dos dados e cópias. [PITR PostgreSQL](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/pitr), [soft delete de objetos](https://docs.cloud.google.com/storage/docs/soft-delete).

Mensalmente e antes de mudanças relevantes: confirmar backup concluído; restaurar para **instância isolada**, nunca sobre produção como teste; validar esquema, contagens, amostra de registros cifrados com a chave preservada, login e imagens; registrar tempo de recuperação. Restringir acesso aos dados restaurados e aprovar seu descarte. Ensaio com dados sintéticos é preferível para testes comuns.

Em incidente: interromper alterações se necessário; preservar evidências sem dados em chat; escolher ponto de recuperação; restaurar em nova instância/bucket; validar; criar nova versão da credencial apontando para o destino; publicar revisão e monitorar. Só desativar o original quando a organização aprovar. Exclusões definitivas, `docker compose down -v` e restauração sobre banco ativo não são procedimentos de rotina.

## 7. Domínio e custos

O Terraform atual **não provisiona domínio, certificado customizado, load balancer, WAF ou alertas de faturamento**. A documentação Google recomenda Application Load Balancer externo para domínio customizado; o mapeamento nativo está em Preview/não recomendado para produção e não inclui São Paulo na lista atual. Não pressupor que um CNAME genérico para `run.app` resolve Host/TLS. Escolher uma opção suportada e testar cookies, OAuth, URLs canônicas, redirects e cabeçalhos antes de trocar DNS. [Opções oficiais de domínio](https://docs.cloud.google.com/run/docs/mapping-custom-domains).

Não há preço mensal garantido neste repositório. Orçar com a calculadora e tabelas oficiais vigentes: região, SQL/HA/disco/PITR, Cloud Run, armazenamento/versões, tráfego, registry, segredos, Scheduler, observabilidade e eventual balanceador. Considerar impostos/câmbio e alertas; benefícios/gratuidades não substituem medição real. [Calculadora Google Cloud](https://cloud.google.com/products/calculator).

## 8. Workspace, tradução e meta de audiência

O login do painel passa a depender exclusivamente de contas Workspace institucionais previamente autorizadas. Antes do deploy real, configurar `enable_google_oauth=true`, as versões reais de `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` no Secret Manager e o domínio exato. O responsável pela organização deve impor e verificar 2FA no Google Workspace e definir recuperação de acesso antes de declarar `google_workspace_mfa_enforced=true`. Essa declaração vira `GOOGLE_WORKSPACE_MFA_ENFORCED` no runtime: **não habilita 2FA no provedor nem prova que cada token OAuth passou por um segundo fator**. O Terraform e o pipeline recusam configuração incompleta antes da migração/implantação real.

Tradução fica desligada por padrão (`enable_translation=false`), sem habilitar a API nem conceder permissões de tradução. Ao aprovar consumo, o Terraform habilita `translate.googleapis.com`, concede ao runtime um papel customizado apenas com `cloudtranslate.generalModels.predict` e `serviceusage.services.use`, e injeta projeto/local/limite diário. Não há chave JSON ou API key no navegador. O padrão `global` não promete residência dos textos no Brasil. [Permissões oficiais de tradução](https://docs.cloud.google.com/translate/docs/access-control).

`translation_daily_character_limit=50000` controla reservas da aplicação por dia UTC; zero mantém apenas traduções já disponíveis em cache. Revisar quotas e alertas na conta Google também: o limite local não controla outros consumidores do projeto, impostos ou custos de infraestrutura. O ensaio local desliga a API e não comprova disponibilidade, qualidade ou latência das traduções externas.

Para a meta de 50 leitores simultâneos e poucos administradores, foi preparado o perfil `audience`: 50 leitores e 3 editores virtuais, pausas explícitas e sessões isoladas. Ver [metodologia de carga](../docs/TESTE-DE-CARGA.md). O ponto inicial de infraestrutura é `request_concurrency=16`, 1 CPU/512 MiB por instância, até quatro instâncias e pool cinco por processo. Concorrência HTTP não é número de pessoas. Resultados locais não garantem a meta na nuvem; medir homologação e cold start, aprovar custo e revisar configurações antes de lançar.
