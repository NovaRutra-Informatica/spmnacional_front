# Teste de audiência — 22/09/2026

## Conclusão

**A segunda rodada, sem outras suítes/builds no host, passou todos os limites do cenário de 50 leitores e 3 editores simultâneos.** Foram 2.636 requisições, p95 global de 158 ms e p99 de 1.758 ms, zero falhas HTTP/conteúdo e nenhuma iteração descartada. As requisições iniciais lentas permaneceram incluídas na avaliação. O p99 do artigo ficou próximo do limite: 1.986 ms contra 2.000 ms; a aprovação local não demonstra ampla margem para picos/crescimento.

**A primeira rodada permanece registrada como reprovada**, com 2.603 requisições e seis violações por rota. Foram 5.239 requisições nas duas rodadas, sem somar probes auxiliares. Não foi alterado código da aplicação, CPU, memória, demanda ou limites entre as medições.

A medição é local e curta. Outros testes (unitários/cobertura e E2E) foram executados em paralelo no mesmo host na primeira rodada; possível interferência deve ser considerada. Não há série temporal de requisições dessa primeira execução para atribuir a cauda exclusivamente a início frio, renderização, compressão ou disputa do host. Os limites não foram reduzidos para obter aprovação.

## Ambiente e contrato medido

- Imagem isolada `spmnacional-front:load-test`, identificador registrado: `sha256:132bb1eb81636bd6b85c2a0375851848782ee5a758d8adc08b50c8571343ca42`. A tag `:latest` e a instalação existente não foram alteradas.
- Build de produção com Bun 1.4.2, lockfile congelado e runtime Node 22 Alpine. Prisma 7.10.0, Next.js 16.3.5. Sete migrações aplicadas apenas no banco descartável.
- Aplicação: 1 CPU/512 MiB; PostgreSQL 17: 1 CPU/512 MiB, tmpfs; gerador k6 2.1: 2 CPUs/512 MiB. Docker com 24 CPUs e 32.411.635.712 bytes de memória disponíveis para sua VM.
- 50 VUs leitores e 3 VUs editores durante 180 segundos, mais conclusão das iterações em andamento. Modelo fechado: uma requisição e pausa de 2–5 segundos para leitores; uma requisição e pausa de 4–7 segundos para editores. Isso **não representa 50 requisições por segundo**.
- Leitores: home, blog, artigo, agenda, Quem Somos e mídia pública. Editores: dashboard, notícias e biblioteca de mídia. Três identidades/sessões estabelecidas distintas, inseridas exclusivamente como fixtures no banco de teste.
- 500 notícias, 250 PNGs sintéticos de 64 KiB, 300 fichas de atendimento, 1.000 mensagens cifradas, categorias, regionais e eventos. Nenhum dado real foi copiado.
- Gzip confirmado em todas as respostas HTML; PNGs sem compressão adicional. Status, conteúdo e tamanho/tipo da mídia foram verificados, sem seguir redirects.

Esta imagem foi construída antes de ajustes posteriores de filtragem `publishedAt`, consentimento e aviso de cookies móvel nesta rodada de desenvolvimento. O dataset já tinha datas de publicação coerentes; o ensaio não exercita envio de formulários nem layout em navegador. A evidência corresponde somente ao artefato identificado acima, não certifica qualquer build posterior.

Limiares de investigação, não SLA comercial: por rota pública p95 < 1 s e p99 < 2 s; por rota administrativa p95 < 1,5 s e p99 < 3 s; erros < 1%, checks > 99%, zero iterações descartadas. O agregado usa o limite administrativo, mas **cada rota também deve passar**.

## Rodada 1 — resultado completo

Identificador: `spm-load-fa855693db0f000a`. Fase de medição registrada entre **01:56:59 e 02:00:06 UTC de 23/09**, correspondente à noite de 22/09 no fuso America/New_York. A taxa média observada foi 14,08 requisições/s, incluindo a conclusão das iterações pendentes.

| Rota                      | Requisições |      p95 |      p99 | Critério por rota  |
| ------------------------- | ----------: | -------: | -------: | ------------------ |
| Home                      |         752 |   303 ms | 2.553 ms | Reprovou p99       |
| Blog                      |         497 |   307 ms | 2.834 ms | Reprovou p99       |
| Artigo                    |         500 |   449 ms | 3.438 ms | Reprovou p99       |
| Agenda                    |         252 |   211 ms | 1.904 ms | Passou             |
| Quem Somos                |         255 |   262 ms | 1.586 ms | Passou             |
| Mídia pública             |         251 |   238 ms | 2.092 ms | Reprovou p99       |
| Dashboard                 |          33 |   357 ms | 2.466 ms | Passou             |
| Notícias administrativas  |          31 |   560 ms |   587 ms | Passou             |
| Biblioteca administrativa |          32 | 1.883 ms | 3.437 ms | Reprovou p95 e p99 |

O k6 encerrou com código 99 (falha de limiar) e o executor com código 1. Não foi falha de infraestrutura, migração ou conteúdo: **5.206/5.206 checks passaram**. O número reduzido de leituras por rota administrativa torna seus percentis sensíveis a poucas respostas lentas; não descartar essas respostas para declarar aprovação.

### Saúde, recursos e integridade

- 37/37 sondas auxiliares de readiness retornaram 200; saúde final também 200. Nenhum OOM da aplicação/gerador; nenhum erro de execução no log da aplicação.
- Memória máxima amostrada da aplicação: **143,4 MiB**. CPU máxima amostrada: aplicação 59,99%, PostgreSQL 10,94%, gerador 8,43% de um núcleo. Amostras espaçadas não capturam todos os picos; houve aproximadamente **18,67 s de throttling** acumulado no cgroup da aplicação durante a fase.
- Pool: **máximo de cinco conexões da aplicação** nas amostras durante a carga, contra dez observadas no teste histórico. A mudança de singleton mostrou efeito neste artefato. Conexões abertas pela inspeção final são separadas da medida da aplicação.
- Sem deadlocks nem esperas por locks nas amostras. Entre as 12 consultas de maior tempo acumulado, a maior média de execução SQL foi 0,747 ms. Isso não mede espera no pool nem latência do Cloud SQL real.
- Integridade do artigo: **500 leituras = 500 incrementos persistidos**.
- Pré-teste de arquivo privado: 404 sem sessão; 200 e 65.536 bytes com sessão válida.
- Os containers e a rede de teste foram removidos, e os dados temporários descartados. Banco, uploads e containers existentes foram preservados.

## Rodada 2 — diagnóstico sem outras suítes no host

Identificador: `spm-load-8579070d796ffedd`. Fase registrada entre **02:05:06 e 02:08:15 UTC de 23/09**. Mesma imagem, dataset de mesmo tamanho, 1 CPU/512 MiB, 50+3 VUs, pausas, gzip, duração e SLOs. Um novo banco sintético foi criado. A única alteração do gerador foi instrumentação observacional: janelas iniciais/sustentadas e métricas com timestamps. Não houve aquecimento extra nem exclusão de respostas iniciais.

Resultado: **2.636 requisições, 14,23 req/s observadas, 5.272/5.272 checks corretos e todos os limites globais/por rota aprovados**. Os códigos de saída do k6 e do executor foram zero.

| Rota                      | Requisições |    p95 |      p99 |
| ------------------------- | ----------: | -----: | -------: |
| Home                      |         761 | 158 ms | 1.604 ms |
| Blog                      |         505 | 138 ms | 1.783 ms |
| Artigo                    |         510 | 173 ms | 1.986 ms |
| Agenda                    |         254 | 146 ms | 1.668 ms |
| Quem Somos                |         254 | 143 ms | 1.285 ms |
| Mídia pública             |         253 | 121 ms | 1.577 ms |
| Dashboard                 |          33 |  77 ms |   973 ms |
| Notícias administrativas  |          33 | 323 ms | 1.647 ms |
| Biblioteca administrativa |          33 | 106 ms |   644 ms |

### O que os timestamps mostram

Os grupos abaixo são somente diagnóstico; os limites continuaram sendo aplicados ao conjunto completo de requisições de cada rota.

| Janela de início da requisição | Requisições |      p95 |      p99 |   Máximo |
| ------------------------------ | ----------: | -------: | -------: | -------: |
| Primeiros 15 segundos          |         213 | 2.204 ms | 2.223 ms | 2.224 ms |
| Após os primeiros 15 segundos  |       2.423 |   133 ms |   246 ms |   494 ms |

As **53 respostas acima de 500 ms** pertenciam à janela inicial e foram registradas entre **02:05:08.999 e 02:05:10.407 UTC**. As 15 respostas acima de 2 s também estavam nesse grupo. Na janela sustentada nenhuma resposta ultrapassou 494 ms.

Isso localiza a cauda desta segunda rodada no pico de entrada, quando os 53 VUs iniciam juntos; não identifica sozinho a fração causada por carregamento inicial, renderização, compressão ou espera por CPU/pool. Tampouco prova retroativamente a causa da primeira reprovação. A diferença entre rodadas não deve ser apresentada como ganho produzido por uma nova otimização, pois o código da aplicação é idêntico.

### Recursos e integridade da segunda rodada

- 38/38 sondas auxiliares e saúde final retornaram 200. Sem OOM da aplicação/gerador nem erros no log da aplicação.
- Máximos amostrados: aplicação **66,98% de CPU e 160,8 MiB**, banco **7,40% de CPU**, gerador **8,76% de CPU**. Throttling acumulado da aplicação durante a fase: aproximadamente **11,04 s**.
- Pool da aplicação: máximo observado de **cinco conexões**, sem deadlocks ou esperas por locks amostradas.
- Artigo: **510 leituras e 510 incrementos persistidos**. Pré-teste de mídia privada novamente aprovado.
- Containers/rede próprios removidos e tmpfs descartado. Nenhuma mudança na instalação existente ou no Google Cloud.

## Interpretação e limites

Este perfil exercita leitura com pausas, não edição simultânea, uploads, SMTP, login Google/2FA real, tradução paga, GCS, CSS/JS do navegador, TLS, CDN ou autoscaling. Não mede todas as funções do site nem estabilidade prolongada. O pool corrigido não resolve, por si só, o comportamento de todas as páginas.

O ensaio de 14/09 usou taxas de chegada e carga administrativa diferentes. Comparar seus números diretamente com este cenário não demonstraria uma porcentagem de melhoria da aplicação. Tampouco o resultado local é uma garantia de capacidade do Google Cloud.

O diagnóstico autorizado foi concluído. **Todas as requisições, inclusive as iniciais, continuaram nos critérios de aprovação.** Nenhuma otimização de código foi aplicada como consequência destas medições. Antes do lançamento, repetir na homologação da nuvem, medir picos de entrada e cold start e realizar ensaio prolongado. A margem estreita do p99 do artigo recomenda atenção ao pico inicial, mesmo com esta rodada aprovada.

## Evidências e reprodução

- [Primeira rodada — report.json](../load-results/spm-load-fa855693db0f000a/report.json)
- [Primeira rodada — resumo k6](../load-results/spm-load-fa855693db0f000a/audience.json)
- [Primeira rodada — log sanitizado](../load-results/spm-load-fa855693db0f000a/app.log)
- [Segunda rodada — report.json](../load-results/spm-load-8579070d796ffedd/report.json)
- [Segunda rodada — resumo com janelas](../load-results/spm-load-8579070d796ffedd/audience.json)
- [Segunda rodada — métricas com timestamps](../load-results/spm-load-8579070d796ffedd/audience-points.json)
- [Executor e metodologia](TESTE-DE-CARGA.md)

Os JSONs/logs são artefatos locais ignorados pelo Git. Para reconstruir e medir: `node scripts/test-load.mjs --profile=audience`. Para repetir exatamente a imagem já construída, usar `--skip-build` e conferir o identificador do artefato no relatório. Não executar em paralelo com builds ou outras suítes.
