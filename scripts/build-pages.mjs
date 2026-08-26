/**
 * Build do site público estático para o GitHub Pages.
 *
 * O app é um Next.js com servidor (painel, sessão, Server Actions, rotas de
 * API, Postgres). O GitHub Pages serve arquivo parado, e só. Este script
 * produz, a partir do mesmo código, a fatia que sobrevive a `output: 'export'`:
 * as páginas públicas, com o conteúdo lido do banco em tempo de build.
 *
 * A regra que orienta tudo aqui: NADA é alterado na árvore de trabalho. O
 * script copia o projeto para `.pages-build/`, mexe só na cópia e joga o
 * resultado em `out/`. Assim o build do Docker e o deploy no Cloud Run
 * continuam vendo o código original, intacto.
 *
 * O que fica de fora, e por quê:
 *   app/admin ............. sessão em cookie e Server Actions
 *   app/api ............... rotas dinâmicas (login Google, arquivos, cron)
 *   app/convite/[token] ... token só existe no e-mail; não há como pré-gerar
 *   app/newsletter/confirmar  idem: a URL vem do e-mail de confirmação
 *   middleware.ts ......... não existe middleware em export estático
 *
 * Uso:
 *   DATABASE_URL=... npm run build:pages
 *
 * Variáveis:
 *   DATABASE_URL      obrigatória — o banco é lido durante o build
 *   PAGES_BASE_PATH   subpasta do site (padrão: /spmnacional_front)
 *   PAGES_SITE_URL    URL pública, usada no sitemap, robots e feed
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, '.pages-build');
const OUT = path.join(ROOT, 'out');
const OVERRIDES = path.join(ROOT, 'scripts', 'pages-overrides');

const BASE_PATH = (process.env.PAGES_BASE_PATH ?? '/spmnacional_front').replace(/\/+$/, '');
const SITE_URL = (
    process.env.PAGES_SITE_URL ?? `https://novarutra-informatica.github.io${BASE_PATH}`
).replace(/\/+$/, '');

/**
 * Diretórios e arquivos que não entram na cópia de trabalho.
 *
 * `scripts` fica de fora porque os substitutos em `pages-overrides/` são
 * escritos no lugar deles (importam `./PageContent`) e não compilam onde estão;
 * `.env` porque o build precisa ser igual aqui e no CI, que não tem o arquivo.
 */
const NAO_COPIAR = new Set([
    '.env',
    '.git',
    '.github',
    '.idea',
    '.next',
    '.pages-build',
    'docs',
    'infra',
    'node_modules',
    'out',
    'scripts',
    'storage',
]);

/** Removidos da cópia: dependem de servidor, sessão ou de um token que só existe no e-mail. */
const PODAR = [
    'app/admin',
    'app/api',
    'app/convite',
    'app/newsletter/confirmar',
    'components/admin',
    'middleware.ts',
];

/**
 * Rotas com parâmetro precisam declarar quais valores existem — em export
 * estático não há servidor para resolver um slug novo em tempo de requisição.
 * O bloco é acrescentado ao fim do arquivo; o `import()` dentro da função evita
 * ter que mexer nos imports do topo.
 */
const PARAMS_ESTATICOS = [
    {
        arquivo: 'app/publicacoes/blog/[slug]/page.tsx',
        codigo: `
export const dynamicParams = false;

export async function generateStaticParams() {
    const { listPublishedPostSlugs } = await import('@/lib/server/queries');
    const posts = await listPublishedPostSlugs();
    return posts.map((post) => ({ slug: post.slug }));
}
`,
    },
    {
        arquivo: 'app/semana-do-migrante/[ano]/page.tsx',
        codigo: `
export const dynamicParams = false;

export async function generateStaticParams() {
    const { listSemanaAnos } = await import('@/lib/server/queries');
    const anos = await listSemanaAnos();
    return anos.map((ano) => ({ ano: String(ano) }));
}
`,
    },
];

/**
 * `next.config.ts` da cópia.
 *
 * Os `redirects()` do original ficam de fora porque o export estático não os
 * aplica — não há servidor para responder 308. As rotas antigas continuam
 * respondidas pelo deploy com servidor, quando ele existir.
 */
const CONFIG_EXPORT = `import type { NextConfig } from 'next';

// Gerado por scripts/build-pages.mjs — não editar aqui.
const nextConfig: NextConfig = {
    output: 'export',
    basePath: '${BASE_PATH}',
    // A raiz do workspace é o projeto original, não esta cópia: o node_modules
    // daqui é um link para lá, e o Turbopack recusa link que aponte para fora
    // da raiz. Declarar resolve isso e ainda cala o aviso dos dois lockfiles.
    turbopack: { root: ${JSON.stringify(ROOT)} },
    // Cada rota vira uma pasta com index.html: o servidor do Pages não precisa
    // adivinhar extensão, e links com e sem barra final funcionam igual.
    trailingSlash: true,
    // Sem servidor não há otimização de imagem sob demanda.
    images: { unoptimized: true },
};

export default nextConfig;
`;

const log = (mensagem) => console.log(`[pages] ${mensagem}`);

/** Copia a árvore do projeto, pulando o que está em NAO_COPIAR. */
async function copiarProjeto() {
    const entradas = await readdir(ROOT, { withFileTypes: true });
    for (const entrada of entradas) {
        if (NAO_COPIAR.has(entrada.name)) continue;
        await cp(path.join(ROOT, entrada.name), path.join(WORK, entrada.name), {
            recursive: true,
            dereference: true,
        });
    }
}

/** Percorre a cópia e devolve todo arquivo com uma das extensões pedidas. */
async function listarArquivos(dir, extensoes) {
    const achados = [];
    const entradas = await readdir(dir, { withFileTypes: true });
    for (const entrada of entradas) {
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) {
            achados.push(...(await listarArquivos(completo, extensoes)));
        } else if (extensoes.includes(path.extname(entrada.name))) {
            achados.push(completo);
        }
    }
    return achados;
}

/**
 * Troca `force-dynamic` por `force-static` nas páginas e rotas públicas.
 *
 * No app com servidor a linha existe para que cada visita leia o banco. Em
 * export estático ela é erro de build: não há requisição para servir. Trocar em
 * vez de apagar é de propósito — `robots.txt`, `sitemap.xml` e `feed.xml` são
 * route handlers, e o Next exige que eles declarem `force-static` explicitamente
 * quando `output: 'export'` está ligado.
 *
 * O efeito prático: o conteúdo do site passa a ser o do banco no instante do
 * build. Publicar algo novo no painel exige rodar este build de novo.
 */
async function fixarConteudoNoBuild() {
    const alvos = await listarArquivos(path.join(WORK, 'app'), ['.ts', '.tsx']);
    let mexidos = 0;
    for (const arquivo of alvos) {
        const original = await readFile(arquivo, 'utf8');
        const novo = original.replace(
            /^export const dynamic = 'force-dynamic';$/gm,
            "export const dynamic = 'force-static';",
        );
        if (novo !== original) {
            await writeFile(arquivo, novo);
            mexidos += 1;
        }
    }
    log(`force-dynamic trocado por force-static em ${mexidos} arquivo(s)`);
}

/**
 * Reescreve os caminhos de `public/` para dentro do basePath.
 *
 * O Next só prefixa sozinho o que passa por ele (`/_next/...`, `next/image`,
 * `<Link>`). Um `<img src="/assets/x.jpeg">` escrito à mão, um `url('/assets/…')`
 * no SCSS e — principalmente — os caminhos que vêm do banco (`Post.coverUrl`)
 * chegam crus no HTML e apontariam para a raiz do domínio, onde não há nada.
 *
 * Por isso a correção é feita na saída, e não no código-fonte: pega os três
 * casos de uma vez, inclusive o que nasceu no Postgres.
 */
async function corrigirCaminhosDeAssets() {
    if (!BASE_PATH) return;

    const publicos = await readdir(path.join(WORK, 'public'), { withFileTypes: true });
    const alvos = publicos.map((e) => (e.isDirectory() ? `/${e.name}/` : `/${e.name}`));
    const escapar = (valor) => valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const base = escapar(BASE_PATH);

    // O lookbehind à esquerda garante que só reescrevemos início de caminho
    // (depois de aspas, parêntese, `=` ou espaço) — assim uma URL externa como
    // `https://site.org/assets/x.png` fica intacta.
    const regras = alvos.map((alvo) => ({
        de: new RegExp(`(?<=["'(\\s=,])(?<!${base})${escapar(alvo)}`, 'g'),
        para: `${BASE_PATH}${alvo}`,
    }));

    const arquivos = await listarArquivos(OUT, [
        '.html',
        '.css',
        '.js',
        '.json',
        '.txt',
        '.xml',
        '.rsc',
    ]);

    let total = 0;
    for (const arquivo of arquivos) {
        const original = await readFile(arquivo, 'utf8');
        let novo = original;
        for (const regra of regras) {
            novo = novo.replace(regra.de, () => {
                total += 1;
                return regra.para;
            });
        }
        if (novo !== original) await writeFile(arquivo, novo);
    }
    log(`${total} caminho(s) de asset prefixado(s) com ${BASE_PATH}`);
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error(
            '[pages] DATABASE_URL não definida. O conteúdo do site é lido do banco durante o build.',
        );
        process.exit(1);
    }

    log(`basePath ${BASE_PATH || '(raiz)'} · site ${SITE_URL}`);

    log('preparando a cópia de trabalho em .pages-build/');
    await rm(WORK, { recursive: true, force: true });
    await mkdir(WORK, { recursive: true });
    await copiarProjeto();

    // Junction/symlink em vez de cópia: node_modules tem dezenas de milhares de
    // arquivos e copiá-los levaria mais tempo que o build inteiro.
    await symlink(path.join(ROOT, 'node_modules'), path.join(WORK, 'node_modules'), 'junction');

    log('removendo o que depende de servidor');
    for (const alvo of PODAR) {
        await rm(path.join(WORK, alvo), { recursive: true, force: true });
    }

    log('aplicando os substitutos de scripts/pages-overrides/');
    await cp(OVERRIDES, WORK, { recursive: true });

    await fixarConteudoNoBuild();

    log('declarando os parâmetros das rotas dinâmicas');
    for (const { arquivo, codigo } of PARAMS_ESTATICOS) {
        const completo = path.join(WORK, arquivo);
        await writeFile(completo, (await readFile(completo, 'utf8')) + codigo);
    }

    await writeFile(path.join(WORK, 'next.config.ts'), CONFIG_EXPORT);

    log('rodando o next build');
    const next = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
    const resultado = spawnSync(process.execPath, [next, 'build'], {
        cwd: WORK,
        stdio: 'inherit',
        env: {
            ...process.env,
            APP_URL: SITE_URL,
            NEXT_TELEMETRY_DISABLED: '1',
        },
    });

    if (resultado.status !== 0) {
        console.error('[pages] o next build falhou.');
        process.exit(resultado.status ?? 1);
    }

    const geradoEm = path.join(WORK, 'out');
    if (!existsSync(geradoEm)) {
        console.error('[pages] o build terminou mas não gerou .pages-build/out.');
        process.exit(1);
    }

    log('publicando em out/');
    await rm(OUT, { recursive: true, force: true });
    await cp(geradoEm, OUT, { recursive: true });

    await corrigirCaminhosDeAssets();

    // Sem isto o GitHub Pages passa o site pelo Jekyll, que ignora toda pasta
    // começada com underline — e o Next põe tudo em `_next/`.
    await writeFile(path.join(OUT, '.nojekyll'), '');

    log('pronto: out/');
}

main().catch((erro) => {
    console.error(erro);
    process.exit(1);
});
