# Operação da VM HML

Este pacote usa Debian 12, Docker Compose, PostgreSQL 18.6 e Caddy. O Terraform
fica no diretório irmão `terraform/`. A aplicação e o migrador são construídos
na estação/CI e referenciados por digest no Artifact Registry; a VM não faz build.
O script de startup prepara o host e mantém o site fechado quando falta configuração.

Baseline da auditoria `hml-20261002-76-04` instalada EXIT 0 em 3/10/2026 UTC
(2/10 Brasília): 13 migrações, seis tabelas ENABLE/FORCE RLS, papel `spm_app`
nonowner sem SUPERUSER/BYPASSRLS, prontidão `scoped-rls-v1` HTTP 200 e timezone
efetivo `America/Sao_Paulo`. A coletora confirmou APP 7488adb0, migrador 4a3d9b21,
PostgreSQL 605136e4 e Caddy 881bbc60 por digest, sem OOM. Os digests completos e
evidências constam no [guia HML](../README.md).

Atualização `hml-20261003-logo` publicada em 3/10/2026, antes do corte das 06h
de Brasília: APP por digest `617e575dc4e2c64b766259ada21136a964e71765ff6f7acfb0fe77953168b85b`;
migrador, PostgreSQL e Caddy preservados. A arte institucional original
`public/assets/spm_logo_atualizada.png` passou a ser usada no cabeçalho, rodapé,
login, painel, favicon e imagem social, sem redesenho ou recorte.

Foi realizado backup online novo de 111.778 bytes no bucket privado antes da
importação editorial, com recibo MD5/tamanho/geração verificado. A nova cópia não
teve restauração ensaiada neste procedimento. Foram inseridos 141 registros de
14 tabelas, incluindo 10 notícias, 17 regionais, 11 documentos, quatro editais,
quatro edições da Semana do Migrante e quatro eventos; o arquivo local de 4.549
bytes foi enviado ao bucket de uploads e verificado por hash na rota pública.
Quatro depoimentos sem consentimento ficaram não publicados. Contas, credenciais,
sessões, logs, permissões, filas e chaves locais não foram importados; as tabelas
locais de contato, atendimentos e boletim estavam vazias. O administrador HML e
as 13 migrações foram preservados.

Os utilitários revisados são `scripts/hml-data-export.mjs`,
`scripts/hml-data-import.mjs` e `scripts/lib/hml-data-transfer.mjs`. O exportador
exige Docker local e protege a saída temporária por ACL no Windows. O importador
usa transação, bloqueios e parâmetros SQL, remapeia referências por identidade
editorial e preserva registros existentes; dados pessoais precisam de um
procedimento próprio de recifragem e são recusados por este exportador.
Dez testes unitários e nove cenários PostgreSQL isolados verificaram repetição,
concorrência, preservação e rollback. A conferência HTTPS verificou 14 rotas,
sete notícias públicas, três conteúdos não publicados ocultos, a logo original
byte a byte e o upload. O scan da imagem nova não encontrou vulnerabilidades;
os limites de Caddy e da dependência de desenvolvimento documentados abaixo
continuam aplicáveis. O transporte IAP apresentou timeouts intermitentes antes
do SSH; nenhuma operação concluída foi repetida. O corte excepcional das 06h e
o agendamento regular não foram alterados.

App/migrador passaram 13 smokes offline e scans com zero achados; PostgreSQL
endurecido passou scan, integridade e ensaio real isolado de migração, restauração
e reinício. O migrador usa dependências de produção e copia somente o executável
schema-engine necessário, sem ESLint/braces ou npm global. Caddy 2.11.6 mantém
1 UNKNOWN em x/crypto/openpgp, com alcance não comprovado. O audit completo de
desenvolvimento mantém 1 HIGH em braces, com
[mitigação local documentada](../../../patches/README.md) e gate da CI bloqueado.
Nenhum scan é prova de ausência de vulnerabilidades.

Instale **todos** os arquivos deste diretório em `/opt/spm-hml` como root, sem copiar
os arquivos de exemplo sobre configurações existentes. Diretórios: modo 0700;
`release.env`, `config.env`, `secret-versions.json` e `generated/*.env`: modo 0600.
Arquivos `.mjs` montados nos contêineres: root:root 0644, para leitura pelo UID 1001.
O diretório de origem continua 0700; o daemon Docker monta cada arquivo individual.
Use arquivos com LF. Nunca copie o `.env` do desenvolvimento para a VM.

1. Preencha `release.env` e `config.env` a partir dos exemplos. A configuração ativa
   usa `HML_DOMAIN=spm-hml.35.215.232.88.sslip.io`, com o IPv4 fixo da própria VM.
   `configure.py` deriva `APP_URL` e `NEXT_PUBLIC_SITE_URL` com essa origem HTTPS
   e passa o mesmo hostname ao Caddy. O site institucional abre diretamente por
   HTTPS, sem Basic Auth, durante a janela da HML. A entrada do painel Google é
   `https://spm-hml.35.215.232.88.sslip.io/atendente`.
   No cliente OAuth Web interno existente, manter **Origens JavaScript autorizadas
   vazias** e o URI de redirecionamento autorizado exatamente igual a
   `https://spm-hml.35.215.232.88.sslip.io/api/auth/google/callback`.
   O fluxo OAuth ocorre no servidor; a mudança de hostname requer deploy normal
   e novo login no domínio ativo.
2. Adicione versões reais aos segredos existentes no projeto. URLs SQL devem usar
   `postgresql://spm:SENHA_URL_ENCODED@localhost/spmnacional?host=/var/run/postgresql&schema=public`
   para o migrador e usuário `spm_app` com senha independente para o runtime.
   O owner usa a mesma senha de `POSTGRES_PASSWORD`. Não regenerar a chave AES
   de um banco importado. `HML_BASIC_AUTH_HASH` versão 2 permanece como cofre
   histórico preservado, sem rotação; o Caddy ativo não usa Basic Auth.
   A antiga senha Basic não é solicitada pelo site ou pelo painel.
3. OAuth client ID/secret e domínio Workspace são obrigatórios. O exemplo mantém
   a declaração de política global 2FA falsa; só alterá-la após exigência efetiva
   confirmada pelo administrador. Há uma exceção autorizada somente para esta
   HML `gcp-vm`: preencher `GOOGLE_OAUTH_ALLOWED_EMAILS` e
   `GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS` com a mesma conta Workspace única,
   cujo 2FA individual o responsável confirmou, e usar esse e-mail no bootstrap.
   Campos ausentes, diferentes, malformados ou com mais de uma conta bloqueiam
   o deploy. A confirmação é operacional: não prova MFA no token OAuth.
   `GOOGLE_WORKSPACE_MFA_ENFORCED` continua false durante a exceção; Cloud Run
   exige política global true e não admite essa exceção. Login local nunca é habilitado.
4. Execute `sudo bash /opt/spm-hml/startup.sh` quando precisar instalar as unidades
   systemd depois de enviar o pacote e `sudo bash /opt/spm-hml/deploy.sh` para publicar.
   Ele valida configuração, baixa imagens, migra uma vez, cria/verifica `spm_app`,
   faz bootstrap somente se a tabela User estiver vazia, verifica readiness e Caddy.
   Não executa seed e não redefine contas existentes.
   Depois da liveness, aguarda readiness HTTP 200 por até 120 segundos, porque a
   primeira consulta SQL na `e2-micro` pode aquecer lentamente. O limite não
   repete migrações e mantém o acesso fechado se a conectividade não se recuperar.

O projeto/registro/buckets/mapa de segredos vêm dos metadados `hml-project-id`,
`hml-region`, `hml-prefix`, `hml-uploads-bucket`, `hml-backups-bucket`,
`hml-artifact-repo` (ID simples do repositório) e `hml-secret-map` (JSON env → secret ID).
`configure.py` acessa cada segredo com gcloud, sem ecoar payloads. Na primeira
configuração, resolve `latest` e grava versões numéricas em `secret-versions.json`;
reboots usam as mesmas versões. Para rotação, atualizar os números protegidos e
executar novamente o deploy. Nunca imprimir `docker compose config` ou `docker inspect`
com segredos; use `compose config --quiet` e logs operacionais necessários.

O PostgreSQL não abre porta TCP, inclusive na rede Docker. Somente os contêineres
necessários recebem o volume de socket `/var/run/postgresql`, com autenticação
SCRAM. Runtime não recebe senha owner nem credencial DDL. O papel runtime é criado
apenas quando ausente; papel existente é verificado e não recebe rotação automática.
Uma senha nova incompatível com um banco existente bloqueia o deploy e exige
procedimento operacional coordenado. O provisionador usa parâmetros/quote_literal
no PostgreSQL; nunca coloca senha em argv ou logs.
Essa separação protege as credenciais injetadas e os privilégios SQL do processo.
A identidade IAM anexada à VM é compartilhada: acesso ao metadata server pode
permitir a um processo comprometido acessar outros cofres concedidos à VM,
inclusive o owner. A VM única não oferece isolamento IAM forte entre contêineres.
A HML não recebeu acervo de produção; conta técnica, sessões e registros de acesso
são reais. Os ensaios locais usam dados sintéticos. Produção e importação do acervo
precisam de desenho e validação próprios.

`spm-hml-gateway.timer` avalia a cada minuto o fuso `America/Sao_Paulo`: segunda,
quarta, sexta, sábado e domingo, 09:00 inclusive até 17:00 exclusive. A VM pode
iniciar antes e parar depois segundo o agendamento do Compute Engine. O proxy
tem `restart: no`, exige assinatura do deploy válida no boot atual e configuração
inalterada; só o gate o inicia. Fora da janela, ele é parado. Um reboot ou mudança
de release/config requer novo preflight antes de reabrir. Caddy fornece HTTPS e
`X-Robots-Tag`, sem Basic Auth no site ou no callback OAuth. O site institucional
é público enquanto o gate estiver aberto. O administrador usa somente login
Google com a conta Workspace nominal ao escolher acessar o painel.
O login da aplicação fica em `/atendente`, e a sessão autenticada acessa `/admin`.
Quando houver allowlist, login e todas as sessões são reavaliados contra ela:
outras contas e uma conta removida/trocada da lista não acessam o painel. A HML
com confirmação individual fica restrita à única conta declarada. Agendar a
política global para uma data futura não habilita MFA global automaticamente.

O serviço DNS Google Endpoints `hml.endpoints.site-institucional-510319.cloud.goog`
continua criado como histórico não usado. Seu registro A foi confirmado por
resolvers públicos, mas esta rede local retorna `SERVFAIL`. A configuração ativa
usa `spm-hml.35.215.232.88.sslip.io`, com resolução local confirmada para
`35.215.232.88`; detalhes em [../dns/README.md](../dns/README.md).

Na validação final de 1/10/2026, DNS normal e TLS passaram sem substituir a
resolução por IP. Sem credenciais, `/`, `/atendente`, `/quem-somos` e
`/api/health/ready` retornaram HTTP 200; `/admin` retornou HTTP 307 para
`/atendente`. `POST /api/admin/uploads?purpose=biblioteca` com Origin válido e
sem sessão retornou HTTP 401; `POST /api/cron/agenda` e `POST /api/cron/retencao`
sem token também retornaram HTTP 401. O cabeçalho `WWW-Authenticate` estava
ausente e `X-Robots-Tag: noindex` foi preservado. O navegador abriu o site sem
Basic Auth e concluiu o fluxo Google com `suporteti@spmnacional.org.br` até
`/admin` às 23:04 UTC (20:04 Brasília).

Para emitir/verificar HTTPS fora da janela sem disponibilizar o site, use
`sudo bash /opt/spm-hml/tls-bootstrap.sh --timeout 180 --hold-seconds 60`.
O serviço temporário responde somente 503, sem proxy para a aplicação nem
credenciais, e reutiliza os volumes Caddy. Ele exige um deploy pronto, toma os
locks operacionais, verifica a cadeia CA e o hostname sem `--insecure` e devolve
o controle ao gate ao terminar. O contêiner expira em 360 segundos mesmo se a
sessão do operador desaparecer. Não inicie o gateway diretamente para testar TLS.

`spm-hml-cron.timer` executa retenção às 09:15, sincroniza Calendar a cada hora
habilitada e processa notificações duráveis de contato a cada cinco minutos;
essas rotinas também rodam após implantação dentro da janela. Chamadas são locais,
POST e autenticadas; cabeçalhos/corpos não entram nos logs. Falhas não são marcadas
como sucesso. Backup é tentado às 16:45, com nova tentativa até 17:00.
Notificações de contato, convites Workspace e confirmações do boletim têm
endpoint independente `/api/cron/notificacoes` e limite HTTP de
185 segundos; falha da retenção não suprime sua chamada. SMTP desligado preserva
os jobs pendentes sem consumir tentativas. O processamento usa até oito jobs por
ciclo, duas entregas simultâneas, lease de cinco minutos e até oito tentativas;
falhas persistentes exigem revisão operacional. O lote deixa de iniciar novas
entregas após 120 segundos; o transporte aplica seus timeouts de conexão/greeting
(10 segundos) e socket (30 segundos). Não há cancelamento de SMTP ativo por
AbortSignal no transporte instalado. Um ACK perdido após aceitação pode resultar
em uma segunda entrega; retries reutilizam o mesmo Message-ID, sem garantia de
exactly-once do provedor. Remover uma mensagem também remove seus jobs por FK.
Convites e confirmação do boletim usam payload AES-GCM, versões verificadas antes
do envio e validade de sete dias e 24 horas, respectivamente. Convite substituído,
conta desativada ou link de boletim substituído, confirmado, cancelado ou vencido
é descartado sem entrega. Retenção remove intenções vencidas e seus ciphertexts;
remover a conta/inscrição remove suas intenções por FK. Com e-mail desabilitado,
o boletim permanece sem confirmação e a interface informa que o usuário precisa
tentar novamente quando o envio estiver disponível. O limite de oito jobs e duas
entregas simultâneas é compartilhado entre as filas nesse endpoint.
O teste offline `infra/hml/tests/check-cron.sh` executa o agendamento real com
arquivos sintéticos e confirma falha de retenção, isolamento da janela e limpeza
do arquivo privado de cabeçalho, sem rede nem segredos reais.

Para backup manual: `sudo bash /opt/spm-hml/backup.sh`. Produz `pg_dump -Fc`, verifica
o índice com `pg_restore --list` e envia objeto único ao bucket privado por REST,
com precondição de geração zero. A VM usa apenas `storage.objectCreator` nesse
bucket: não pode ler nem apagar backups. Dumps enviados são removidos do disco;
uma falha preserva o dump 0600 para diagnóstico/reenvio e exige conferir espaço.
Há somente um dump pendente: `backups/pending.dump` é reenviado antes de criar
qualquer captura nova. Falha durante a captura reutiliza `pending.partial` na
próxima tentativa. O nome do objeto mantém o horário da captura e um sufixo único;
uma resposta de upload perdida pode produzir uma segunda cópia remota. Um pendente
antigo enviado hoje não comprova que houve captura nova hoje. Conferir a idade do
objeto e a retomada das capturas após resolver a falha.
Nenhum dump contém a chave AES: sua recuperação depende do segredo preservado.
O teste de índice não substitui uma restauração. Ensaiar restauração lógica em banco
isolado, contagens, conteúdo cifrado e arquivos com uma identidade operacional
separada que tenha leitura do backup. Não restaurar sobre banco ativo como teste.
Volumes físicos PostgreSQL 18 não são portáveis para o SQL PostgreSQL 17.

Na publicação final, `backup-verify.sh` parou e conferiu gateway/web, removeu
readiness, restaurou o dump em banco temporário separado e comparou conteúdo,
contagens e sequências antes de remover o banco de ensaio. A prova real HML de
3/10 UTC verificou **33 tabelas e uma sequência**, origem inalterada e dump de
**111.498 bytes**; o upload posterior validou MD5 do recibo GCS e geração decimal
positiva. O ensaio Docker local separado verificou **34 tabelas e duas sequências**,
devido aos seus dados sintéticos. Essa manutenção termina fechada: a aplicação
volta apenas após deploy/readiness e avaliação do gate, sem restauração sobre o
banco ativo. Ver `tmp/hml-final76-proof.json` e `tmp/pg-secure76-smoke-proof.json`.

O host cria 1 GiB de swap; isso reduz encerramentos por falta de memória, mas não
garante capacidade. Limites iniciais: web 448 MiB, PostgreSQL 192 MiB, proxy 96 MiB;
o migrador executa enquanto a web está parada. Medir RSS, swap, latência e disco
antes de aceitar a `e2-micro`. Use `check-window.sh` para conferir 42 combinações
de dia/horário com data simulada, sem bypass no gate de produção.

As 28 verificações anteriores de `python3 check-config.py --docker` ficam como
histórico da configuração/Compose/Caddy com Basic Auth. Esse conjunto verificou
credenciais separadas, recusa de MFA ausente/URLs indevidas/releases sem digest
e preservação do bcrypt no env raw. As fixtures bcrypt continuam no pacote de
provisão/preservação dos segredos, validado em 216 verificações PowerShell 5.1 e 7;
elas não representam autenticação ativa no site.
Usa apenas fixtures sintéticas e um projeto Docker com nome aleatório, sem banco,
sem portas publicadas e removido ao final. Não acessa GCP nem o `.env` local.

Fontes: [Docker no Debian](https://docs.docker.com/engine/install/debian/),
[Basic Auth do Caddy, usada na configuração histórica](https://caddyserver.com/docs/caddyfile/directives/basic_auth),
[autenticação local PostgreSQL](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html).

## Exceção aplicada em 2/10/2026 até 3/10 às 06h Brasília

O pacote atual `open-test-window.sh` instala uma exceção protegida em
`state/access-exception.json` e arma `spm-hml-test-window-20261002.timer` para
**3/10 às 09h UTC**, equivalente a **06h Brasília**. A instalação arma e confere
o timer antes de gravar o JSON atomicamente; o gate continua exigindo readiness,
e o painel mantém o login Google. O arquivo deve ser root:root 0600, regular,
sem links, com data/fuso/início/prazo exatos. O prazo `1791018000` é exclusivo:
dados inválidos ou expirados não ampliam o acesso.

O handler solicita desligamento somente de 06:00 inclusive a 06:05 exclusive
de 3/10. Um disparo persistente recuperado depois dessa margem apenas remove a
exceção; não desliga uma VM no horário regular. A janela do Compute não muda:
sábado, 3/10, mantém início previsto às 08:45 e acesso **09h–17h**, sujeito à
readiness.

O comando `sudo bash /opt/spm-hml/open-test-window.sh` foi aplicado na VM pelo
operador. Timer habilitado, ativo e aguardando, quota de 512 MiB de saída, shaping
de 10 Mbit/s e baseline preservada foram confirmados. O disparo/desligamento
futuro ainda não foi observado; a quota de tráfego não é limite rígido de cobrança.
O helper aceita instalação somente em 2/10, antes do prazo e com duração
máxima de 24h. `check-exception.py` e `check-test-window.py` cobrem meia-noite,
expiração exata, permissões, timer e recuperação atrasada sem desligar uma VM real.

Histórico de 1/10: o comando foi aplicado para a autorização daquela data até
21h Brasília, usando `spm-hml-test-window-20261001.timer` (2/10 às 00h UTC).
Aquele timer foi conferido habilitado, ativo e aguardando às 23:06 UTC
(20:06 Brasília), antes do prazo. O timer de 2/10 foi conferido separadamente na
coletora atual, com prazo até 3/10 às 06h Brasília.
