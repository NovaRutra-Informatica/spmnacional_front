import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const validStatus = ['implementado', 'parcial', 'pendente_externo', 'não_aplicável'];
const imageIds = [
    'sha256:7488adb06c40b0a382c0b793a9b2048d381853a195cde92952c292ead802f338',
    'sha256:4a3d9b21d38680940477e1a1cb4582806f730249cc49186fee0243ef8de88420',
    'sha256:605136e47342394723b247f76a53ea82804c3855349124db6e31ff29558bf515',
    'sha256:881bbc60f9986d5ab8e7cfd6cf7e4ef3c9c0439fef2429d035d065577882f028',
].sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function requireValue(value, message) {
    if (!value) throw new Error(message);
}

export function validateAuditDocuments(matrix, summary, sources, readmes) {
    requireValue(Array.isArray(matrix.itens) && matrix.itens.length === 76, 'Matrix must contain 76 entries');
    const numbers = matrix.itens.map(row => row.numero).sort((a,b) => a-b);
    requireValue(same(numbers, Array.from({length:76}, (_,i) => i+1)), 'Matrix must contain each number 1–76 once');
    const counter = Object.fromEntries(validStatus.map(status => [status, 0]));
    for (const item of matrix.itens) {
        requireValue(validStatus.includes(item.status), 'Unknown item status');
        requireValue(typeof item.verificacao === 'string' && item.verificacao.length > 0, 'Each item requires evidence interpretation');
        requireValue(Array.isArray(item.caminho_evidencia) && item.caminho_evidencia.length > 0, 'Each item requires evidence paths');
        counter[item.status] += 1;
    }
    requireValue(summary.contagem_status.total === 76 && validStatus.every(status => summary.contagem_status[status] === counter[status]), 'Status counters disagree with matrix');
    requireValue(same(counter,{implementado:65,parcial:7,pendente_externo:3,'não_aplicável':1}), 'Final statuses must preserve unresolved scopes');
    const grouped = new Set();
    const groupIds = new Set();
    for (const group of summary.grupos) {
        requireValue(!groupIds.has(group.id), 'Summary group IDs must be unique');
        groupIds.add(group.id);
        requireValue(new Set(group.itens).size === group.itens.length, 'Duplicate item within a summary group');
        for (const number of group.itens) {
            requireValue(Number.isInteger(number) && number >= 1 && number <= 76, 'Summary group item outside matrix');
            grouped.add(number);
        }
    }
    requireValue(grouped.size === 76, 'Summary groups must cover all 76 items');
    requireValue(matrix.escopo === summary.escopo, 'Scope must match across documents');
    const infra = summary.grupos.find(group => group.id === 'publicacao_infraestrutura');
    const load = summary.grupos.find(group => group.id === 'carga_e_otimizacao');
    const quality = summary.qualidade_consolidada_confirmada_pelo_operador;
    const state = matrix.estado_operacional_hml;
    requireValue(same(state, infra.estado_operacional), 'HML state must match across documents');
    requireValue(state.release_final_sem_npm_publicada === true && infra.release_final_sem_npm_publicada === true, 'Final release must be marked published');
    requireValue(state.release_final_id === 'hml-20261002-76-04' && state.instalacao_exit_code === 0, 'Final release identity/installer status incorrect');
    requireValue(state.url === 'https://spm-hml.35.215.232.88.sslip.io' && state.publico_sem_basic_auth === true, 'HML URL/access contract incorrect');
    requireValue(state.migrations_aplicadas === 13 && state.tabelas_force_rls === 6 && state.postgres === '18.6' && state.runtime_timezone === 'America/Sao_Paulo', 'Final SQL/timezone contract incorrect');
    requireValue(sources.final.cloud.complete === true && same(sources.final.cloud.errors,[]) && state.coletora_json_completa === true, 'Final collector JSON must be complete');
    requireValue(state.coletora_cli_export_exit0_confirmado === true && quality.deploy_final_real.coletora_cli_export_exit0_confirmado === true && state.coletora_stdout_direto_exit0_confirmado === false, 'Protected-file export must be distinguished from failed direct stdout');
    requireValue(same(sources.downloaded,sources.final), 'Downloaded collector JSON must be identical to original');
    requireValue(same(state.imagens_configuradas.map(row => row.id).sort(),imageIds), 'HML image IDs do not match final release');
    requireValue(same(sources.final.cloud.compose.configured_images.map(row => row.id).sort(),imageIds), 'Source collector image IDs do not match final release');
    const backup = state.backup_restauracao_hml;
    requireValue(backup.migrations === 13 && backup.tabelas === 33 && backup.sequencias === 1 && backup.bytes === 111498 && backup.verificado === true, 'Live HML restore scope incorrect');
    requireValue(backup.tabelas === sources.final.backup.tables_verified && backup.sequencias === sources.final.backup.sequences_verified && backup.bytes === sources.final.backup.dump_bytes, 'Live backup fields disagree with evidence');
    requireValue(backup.md5_recibo_validado === true && backup.geracao_decimal_positiva === true && sources.final.backup_upload.verified_dump_uploaded === true, 'GCS verified receipt required');
    requireValue(sources.final.backup_upload.bytes === backup.bytes && sources.final.backup_upload.sha256 === sources.final.backup.dump_sha256 && /^[1-9][0-9]*$/.test(sources.final.backup_upload.generation), 'GCS receipt inconsistent');
    requireValue(quality.postgres_smoke_local.tabelas_restauradas === 34 && quality.postgres_smoke_local.sequencias_restauradas === 2 && sources.pg.backupRestore.tables === 34 && sources.pg.backupRestore.sequences === 2, 'Local and live restore scopes must remain distinct');
    requireValue(sources.http.passed === true && sources.http.total === 18 && sources.http.totalResponseBytes === 372529 && state.bytes_respostas_http === 372529, 'Final HTTP totals disagree');
    requireValue(sources.browser.freshWorkspaceLogin === true && sources.browser.adminVisible === true && sources.browser.release === state.release_final_id && state.oauth_confirmacao_operador_utc === '2026-10-03T02:59:00Z', 'Final Workspace proof missing or misdated');
    requireValue(state.oauth_atividade_exibida_brasilia === '02/10/2026 23:59', 'OAuth UTC/Brasilia dates disagree');
    requireValue(state.excecao_deadline_brasilia === '2026-10-03T06:00:00-03:00' && state.limite_trafego_excecao_mib === 512 && state.shaping_excecao_mbit_s === 10 && state.limite_rigido_faturamento === false, 'Exception window/quota/cost guarantees incorrect');
    requireValue(state.custo_excecao.reserva_planejamento_brl === 12 && state.custo_excecao.fatura_real_confirmada === false, 'Cost estimate must not be an invoice');
    requireValue(quality.unitarios.testes_passados === 851 && quality.unitarios.arquivos === 73 && sources.unit.success === true && sources.unit.numPassedTests === 851 && sources.unit.testResults.length === 73, 'Unit totals disagree with confirmed release evidence');
    requireValue(quality.audit_dependencias.high === 1 && quality.audit_dependencias.achado_suprimido === false && quality.audit_dependencias.gate_ci_high_bloqueado === true, 'Development HIGH must remain explicit');
    requireValue(quality.scans_imagens_finais.length === 3 && quality.scans_imagens_finais.every(row => row.achados === 0), 'Zero scans must include only APP/migrator/PostgreSQL');
    requireValue(/Caddy[\s\S]*1 UNKNOWN[\s\S]*alcance não comprovado/.test(quality.escopo_scans), 'Caddy finding/unknown reachability must remain explicit');
    requireValue(load.reteste.engine === 'monotonic' && load.reteste.timing_valido === true && load.reteste.accounting_valido === true && load.reteste.limite_consecutivo_rps === 50 && load.reteste.primeiro_estagio_fora_slo_rps === 75 && load.reteste.ensaio_completo_passed === false && load.reteste.exit_code === 99, 'Capacity result must preserve real saturation');
    requireValue(load.reteste.imagem_medida === 'sha256:b964c14e97b320eb9e0588db78cf81637502fd1da1a374de66611683b7409f83' && load.reteste.requisicoes === 14544 && load.reteste.drops === 9231, 'Capacity measurement must remain on older public image');
    requireValue(load.limites.some(text => /a partir de 100/.test(text)) && load.limites.some(text => /não é reteste autenticado/.test(text)), 'Capacity profile/drops limitations missing');
    const allTexts = JSON.stringify({matrix,summary,readmes});
    requireValue(!/final[^.\n]{0,120}(?:ainda aguarda|aguardam conclusão|precisa da confirmação após)/i.test(allTexts), 'Stale final-release pending assertion');
    requireValue(!/intervalo local de SLO 50[–-]75|Drops acima de 100|372[.,]?543|495 arquivos/.test(allTexts), 'Stale load/HTTP/secret-scan wording');
    for (const text of Object.values(readmes)) {
        requireValue(text.includes('hml-20261002-76-04'), 'Each README must identify final release');
        requireValue(text.includes('UNKNOWN') && text.includes('HIGH'), 'Each README must preserve security findings');
    }
    return {passed:true,total:76,...counter,liveBackup:{tables:33,sequences:1},localBackup:{tables:34,sequences:2},finalRelease:'hml-20261002-76-04'};
}

export function readAuditInputs(root = process.cwd()) {
    const read = file => JSON.parse(readFileSync(resolve(root,file),'utf8'));
    return {
        matrix:read('docs/auditoria-76-itens.json'), summary:read('docs/auditoria-76-resumo.json'),
        sources:{final:read('tmp/hml-final76-proof.json'),downloaded:read('tmp/hml-final76-proof-downloaded.json'),http:read('tmp/hml-final-http-proof.json'),browser:read('tmp/hml-final76-browser-proof.json'),pg:read('tmp/pg-secure76-smoke-proof.json'),unit:read('tmp/final-unit-results.json')},
        readmes:Object.fromEntries(['README.md','infra/hml/README.md','infra/hml/vm/README.md'].map(file => [file,readFileSync(resolve(root,file),'utf8')])),
    };
}

export function verifyEvidencePaths(matrix, summary, root = process.cwd()) {
    let count = 0;
    function visit(value, key = '') {
        if (typeof value === 'string' && ['caminho_evidencia','evidencias','evidencia','arquivos','fontes','relatorio'].includes(key)) {
            const path = resolve(root,value);
            const inside = relative(root,path);
            requireValue(!isAbsolute(value) && inside !== '..' && !inside.startsWith('..'+(process.platform === 'win32' ? '\\' : '/')) && existsSync(path), 'Evidence path missing or outside workspace: '+value);
            count += 1;
        } else if (Array.isArray(value)) value.forEach(item => visit(item,key));
        else if (value && typeof value === 'object') Object.entries(value).forEach(([name,item]) => visit(item,name));
    }
    visit(matrix); visit(summary);
    return count;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const {matrix,summary,sources,readmes} = readAuditInputs();
    const proof = validateAuditDocuments(matrix,summary,sources,readmes);
    console.log(JSON.stringify({...proof,evidencePaths:verifyEvidencePaths(matrix,summary)}));
}
