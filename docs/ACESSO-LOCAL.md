# Acesso local de teste

Exceção solicitada para testar o painel no próprio computador enquanto o Google
Workspace não está configurado. Não é método de autenticação para produção.

## Uso

Abrir `/atendente` e escolher **Entrar no ambiente local**. A tela identifica a conta
usada e o painel mostra **Acesso local de teste** durante a navegação. As alterações
são reais no banco local, não uma prévia que desaparece ao sair. Evitar dados
pessoais reais neste ambiente.

O modo utiliza exatamente uma conta ativa já existente, indicada por ID na
configuração do servidor. Não cria usuários, não concede novos perfis, não muda
e-mail/senha/vínculo Google e não aceita uma conta ou perfil enviados pelo formulário.
O ID não é senha: qualquer pessoa com acesso a esse ambiente local poderá usar o botão.

## Configuração explícita

```dotenv
DEPLOYMENT_TARGET="local"
APP_URL="http://localhost:3000"
LOCAL_TEST_AUTH_ENABLED="true"
LOCAL_TEST_AUTH_USER_ID="ID_EXATO_DA_CONTA_ATIVA"
GOOGLE_OAUTH_CLIENT_ID=""
GOOGLE_OAUTH_CLIENT_SECRET=""
```

Manter o Docker publicado somente em `127.0.0.1`, nunca `0.0.0.0`, e não expor o
ambiente por túnel ou proxy público. O Compose usa loopback por padrão. O ID é obtido
na própria base local; não executar seed/reset para liberar acesso a uma instalação
existente. Uma conta legada cujo campo de e-mail contenha apenas um nome de usuário
pode ser usada nos testes por ID; isso não a torna autorizada no Google Workspace.

As verificações no servidor exigem flag explícita, destino local, origem canônica
loopback, Host correspondente, ausência de marcadores Cloud Run e credenciais OAuth
vazias. O login exige POST de mesma origem e aplica limitação de tentativas. Não
confiar apenas em botão escondido ou em cabeçalhos `X-Forwarded-*`.

Sessões são identificadas como `LOCAL_TEST`, com cookie HttpOnly, expiração de uma
hora e inatividade de 30 minutos. O logout revoga o token no banco. Desligar o modo,
trocar a conta configurada ou suspender o usuário impede a utilização dessas sessões.
A entrada fica registrada na auditoria como teste local, nunca como login Google.

## Antes da nuvem

1. Definir `LOCAL_TEST_AUTH_ENABLED=false` e remover `LOCAL_TEST_AUTH_USER_ID` do
   ambiente de produção. O padrão versionado é desligado.
2. Configurar Workspace, domínio autorizado, contas institucionais e política de
   2FA conforme [INTEGRACOES-SPM.md](INTEGRACOES-SPM.md).
3. Usar `DEPLOYMENT_TARGET=gcp` e URL HTTPS real. Configuração local de teste nesse
   ambiente deve falhar no preflight; nunca modificar o validador para contornar isso.
4. Homologar login Google e confirmar ausência do botão/aviso local.

O modo local e OAuth não funcionam ao mesmo tempo. A exceção não é ativada pelo
Dockerfile nem pelo Terraform. A configuração do computador é local, fora do Git,
e não deve ser copiada para a nuvem.

## Regressão

`bun run test:e2e:local` usa banco descartável, dados sintéticos e login pelo
formulário real. Não usa o banco em execução. A suíte normal `bun run test:e2e`
mantém o modo local desligado e cobre o caminho Workspace simulado. Nenhuma suíte
autentica no Google real.
