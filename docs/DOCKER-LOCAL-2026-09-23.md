# Atualização local — 23/09/2026

Docker atualizado e validado em `http://localhost:3000`. Para testar o painel,
abrir `/atendente` e selecionar **Entrar no ambiente local**. O aviso do painel
identifica esse modo e lembra que as alterações são persistidas no banco local.
Esta entrega não publicou recursos no GCP nem ativou APIs cobradas.

## Acesso e limites

- Modo de teste ativado explicitamente apenas no `.env` local, fora do Git.
- Conta já existente e ativa, sem criar usuário ou alterar e-mail, senha ou perfil.
- Porta verificada em `127.0.0.1:3000`, não exposta à rede. Não abrir túnel/proxy público.
- Sessão de até uma hora, inatividade de 30 minutos, proteção de origem e auditoria.
- Corrigida a expiração do cookie `__Host-spm_session` no logout; o token também é revogado no banco.
- Configuração GCP/Cloud Run/OAuth incompatível bloqueia o modo local.
- Workspace, 2FA institucional, tradução real e SMTP ainda exigem credenciais e homologação.

Detalhes: [ACESSO-LOCAL.md](ACESSO-LOCAL.md) e [INTEGRACOES-SPM.md](INTEGRACOES-SPM.md).

## Dados preservados e migrações

O serviço web foi pausado para backup consistente. O container PostgreSQL 18.6,
seu volume e o volume de uploads foram mantidos. Não houve reset ou seed.

| Verificação | Antes | Depois |
| --- | ---: | ---: |
| Usuários | 2 | 2 |
| Artigos | 10 | 10 |
| Registros de mídia | 1 | 1 |
| Contatos | 0 | 0 |
| Atendimentos | 0 | 0 |
| Arquivos no volume de uploads | 1 | 1 |
| Migrações concluídas | 5 | 7 |

Aplicadas `20260922100000_workspace_sessions` e `20260922110000_public_translations`.
A primeira encerrou a sessão antiga, como previsto. O teste real criou e encerrou
uma sessão local e gerou os respectivos registros de auditoria, sem editar conteúdo.
Nenhuma migração ficou com falha. Chaves e conexão do banco foram preservadas.

## Backup e recuperação

Diretório local ignorado pelo Git e pelo Docker:
`tmp/docker-update-20260923-local-test/`.

- `database.dump`: 89.511 bytes; arquivo custom PostgreSQL validado com `pg_restore --list`.
- `uploads.tar.gz`: 4.874 bytes; arquivo validado e conteúdo comparado por SHA-256 com o volume após a atualização.
- `environment.before.env`: configuração anterior; contém segredos e não deve ser compartilhada ou publicada.
- `login.png` e `admin-media.png`: evidências do teste no Docker atualizado.

SHA-256 dos backups:

```text
database.dump   c23d6054990495c2a273122f5f637f0e3553639ccdb0c6c99f0214f484bc997f
uploads.tar.gz  2672d52e71ef80868721b9f7367d37f602c919ac16b370b049bf2d498a87c198
```

A validação do arquivo não substitui ensaio completo de restauração. Preservada a
imagem anterior como `spmnacional-front:rollback-20260923-local-test`. Reverter
imagem não desfaz migrações ou restaura sessões. Antes de qualquer restauração,
avaliar compatibilidade e salvar as alterações posteriores; não restaurar por cima
da base nem apagar volumes automaticamente. O volume legado de PostgreSQL, que o
Compose indicou como não utilizado, também foi deixado intacto.

## Imagens em uso

```text
spmnacional-front:latest
spmnacional-front:local-20260923-test-access
sha256:3dbb4944fbd06e69be7e4d13b496be038d8894114e70c32f13d4f086fd7080c2

spmnacional-migrate:latest
spmnacional-migrate:local-20260923-test-access
sha256:2ce632687b1b71066a4b7c7f5fe06191040f3f75f14bdac9d1ea0479dcd30c28
```

Imagens construídas a partir do código atual. Runtime sem root, com verificação
de ausência de arquivos de ambiente no build/standalone. Web e banco saudáveis;
endpoints de liveness e readiness responderam HTTP 200.

## Evidências de validação

- Build de produção, TypeScript, lint e catálogo de traduções passaram.
- 439 testes unitários; cobertura de linhas de 89,25% nos módulos configurados, não na aplicação inteira.
- 13 testes de integração com PostgreSQL descartável.
- 2 E2E locais e 16 E2E do modo Workspace simulado, em desktop/mobile; sem autenticar no Google real.
- Auditoria Bun: nenhuma vulnerabilidade conhecida entre 625 pacotes verificados.
- Smoke no Docker real: site público, saúde, login, biblioteca de mídia, cookie protegido, logout, rejeição do token revogado e ausência de erros JavaScript.
- Revisão visual das capturas desktop/mobile, preservando o design aprovado.

Os resultados não são certificação de segurança nem homologação no GCP. Pendências
editoriais, requisitos de parceiros/atendimento/Vai e Vem e operação externa continuam
registrados no documento de integrações.
