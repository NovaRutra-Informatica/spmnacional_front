// Build-time extraction of fixed public-interface copy. Never reads .env or admin files.
import ts from 'typescript';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const groups = {};
const shared = [
    'Header',
    'Footer',
    'PageHero',
    'PageCta',
    'SiteChrome',
    'HomeHeroCarousel',
    'NewsletterForm',
];
const files = shared.map((name) => `components/${name}.tsx`);
async function visit(directory) {
    for (const item of await readdir(path.join(root, directory), { withFileTypes: true })) {
        const name = `${directory}/${item.name}`;
        if (/^app\/(admin|atendente|convite|api|newsletter)(\/|$)/.test(name)) continue;
        if (item.isDirectory()) await visit(name);
        else if (item.name === 'PageContent.tsx') files.push(name);
    }
}
await visit('app');
const usable = (value) =>
    value.length > 1 &&
    /\p{L}/u.test(value) &&
    !/^(https?:|mailto:|tel:|\/|#|@|\.\/|\.\.\/|\(prefers-)/i.test(value) &&
    !/^[^\s@]+@[^\s@]+$/.test(value);
const decode = (value) =>
    value
        .replace(
            /&(quot|apos|amp|lt|gt|nbsp|copy);/g,
            (_, code) =>
                ({ quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ', copy: '©' })[code],
        )
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const group = file.startsWith('components/')
        ? 'common'
        : `/${file.slice(4).replace(/\/PageContent\.tsx$/, '')}`;
    const texts = new Set(groups[group] ?? []);
    function walk(node) {
        if (ts.isJsxText(node)) {
            const value = decode(node.text).replace(/\s+/g, ' ').trim();
            if (usable(value)) texts.add(value);
        } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            const parent = node.parent;
            const attribute = ts.isJsxAttribute(parent) ? parent.name.getText(tree) : '';
            const field = ts.isPropertyAssignment(parent)
                ? parent.name.getText(tree).replace(/['"]/g, '')
                : '';
            const presentational =
                /^(title|subtitle|eyebrow|text|description|excerpt|label|desc|alt|placeholder|aria-label|primaryLabel|secondaryLabel)$/;
            const value = node.text.replace(/\s+/g, ' ').trim();
            if (
                usable(value) &&
                (presentational.test(attribute) ||
                    presentational.test(field) ||
                    ts.isVariableDeclaration(parent) ||
                    (!attribute && !field && /\s/.test(value) && !/^[.#]|\{|\}|=>|;/.test(value)))
            )
                texts.add(value);
        }
        ts.forEachChild(node, walk);
    }
    walk(tree);
    groups[group] = [...texts].sort();
}
// Public enum labels only: enum keys and administrative vocabulary stay untouched.
const labelsTree = ts.createSourceFile(
    'labels.ts',
    await readFile(path.join(root, 'lib/labels.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
);
function publicLabels(node) {
    if (
        ts.isVariableDeclaration(node) &&
        ['REGIAO_LABEL', 'DOCUMENTO_CATEGORIA_LABEL', 'EDITAL_STATUS_LABEL'].includes(
            node.name.getText(labelsTree),
        ) &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer)
    ) {
        for (const property of node.initializer.properties)
            if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer))
                groups.common.push(property.initializer.text);
    }
    ts.forEachChild(node, publicLabels);
}
publicLabels(labelsTree);
groups.common = [...new Set(groups.common)].sort();
const catalogPath = path.join(root, 'lib/i18n/interface-catalog.json');
if (process.argv.includes('--check')) {
    const existing = JSON.parse(await readFile(catalogPath, 'utf8'));
    if (JSON.stringify(existing) !== JSON.stringify(groups)) {
        console.error(
            'Catálogo público desatualizado. Execute bun run i18n:catalog e revise o resultado.',
        );
        process.exit(1);
    }
} else {
    await writeFile(catalogPath, `${JSON.stringify(groups, null, 2)}\n`);
}
console.log(
    `Public interface catalog: ${Object.values(groups).reduce((sum, rows) => sum + rows.length, 0)} texts across ${Object.keys(groups).length} groups.`,
);
