O guard é exclusivo da autorização de 02/10/2026 até **03/10/2026 às 06h de Brasília**. Ele limita o tráfego de saída usado pelos testes; não representa um limite rígido de faturamento do GCP. A cobrança também inclui computação, discos, IP, APIs, armazenamento e recursos já existentes.

Depois de baixar as imagens, com o gateway fechado e a exceção protegida já criada, execute na VM:

```bash
sudo bash /opt/spm-hml/budget-test-window.sh --arm --shape
```

A saída JSON comprova a expiração, quota de **536870912 bytes (512 MiB)**, interface, shaping de **10 Mbit/s** e timer ativo. O contador `tx_bytes` da interface da rota padrão inclui também tráfego administrativo e interno; a quota é conservadora. O TBF limita a taxa média e permite pequenos bursts; há margem adicional entre a medição a cada cinco segundos e o encerramento. [Manual upstream do TBF](https://man7.org/linux/man-pages/man8/tc-tbf.8.html).

A baseline root `0600` fica em `/opt/spm-hml/state/test-budget.json`, vinculada ao boot e à interface. Repetir `--arm` não reinicia a quota. Mudança de boot/interface, contador regressivo, estado inválido ou limite atingido durante a autorização fecha o gateway e solicita desligamento. O serviço não consulta o faturamento e não cria recursos GCP.

`--shape` aceita somente filas padrão reconhecidas e grava o handle próprio `5a20:`. Uma fila personalizada provoca recusa. Sem `--shape`, o monitor mantém quota e cadência, mas não limita a taxa nem o excesso de tráfego entre verificações; use apenas se essa limitação operacional for aceita.

Às 06h, ou ao remover a exceção para fechar os testes, o guard remove somente o TBF comprovadamente criado no mesmo boot e desativa seu timer. A baseline permanece para impedir reset e permitir auditoria. Execução tardia não desliga a VM nem interfere no agendamento normal de sábado às 09h. O desligamento fixo já armado por `open-test-window.sh` permanece independente.

Verificação local, sem iniciar serviços ou alterar a rede real:

```bash
python3 infra/hml/vm/check-budget-window.py
```

O teste exige um ambiente Linux isolado como root; todos os comandos `tc`, `systemctl` e `compose` são substituídos por mocks.
