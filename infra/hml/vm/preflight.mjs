import { inspectRuntimeEnvironment } from '/app/lib/config/runtime.ts';

const report = inspectRuntimeEnvironment(process.env);
for (const warning of report.warnings) console.warn(`AVISO: ${warning}`);
for (const error of report.errors) console.error(`ERRO: ${error}`);
if (report.errors.length) process.exitCode = 1;
else console.log('Configuração HML válida; a conectividade será verificada no deploy.');
