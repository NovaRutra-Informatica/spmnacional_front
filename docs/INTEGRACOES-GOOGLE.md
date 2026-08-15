# Integrações com o Google

Dados de programa e limites confirmados em **agosto de 2026** nas páginas
oficiais do Google (`google.com/nonprofits`, `support.google.com`,
`developers.google.com` e `cloud.google.com`). Programa de doação muda de
regra com alguma frequência — **confira antes de tomar decisão baseada em
valor**.

---

## O que a organização ganha

O SPM é organismo da Pastoral Social da CNBB e se enquadra no perfil de
entidade sem fins lucrativos elegível ao **Google for Nonprofits**. A validação
no Brasil é feita por um parceiro do Google (historicamente o TechSoup Brasil),
que confere estatuto, CNPJ e finalidade.

Aprovada a organização, estes são os produtos disponíveis:

| Programa                            | O que dá                                                                                                | Onde entra neste sistema                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Google Workspace for Nonprofits** | Gratuito, **US$ 0/usuário/mês**, com **100 TB de armazenamento em pool** e limite de **2.000 usuários** | Contas `@spmnacional.org.br`, envio de e-mail e login no painel  |
| **Google Ad Grants**                | Até **US$ 10.000/mês** em anúncios de texto na Busca. Disponível no Brasil                              | Divulgação de campanhas, Semana do Migrante e canais de acolhida |
| **Google Maps Platform**            | **US$ 250/mês** em créditos                                                                             | Mapa das unidades regionais (`/onde-estamos`)                    |
| **YouTube Nonprofit Program**       | Incluído no pacote                                                                                      | Formação, testemunhos e transmissões                             |

Para uma organização deste porte, o Workspace gratuito já resolve e-mail,
identidade e armazenamento. O Ad Grants é o de maior impacto potencial — e o
de maior exigência de manutenção.

### Ad Grants: o que a conta precisa sustentar

O programa não é "dinheiro que cai". Ele tem regras de qualidade que, se não
forem cumpridas, suspendem a conta:

- **Site de qualidade**, com conteúdo próprio, carregamento rápido e sem
  excesso de anúncio de terceiros.
- **Mínimo de 2 sitelinks** por campanha.
- **CTR de 5%** — abaixo disso por dois meses seguidos, a conta é suspensa.
- **Pelo menos 1 conversão por mês**, com acompanhamento configurado.
- Só **anúncios de texto na Busca** (não há display, YouTube nem remarketing).

Consequência prática: entrar no Ad Grants exige alguém acompanhando a conta
todo mês. Não é decisão só de tecnologia — é compromisso de comunicação.

Conversão, neste site, tem candidatos naturais: envio do Fale Conosco,
inscrição no boletim e download de material da Semana do Migrante.

---

## E-mail

O sistema envia e-mail em quatro situações (`lib/server/mail.ts`): aviso de
nova mensagem do Fale Conosco, confirmação de recebimento para quem escreveu,
convite de acesso ao painel e confirmação de inscrição no boletim.

Sem SMTP configurado, **tudo continua sendo gravado no banco** — só não há
notificação. É degradação proposital, não falha silenciosa.

Com Google Workspace há dois caminhos:

|              | `smtp-relay.gmail.com`                    | `smtp.gmail.com`              |
| ------------ | ----------------------------------------- | ----------------------------- |
| Portas       | 25, 465, 587                              | 465 (SSL), 587 (TLS)          |
| Autenticação | Por **IP** (ou usuário/senha)             | Usuário + **Senha de App**    |
| Limite       | **10.000 destinatários por usuário/dia**  | **2.000 mensagens/dia**       |
| Remetente    | Qualquer endereço do domínio              | Só a conta autenticada        |
| Configuração | Admin Console (Apps > Gmail > Roteamento) | Nenhuma, além da Senha de App |

**Recomendação para este sistema: `smtp.gmail.com` com Senha de App.**

O relay autentica por IP, e o Cloud Run **não tem IP de saída fixo** sem Cloud
NAT — que custa mais do que o problema que resolve. Os limites do
`smtp.gmail.com` são folgados para o volume esperado (dezenas de mensagens por
dia, não milhares).

Como ligar:

1. Ative a verificação em duas etapas na conta institucional.
2. Gere uma **Senha de App** (Conta Google > Segurança > Senhas de app).
3. Grave a senha no Secret Manager, no segredo `spm-smtp-password`.
4. Ligue `enable_smtp = true` no terraform.

```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="contato@spmnacional.org.br"
SMTP_PASSWORD="<senha de app, 16 caracteres>"
MAIL_FROM="SPM Nacional <contato@spmnacional.org.br>"
```

> Senha de App é credencial de longa duração e dá acesso ao envio pela conta.
> Ela nunca vai para o `.env` de produção nem para o repositório: fica no
> Secret Manager, lida pela conta de serviço do Cloud Run.

---

## Login com Google Workspace (OAuth 2.0)

Entrar no painel com a conta institucional em vez de mais uma senha para
lembrar. A vantagem real não é comodidade: é que **desligar a pessoa no Admin
Console derruba o acesso ao painel junto**, sem depender de alguém lembrar de
desativar o usuário no sistema.

O fluxo é o autorização padrão (`code` + troca por token no servidor), com um
detalhe que vale por toda a segurança do recurso:

### O parâmetro `hd` não é garantia

Passar `hd=spmnacional.org.br` na URL de autorização faz o Google **sugerir**
apenas contas daquele domínio no seletor. É experiência de uso.

Um cliente malicioso pode simplesmente não enviar o parâmetro, ou enviar
outro. Por isso **a verificação que vale é a do claim `hd` dentro do
`id_token`, no servidor**:

```
1. Redirecionar para /o/oauth2/v2/auth com hd=<domínio>   (conveniência)
2. Receber o code no callback
3. Trocar o code por tokens no servidor
4. Validar assinatura, `iss`, `aud` e `exp` do id_token
5. Conferir hd === GOOGLE_OAUTH_ALLOWED_DOMAIN            (segurança)
6. Conferir email_verified === true
7. Só então casar o `sub` com o usuário local
```

O passo 5 é obrigatório. Sem ele, qualquer conta `@gmail.com` entra.

No schema, o campo `User.googleSub` guarda o `sub` do Google — identificador
estável, que não muda se a pessoa trocar de e-mail. **Nunca use o e-mail como
chave de identidade**: e-mail é reatribuível dentro de um domínio.

Configuração no Google Cloud:

- Tela de consentimento **Interna** (só contas do domínio).
- Tipo _Aplicativo da Web_.
- Redirect autorizado: `https://spmnacional.org.br/api/auth/google/callback`.
- Client ID e Secret nos segredos `spm-google-oauth-client-id` e
  `spm-google-oauth-client-secret`.

---

## Agenda pública (Google Calendar)

A agenda do site funciona sem o Google: eventos cadastrados no painel entram
com `source: MANUAL`. A integração serve para quem já mantém a agenda no
Calendar e não quer digitar duas vezes.

Implementado em `lib/server/google-calendar.ts`:

- Endpoint: `https://www.googleapis.com/calendar/v3/calendars/<id>/events`
- Parâmetros: `key`, `timeMin`, `singleEvents=true`, `orderBy=startTime`,
  `maxResults=50`
- Escopo correspondente: `https://www.googleapis.com/auth/calendar.readonly`

**`events.list` aceita autorização opcional quando o calendário é público** —
por isso basta uma chave de API restrita à Calendar API, sem OAuth e sem conta
de serviço. É o caminho mais simples que resolve o caso.

Detalhes que o código trata e que costumam morder:

- **Dia inteiro vem em `start.date`; com hora, em `start.dateTime`.** São
  formatos diferentes, não um opcional do outro.
- **`end.date` é exclusivo** — um evento de um dia só termina no dia seguinte,
  segundo o Google. O código recua para o fim real do último dia.
- **`singleEvents=true` expande a recorrência** em ocorrências individuais.
  Sem isso viria a regra RRULE, não os eventos. E `orderBy=startTime` só é
  aceito junto com essa opção.
- **Evento apagado no Google precisa sumir do site.** A remoção é limitada à
  janela consultada: nada antes de `timeMin` (histórico) e, se a resposta bateu
  no teto de 50, nada depois do último evento recebido.
- Eventos `MANUAL` **nunca** são tocados.

A sincronização é disparada pelo Cloud Scheduler em `/api/cron/agenda`, com o
`CRON_SECRET` no cabeçalho. A rota aceita `Authorization: Bearer <segredo>` ou
`X-Cron-Secret`, e responde **401** sem ele — inclusive quando o segredo não
está configurado, para que a rota nunca fique aberta por omissão.

Ligar:

1. Torne o calendário público (Configurações do calendário > Permissões).
2. Crie uma chave de API **restrita à Google Calendar API**.
3. Grave em `spm-google-calendar-api-key`, defina `google_calendar_id`.
4. `enable_google_calendar = true`.

---

## Conta de serviço com delegação em todo o domínio

Necessária quando o sistema precisar agir **em nome de um usuário do
Workspace** — ler um Drive compartilhado, escrever numa planilha da equipe,
enviar e-mail pela API do Gmail. Nada disso está em uso hoje; a documentação
fica pronta para quando for.

É um poder amplo: uma conta de serviço com delegação pode representar
**qualquer usuário do domínio** dentro dos escopos autorizados. Só se concede
o escopo exato, e o mais restrito possível (prefira `.readonly`).

**Como autorizar:**

1. No Google Cloud, crie a conta de serviço e **copie o Client ID numérico**
   (IAM e administrador > Contas de serviço > Detalhes).
2. No **Admin Console** do Workspace, vá em **Segurança > Controles de API >
   Gerenciar delegação em todo o domínio**.
3. **Adicionar novo**, cole o Client ID e a lista de escopos separados por
   vírgula.
4. Salve. **A propagação pode levar até 24 horas** — falha imediata depois de
   configurar não significa configuração errada.

**Como usar (fluxo JWT, sem SDK):**

O código monta um JWT assinado com a chave privada da conta de serviço e o
troca por um access token:

| Claim   | Valor                                                                   |
| ------- | ----------------------------------------------------------------------- |
| `iss`   | E-mail da conta de serviço                                              |
| `scope` | Escopos separados por espaço                                            |
| `aud`   | `https://oauth2.googleapis.com/token`                                   |
| `exp`   | Expiração — **máximo 1 hora** após `iat`                                |
| `iat`   | Emissão, em segundos desde a época                                      |
| `sub`   | **E-mail do usuário representado** — é este claim que ativa a delegação |

Sem o `sub`, o token vale para a própria conta de serviço, não para o usuário.
Essa é a diferença entre "a conta de serviço acessa o que é dela" e "a conta de
serviço age em nome de fulano".

`lib/server/google-auth.ts` já implementa a montagem e a assinatura desse JWT
(hoje sem `sub`), além do caminho preferencial: **no Cloud Run, o token vem do
servidor de metadados**, usando a identidade anexada ao serviço — sem chave
JSON nenhuma.

> Chave JSON de conta de serviço é credencial de longa duração que não expira
> sozinha. Neste projeto ela não existe: nem no deploy (Workload Identity
> Federation) nem em execução (servidor de metadados). Se um dia a delegação
> for necessária, a chave deve ficar no Secret Manager e ter rotação
> programada.

---

## Situação de cada peça

| Peça                        | Situação                                                   | Onde está                                              |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Envio de e-mail (SMTP)      | **Implementado**                                           | `lib/server/mail.ts`                                   |
| Login com Google (OAuth)    | **Implementado**, aparece só com credencial                | `lib/server/auth.ts` (`loginWithGoogleProfile`)        |
| Agenda via Calendar         | **Implementado**                                           | `lib/server/google-calendar.ts`, `app/api/cron/agenda` |
| Uploads no Cloud Storage    | **Implementado** (REST, sem SDK)                           | `lib/server/storage.ts`                                |
| Token de conta de serviço   | **Implementado** (metadados + JWT)                         | `lib/server/google-auth.ts`                            |
| Workspace for Nonprofits    | **Pronto para ligar** — depende da aprovação               | —                                                      |
| Ad Grants                   | **Pronto para ligar** — depende de conversões configuradas | —                                                      |
| Maps Platform               | **Pronto para ligar** — a página de regionais já existe    | `app/onde-estamos`                                     |
| YouTube Nonprofit           | **Pronto para ligar** — sem dependência de código          | —                                                      |
| Delegação em todo o domínio | **Documentada, não usada**                                 | `lib/server/google-auth.ts`                            |
| **Drive**                   | Próximo passo                                              | Publicar documentos direto de uma pasta compartilhada  |
| **Sheets**                  | Próximo passo                                              | Exportar indicadores **agregados** de atendimento      |
| **Groups**                  | Próximo passo                                              | Mapear grupo do Workspace em perfil de acesso          |

Sobre o próximo passo de **Sheets**: qualquer exportação de atendimento sai
**agregada e sem identificação**, e nunca por situação migratória. A regra está
em `docs/PRIVACIDADE.md` e vale antes de qualquer conveniência de relatório.
