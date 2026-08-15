# Privacidade e proteção de dados

Documento de requisitos, não de marketing. Ele registra **o que a lei exige do
módulo de atendimentos**, o que o sistema já faz, o que falta, e o que só a
organização pode produzir — porque não é código.

Levantamento feito em **agosto de 2026** sobre a Lei 13.709/2018 (LGPD), as
resoluções da ANPD, a Lei 13.445/2017 (Lei de Migração) e a Lei 9.474/1997
(Lei do Refúgio). **Não é parecer jurídico.** Antes de o módulo de
atendimentos entrar em produção com dado real, isto precisa passar por
advogado.

---

## Por que este módulo é diferente do resto do site

O site institucional trata dado comum: nome e e-mail de quem escreve pelo Fale
Conosco, e-mail de quem assina o boletim. O módulo de atendimentos é outra
categoria.

**Dado de atendimento a migrante tende a ser dado pessoal sensível** na
definição do art. 5º, II da LGPD. A ficha não pergunta religião nem origem
racial — mas o contexto entrega: uma pessoa atendida por pastoral católica,
com país de origem, idiomas, e necessidades que incluem `VIOLENCIA`,
`TRAFICO_DE_PESSOAS`, `SAUDE` e `JURIDICO`, produz um conjunto do qual se
inferem convicção religiosa, origem étnica e dado de saúde.

Some-se a isso: **titulares em situação de vulnerabilidade**, **dados
sensíveis** e **volume relevante de titulares** são exatamente os critérios da
**Resolução CD/ANPD nº 2/2022** para classificar o tratamento como de **alto
risco**.

### A consequência prática

O SPM se encaixaria como **agente de tratamento de pequeno porte**, o que
permitiria um regime simplificado de obrigações. **Tratamento de alto risco
afasta esse regime.** O que volta a ser exigível:

| Obrigação                                    | O que significa aqui                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Encarregado (DPO) indicado e publicado**   | Nome e canal de contato visíveis no site, não só num documento interno                                            |
| **ROPA completo**                            | Registro das operações de tratamento, com finalidade, base legal, categorias de dado, compartilhamento e retenção |
| **Comunicação de incidente em 3 dias úteis** | Prazo para avisar a ANPD e os titulares, contado da ciência do incidente                                          |
| **Política de segurança formalizada**        | Documento, não prática tácita                                                                                     |

O prazo de três dias úteis é o item mais duro na prática: ele exige saber de
antemão **quem decide**, **quem redige** e **quem comunica**. Descobrir isso
durante o incidente é como se perde o prazo.

---

## Base legal: o buraco que a LGPD tem e o GDPR não

O GDPR tem uma base legal própria para entidade religiosa ou filantrópica
tratando dados de seus membros (art. 9º, 2, "d"). **A LGPD não tem
equivalente.**

O art. 11 da LGPD lista as hipóteses de tratamento de dado sensível, e nenhuma
diz "entidade religiosa ou assistencial". As que às vezes se invocam não
sustentam o uso corrente:

- **Tutela da saúde** (art. 11, II, "f") — só por profissional de saúde ou
  serviço de saúde. Acolhida pastoral não é.
- **Proteção da vida** (art. 11, II, "e") — cabe na emergência concreta, não
  como base permanente de um cadastro.
- **Política pública** (art. 11, II, "b") — exige previsão legal ou
  regulamentar. Só se houver convênio formal que a estabeleça.

**Sobra o consentimento específico e destacado (art. 11, I).** É o caminho
principal, e ele tem exigências próprias:

- **Específico**: consentir para "acolhida e encaminhamento", não para
  "atividades da pastoral".
- **Destacado**: cláusula em separado, não enterrada num termo geral.
- **Informado**: em idioma que a pessoa entenda. Consentimento em português
  dado por quem fala apenas espanhol, crioulo haitiano, francês ou árabe **não
  é consentimento**.
- **Revogável**: a qualquer momento, por procedimento gratuito e facilitado.
- **Comprovável**: o ônus da prova é do controlador.

Do que decorre o requisito de sistema: registrar **finalidade, data, versão do
termo e canal** de cada consentimento — e permitir a revogação.

> **Estado atual:** o modelo `Testemunho` já tem `consent`, `consentNote` e
> `anonymized`, porque publicar história de vida sempre exigiu autorização
> explícita. O modelo `Atendimento` **ainda não tem** os campos de
> consentimento. É a lacuna mais relevante deste documento.

---

## Legislação migratória: o que agrava o dever de sigilo

Três dispositivos mudam o peso do que está guardado neste banco.

**Lei de Migração (13.445/2017)**

- **Art. 4º, XIII** — garante ao migrante o direito ao **acesso e à
  confidencialidade** de seus dados pessoais. Não é o dever genérico da LGPD:
  é confidencialidade prevista na lei específica do sujeito atendido.
- **Art. 3º, III** — adota o princípio da **não criminalização da migração**.
- **Art. 109** — trata a entrada ou permanência irregular como **infração
  administrativa**, sujeita a multa, **não como crime**.

**Lei do Refúgio (9.474/1997)**

- **Art. 25** — impõe **segredo profissional** a todos que intervêm no
  processo de refúgio, e determina que o procedimento corra em caráter
  sigiloso.

O art. 109 combinado com o art. 3º, III é o que sustenta a regra de produto
mais importante daqui: como irregularidade **não é crime**, não há dever de
noticiar nada a autoridade nenhuma — e um cadastro que permita separar pessoas
por situação migratória serviria, na prática, apenas para expô-las.

### Regra de produto

> **O sistema não tem e não deve ter função de exportar, filtrar ou reportar
> pessoas por situação migratória.**

Não é preferência de implementação. É decisão de projeto que deve sobreviver a
pedidos futuros — inclusive de dentro da casa, inclusive bem-intencionados. Um
relatório "para saber quantos estão irregulares" é exatamente a funcionalidade
que transforma um sistema de acolhida em instrumento de risco.

Por isso o `schema.prisma` diz, no próprio modelo:

> _Orientação da equipe: não registrar situação documental nem dado de saúde
> que não seja indispensável ao encaminhamento._

**Dado que não existe não vaza, não é requisitado e não é usado contra
ninguém.** A minimização vem antes da criptografia.

---

## O que o sistema guarda

| Campo                                 | Natureza                               | Como está                                |
| ------------------------------------- | -------------------------------------- | ---------------------------------------- |
| `codigo`                              | Pseudônimo (`ATD-2026-0142`)           | Texto claro — é o que circula na equipe  |
| `nomeEncrypted`                       | Identificação direta                   | **AES-256-GCM**, chave no Secret Manager |
| `contatoEncrypted`                    | Identificação direta                   | **AES-256-GCM**                          |
| `faixaEtaria`, `genero`               | Categoria, não data nem documento      | Texto claro                              |
| `paisOrigem`, `idiomas`, `chegadaAno` | Necessário ao encaminhamento           | Texto claro                              |
| `necessidades`                        | Sensível por inferência                | Texto claro                              |
| `observacoes`                         | Campo livre — **maior risco residual** | Texto claro                              |
| `retencaoAte`                         | Data de expurgo programado             | Texto claro                              |
| **Situação documental**               | —                                      | **Não existe no schema. Proposital.**    |
| **Documento (CPF, RNM, passaporte)**  | —                                      | **Não existe no schema. Proposital.**    |

O campo `observacoes` é o ponto fraco conhecido: é livre, e campo livre recebe
o que a equipe escrever. Mitigação é treinamento e revisão periódica, não
código.

---

## Retenção

**Não existe prazo legal fixo de retenção para prontuário socioassistencial.**
Prazos de prontuário médico não se aplicam por analogia — acolhida pastoral não
é serviço de saúde.

Como a lei não define, **a organização precisa definir e documentar o seu
prazo**, com justificativa ligada à finalidade. O sistema já tem a coluna
(`Atendimento.retencaoAte`); falta a política que diz qual valor colocar nela.

Referência para a discussão:

| Situação                               | Prazo sugerido                     | Razão                                         |
| -------------------------------------- | ---------------------------------- | --------------------------------------------- |
| Atendimento pontual, encerrado         | 2 anos após o encerramento         | Cobre retorno da pessoa e prestação de contas |
| Acompanhamento continuado              | 5 anos após o último contato       | Alinha com prazo de prescrição civil          |
| Caso com encaminhamento judicial       | Enquanto durar o processo + 5 anos | Exercício regular de direito (art. 7º, VI)    |
| **Registro de incidente de segurança** | **5 anos**                         | **Resolução CD/ANPD nº 15/2024, art. 10**     |

Os três primeiros são proposta a validar. O quarto é obrigação: cinco anos, com
prazo contado da data do incidente.

Expurgo hoje é manual. Automatizá-lo (rotina diária sobre `retencaoAte`) é
próximo passo natural — e depende da política estar definida primeiro.

---

## Medidas de segurança

A ANPD publicou recomendações de segurança para agentes de tratamento. Situação
do sistema frente a elas:

### Já atendido

| Recomendação                            | Como                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Controle de acesso por papel (RBAC)** | `Role` + `Permission` + `RolePermission`; o painel de atendimentos exige a permissão `atendimentos`       |
| **Log de auditoria**                    | `AuditLog` com autor, ação, alvo, nível, IP e user-agent; toda criação, alteração e exclusão é registrada |
| **Criptografia em repouso**             | Disco do Cloud SQL cifrado + **cifragem de coluna** nos campos identificadores                            |
| **Criptografia em trânsito**            | HTTPS obrigatório; banco acessado pelo socket do Cloud SQL                                                |
| **Senha forte e armazenada com KDF**    | `scrypt` com salt por usuário                                                                             |
| **Sem conta compartilhada**             | Cada pessoa tem usuário próprio; auditoria só faz sentido assim                                           |
| **Bloqueio por tentativa**              | 5 erros bloqueiam por 15 minutos; `LoginAttempt` registra                                                 |
| **Sessão revogável e com expiração**    | 12h absolutas, 30 min de inatividade, revogação imediata pelo painel                                      |
| **Segredos fora do código**             | Secret Manager; nada de credencial no repositório                                                         |
| **Minimização**                         | Ver a tabela de campos acima                                                                              |

### Ainda falta

| Recomendação                                   | Estado                       | Observação                                                                                                                                    |
| ---------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **MFA**                                        | Não implementado             | `User.mfaRequired` já existe no schema. É a lacuna técnica mais séria                                                                         |
| **Backup em local distinto**                   | Não configurado              | Backup do Cloud SQL fica na mesma região. Falta cópia fora do projeto                                                                         |
| **Aviso de privacidade multilíngue**           | Só rascunho, só em português | `/politica-de-privacidade` tem texto redigido para o site, sem aprovação formal nem tradução. Sem isso, não há consentimento informado válido |
| **Termo de confidencialidade (NDA) da equipe** | Não existe                   | Inclui voluntários e estagiários                                                                                                              |
| **RIPD**                                       | Não elaborado                | Relatório de Impacto — exigível em tratamento de alto risco                                                                                   |
| **Expurgo automático**                         | Não implementado             | Depende da política de retenção                                                                                                               |
| **Consentimento no modelo `Atendimento`**      | Não implementado             | Campos de finalidade, data, versão e canal                                                                                                    |
| **Portal do titular**                          | Não existe                   | Hoje o pedido chega pelo Fale Conosco e é tratado à mão                                                                                       |

---

## Direitos do titular

O art. 18 da LGPD garante confirmação, acesso, correção, anonimização,
portabilidade, eliminação, informação sobre compartilhamento e revogação do
consentimento. O prazo de resposta é **15 dias**.

Duas dificuldades específicas deste sistema:

1. **Identificar o titular sem expor terceiros.** Como o nome é cifrado e não
   indexado, localizar a ficha exige o código do atendimento ou busca
   assistida. Isso é efeito colateral da proteção — e o procedimento de
   atendimento ao titular precisa prever a verificação de identidade.
2. **Eliminar sem destruir o histórico agregado.** A eliminação pode ser feita
   apagando os campos cifrados e mantendo o registro pseudonimizado, quando
   houver base para conservar a estatística. Isso precisa estar escrito no
   procedimento, não decidido caso a caso.

---

## Resposta a incidente

Prazo de comunicação: **3 dias úteis** da ciência, para a ANPD e para os
titulares afetados (regime de alto risco).

Sequência mínima:

1. **Conter** — revogar sessões (`revokeAllSessions`), desativar contas
   suspeitas, trocar segredos comprometidos.
2. **Registrar** — o que aconteceu, quando, quais dados, quantos titulares.
   Este registro é guardado por **5 anos**.
3. **Avaliar risco** — a `AuditLog` responde quem acessou o quê e quando.
4. **Comunicar** — ANPD e titulares, em até 3 dias úteis.
5. **Corrigir** — e registrar a correção no mesmo documento.

O passo 3 só funciona porque a auditoria existe desde o primeiro dia. Log
adicionado depois do incidente não responde nada sobre ele.

---

## Checklist: o que a organização precisa produzir

Nada disto é código. Sem isto, o sistema pode estar tecnicamente correto e a
organização ainda estar irregular.

**Governança**

- [ ] Indicar o **encarregado (DPO)** e publicar nome e canal de contato no site
- [ ] Aprovar a **política de segurança da informação**
- [ ] Elaborar o **ROPA** (registro das operações de tratamento)
- [ ] Elaborar o **RIPD** (relatório de impacto) do módulo de atendimentos
- [ ] Definir o **procedimento de resposta a incidente**, com papéis e prazos

**Documentos para o titular**

- [ ] Revisar juridicamente e **aprovar formalmente** o aviso de privacidade —
      hoje `/politica-de-privacidade` é rascunho redigido para o site
- [ ] Traduzir o aviso para **espanhol, crioulo haitiano, francês e inglês**,
      no mínimo
- [ ] **Termo de consentimento** específico e destacado para o atendimento,
      versionado, também traduzido
- [ ] Procedimento de **revogação** do consentimento

**Equipe**

- [ ] **Termo de confidencialidade** assinado por toda a equipe, incluindo
      voluntários e estagiários
- [ ] **Treinamento** sobre minimização — especialmente sobre o que não
      escrever no campo `observacoes`
- [ ] Regra escrita: **nenhuma conta compartilhada**, nenhuma senha em papel

**Retenção**

- [ ] Definir e aprovar os **prazos de retenção** por tipo de atendimento
- [ ] Definir o **procedimento de expurgo** e quem o executa

**Contratos**

- [ ] Mapear **operadores** (Google Cloud, provedor de e-mail) e registrar as
      cláusulas de proteção de dados
- [ ] Se algum dado sair do Brasil, registrar a **base de transferência
      internacional** — ver a alternativa de Postgres serverless em
      `infra/README.md`

---

## Princípios que não se negociam

1. **Minimização antes de criptografia.** Dado que não existe não vaza.
2. **Sem exportação por situação migratória.** Nunca, para ninguém.
3. **Pseudônimo no uso diário.** A equipe trabalha pelo código; o nome é
   exceção, não rotina.
4. **Tudo auditado.** Quem acessou ficha de atendimento fica registrado.
5. **Consentimento em língua que a pessoa entenda.** Caso contrário, não houve
   consentimento.
6. **A chave de cifragem não mora junto com o dado cifrado.**
