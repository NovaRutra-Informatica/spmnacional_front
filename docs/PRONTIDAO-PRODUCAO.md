# Preparação para produção — 14/09/2026

> Atualização de 22/09/2026: este documento preserva a fotografia histórica dos testes e controles de 14/09. As decisões atuais de identidade, tradução e capacidade estão em [INTEGRACOES-SPM.md](INTEGRACOES-SPM.md). O acesso por senha foi removido; autenticação exclusivamente Workspace com política de 2FA obrigatória no provedor, ainda pendente de homologação com a organização. Usar Bun conforme o README atual.

## Escopo desta entrega

Reforço técnico da aplicação existente, preservando o design aprovado e sem inventar os requisitos editoriais ainda pendentes do SPM. Nenhum recurso GCP, publicação, envio real de e-mail ou migração no banco da organização faz parte desta validação local.

### Segurança e integridade implementadas

- Senhas scrypt com formato/tamanho canônicos; rejeição de hash vazio ou malformado. AES-256-GCM com IV e tag completos, sem aceitar tags truncadas.
- Sessões opacas/HMAC, expiração, revogação, origem canônica nas mutações e limitação atômica no PostgreSQL. Senhas preservam espaços legítimos e são atualizadas junto com a revogação de sessões.
- Consumo único e concorrente de convites/confirmações; redirects restritos ao painel; OAuth com PKCE, state, nonce, domínio e audiência, timeouts e endpoints confiáveis.
- CSP por nonce no painel/login/convites. Público mantém CSP compatível com renderização estática. Credenciais e dados internos não são serializados nos logs de erro da aplicação.
- Uploads limitados por tamanho/tempo, tipo e permissão; caminhos validados, defesa contra symlinks, nomes únicos e escrita exclusiva. GCS privado, downloads autorizados sem cache duradouro e otimizador de imagem limitado a assets públicos.
- Remoção de mídia com fila persistente `MediaDeletion`, exclusão condicional em transação, lease e retentativas. Falha no provedor não perde a intenção de exclusão. Processamento no cron de retenção, até 20 objetos por ciclo; acompanhar backlog e falhas.
- Retenção preserva alterações concorrentes. Sincronização Calendar lê todas as páginas antes de alterar dados, valida resposta e devolve falha real ao Scheduler/painel.
- Pré-validação de configuração, limites do pool/consultas, separação liveness/readiness e páginas de erro sem detalhes internos.

### Testes e entrega

Vitest cobre regras e casos de regressão; testes de integração aplicam migrações em PostgreSQL descartável e exercitam concorrência, bootstrap, sessões, publicação e exclusão; Playwright testa desktop/mobile, movimento reduzido, login/logout, sessão segura, upload privado e cabeçalhos CSP. Os relatórios são gerados por `npm run test:coverage` e `npm run test:e2e`, não são prova de cobertura integral de todas as telas.

Limiares atuais para módulos de `lib/server`, configuração, Markdown, CSP e política regional: 70% de linhas, instruções e funções; 60% de ramos. Integração e E2E são evidências adicionais e não entram nesse percentual. Regras de otimização do React foram introduzidas como avisos em componentes legados; erros de lint continuam bloqueantes. ESLint 9 está fixado para compatibilidade com os peers do `eslint-config-next` atual, com atualização pendente quando esses peers suportarem ESLint 10; não é dependência do runtime.

A CI também verifica imagens sem root/segredos, Terraform com providers mock e privilégios SQL em PostgreSQL descartável. Preflight offline não valida DNS, IAM, entrega de e-mail, faturamento, volume de carga ou disponibilidade de um projeto GCP real.

### Evidências locais desta revisão

Em 14/09/2026: **257 testes unitários, 9 testes de integração e 8 testes de navegador passaram**. A cobertura de linhas foi de **85,56% no conjunto de módulos configurado acima**, não na aplicação inteira. TypeScript, lint sem erros, build de produção e builds Docker de runtime/migração passaram; `npm audit` não apontou vulnerabilidades conhecidas. Também passaram a validação Terraform, dois testes com providers mock e o ensaio de privilégios SQL. Os testes de banco usaram PostgreSQL 17 descartável, sem volumes da aplicação. Esses números são uma fotografia desta revisão; devem ser revalidados pela CI a cada alteração.

## Atualizar uma instalação existente

Há uma nova migração aditiva: `20260914180000_media_deletion_queue`. Depois de backup verificado, aplicar `prisma migrate deploy` antes de disponibilizar o novo código. Nunca executar reset/seed para atualizar produção. Nesta entrega a migração foi executada apenas nos bancos sintéticos de testes.

Revisar `.env.example` sem sobrescrever `.env`. Integrações parcialmente preenchidas podem ser recusadas pelo preflight; manter credenciais completas ou desativá-las explicitamente. Domínio de OAuth pré-preenchido, sem client ID/secret, não habilita o login. Na nuvem, usar `RUNTIME_DATABASE_URL` com papel SQL restrito conforme runbook; banco de migração permanece separado. A chave AES existente não pode ser regenerada automaticamente.

## Gates que ainda exigem a organização e homologação

- Aprovar textos, imagens/direitos, perfis, destinatários, conteúdo inicial e requisitos finais. O bootstrap técnico não carrega conteúdo demo.
- Definir responsáveis, política de retenção e atendimento de solicitações de titulares; considerar também e-mail, backups e logs. Este documento não certifica conformidade legal.
- Provisionar GCP/segredos, SQL restrito, DNS/TLS e proteções dos environments GitHub; configurar SMTP, OAuth e Calendar quando escolhidos.
- Ensaio de restauração com chave preservada, teste de carga, alertas para erros/latência/readiness/Scheduler/fila de exclusão e acompanhamento de custos. Configurar destinatários e provar que o alerta chega.
- Revisão de segurança independente antes de abrir dados sensíveis reais, além de auditorias contínuas de pacotes/imagens. Nenhum resultado local elimina risco de vulnerabilidade.

## Limitações que não devem ser vendidas como prontas

- MFA próprio e fluxo de troca obrigatória de senha ainda não existem; campos no banco não equivalem à implementação. Se a organização exigir MFA, definir/homologar a política no provedor de identidade e avaliar o login por senha.
- Cadastro e dupla confirmação de newsletter não equivalem a plataforma de campanhas: disparo editorial, cancelamento autoatendido e política final de assinantes precisam de escopo/implementação antes de anunciar um boletim operacional completo.
- Assinatura de arquivo não é antivírus. Não há varredura/CDR de PDF, Office ou ZIP; definir política de documentos antes de permitir arquivos não confiáveis.
- Não há rotação automatizada com múltiplas versões da chave AES; sua troca sem migração de dados torna o histórico ilegível.
- A fila cobre exclusões conhecidas. Se upload, gravação no banco e compensação falharem juntos, ainda é necessário reconciliar inventário de objetos órfãos. Nunca apagar objetos em massa sem comparar referências e revisar o plano.
- E-mails transacionais não têm fila persistente de entrega; falha retorna estado controlado e contato salvo permanece no painel. Validar reenvio/monitoramento e retenção da caixa postal conforme criticidade acordada.
- CSP pública permite scripts inline exigidos pela estratégia atual de export estático; a CSP mais restrita por nonce está nas áreas privadas.
- WAF, domínio customizado, alertas de faturamento/monitoramento e alta disponibilidade contratada não são provisionados automaticamente pela aplicação.

Sequência de lançamento e recuperação: [guia operacional](../infra/OPERACAO-PRODUCAO.md).
