# Resultado do teste de carga — 14/09/2026

## Conclusão

**A aplicação manteve respostas corretas, mas a configuração de 1 CPU não passou todos os critérios de desempenho quando o cliente solicitou gzip.** O painel foi o ponto mais sensível: p95 de 5,97 s, p99 de 6,72 s e 76 iterações que o gerador não conseguiu iniciar ao atingir 100 usuários virtuais ocupados. Usuários virtuais representam capacidade de execução do teste, não pessoas reais.

Não foram alterados o código de negócio, o banco atual, os containers da instalação existente ou recursos Google Cloud. As alterações desta rodada são de teste, coleta e documentação. Os ambientes descartáveis foram removidos ao terminar.

## Ambiente e método

- Mesma imagem standalone nas duas rodadas: `sha256:0a87794a7aaf04ef30aa79e40c63cbe19b09146334d594d359b15efeab1e28ef` (`spmnacional-front:load-test`).
- Aplicação: 1 CPU, 512 MiB; PostgreSQL 17: 1 CPU, 512 MiB, dados em tmpfs; gerador k6 2.1: 2 CPUs, 512 MiB. Host Docker compartilhado: 24 CPUs e aproximadamente 30,2 GiB disponíveis para a VM.
- 500 notícias, 250 arquivos de 64 KiB, 300 atendimentos e 1.000 mensagens cifradas, além de categorias, regionais, agenda e sessões sintéticas. Nenhum dado pessoal real.
- Uma requisição HTTP por iteração; modelo de taxa de chegada; validações de status, conteúdo, autorização e bytes, sem seguir redirects. Sem CSS/JS/imagens externas ou execução completa do navegador.
- Duas rodadas principais, **13.330 requisições efetivamente enviadas**. Não somam sondas, provas auxiliares de autorização/limite ou o smoke preliminar.

Os percentis abaixo são **agregados de todo o perfil**, incluindo os três patamares quando houver. Não são percentis medidos exclusivamente no último patamar. Critérios de investigação: público p95 < 1 s e p99 < 2 s; painel p95 < 1,5 s e p99 < 3 s; erros < 1%; nenhuma iteração descartada. Também foram impostos limites por rota. Estes critérios não são um SLA acordado com o SPM.

## Rodada principal com gzip

Executada das 20:49:44 às 20:53:52 UTC. Gzip foi confirmado em 100% das respostas HTML, não apenas solicitado; PNGs permaneceram sem compressão HTTP adicional.

| Perfil                | Demanda programada | Requisições enviadas |      p95 |      p99 | Não iniciadas | Resultado                |
| --------------------- | ------------------ | -------------------: | -------: | -------: | ------------: | ------------------------ |
| Pico público          | 30 → 50 → 75 req/s |                4.752 |   884 ms | 2.029 ms |             0 | Reprovou latência        |
| Recuperação após pico | 10 req/s           |                  301 |    18 ms |    20 ms |             0 | Passou                   |
| Painel autenticado    | 5 → 10 → 20 req/s  |                  996 | 5.967 ms | 6.718 ms |            76 | Reprovou latência e taxa |

Nas requisições enviadas, **zero falhas HTTP/conteúdo** e 100% dos checks passaram. Isso não elimina a reprovação: lentidão e demanda não atendida também são falhas de desempenho. O perfil administrativo entregou cerca de 10,28 req/s em média, contando a conclusão das requisições pendentes; não sustentou toda a demanda planejada.

O artigo público mais acessado teve p95 de **2.029 ms** e p99 de **2.154 ms**, violando ambos os limites individuais. No painel, a lista de notícias foi a mais lenta: p95 de **6.718 ms**, máximo de **7.075 ms**. As demais páginas administrativas também ultrapassaram os critérios individuais de latência.

### Recursos e integridade

- CPU da aplicação chegou à faixa do teto de um núcleo; o Docker registrou máximos amostrados de 101,6% no público e 111,9% no painel. Percentuais breves acima de 100% não significam uma segunda CPU provisionada. O cgroup registrou throttling de CPU.
- Memória máxima amostrada da aplicação: **203,1 MiB**. Nenhum container teve OOM. Um ensaio curto não prova ausência de vazamentos de memória.
- CPU máxima amostrada do gerador: **17,5% de um núcleo**, com cota de dois núcleos; não há indício de que o gerador estivesse limitado por CPU. Os 100 VUs ficaram ocupados aguardando as respostas.
- PostgreSQL: CPU máxima amostrada de **13,2%**, sem deadlocks e sem esperas por locks nas amostras. As consultas mais relevantes por tempo acumulado tiveram execução média inferior a 1 ms. Isso não mede toda a espera da aplicação pelo pool nem reproduz disco/rede Cloud SQL.
- As **45 sondas auxiliares de saúde** desta rodada retornaram 200; as verificações ao fim dos perfis também passaram.
- Contador do artigo: **1.010 requisições e 1.010 visualizações persistidas**, sem divergência.

## Rodada de referência, sem negociação de compressão

Executada das 20:38:53 às 20:45:36 UTC, com 7.281 requisições. Foi preservada como referência, não usada para esconder o resultado mais exigente com gzip.

| Perfil           | Demanda programada   |    p95 |    p99 | Resultado dos critérios k6 |
| ---------------- | -------------------- | -----: | -----: | -------------------------- |
| Smoke            | 2 req/s              |  31 ms | 103 ms | Passou                     |
| Público gradual  | 5 → 10 → 20 req/s    |  25 ms |  49 ms | Passou                     |
| Pico público     | 30 → 50 → 75 req/s   |  85 ms | 158 ms | Passou                     |
| Recuperação      | 10 req/s             |  17 ms |  20 ms | Passou                     |
| Painel           | 5 → 10 → 20 req/s    | 275 ms | 362 ms | Passou                     |
| Upload de 64 KiB | 1 req/s, 25 arquivos |  13 ms |  24 ms | Passou                     |

Zero falhas HTTP/conteúdo e nenhuma iteração descartada nos cenários k6. Contudo, **uma sonda auxiliar do host retornou status 0**, sem código de causa registrado naquele executor. Não foi uma resposta HTTP 500; sua origem não pode ser afirmada retroativamente. Alguns tempos dessa sonda também podiam ser afetados por coleta síncrona. O executor foi ajustado para coleta assíncrona das estatísticas, fechamento da conexão da sonda e registro do código de erro. A segunda rodada não reproduziu a falha. Isso não prova disponibilidade perfeita fora dos intervalos medidos.

Provas adicionais nesta referência:

- Arquivo privado: 404 sem sessão, 200 e 65.536 bytes com sessão.
- Upload: 25 aceitos na carga; mais cinco aceitos na prova auxiliar e os cinco excedentes bloqueados com 429, respeitando o limite real de 30 por janela de 15 minutos. Não foram reduzidas as proteções da aplicação.
- Contador de artigos: **1.236 requisições e 1.236 incrementos** persistidos.

No pico público, o tráfego recebido pelo k6 caiu de aproximadamente **504,5 MB sem negociação de compressão para 87,6 MB com gzip**. Compressão economiza transferência, mas custa processamento. Não se recomenda desligá-la apenas para obter um resultado melhor no benchmark. As rodadas tiveram inicialização/aquecimento diferentes e não constituem um experimento de laboratório perfeitamente isolado.

## Achados e prioridades antes de dimensionar produção

1. **Investigar CPU, renderização e compressão no painel.** A combinação de latência crescente, throttling da aplicação e baixo uso do gerador/banco aponta nessa direção. Não foi feito profiling suficiente para atribuir uma porcentagem exata a cada função. Comparar paginação real, redução de payload e trabalho repetido; depois repetir o ensaio e comparar uma configuração de 2 CPUs, sem presumir que aumentar CPU sozinho resolverá tudo.
2. **Corrigir ou contabilizar os múltiplos clientes Prisma.** `DB_POOL_MAX=5` é por cliente, mas foram observadas até dez conexões da aplicação durante a carga. O build separa módulos SSR e APIs, e `lib/server/db.ts` só atribui o cliente ao global em desenvolvimento. A inspeção sustenta a hipótese de pools independentes; não foi feita instrumentação de criação para contar cada um diretamente. Dimensionar `instâncias × conexões reais`, não simplesmente assumir cinco conexões totais por processo. O `inspect` final abre suas próprias conexões e não deve ser confundido com as amostras durante a carga.
3. **Tratar crescimento das listagens.** Blog, notícias administrativas e biblioteca de mídia carregam todos os registros; mensagens lê e decifra até 300 linhas por acesso. O conjunto atual passou funcionalmente, mas o comportamento tende a custar mais com bases maiores. Não foram criados índices, caches nem alteradas regras de autorização nesta rodada.
4. **Repetir na homologação real.** Validar Cloud SQL/GCS, TLS, proxy, política de compressão, concorrência, autoscaling, carga prolongada e custos. Não converter estas taxas em “quantidade de visitantes simultâneos” nem vender este ensaio como garantia de capacidade na nuvem.

## Evidências e reprodução

- [Referência sem compressão — report.json](../load-results/spm-load-d1ccba1f7f37703d/report.json)
- [Gzip — report.json](../load-results/spm-load-91ce36b9bdafb203/report.json)
- [Executor, comandos e limitações](TESTE-DE-CARGA.md)

Os JSONs/logs são artefatos locais ignorados pelo Git; este resumo é versionável. Reexecutar os comandos gera novas evidências. `npm run test:load` agora solicita gzip por padrão e retorna erro se os critérios falharem. Os 14 testes novos de isolamento também passaram; a suíte unitária totalizou 271 testes aprovados nesta revisão.
