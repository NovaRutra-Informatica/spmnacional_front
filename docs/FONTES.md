# Fontes

De onde veio cada informação institucional deste projeto — o conteúdo do seed
(`prisma/seed.ts`), os textos das páginas e os dados citados na documentação.

Todas as consultas foram feitas em **agosto de 2026**. A web muda; a data está
registrada em cada item para que se saiba o que precisa ser reconferido.

O documento também registra, no fim, **o que não foi possível confirmar**. Essa
parte é tão importante quanto a primeira: ela diz o que a equipe precisa
levantar antes de o site ir ao ar.

---

## Resumo

| Fonte                                    | O que sustenta                                                      |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `spmnacional.org.br` — páginas regionais | Unidades, cidades, endereços e frentes de atuação                   |
| `spmnacional.org.br` — Quem Somos        | Identidade, missão, metodologia e histórico                         |
| `cnbb.org.br`                            | Vínculo com a CNBB e o reconhecimento como organismo                |
| `cepastcnbb.org.br`                      | Inserção na Comissão Episcopal para a Ação Sociotransformadora      |
| `vaticannews.va`                         | Dia Mundial do Migrante e do Refugiado; magistério sobre mobilidade |
| `planalto.gov.br`                        | Lei de Migração, Lei do Refúgio, LGPD, decretos citados             |
| `gov.br/anpd`                            | Resoluções e recomendações de segurança usadas em `PRIVACIDADE.md`  |
| `cloud.google.com`                       | Preços e limites usados em `infra/README.md`                        |
| `google.com/nonprofits`                  | Programas e limites usados em `INTEGRACOES-GOOGLE.md`               |

---

## Institucional

### `spmnacional.org.br` — páginas regionais

**Consulta:** agosto de 2026 · páginas _Norte_, _Nordeste_, _Centro-Oeste_,
_Sudeste_ e _Sul_.

**Sustenta:** a lista de unidades no seed (`REGIONAIS`) — slug, UF, cidade,
nome, região, endereço e frentes prioritárias. É o único lugar onde a própria
entidade publica sua presença território a território.

**Exemplos do que veio daí:** a sede nacional na Rua Caiambé, 126 (Vila
Monumento / Ipiranga, São Paulo); a equipe do Amazonas sediada na Arquidiocese
de Manaus; a de Rondônia na Paróquia São Sebastião, no bairro Jardim dos
Migrantes, em Ji-Paraná; a de Balsas (MA), na região do MATOPIBA.

**Cuidado:** os textos descritivos de cada regional foram **redigidos para este
site** a partir do que a página publica. Eles interpretam e contextualizam — a
coordenação de cada regional precisa revisar o que diz respeito a ela.

### `spmnacional.org.br` — Quem Somos

**Consulta:** agosto de 2026.

**Sustenta:** fundação em **outubro de 1985**, reconhecimento como organismo da
CNBB em **1986**, a origem ligada à Campanha da Fraternidade de 1980 (_"Para
onde vais?"_), o lema **"Acolher, Proteger, Promover e Integrar"**, a
metodologia **ver, discernir e agir** e a referência à formação FIA.

Sustenta também a descrição institucional gravada em `SiteSetting`, o telefone
**(11) 2063-7064** e o e-mail **spm.nac@terra.com.br** do secretariado
nacional, além dos perfis no Instagram e no Facebook
(`/pastoraldosmigrantes` nos dois).

### `cnbb.org.br`

**Consulta:** agosto de 2026 · página do SPM dentro do portal da CNBB.

**Sustenta:** o vínculo formal do SPM com a Conferência Nacional dos Bispos do
Brasil e sua natureza de organismo da Pastoral Social.

**Ressalva importante:** ver _"O que não foi possível confirmar"_, adiante — a
página está desatualizada.

### `cepastcnbb.org.br`

**Consulta:** agosto de 2026.

**Sustenta:** a inserção do SPM na estrutura da Comissão Episcopal Pastoral
para a Ação Sociotransformadora, e o relacionamento com os demais organismos da
Pastoral Social.

### `vaticannews.va`

**Consulta:** agosto de 2026.

**Sustenta:** o **Dia Mundial do Migrante e do Refugiado**, celebrado no
último domingo de setembro com tema definido anualmente pela Santa Sé — evento
gravado na agenda do seed. Sustenta também as referências ao magistério sobre
mobilidade humana usadas nos textos institucionais.

---

## Legislação

### `planalto.gov.br`

**Consulta:** agosto de 2026 · texto oficial das normas.

| Norma                                                               | Onde é usada                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Lei 13.445/2017** (Lei de Migração)                               | Página `/legislacao/lei-de-migracao`; arts. 3º, III, 4º, XIII e 109 em `PRIVACIDADE.md` |
| **Lei 9.474/1997** (Lei do Refúgio)                                 | Art. 25 (segredo profissional) em `PRIVACIDADE.md`                                      |
| **Lei 13.709/2018** (LGPD)                                          | Arts. 5º, II; 7º; 11; 18 em `PRIVACIDADE.md`                                            |
| **Decreto 9.199/2017**                                              | Regulamento da Lei de Migração                                                          |
| **Lei municipal 16.478/2016** e **Decreto 57.533/2016** (São Paulo) | Páginas de legislação municipal                                                         |

Os textos das páginas de legislação **resumem e comentam** a norma; eles não a
substituem. Cada página aponta para o texto oficial.

### `gov.br/anpd`

**Consulta:** agosto de 2026.

**Sustenta**, em `PRIVACIDADE.md`:

- **Resolução CD/ANPD nº 2/2022** — critérios de tratamento de alto risco
  (dado sensível, titular vulnerável, volume relevante) e o regime de agentes
  de pequeno porte que esses critérios afastam.
- **Resolução CD/ANPD nº 15/2024, art. 10** — guarda do registro de incidentes
  por **5 anos**.
- **Recomendações de segurança da ANPD** — controle de acesso, log de
  auditoria, criptografia, senha forte, ausência de conta compartilhada, MFA e
  backup em local distinto.
- O prazo de **3 dias úteis** para comunicação de incidente.

---

## Infraestrutura e integrações

### `cloud.google.com`

**Consulta:** 14 de agosto de 2026 · páginas de preço de Cloud Run, Cloud SQL,
Cloud Storage, Artifact Registry, Secret Manager e Cloud Scheduler.

**Sustenta** a tabela de custo de `infra/README.md`:

- Cloud Run: nível gratuito de **180.000 vCPU-s**, **360.000 GiB-s** e
  **2 milhões de requisições/mês**, aplicado como desconto calculado com preço
  **Tier 1** — e São Paulo é **Tier 2**.
- Cloud SQL: **sem nível gratuito e sem escala a zero**; `db-f1-micro` em São
  Paulo a **US$ 0,0158/hora** (≈ US$ 11,53/mês); SSD a **US$ 0,255/GiB-mês**,
  mínimo de 10 GB (≈ US$ 2,55).
- `southamerica-east1` custa **cerca de 1,5x** `us-central1`.

Preço de nuvem muda. **Confira na calculadora oficial antes de decidir
orçamento.**

### `google.com/nonprofits` e `support.google.com`

**Consulta:** agosto de 2026.

**Sustenta** `INTEGRACOES-GOOGLE.md`:

- **Workspace for Nonprofits**: US$ 0/usuário/mês, **100 TB em pool**, limite
  de **2.000 usuários**.
- **Ad Grants**: até **US$ 10.000/mês** em anúncios de texto na Busca,
  disponível no Brasil, com exigência de site de qualidade, **mínimo de 2
  sitelinks**, **CTR de 5%** e **ao menos 1 conversão/mês**.
- **Maps Platform**: **US$ 250/mês** em créditos. **YouTube Nonprofit
  Program** incluído.
- **SMTP**: `smtp-relay.gmail.com` (portas 25/465/587, autenticação por IP,
  **10.000 destinatários por usuário/dia**) e `smtp.gmail.com` (465 SSL /
  587 TLS, **2.000 mensagens/dia**, exige Senha de App).

### `developers.google.com`

**Consulta:** agosto de 2026.

**Sustenta:** o fluxo OAuth 2.0 com `hd` e a obrigatoriedade de verificar o
claim `hd` no `id_token`; o escopo
`https://www.googleapis.com/auth/calendar.readonly` e o comportamento de
`events.list` com autorização opcional em calendário público; e o fluxo JWT da
delegação em todo o domínio (`iss`, `scope`, `aud`, `exp` de no máximo 1 hora,
`iat` e `sub`), incluindo o caminho pelo Admin Console e a propagação de até
**24 horas**.

---

## O que é conteúdo de demonstração

Nem tudo no seed é dado confirmado. O que foi **escrito para dar vida às telas**
e precisa ser substituído antes de publicar:

| Conteúdo                                          | Situação                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Notícias do blog                                  | Redigidas para o projeto. A da 41ª Semana usa dados reais de tema e lema; o resto é redação nossa                 |
| **Editais e chamadas**                            | **Fictícios.** Códigos, prazos e escopos são plausíveis, não reais                                                |
| **Testemunhos**                                   | **Fictícios.** Gravados com `consent: false` e `anonymized: true` justamente para não serem publicados por engano |
| **Documentos** (estatuto, atas, notas, cartilhas) | Títulos plausíveis, **sem arquivo real anexado**                                                                  |
| Materiais da Semana do Migrante                   | Estrutura real (texto-base, roteiros, oração, cartaz); arquivos ainda não anexados                                |
| Programação das Semanas                           | Reconstruída a partir do formato conhecido das edições                                                            |

O seed marca isso na própria constante `DEMO`
(_"Conteúdo de demonstração — substituir antes de publicar"_).

---

## O que não foi possível confirmar

Três lacunas, todas verificadas em agosto de 2026 e todas com consequência
prática.

### 1. Nenhuma unidade regional publica telefone ou e-mail próprio

O único contato publicado é o do **secretariado nacional** em São Paulo:
(11) 2063-7064 e spm.nac@terra.com.br. As páginas regionais trazem endereço —
quando trazem — mas **nenhum canal direto**.

Efeito no sistema: os campos `phone` e `email` do modelo `Regional` ficam
vazios para quase todas as unidades, e a página `/onde-estamos` não consegue
oferecer contato local.

Efeito no atendimento: uma pessoa migrante em Manaus ou Balsas que encontre o
site não tem para quem ligar na sua cidade. Ela cai no número de São Paulo.

**O que fazer:** levantar com cada coordenação regional um canal público —
telefone, WhatsApp ou e-mail — e preencher. É a informação de maior impacto
direto no público que o site atende.

### 2. A página do SPM no site da CNBB está desatualizada

A página traz **nomes da gestão anterior** na coordenação. Não foi possível
confirmar, por fonte pública oficial, a composição atual da coordenação
nacional.

Por isso **o seed não cadastra nomes de coordenação**: preferimos a ausência a
publicar informação errada sobre pessoas.

**O que fazer:** obter a composição atual com o secretariado nacional e pedir à
CNBB a atualização da página — que continuará sendo a fonte que terceiros
consultam.

### 3. Não há política de privacidade publicada pela entidade

Não foi localizada política de privacidade, aviso de privacidade ou canal de
encarregado (DPO) publicado pelo SPM.

**Isto é lacuna de conformidade, não detalhe de conteúdo.** O site coleta dado
pessoal desde a primeira versão (Fale Conosco e boletim), e o painel prevê
ficha de atendimento com dado sensível. A LGPD exige informação ao titular
sobre finalidade, base legal, compartilhamento e direitos — e, no regime de
alto risco que se aplica ao módulo de atendimentos, exige **encarregado
indicado e publicado**.

A rota `/politica-de-privacidade` existe no projeto com um **texto redigido
para este site** — que é rascunho, não política vigente. Ele precisa de revisão
jurídica, aprovação formal da entidade e da inclusão do canal do encarregado.
Uma política de privacidade é declaração da organização sobre o que ela faz com
os dados; a equipe técnica pode redigir a minuta, não aprová-la.

**O que fazer:** ver o checklist completo em `docs/PRIVACIDADE.md`.

---

## Como manter esta lista

- Toda informação institucional nova entra com **fonte e data de consulta**.
- Se a fonte for uma página que pode mudar, registre também **o que ela dizia**
  — é isso que permite perceber a mudança depois.
- Conteúdo sem fonte confirmada entra marcado como demonstração, nunca
  publicado como se fosse dado da entidade.
- Ao substituir conteúdo de demonstração por real, **remova a marcação `DEMO`**
  do seed junto — senão a marcação vira ruído e ninguém mais confia nela.
