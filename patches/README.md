A patch `braces@3.0.3.patch` mitiga o alerta
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
limitando a profundidade de padrões e árvores sintáticas a 100 níveis. Mantém a
versão publicada e altera somente os cinco arquivos de implementação envolvidos.
Foi adaptada da [PR upstream #72](https://github.com/micromatch/braces/pull/72),
commit `d0d575e55e74a4e0218e5248fafb79efc3e54ebb`, ainda não incorporada ao upstream
em 2 de outubro de 2026. Mudanças anteriores e não relacionadas do upstream não
foram incluídas. O Bun aplica a patch em instalações reproduzíveis pelo lockfile.
O backport também preserva o contexto vazio original do `stringify` ao contar
profundidade: propagar `parent`, como faz a PR, mudaria `escapeInvalid` em braces
literais. A regressão mantém essa semântica anterior e os limites de profundidade.

Ainda não há release corrigida publicada: `bun audit --audit-level=high` continua
reportando o HIGH por `braces@3.0.3` e bloqueando o gate da CI. Esse resultado não
foi suprimido nem apresentado como zero vulnerabilidades. A patch é uma mitigação
local de ferramenta de desenvolvimento; o migrador usa apenas dependências de
produção e não inclui ESLint, fast-glob, micromatch ou braces.

Os testes em `tests/unit/braces-security.test.ts` exercitam a implementação real,
os consumidores de glob, padrões permitidos e os limites do parser e dos três
walkers, em subprocessos com timeout. Remover a patch quando uma release oficial
corrigida estiver disponível, atualizando o lockfile e repetindo esses testes e a
auditoria. A presença de uma patch não substitui o acompanhamento do advisory.
