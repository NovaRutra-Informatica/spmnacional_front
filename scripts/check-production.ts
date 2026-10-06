import { inspectRuntimeEnvironment } from '../lib/config/runtime';

// Sem leitura implícita de .env e sem chamadas de rede; não imprime valores secretos.
const report = inspectRuntimeEnvironment(process.env);
for (const warning of report.warnings) console.warn(`AVISO: ${warning}`);
for (const error of report.errors) console.error(`ERRO: ${error}`);
if (report.errors.length) process.exitCode = 1;
else
    console.log(
        'Configuração válida. Conectividade, IAM, backup e integrações ainda exigem homologação.',
    );
