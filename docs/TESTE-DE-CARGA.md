# Teste de carga local — SPM Nacional

Resultado registrado: [ensaio de 14/09/2026 e gargalos encontrados](RESULTADO-CARGA-2026-09-14.md).

Nova medição: [50 leitores e 3 editores, incluindo diagnóstico do pico inicial em 22/09](RESULTADO-CARGA-2026-09-22.md).

Este ensaio mede a imagem de produção em um ambiente Docker descartável. Não acessa o banco atual, não publica nada e não estima automaticamente capacidade ou custo do Google Cloud.

## Repetir o ensaio

Com dependências instaladas e Docker Desktop em modo Linux:

```sh
bun run test:load
```

O executor constrói `spmnacional-front:load-test` (não substitui `:latest`), cria banco e rede próprios, aplica migrações, gera dados sintéticos e executa sete perfis. Os JSONs e logs ficam em `load-results/spm-load-<id>/`, ignorados pelo Git e pelo contexto Docker.

Para executar somente um perfil e reutilizar a imagem de teste já construída:

```sh
node scripts/test-load.mjs --skip-build --profile=smoke
```

Perfis aceitos: `smoke`, `baseline`, `stress`, `recovery`, `auth`, `upload`, `audience`. `--skip-build` reutiliza o artefato anterior: reconstruir sempre que o código da aplicação mudar. A identificação da imagem efetivamente medida fica em `report.json`. Não executar o benchmark em paralelo com outro benchmark ou com builds pesados na mesma máquina.

O padrão atual solicita gzip, registrando se cada endpoint efetivamente comprimiu a resposta. Para medir sem compressão, usar `--encoding=identity`. É possível repetir `--profile` com valores diferentes para uma sequência menor, preservando a ordem:

```sh
node scripts/test-load.mjs --skip-build --encoding=gzip --profile=stress --profile=recovery --profile=auth
```

## Ambiente e segurança

- Aplicação: 1 CPU, 512 MiB de memória, imagem standalone, usuário sem root e `DB_POOL_MAX=5`. O cliente agora usa singleton global também em produção para evitar pools duplicados entre bundles; verificar as conexões efetivas nas amostras. Réplicas/processos diferentes continuam tendo pools independentes.
- PostgreSQL 17: 1 CPU, 512 MiB, 30 conexões máximas, 64 MiB de shared buffers e dados em tmpfs descartável. Isso não reproduz I/O de disco ou latência do Cloud SQL.
- k6 2.1: 2 CPUs e 512 MiB, imagem fixada por digest, métricas locais e telemetria desativada.
- Rede Docker exclusiva; portas de preparação/saúde publicadas apenas em loopback aleatório. Não é uma política de bloqueio de saída à internet: a proteção do ensaio está no destino fixo dos cenários, ausência de redirects e integrações desativadas.
- Nenhum volume da instalação atual é usado. Arquivos e banco de teste ficam em tmpfs. A limpeza confere nomes e rótulos de propriedade; não remove imagens ou volumes existentes.
- Segredos são aleatórios por execução e não entram nos relatórios. A configuração do Prisma não lê `.env` nessa preparação. Dados reais nunca devem ser copiados para este ensaio.

Dataset: 500 notícias (350 publicadas, 100 rascunhos, 50 agendadas), 250 arquivos PNG sintéticos de 64 KiB (200 públicos e 50 privados), 300 atendimentos, 1.000 mensagens cifradas, 30 eventos, 5 regionais, 8 categorias, 20 tags e três identidades administrativas sintéticas com sessões Workspace válidas. As sessões são inseridas somente no banco isolado: não há login Google real, validação de 2FA do provedor nem segredo OAuth válido. Tradução permanece desligada para não consumir APIs pagas no ensaio.

## Perfis e critérios

Cada iteração faz **uma requisição HTTP**. Os seis perfis originais usam taxa de chegada, sem pausas: mantêm a demanda independentemente da velocidade da resposta; o relatório registra iterações que não puderam ser iniciadas. Taxa de requisições não equivale a número de pessoas navegando. O novo `audience` usa um modelo fechado com pausas explícitas, descrito abaixo. [Modelo aberto/fechado do k6](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/) e [iterações descartadas](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/dropped-iterations/).

| Perfil             | Taxa programada                   | Duração da carga                   |
| ------------------ | --------------------------------- | ---------------------------------- |
| Smoke              | 2 req/s                           | 30 s                               |
| Público gradual    | 5 → 10 → 20 req/s                 | 3 patamares de 30 s, rampas de 1 s |
| Pico público       | 30 → 50 → 75 req/s                | 3 patamares de 30 s, rampas de 1 s |
| Recuperação        | 10 req/s                          | 30 s, após o pico                  |
| Painel autenticado | 5 → 10 → 20 req/s                 | 3 patamares de 30 s, rampas de 1 s |
| Upload             | 1 req/s, até 25 arquivos          | 25 s                               |
| Audience           | 50 leitores + 3 editores virtuais | 180 s, modelo fechado com pausas   |

Mix público: home 30%, blog 20%, um artigo popular 20%, agenda 10%, institucional 10%, mídia pública 10%. Mix administrativo: painel, notícias, mídia, atendimentos e mensagens, com pesos iguais. Os cenários autenticados usam sessões Workspace estabelecidas, não medem login Google, disponibilidade do provedor ou verificação real de 2FA.

Limiares de investigação, **não um SLA contratado**: p95 abaixo de 1 s e p99 abaixo de 2 s no público; p95 abaixo de 1,5 s e p99 abaixo de 3 s no painel; p95 abaixo de 2 s nos uploads. Erros funcionais abaixo de 1%, checks acima de 99% e nenhuma iteração descartada. Os limites também são verificados por endpoint, para uma página rápida não esconder outra lenta. Falhas de limiar encerram o comando com erro, mas o executor ainda tenta medir recuperação e gerar evidências. [Thresholds do k6](https://grafana.com/docs/k6/latest/using-k6/thresholds/).

Não basta HTTP 200: os checks exigem conteúdo esperado, sem redirects, e validam tamanho/tipo da mídia. Um pré-teste verifica arquivo privado sem sessão/com sessão; após os uploads, outro teste verifica o bloqueio real de 30 envios por usuário em 15 minutos. Respostas 429 esperadas dessa prova separada não entram como falhas do benchmark de upload.

### Critério de 50 leitores simultâneos

```sh
node scripts/test-load.mjs --profile=audience --profile=recovery
```

O `audience` mantém **50 VUs públicos e 3 VUs administrativos simultâneos durante três minutos**, com gzip. Cada leitor percorre o mix público e espera de **2 a 5 segundos** após cada resposta; cada editor alterna dashboard, notícias e biblioteca de mídia, com **4 a 7 segundos** de leitura entre respostas. Cada um dos três editores tem identidade/sessão própria. Os leitores não recebem cookies do painel. Não há escrita editorial, uploads, atendimento, tradução ou login externo nesse perfil.

São jornadas HTTP simuladas, não 53 navegadores completos. No modelo fechado a taxa obtida cai se o servidor demora; por isso a aprovação depende de latência/erros por rota, e não de manter uma taxa arbitrária de requisições. Os limites por endpoint continuam em p95 < 1 s/p99 < 2 s para o público e p95 < 1,5 s/p99 < 3 s para o painel. A agregação global usa os limites do painel e não substitui a verificação por rota. O ensaio curto não mede capacidade máxima nem estabilidade prolongada. O relatório de 14/09 é histórico e não contém esse novo cenário.

O Terraform usa inicialmente `request_concurrency=16` por instância (limite de **requisições HTTP**, não de pessoas), até quatro instâncias, pool cinco por processo. Isso é um ponto de partida para homologação e orçamento, não comprovação de que o Google Cloud já suporta a meta. Nenhum recurso é criado ao preparar ou executar estes testes locais.

O `audience` também registra `audience-points.json`, com timestamps e métricas sem corpo de respostas/credenciais. A tag `window` separa requisições iniciadas nos primeiros 15 segundos das restantes; os percentis de cada grupo são apenas observacionais. Os limites de aprovação originais continuam incluindo todas as requisições, inclusive as iniciais. Os rates dos subgrupos no JSON k6 usam a duração total do cenário como denominador: não devem ser interpretados como taxa exclusiva daquela janela.

## Interpretar os resultados

`report.json` reúne os resumos dos perfis, amostras de CPU/memória do servidor, banco e gerador, saúde, conexões, locks, deadlocks, estatísticas SQL e estado OOM dos containers. `app.log` reúne stdout e stderr, com remoção dos segredos sintéticos. Os percentis de cada perfil agregado cobrem seus três patamares: não representam, isoladamente, o patamar mais alto. A sonda auxiliar de saúde é separada dos limiares k6; conferir `healthObservations`, não apenas `passed`.

O artigo atualiza `views` a cada leitura. Comparar o contador final com as requisições ao artigo ajuda a verificar a escrita; uma divergência só pode ser interpretada depois de considerar erros, timeouts e requisições que terminaram após o prazo do cliente.

Limitações: carga HTTP local, não navegação completa ou Web Vitals; sem downloads dos bundles CSS/JS, imagens externas, TLS de borda, CDN, autoscaling, GCS, SMTP ou chamadas Google; sem teste prolongado de vazamento de memória, falhas de infraestrutura ou todos os fluxos de escrita. PNG com padding testa transporte/armazenamento, não decodificação ou antivírus. O gerador e o alvo compartilham o host, embora tenham limites separados: conferir saturação do gerador antes de atribuir perda de taxa ao servidor.

Repetir em homologação real, com orçamento e carga autorizados, antes de dimensionar produção. A preparação e os resultados locais não substituem essa etapa.
