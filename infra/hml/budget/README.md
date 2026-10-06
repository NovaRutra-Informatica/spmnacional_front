# Orçamento HML isolado

Plano: R$ 100 por mês, somente `site-institucional-510319` (número `114929512155`), conta `01C2C2-797E64-F65A13`. A leitura em 01/10/2026 confirmou conta aberta, moeda BRL e operador `suporteti@spmnacional.org.br` com `roles/billing.admin`; no projeto, ele possui `roles/owner`.

Alertas de consumo em 50%, 90% e 100%, mais previsão de 100%. Destinatários são os administradores e usuários IAM padrão do faturamento. Não há texto personalizado, Pub/Sub ou canais adicionais. [CLI oficial](https://docs.cloud.google.com/sdk/gcloud/reference/billing/budgets/create).

Usamos `EXCLUDE_ALL_CREDITS`: os créditos não reduzem o consumo acompanhado, evitando que créditos promocionais ocultem o custo HML. Valor e moeda são explícitos; a moeda deve coincidir com a conta. O mês segue o calendário de Billing, cujo início é à meia-noite no horário do Pacífico, e não o agendamento Brasília da VM. [Contrato Budget/Filter](https://docs.cloud.google.com/billing/docs/reference/budget/rest/v1/billingAccounts.budgets).

Prévia inteiramente local:

```powershell
pwsh -NoProfile -File .\infra\hml\budget\Create-HmlBudget.ps1
```

Depois da revisão, aplicar:

```powershell
pwsh -NoProfile -File .\infra\hml\budget\Create-HmlBudget.ps1 -Apply
```

O script fixa configuração, conta e projeto em todas as chamadas. Confere BRL e vínculo, habilita somente `billingbudgets.googleapis.com` se necessário, lista antes de criar, reutiliza orçamento idêntico com mesmo nome e recusa divergências. Após habilitar API, uma demora de propagação pode exigir repetir o comando. A execução repetida não cria duplicata de mesmo nome; não é necessário alterar Terraform ou seu estado.

Criação exige `billing.budgets.create`; leitura exige `billing.budgets.list/get`. O papel `roles/billing.admin` atual atende. Habilitar API exige `serviceusage.services.enable`, já concedido por `roles/owner`; nenhuma permissão é dada à VM. [Criação REST](https://docs.cloud.google.com/billing/docs/reference/budget/rest/v1/billingAccounts.budgets/create), [preparação da API](https://docs.cloud.google.com/billing/docs/how-to/budget-api-setup).

A API, os orçamentos e os alertas são gratuitos; este plano não configura serviços adicionais cobrados. [Preço oficial do Cloud Billing](https://cloud.google.com/billing/v1/pricing). O orçamento avisa sobre os gastos e não os bloqueia; valores/avisos podem chegar após o consumo. [Comportamento dos alertas](https://docs.cloud.google.com/billing/docs/how-to/budgets).

Aplicado em 01/10/2026 pelo operador autorizado: orçamento `fbada1e9-5196-41cc-bf71-6777afd138fc` criado e conferido por leitura posterior. A API de orçamentos foi habilitada no projeto. Reexecutar com `-Apply` preserva esta configuração sem criar duplicata.
