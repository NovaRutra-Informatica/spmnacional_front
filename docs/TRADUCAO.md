# Tradução pública: português, inglês, francês, espanhol e árabe

O texto editorial original permanece em português. A integração preparada usa **Cloud
Translation Advanced v3, modelo NMT**, com idiomas de destino `en`, `fr`, `es` e `ar`.
O árabe exige direção RTL na interface; a seleção e os avisos devem representar o
idioma efetivamente exibido, inclusive quando a tradução ainda não está disponível.

## Decisão de 03/10/2026 — estratégia futura, ainda não implementada

O responsável confirmou o uso de **Google Cloud Translation Advanced v3, modelo
NMT**, no projeto GCP da SPM. A estratégia abaixo será implementada **somente depois
da atualização e aprovação dos textos fixos do site**. Este registro não altera o
código, os idiomas disponíveis, o limite diário, a infraestrutura ou o deploy.
As demais seções deste documento descrevem a implementação atual.

- **Textos fixos públicos:** navegação, botões, rótulos, rodapé e conteúdo
  institucional que permanece fixo terão traduções previamente geradas para **todos
  os idiomas de destino suportados pelo modelo NMT do Google**, conforme sua
  [lista oficial](https://docs.cloud.google.com/translate/docs/languages). As versões
  ficarão em catálogos persistentes e versionados, disponíveis antes da publicação
  do site. Servir esses textos ou trocar o idioma não deverá chamar a API de
  tradução. Atualizar o original ou acrescentar um idioma exigirá preparar as
  traduções correspondentes antes de publicar a nova versão.
- **Conteúdo editorial da SPM:** posts de blog e demais conteúdos públicos gerados
  pela equipe continuarão com tradução dinâmica sob demanda. Cada tradução completa
  será armazenada por conteúdo, versão e idioma; visitas seguintes reutilizarão o
  resultado. Editar a fonte exigirá uma nova versão da tradução.
- **Escopo preservado:** português continua sendo a fonte original. Dados privados,
  formulários preenchidos e área administrativa não entram na tradução. Traduzir
  arquivos PDF, imagens ou vídeos não faz parte desta decisão. A ampliação dos
  idiomas deverá preservar a atribuição ao Google e validar fontes e direção RTL
  para os idiomas aplicáveis.

**Custos:** a pré-tradução inicial também consome caracteres, multiplicados pelos
idiomas efetivamente traduzidos. O NMT oferece crédito mensal de até US$ 10,
equivalente aos primeiros 500 mil caracteres, compartilhado entre Basic/Advanced
e entre os idiomas; renova mensalmente e não acumula. Acima disso, o preço padrão
é US$ 20 por milhão de caracteres excedentes. A gratuidade cobre a tradução, não
a infraestrutura. [Preços oficiais verificados em 03/10/2026](https://cloud.google.com/products/translate/pricing).

A economia vem do reaproveitamento das traduções, tanto fixas quanto editoriais.
Pré-gerar os textos fixos também evita a espera pela API na primeira visita;
não elimina o consumo da geração inicial ou das futuras alterações. Planejar essa
geração com controle de consumo, sem presumir que todos os idiomas caberão na
franquia mensal. O limite diário da aplicação é independente dessa franquia.

**Aceite futuro:** testes deverão comprovar que textos fixos não acionam tradução
durante a navegação, que traduções editoriais são reutilizadas por versão e idioma
e que alterações da fonte não exibem traduções desatualizadas. A implementação e
essa validação ficam adiadas até os textos finais estarem definidos.

## Ativação na nuvem

A integração vem **desligada** e não chama o Google durante build, testes ou apenas
por disponibilizar o seletor de idioma. Antes de habilitar:

1. Aplicar as migrações, incluindo `20260922110000_public_translations`.
2. Habilitar `translate.googleapis.com` no projeto com faturamento ativo.
3. Dar à conta de serviço de execução as permissões `cloudtranslate.generalModels.predict`
   e `serviceusage.services.use` no projeto. O Terraform fornecido prepara um papel
   mínimo específico quando a tradução é habilitada; conferir as permissões reais
   durante a homologação.
4. Configurar quotas do Google, alertas de faturamento e estas variáveis de servidor:

| Variável                            | Valor inicial            | Comportamento                                                                                                           |
| ----------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `TRANSLATION_ENABLED`               | `false`                  | Somente `true` permite gerar ou servir traduções pelo serviço.                                                          |
| `GOOGLE_CLOUD_PROJECT`              | Identificador do projeto | Projeto de faturamento/inferência, validado, sem URL arbitrária.                                                        |
| `TRANSLATION_LOCATION`              | `global`                 | Localização do modelo NMT. A infraestrutura fornecida usa `global`.                                                     |
| `TRANSLATION_DAILY_CHARACTER_LIMIT` | `50000`                  | Teto de **reservas** por dia UTC e banco desta aplicação; `0` impede novas traduções e permite cache quando habilitado. |

No Cloud Run, a aplicação usa o token do servidor de metadados da conta de serviço
anexada. Nenhuma chave de API ou credencial vai para o navegador. O helper existente
também suporta arquivo de credencial de serviço fora da nuvem; nunca incluí-lo no
repositório ou na imagem. A execução em homologação deve confirmar conta, IAM e
cobrança reais antes da abertura pública.

Fontes oficiais verificadas em 22/09/2026:
[tradução de texto](https://docs.cloud.google.com/translate/docs/translate-text),
[contrato REST v3](https://docs.cloud.google.com/translate/docs/reference/rest/v3/projects.locations/translateText),
[quotas](https://docs.cloud.google.com/translate/quotas),
[atribuição](https://docs.cloud.google.com/translate/attribution).

## Contrato interno

`lib/server/translation.ts` exporta:

```ts
translatePublicFields({
    key: `post:${post.id}`,
    locale: 'en',
    fields: { title: post.title, excerpt: post.excerpt, content: post.content },
    format: 'markdown', // ou 'text' (padrão)
});
// { fields, translated, status }
```

**Pré-condição de segurança:** o chamador server-side deve consultar conteúdo
publicado/autorizado antes de chamar o serviço, também em cache hits. Não enviar
rascunhos, conteúdo futuro, contatos, atendimentos, usuários, mensagens ou dados de
formulários. Não existe endpoint público que receba texto, URL ou modelo arbitrário.
Textos de interface são definidos no código, nunca obtidos da requisição do visitante.

Os resultados são strings de texto, **não HTML confiável**. Renderizar por React ou
pelo `renderMarkdown` escapador já existente. No modo Markdown, a segmentação mantém
subtítulos, listas, citações, delimitadores e URLs do original fora da API; somente
os trechos de texto são enviados. HTML, PDF, imagem e vídeo não são traduzidos.
Dividir trechos pode reduzir o contexto linguístico; revisão editorial continua
necessária para conteúdo sensível, sobretudo termos jurídicos e nomes próprios.

Estados possíveis:

- `source`: português ou fonte sem texto traduzível.
- `disabled`: integração desligada.
- `cached` / `translated`: tradução completa disponível.
- `pending`: outro servidor está processando, aguardando backoff ou lease perdeu validade.
- `budget_exceeded`: teto de reservas atingido.
- `unavailable` / `invalid`: falha externa/interna ou configuração/fonte inválida.

Nos estados sem tradução, os campos originais são devolvidos integralmente. O
consumidor não deve apresentar português como se fosse tradução bem-sucedida.

## Cache, concorrência e orçamento

- Hash SHA-256 da fonte, formato e versão do processamento; chave inclui identificador
  do conteúdo e idioma. Alterar um texto gera uma nova versão automaticamente no
  próximo acesso ao idioma — nenhuma ação manual do editor é necessária.
- O cache é persistente em `PublicTranslation`; novas visitas reutilizam traduções
  completas. Publicações retiradas não podem ser expostas por consultar apenas cache.
- Lease atômico de 120 segundos no PostgreSQL impede duplicação normal entre
  instâncias. Um worker antigo não pode sobrescrever o resultado de seu substituto.
- Falhas usam backoff persistente entre 1 e 60 minutos, sem retries imediatos
  faturáveis. Orçamento esgotado aguarda 5 minutos antes de reavaliar.
- `TranslationUsage` reserva caracteres de forma atômica antes da chamada. Falhas,
  timeouts, queda do processo e chamadas parcialmente concluídas **não estornam**
  reservas: o provedor pode ter faturado. A contagem inclui pontos de código enviados,
  somados entre todos os idiomas. Isso é deliberadamente conservador, não uma réplica da fatura.
- O teto cobre esta aplicação usando o mesmo banco, não outros projetos, bases ou
  clientes da API. Reservas são atribuídas ao dia UTC em que começaram. Configurar
  também quotas no provedor e alertas; alerta de faturamento não bloqueia consumo.
- Limites por chamada interna: até 512 campos, 100 mil pontos de código e 2.048
  segmentos; lotes com no máximo 20 mil pontos e 128 segmentos. Resposta limitada a
  1 MiB por lote; prazo total de chamadas de tradução de 8 segundos (a obtenção
  inicial de token e consultas ao banco têm seus próprios limites).
- Apenas HTTPS para host fixo do Google, sem redirects. Resposta parcial, inválida,
  excessiva ou vazia não é gravada como sucesso. Logs não incluem textos ou tokens.

O primeiro acesso de cada versão/idioma pode esperar o provedor; acessos concorrentes
recebem o original com aviso. Não há worker de tradução antecipada nem garantia de
latência do provedor. Isso evita acoplar publicação ao Google e traduzir idiomas
sem demanda. Um job de pré-aquecimento poderá ser acrescentado posteriormente.

Versões anteriores do cache permanecem armazenadas e não são servidas para fonte
alterada. Definir retenção/limpeza do histórico antes de um acervo muito grande;
nenhuma remoção destrutiva foi adicionada automaticamente nesta entrega.

## Verificação

Os testes unitários usam respostas Google simuladas (nenhuma cobrança). Os testes
de integração usam o PostgreSQL descartável do comando `bun run test:integration`
e verificam disputa de 50 leitores por um lease, reservas concorrentes sem exceder
orçamento, troca de versão e rejeição de resultados de workers antigos.

O E2E também é offline: `bun run test:e2e` prepara cache de traduções **fictícias**
identificadas por `[TEST en]`, `[TEST fr]`, `[TEST es]` ou `[TEST ar]`, com orçamento
zero e projeto sintético. Testa seleção de idioma, navegação sem recarregar o layout,
volta ao português e direção/overflow do árabe. Essas frases não são traduções
linguisticamente válidas e nunca são inseridas em banco de desenvolvimento/produção.

Esses testes não certificam qualidade linguística, IAM/faturamento reais ou
capacidade de Cloud Run. Para homologar: habilitar com orçamento pequeno em projeto
de teste, traduzir uma notícia autorizada nos quatro idiomas, confirmar cache sem
novo consumo, editar a fonte, testar uma falha/limite e revisar o layout RTL.
