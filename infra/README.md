# Infraestrutura SPM Nacional

Configuração preparada para Cloud Run, Cloud SQL PostgreSQL, Secret Manager, Cloud Storage privado e GitHub Actions com federação OIDC.

**Comece pelo [runbook de produção](OPERACAO-PRODUCAO.md)**. Ele substitui as instruções e estimativas antigas, incluindo bootstrap, usuário SQL separado, gates de lançamento, publicação por digest, rollback e recuperação.

- [Terraform](terraform/): recursos e variáveis; validar sem credenciais com `terraform init -backend=false` e `terraform validate`.
- [Configuração de exemplo](terraform/terraform.tfvars.example): copiar e preencher; os IDs ilustrativos não são utilizáveis.
- [Papel SQL runtime](sql/provision-runtime-role.sql) e [verificação](sql/verify-runtime-role.sql): artefatos para revisão antes da execução em ambiente autorizado, nunca aplicados pelo CI.
- [Pipeline de produção](../.github/workflows/deploy-gcp.yml): manual, protegido pelo environment `production` e CI.

Nenhum recurso é criado automaticamente por estes arquivos. O lançamento depende de credenciais, orçamento, domínio, observabilidade e homologação aprovados. GitHub Pages continua disponível apenas como demonstração estática manual.

Use `terraform fmt` (2 espaços) nos arquivos HCL. Versione `.terraform.lock.hcl`; não versione estado, planos ou credenciais.
