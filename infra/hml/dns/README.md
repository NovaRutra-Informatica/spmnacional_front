# DNS da HML

## Configuração ativa

Hostname: **`spm-hml.35.215.232.88.sslip.io`**. O DNS local confirmou o registro A para `35.215.232.88`, o IPv4 fixo da VM `spm-hml-vm` no projeto `site-institucional-510319`. O serviço aceita IPv4 com pontos ou hífens e prefixos em subdomínio; este hostname usa o formato com pontos. [Documentação sslip.io/nip.io](https://nip.io/).

O site institucional em [https://spm-hml.35.215.232.88.sslip.io](https://spm-hml.35.215.232.88.sslip.io) é público durante a janela da HML, sem Basic Auth. O visitante escolhe o login Google para o painel em [https://spm-hml.35.215.232.88.sslip.io/atendente](https://spm-hml.35.215.232.88.sslip.io/atendente). `HML_DOMAIN=spm-hml.35.215.232.88.sslip.io` gera `APP_URL` e `NEXT_PUBLIC_SITE_URL` com essa origem HTTPS, e Caddy usa o mesmo hostname para atender e emitir seu certificado. DNS normal e TLS foram validados sem substituir a resolução por IP, e o navegador abriu o site público sem Basic Auth.

Callback do cliente OAuth Web interno existente:

`https://spm-hml.35.215.232.88.sslip.io/api/auth/google/callback`

**Origens JavaScript autorizadas permanecem vazias**. O fluxo Authorization Code + PKCE é executado no servidor; configurar o URI de redirecionamento autorizado acima, alinhado a `APP_URL`. Client ID e secret permanecem na versão 1 dos cofres HML. O caminho foi conferido nos handlers reais. [Regras OAuth](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).

O fluxo completo Google no navegador passou neste domínio às **23:04 UTC (20:04 Brasília)**: escolha da conta `suporteti@spmnacional.org.br` e chegada a `/admin`. Requisições anônimas a `/`, `/atendente`, `/quem-somos` e `/api/health/ready` retornaram HTTP 200; `/admin` redirecionou com HTTP 307 para `/atendente`. Upload administrativo com Origin válido e sem sessão, além dos cron jobs sem token, retornaram HTTP 401. `WWW-Authenticate` estava ausente e `X-Robots-Tag: noindex` foi preservado.

A exceção de acesso vale somente em **1/10/2026 até 21h Brasília**, mantendo readiness e autenticação Google apenas no painel. O timer persistente foi conferido habilitado, ativo e aguardando às 23:06 UTC, sem modificar a agenda regular. O antigo `HML_BASIC_AUTH_HASH` versão 2 permanece preservado como histórico, sem rotação e sem uso pelo Caddy ativo.

## Histórico: serviço Google Endpoints não usado

Aplicado em **1º de outubro de 2026**, com configuração `2026-10-01r0`. O serviço `hml.endpoints.site-institucional-510319.cloud.goog` permanece criado, e seu registro A foi confirmado para `35.215.232.88` por consultas Google e Cloudflare. O DNS desta rede local retorna `SERVFAIL`, portanto esse hostname não integra a configuração ativa. TLS externo e integração real do OAuth nele passaram, com certificado aceito, sessão Secure/HttpOnly e `/admin` HTTP 200; a conclusão OAuth usou relay preservando state, PKCE e cookies originais.

Registro dos comandos usados para a configuração anterior; eles não são necessários para o hostname ativo sslip.io:

```powershell
gcloud --configuration=spm-site-hml --account=suporteti@spmnacional.org.br --project=site-institucional-510319 --quiet services enable servicemanagement.googleapis.com
gcloud --configuration=spm-site-hml --account=suporteti@spmnacional.org.br --project=site-institucional-510319 --quiet endpoints services deploy infra/hml/dns/openapi.yaml --format=json
```

A publicação criou o A-record do serviço anterior. O nome segue o formato Compute Engine com o ID do projeto. [DNS oficial](https://docs.cloud.google.com/endpoints/docs/openapi/cloud-goog-dns-configure).

O SDK 580 instalado foi inspecionado: cria ManagedService, compila OpenAPI, faz rollout e habilita o próprio serviço produzido. Usa Service Management e Service Usage. Não instala ESP nem cria VM, proxy, balanceador, zona Cloud DNS ou NAT. O serviço é global, sem parâmetro de região.

A independência de ESP para DNS é uma inferência do fluxo documentado: o registro nasce ao publicar a especificação. HTTPS e acesso continuam com Caddy e a aplicação. [Publicação oficial](https://docs.cloud.google.com/endpoints/docs/openapi/deploy-endpoints-config).

Criação exige `servicemanagement.services.create`; configuração/rollout usam `servicemanagement.services.update`, e habilitação usa `serviceusage.services.enable`. O operador já tem `roles/owner`; não há novo IAM na VM. O domínio é do Google e o serviço/configuração pertencem ao projeto. [IAM oficial](https://docs.cloud.google.com/service-infrastructure/docs/service-management/access-control).

Endpoints cobra operações reportadas a Service Control. Sem ESP/Frameworks ou chamadas Service Control, a expectativa é zero operações faturáveis deste serviço, inferida da regra oficial. Custos existentes da VM, IP e tráfego continuam. [Preços oficiais](https://cloud.google.com/endpoints/pricing).

O arquivo `openapi.yaml` deste diretório registra essa configuração histórica. A troca de hostname ativo não modifica esse serviço global nem cria outra VM, IP ou configuração IAM.
