# Preparação SPM — 22/09/2026

Escopo confirmado: até 50 pessoas navegando no site público, no máximo três pessoas no painel, acesso exclusivo pelo Google Workspace e tradução de português para inglês, francês, espanhol e árabe. Preparação local não significa Google configurado ou produção homologada. Nenhum deploy, faturamento ou domínio é ativado por esta entrega.

**Complemento posterior para desenvolvimento:** a pedido do responsável, foi adicionado [acesso local de teste](ACESSO-LOCAL.md), explícito e limitado ao próprio computador, sem OAuth configurado. A regra de acesso exclusivo Workspace continua obrigatória na nuvem. Atualizações posteriores no Docker são registradas separadamente do preparo inicial.

## Google Workspace

1. Confirmar com a SPM o domínio real do Workspace (não inferir apenas do domínio do site).
2. No projeto Google da organização, criar cliente OAuth de aplicação Web, configurar audiência interna quando aplicável e cadastrar exatamente `{APP_URL}/api/auth/google/callback` como URI de retorno. Escopos de login: openid/email/profile; a aplicação não precisa de acesso à caixa de e-mail para autenticar.
3. Guardar client ID/segredo no Secret Manager e configurar `GOOGLE_OAUTH_ALLOWED_DOMAIN`. A política verifica `hd` no token assinado, e-mail verificado, vínculo `sub` e cadastro ativo local. Pertencer ao domínio não autoriza uma pessoa automaticamente.
4. Administrador Workspace deve exigir verificação em duas etapas para todos os usuários autorizados, revisar métodos permitidos, exceções/carência e recuperação. Só depois definir `GOOGLE_WORKSPACE_MFA_ENFORCED=true`. Isso é declaração operacional: OAuth não atesta que um segundo fator foi solicitado em cada acesso. Recuperação/bloqueio da conta Google é administrado no Workspace; acesso local pode ser revogado no site.
5. Cadastrar a primeira conta pelo bootstrap em banco novo, ou autorizar as contas existentes. Testar conta correta, conta externa, conta desativada, usuário sem cadastro, logout e recuperação. Na nuvem não há login por senha nem alternativa local ao Workspace. A migração `workspace_sessions` revoga sessões antigas.

Sem credenciais no ambiente local e sem a exceção de teste explicitamente habilitada, o site público funciona e o login informa indisponibilidade. No GCP, configuração OAuth incompleta e declaração de 2FA ausente bloqueiam o preflight. Não substituir AUTH_SECRET/ENCRYPTION_KEY para configurar o login.

## Tradução

**Decisão posterior de 03/10/2026, ainda não implementada:** manter Google NMT,
ampliar para todos os idiomas suportados e pré-traduzir os textos fixos após sua
atualização, mantendo tradução dinâmica com cache para conteúdo editorial da SPM.
O registro completo está em [TRADUCAO.md](TRADUCAO.md#decisão-de-03102026--estratégia-futura-ainda-não-implementada).
As descrições abaixo preservam o comportamento da versão atual.

Consultar [TRADUCAO.md](TRADUCAO.md) para cache, API e controle de custos. `TRANSLATION_ENABLED=false` é o padrão: nenhum texto é enviado ao Google e o seletor informa indisponibilidade. Antes de habilitar, configurar projeto, IAM, quota do provedor, limite diário da aplicação e revisar cobrança com a organização.

Conteúdo editorial publicado e textos de interface são traduzidos; formulários preenchidos, contatos, atendimentos, contas, administração, arquivos PDF, imagens e vídeos não são enviados ao tradutor. Uma edição altera a versão e demanda nova tradução. Conteúdo despublicado é filtrado antes de consultar o cache. As traduções não são prometidas como revisão humana, nem ficam prontas para todos os idiomas no instante da publicação: o primeiro acesso solicita cada versão; falhas/pedidos simultâneos exibem o original em português, identificado na tela.

O seletor usa `?lang=en|fr|es|ar`, cookie funcional e links internos localizados. Rotas privadas continuam em português. Árabe usa direção RTL; campos como e-mail/URL permanecem LTR. O texto português continua sendo a referência. Páginas traduzidas recebem noindex nesta versão (SEO multilíngue completo com URLs próprias/hreflang fica fora desta entrega). Catálogo fixo: `bun run i18n:catalog` ao editar componentes. Novos idiomas exigem revisar lista, fontes/layout, testes e orçamento, não apenas prometer todos os idiomas.

## Capacidade e implantação

Perfil de carga `audience`: 50 leitores e três sessões administrativas distintas, com pausas, gzip e limite de recursos explícito. Não equivale a 53 requisições por segundo nem a um SLA de produção. Cloud Run começa com concorrência HTTP limitada e pool de banco reutilizado no processo. Blog público pagina no servidor, 12 artigos por página, com categoria aplicada antes de limitar os registros.

Aplicar as migrações somente após backup e janela autorizada. Ensaiar primeiro em homologação separada, validar storage/SMTP/SQL/Google reais e executar teste de carga representativo. O teste local não mede latência Cloud SQL/GCS, autenticação no Google, tradução externa fria, nem qualidade linguística. Traduções precisam de homologação editorial nos quatro idiomas.

Revisar os registros editoriais existentes: editais, documentos e testemunhos com data futura não aparecem nas consultas públicas. Testemunhos exigem também consentimento registrado, inclusive no destaque da home. Não marcar consentimento automaticamente para recuperar uma publicação; confirmar a autorização editorial.

## Evidências locais desta rodada

- Build de produção, TypeScript, lint e verificação do catálogo passaram.
- 381 testes unitários em 35 arquivos; cobertura de linhas de 88,67% no conjunto configurado pelo Vitest, não na aplicação inteira.
- 13 testes de integração com PostgreSQL descartável; concorrência de tradução sem chamadas reais ao Google.
- 16 testes de navegador em desktop/mobile, com fixtures nos quatro idiomas, layout RTL e captura de erros de hidratação. Não são prova de qualidade linguística nem autenticação real no Workspace.
- Auditoria Bun: nenhuma vulnerabilidade conhecida encontrada entre 625 pacotes verificados. Isso não é certificação de segurança.
- Terraform: validação e cinco testes com providers simulados, sem aplicar recursos.
- Carga: segunda rodada isolada aprovada, 2.636 requisições sem erros; p95 global 158 ms, p99 1.758 ms. A primeira rodada teve reprovações de latência e outros testes concorrentes no host; os dois resultados foram preservados em [RESULTADO-CARGA-2026-09-22.md](RESULTADO-CARGA-2026-09-22.md). Sessões administrativas já estabelecidas, sem simular publicação de artigos. Não equivale a uma homologação no GCP; p99 do artigo ficou perto do limite local.

## Decisões ainda dependentes da SPM

- Domínio Workspace, projeto Google, identidade operacional, credenciais OAuth e política efetiva de 2FA.
- Ativação da tradução e teto de consumo aprovado, textos finais e revisão do árabe.
- Formato/acervo da publicação Vai e Vem e destinos de e-mail/site para encaminhamento do atendimento. Não foram inventados nem desativados módulos com base nesses pontos ainda ambíguos.
- Ajustes de parceiros/menu de atendimento devem ser fechados em sua etapa própria; esta rodada prepara identidade, idiomas e capacidade confirmados.

Referências: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [2FA Workspace](https://support.google.com/a/answer/175197), [Cloud Translation](https://docs.cloud.google.com/translate/docs/translate-text), [atribuição](https://docs.cloud.google.com/translate/attribution).
