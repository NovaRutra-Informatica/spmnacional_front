# Homologação SPM no Google Cloud

Projeto existente: **Site institucional**, ID `site-institucional-510319`, organização `spmnacional.org.br`. Esta configuração usa São Paulo (`southamerica-east1`, zona `southamerica-east1-a`) e horários `America/Sao_Paulo`.

## Validações históricas de 1º de outubro e publicação final de 2–3 de outubro de 2026

- Login CLI concluído com `suporteti@spmnacional.org.br`.
- Configuração CLI `spm-site-hml` criada **sem ativação**, permitindo usar outra conta/projeto simultaneamente.
- APIs IAM, Resource Manager, Calendar (`calendar-json.googleapis.com`) e API Keys habilitadas e verificadas no projeto.
- Imagens construídas localmente e publicadas por digest no Artifact Registry regional. A configuração protegida `release.env` fixa os digests efetivamente instalados; as tags `protected-current` e `protected-previous` servem à retenção do registry.
- Perfil `DEPLOYMENT_TARGET=gcp-vm` implementado, com HTTPS, Workspace, confirmação individual de 2FA para a única conta autorizada, GCS e bloqueio do login local de teste.
- Pagamento concluído pelo usuário; Cloud Billing está ativo e vinculado ao projeto, na conta `01C2C2-797E64-F65A13`.
- Terraform aplicado: **53 recursos adicionados**, sem alteração ou exclusão de recursos anteriores, mais o bucket de estado privado. VM `spm-hml-vm`, IPv4 fixo `35.215.232.88`, buckets privados, Artifact Registry, cofres, IAM, rede e agendamento estão criados.
- Na validação inicial de **1/10**, deploy/readiness, 23 verificações GCS/Translation, sete migrações, reinício com persistência e backup/restauração isolada passaram. A publicação final **`hml-20261002-76-04`**, em **3/10 UTC (2/10 Brasília)**, terminou com **EXIT 0**. A HML está `RUNNING`, com PostgreSQL 18.6 endurecido, **13 migrações**, seis tabelas `ENABLE/FORCE RLS`, runtime nonowner sem `SUPERUSER/BYPASSRLS`, conta única autorizada, timezone `America/Sao_Paulo` e readiness `scoped-rls-v1` HTTP 200. A coletora de **3/10 às 02:57 UTC (2/10 às 23:57 Brasília)** confirmou `complete=true`, `errors=[]`, digests finais e nenhum OOM. A exportação direta por stdout sofreu avaria no cliente Windows; salvar a prova em arquivo protegido na VM por SSH **EXIT 0** e baixá-la por SCP **EXIT 0** recuperou JSON idêntico, confirmado por comparação.
- Domínio ativo: **`spm-hml.35.215.232.88.sslip.io`**, com DNS normal e TLS verificados sem substituir a resolução por IP. Entrada do painel: [https://spm-hml.35.215.232.88.sslip.io/atendente](https://spm-hml.35.215.232.88.sslip.io/atendente).
- Por orientação do usuário, o site institucional é público durante a janela da HML e abre diretamente, sem Basic Auth. A validação final confirmou páginas públicas e readiness HTTP 200 sem credenciais, `/admin` redirecionando para o login e rotas protegidas recusando chamadas sem sessão/token. O navegador também abriu o site sem a antiga exigência Basic.
- O serviço Google Endpoints anterior, configuração `2026-10-01r0`, permanece criado: `hml.endpoints.site-institucional-510319.cloud.goog` tem registro A confirmado por Google e Cloudflare, mas retorna `SERVFAIL` no DNS desta rede local. Esse hostname não é usado pela configuração ativa; os testes externos de TLS e OAuth realizados nele ficam registrados como histórico.
- Orçamento mensal **R$ 100**, filtrado somente para este projeto, criado e conferido: ID `fbada1e9-5196-41cc-bf71-6777afd138fc`. Alertas de consumo em 50%, 90% e 100%, mais previsão de 100%; orçamento envia alertas e não bloqueia cobranças.
- A exigência global de 2FA está agendada pelo administrador para **19 de outubro de 2026**. O usuário confirmou 2FA individual e autorizou somente `suporteti@spmnacional.org.br`; a HML implementa allowlist e confirmação individual dessa conta, mantendo a declaração global `false`. Login e sessões de outras contas são recusados.
- Branding e cliente OAuth Web internos `SPM Nacional — HML` criados no Console; client ID e secret instalados na versão 1 dos cofres HML. O primeiro fluxo completo no domínio ativo passou em **1/10 às 23:04 UTC (20:04 Brasília)**. Após a publicação final, um login Workspace novo no navegador chegou a `/admin` em **3/10 às 02:59 UTC (2/10 às 23:59 Brasília)**: 14 áreas, um usuário e zero notícias; o registro da prova é de 03:03 UTC. As origens JavaScript autorizadas permanecem vazias, pois o OAuth é executado no servidor. Calendar tem chave restrita à API e ao IPv4, armazenada no Secret Manager; ID do calendário e SMTP continuam pendentes.
- Não houve importação do acervo real. Historicamente, após a validação de quinta-feira, 1/10, a VM foi desligada e `TERMINATED` conferido; depois foi religada para a exceção até 21h. Em **2/10**, a nova exceção até **03/10 às 06h Brasília** foi aplicada, com timer habilitado, ativo e aguardando, quota de saída de **512 MiB** e shaping de **10 Mbit/s**, preservando a baseline. A associação da política semanal à VM foi conferida; primeiro ciclo real e desligamento futuro ainda não foram observados.
- As imagens finais do app e do migrador, sem npm global, passaram build, 13 smokes offline e scans Trivy OS/bibliotecas com zero achados nos respectivos digests. PostgreSQL endurecido também passou scan com zero achados, integridade e ensaio isolado de 13 migrações, backup/restauração e reinício. Os quatro digests finais foram instalados e confirmados na VM; o backup real da HML verificou **33 tabelas e uma sequência**, origem preservada e remoção do banco de ensaio, com dump de **111.498 bytes** enviado ao GCS e MD5/geração do recibo validados. O ensaio local verificou **34 tabelas e duas sequências**, devido aos dados de teste próprios. Esse zero não abrange Caddy: o digest 881bbc60 da versão 2.11.6 mantém um `UNKNOWN` em `x/crypto/openpgp`, sem correção upstream identificada e com alcance não comprovado. O audit completo de desenvolvimento mantém 1 HIGH explícito em braces, mitigado por patch local e bloqueando o gate da CI.

Digests da release final confirmados na coletora:

| Componente | Digest |
| --- | --- |
| APP | `sha256:7488adb06c40b0a382c0b793a9b2048d381853a195cde92952c292ead802f338` |
| Migrador | `sha256:4a3d9b21d38680940477e1a1cb4582806f730249cc49186fee0243ef8de88420` |
| PostgreSQL | `sha256:605136e47342394723b247f76a53ea82804c3855349124db6e31ff29558bf515` |
| Caddy 2.11.6 | `sha256:881bbc60f9986d5ab8e7cfd6cf7e4ef3c9c0439fef2429d035d065577882f028` |

Após a validação, as cinco tags de retenção foram promovidas: `protected-current`
para APP, migrador e PostgreSQL finais; `protected-previous` para APP b964c14e e
migrador 45f6a4eb, com protocolo compatível. Isso preserva imagens de retorno;
não reverte schema ou dados.

As alterações locais anteriores do site foram preservadas. A configuração de produção em `infra/terraform` continua separada desta HML.

## Arquitetura e consumo

Uma VM `e2-micro`, disco persistente `pd-balanced` de 20 GiB, PostgreSQL 18.6 e Next.js em contêineres. O banco não tem interface TCP: a aplicação e as operações compartilham o socket privado `/var/run/postgresql`, com senha SCRAM e papéis distintos `spm` (migração) e `spm_app` (runtime). Não há Cloud SQL, Cloud Run, balanceador ou Cloud NAT neste ambiente.

Uploads vão para bucket GCS privado e versionado. Backups lógicos vão para outro bucket privado; a identidade da VM pode criá-los, mas não lê-los nem apagá-los. Lifecycle conserva backups e versões antigas dos uploads por 30 dias. Terraform protege disco, buckets e cofres contra exclusão acidental; os segredos não entram no estado nem nos metadados.

Há IPv4 fixo para manter DNS e callback OAuth estáveis. O hostname ativo é `spm-hml.35.215.232.88.sslip.io`, que incorpora o IPv4 da própria VM e não exige compra de domínio. O DNS local confirmou esse formato com pontos. O hostname Google Endpoints anterior permanece como configuração histórica não usada, devido ao `SERVFAIL` nesta rede. A configuração ativa e o histórico estão em [dns/README.md](dns/README.md).

O IPv4 fixo e o disco continuam cobrados com a VM desligada. Buckets, imagens, segredos, tráfego e tradução também entram na conta conforme uso. As margens do agendamento aumentam as horas de computação em relação às oito horas de acesso; as estimativas anteriores não são orçamento fechado. A configuração inicial limita tradução a **5.000 caracteres de origem por dia UTC**, compartilhados entre idiomas, quando ativada; o horário da HML é Brasília. O limite de tradução não limita toda a fatura do projeto.

O orçamento aplicado acompanha R$ 100 por mês deste projeto, excluindo todos os créditos do cálculo para que eles não escondam o consumo. Os alertas usam os destinatários IAM padrão do faturamento, sem Pub/Sub ou canais adicionais. O orçamento é independente do módulo Terraform e não desliga recursos quando o valor é atingido; detalhes em [budget/README.md](budget/README.md).

Para a exceção de 2–3/10, a reserva conservadora de planejamento foi **R$ 12**, com premissa de até oito horas e contingência. É estimativa, não fatura confirmada, preço mensal ou teto monetário automático. A quota de saída e o shaping limitam parte do consumo; não limitam todas as cobranças do projeto.

O proxy Caddy serve o site institucional por HTTPS sem Basic Auth e envia `X-Robots-Tag: noindex, nofollow, noarchive`. O painel usa somente login Google Workspace, escolhido em `/atendente`, com as restrições de conta já configuradas. O SSH só entra por IAP e OS Login. A identidade da VM usa tokens curtos do metadata server, sem chave JSON de conta de serviço.

A aplicação e as operações compartilham a identidade IAM da VM. Um comprometimento do contêiner web pode alcançar o metadata server e os cofres SQL de migração; separar os papéis SQL no ambiente não oferece isolamento IAM entre contêineres. A HML usa uma VM e não recebeu acervo de produção; conta técnica, sessões e registros de acesso são reais. Os ensaios locais usam dados sintéticos. Rever esse isolamento antes de importar o acervo ou dados de atendimento reais.

## Janela de acesso

Segunda, quarta, sexta, sábado e domingo, **09:00–17:00**. Terça, quinta e demais horários ficam fechados.

O agendamento externo do Compute inicia às 08:45 e para às 17:15 nos dias permitidos. O gate local avalia o horário a cada minuto, inicia o proxy apenas dentro da janela e o interrompe às 17h, inclusive depois de reinício manual. O agendamento do Compute pode atrasar; preparar às 08:45 dá margem, mas não garante disponibilidade exata às 09h. O pacote inicia fechado quando faltam configuração, segredos ou readiness.

Exceção aplicada e autorizada **somente de 2/10/2026 até 3/10 às 06h Brasília**: `open-test-window.sh` arma `spm-hml-test-window-20261002.timer` para **3/10 às 09h UTC**, antes de gravar o arquivo protegido. A instalação e o estado habilitado/ativo/aguardando foram confirmados; o disparo futuro ainda não foi observado. O gate mantém readiness e login Google no painel; o prazo é exclusivo e não pode ultrapassar `1791018000`. O handler solicita desligamento somente entre 06:00 e 06:05 de 3/10. Um timer recuperado mais tarde apenas limpa a exceção, sem desligar uma VM no horário regular. O agendamento semanal não muda: sábado, 3/10, continua com início previsto às 08:45 e acesso **09:00–17:00**, sujeito à readiness.

Histórico: a exceção de **1/10 até 21h Brasília** usou `spm-hml-test-window-20261001.timer`, com prazo em 2/10 às 00h UTC. Ela não autoriza acesso em outras datas.

## Contas CLI simultâneas

Todas as operações deste ambiente devem informar a configuração, sem trocar a configuração ativa de outro trabalho:

```powershell
gcloud --configuration=spm-site-hml --account=suporteti@spmnacional.org.br --project=site-institucional-510319 auth list
gcloud --configuration=spm-site-hml --account=suporteti@spmnacional.org.br --project=site-institucional-510319 config configurations list
gcloud --configuration=spm-site-hml --account=suporteti@spmnacional.org.br --project=site-institucional-510319 projects describe site-institucional-510319
gcloud --configuration=spm-site-hml --account=suporteti@spmnacional.org.br --project=site-institucional-510319 billing projects describe site-institucional-510319
```

Credenciais CLI e Application Default Credentials (ADC) são independentes. O script operacional usa um token CLI transitório para Terraform e um login Docker em diretório temporário. Não execute `gcloud auth application-default login` ou altere o quota project ADC de outro projeto para preparar esta HML.

## Faturamento e política de acesso

O [faturamento do projeto](https://console.cloud.google.com/billing/linkedaccount?project=site-institucional-510319) já está vinculado à conta ativa, e o orçamento HML já foi criado. Não é necessário repetir a ativação ou o vínculo para publicar atualizações.

Antes de ampliar o acesso ao painel, exigir 2FA no Workspace para o conjunto de usuários, confirmar a política e só então preencher `GOOGLE_WORKSPACE_MFA_ENFORCED=true` em `config.env`. Até a ativação prevista para 19 de outubro, esta HML usa a exceção autorizada para uma única conta: `GOOGLE_OAUTH_ALLOWED_EMAILS` e `GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS` iguais a `suporteti@spmnacional.org.br`, com declaração global `false`. Isso registra a confirmação operacional do administrador; não verifica 2FA pelo token OAuth e não permite outras contas.

Referências: [vínculo e permissões de faturamento](https://docs.cloud.google.com/billing/docs/how-to/modify-project), [2FA Workspace](https://support.google.com/a/answer/175197), [agendamento Compute](https://docs.cloud.google.com/compute/docs/instances/schedule-instance-start-stop).

## Operar a infraestrutura aplicada

`Invoke-Hml.ps1` fornece `Preflight`, `Infrastructure` e `Build`. O script confere conta, projeto, faturamento e ferramentas; nunca aplica o módulo de produção. `Infrastructure` guarda plano e configuração em `.private`, inspeciona o plano e rejeita exclusões e projeto inesperado. O backend usa bucket privado regional com versionamento e prefixo `spmnacional/hml`.

A criação inicial já foi aplicada. Para futuras alterações, gerar e revisar o plano; acrescentar `-Apply` somente quando a mudança de infraestrutura for necessária. Atualizações das imagens usam `Build` e o deploy da VM.

```powershell
.\infra\hml\Invoke-Hml.ps1 -Action Preflight
.\infra\hml\Invoke-Hml.ps1 -Action Infrastructure
.\infra\hml\Invoke-Hml.ps1 -Action Build
```

Confirmar IAM do operador para Terraform, publicação de imagens e SSH. Para operar a VM por IAP, são necessários acesso ao túnel, OS Admin Login e uso da conta de serviço da VM. A configuração não concede permissões novas a usuários arbitrários.

Os valores dos segredos devem ser adicionados ao Secret Manager usando **arquivos locais protegidos** e `--data-file`; não passar senhas pelo histórico/argumentos nem colá-las em chats. Gerar segredos novos e independentes para HML. Preservar senhas e a chave de criptografia em atualizações: trocar um arquivo não muda a senha gravada no PostgreSQL e perder a chave AES impede ler registros cifrados.

## Completar as integrações e publicar

Usar `HML_DOMAIN=spm-hml.35.215.232.88.sslip.io` na configuração protegida da VM. `configure.py` deriva `APP_URL` e `NEXT_PUBLIC_SITE_URL` como `https://spm-hml.35.215.232.88.sslip.io`, e configura Caddy para esse hostname. A entrada do painel é `/atendente`. O Workspace é `spmnacional.org.br`, e o administrador inicial autorizado é `suporteti@spmnacional.org.br`. Não levar o `.env` local para a VM.

O cliente Web interno já existe no [Google Auth Platform](https://console.cloud.google.com/auth/overview?project=site-institucional-510319), com client ID e secret instalados nos cofres HML. O callback da configuração ativa é `https://spm-hml.35.215.232.88.sslip.io/api/auth/google/callback`; mantê-lo alinhado a `HML_DOMAIN` em futuras alterações. Deixar **Origens JavaScript autorizadas vazias**: o fluxo Authorization Code + PKCE ocorre no servidor e usa o URI de redirecionamento autorizado. O fluxo completo no navegador foi validado no domínio ativo com a conta autorizada, chegando ao painel `/admin`. O cliente IAM OAuth da CLI não substitui este cliente de login do site.

Calendar precisa do ID de um calendário público da organização e chave restrita a `calendar-json.googleapis.com` (e ao IPv4 fixo da VM quando configurada). SMTP precisa de conta institucional, senha de app ou relay autenticado compatível; não usa Gmail API. Deixar essas integrações desligadas até obter credenciais completas. Não foram enviados e-mails nem criados eventos no calendário nesta preparação.

O build produz `APP_IMAGE` e `MIGRATOR_IMAGE` por digest em `release.env`; a release final também fixa `POSTGRES_IMAGE` endurecida e `CADDY_IMAGE` oficial por digest. Copiar o pacote `vm/`, `release.env`, `config.env` e versões de segredos por SCP/IAP, instalar em `/opt/spm-hml` com proprietário root e executar `sudo /opt/spm-hml/deploy.sh`. Diretórios e scripts executáveis usam 0700; configuração e segredos usam 0600. Os módulos de código `preflight.mjs` e `provision-runtime.mjs`, sem segredos, precisam de 0644 para leitura pelo UID 1001 dos contêineres. O arquivo `vm/README.md` detalha instalação e recuperação.

O deploy valida configuração, busca versões dos cofres, migra, provisiona/verifica o papel limitado, faz bootstrap apenas em banco sem usuários, inicia web e confere readiness. O bootstrap não importa conteúdo nem cria dados de demonstração. Importação do acervo e de dados locais precisa de plano de migração separado; não copiar volumes de banco nem importar dados pessoais reais automaticamente para HML.

O Artifact Registry mantém as dez versões recentes por pacote e expurga versões antigas não protegidas. Ao promover, mover as tags `protected-current` e `protected-previous` para os digests efetivamente usados; não criar uma tag protegida nova por release, pois isso impediria a limpeza.

## Validação já realizada e pendente

No ensaio histórico de **1/10**, passaram build das duas imagens, 207 testes focados de runtime/Workspace/login local, Terraform `fmt/validate` e três cenários simulados, sete migrações no PostgreSQL isolado por socket SCRAM, bootstrap, papel SQL separado, HTTP 200, reinício com persistência e dump/restauração isolada. Em **2/10**, a suíte SQL consolidada passou **65 testes em 11 arquivos** com as **13 migrações**, incluindo RLS nonowner, corridas, outboxes e recuperação de upload. Os ensaios usaram dados/volumes exclusivos, removidos ao terminar, sem banco ou `.env` de desenvolvimento.

Também passaram 79 verificações do script operacional, 216 verificações da preservação/provisão dos segredos em PowerShell 5.1 e 7 e 42 casos da janela de acesso. As 28 verificações sintéticas de configuração/Compose/Caddy ficam registradas como histórico da configuração anterior, que incluía Basic Auth. As fixtures bcrypt das 216 verificações continuam no pacote de provisão/preservação dos segredos; não representam autenticação ativa no site. Também passaram 40 verificações do bootstrap TLS e 11 cenários de espera pela readiness. Todos os scripts Bash e módulos Node do pacote foram verificados. O backup mantém um único dump pendente para reenviar após falha, evitando acumular novos dumps a cada tentativa; o procedimento de recuperação está em `vm/README.md`.

Como histórico do GCP em **1/10**, Terraform/deploy, 23 verificações GCS/Translation, sete migrações, reinício com persistência, backup GCS e restauração da amostra sintética passaram. Um reboot gracioso preservou as sete migrações daquela release e o gate externo fechado na quinta-feira. A release final de **3/10 UTC (2/10 Brasília)** terminou EXIT 0 e confirmou as **13 migrações**, seis tabelas FORCE RLS, runtime restrito, banco somente por socket e um único administrador Workspace aprovado. A coletora JSON final confirmou digests, timezone Brasília, readiness/liveness 200, nenhum OOM e timers. Antes da troca do PostgreSQL, a restauração isolada real da HML verificou 33 tabelas e uma sequência, com origem preservada e upload GCS de 111.498 bytes validado por MD5 do recibo e geração positiva. O histórico de sete migrações permanece identificado separadamente. O coletor não valida OAuth; salvar a prova por SSH e baixar por SCP passaram EXIT 0 com JSON idêntico, após a avaria da exportação direta por stdout no cliente Windows.

O domínio ativo passou em DNS/TLS normal, sem substituir a resolução por IP. A prova HTTP final repetida em **3/10 às 03:10 UTC (3/10 às 00:10 Brasília)** confirmou **18 checks e 372.529 bytes**, incluindo páginas públicas/readiness 200, 404 para caminho inexistente e arquivos internos, `/admin` redirecionando sem sessão, rotas cron/admin recusando chamadas anônimas e HTTP redirecionando para HTTPS. O navegador abriu o site sem Basic Auth e repetiu Google até `/admin` às **02:59 UTC de 3/10 (23:59 Brasília de 2/10)**, com atividade exibida nesse horário. Ver [matriz e limitações consolidadas](../../docs/auditoria-76-resumo.json).

Faltam SMTP, ID do calendário, observação do primeiro ciclo real do Compute e ensaios prolongados na `e2-micro`; não houve importação de acervo de produção. O timer da exceção de **2/10 até 3/10 06h Brasília** foi confirmado habilitado, ativo e aguardando, mas o desligamento futuro ainda não foi observado. O sábado regular mantém início previsto 08:45 e acesso 09h–17h sujeito à readiness. A carga pública Docker monotônica delimitou saturação entre **50 req/s PASS e 75 req/s FAIL**, com drops também a partir de 100 req/s; o ensaio completo retornou `passed=false/exit 99`, com saúde 200 e cleanup. Mediu a imagem pública anterior b964c14e: não mede a VM, produção ou o painel autenticado da release final. Os ensaios k6 com tempos negativos permanecem inconclusivos.

Histórico da proteção Basic anterior: sem credenciais HTTPS 401; com as credenciais corretas, home e readiness HTTPS 200 e certificado verificado. A versão 2 de `HML_BASIC_AUTH_HASH` corrigiu um CR introduzido pelo pipeline PowerShell na geração anterior. Esse cofre e sua versão permanecem preservados, sem rotação; o hash não é usado pelo Caddy ativo, e o site público não solicita aquela senha. No hostname anterior, Google, Cloudflare e o resolver da VM confirmaram o registro A, mas o DNS desta rede retornou `SERVFAIL`; o teste externo usou o IP fixo confiável sem desabilitar a validação TLS. O domínio ativo `spm-hml.35.215.232.88.sslip.io` passou na validação final com DNS normal, acesso anônimo e login Google no navegador.
