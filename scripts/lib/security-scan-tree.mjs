import { lstatSync, mkdirSync, copyFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export function safeScanPath(root, relative) {
    if (
        !relative ||
        /[\u0000\r\n]/.test(relative) ||
        relative.includes('\\') ||
        path.isAbsolute(relative) ||
        /^[a-z]:/i.test(relative) ||
        relative.split('/').some((part) => part === '..' || part === '.git')
    ) {
        throw new Error('Unsafe secret scan path.');
    }
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`))
        throw new Error('Unsafe secret scan path.');
    return target;
}

function isInside(root, target) {
    const relative = path.relative(root, target);
    return (
        relative === '' ||
        (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
    );
}

/** Inspect every existing component before any copy; lstat of a leaf follows parent links. */
function regularPath(root, target, allowMissing = false) {
    const absoluteRoot = path.resolve(root);
    const rootInfo = lstatSync(absoluteRoot);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())
        throw new Error('Secret scanner requires a regular root directory.');
    const canonicalRoot = realpathSync(absoluteRoot);
    const parts = path.relative(absoluteRoot, target).split(path.sep).filter(Boolean);
    let current = absoluteRoot;
    for (let index = 0; index < parts.length; index++) {
        current = path.join(current, parts[index]);
        let info;
        try {
            info = lstatSync(current);
        } catch (error) {
            if (allowMissing && error.code === 'ENOENT') return null;
            throw error;
        }
        if (info.isSymbolicLink())
            throw new Error('Secret scanner rejects symbolic links in every path component.');
        if (!isInside(canonicalRoot, realpathSync(current)))
            throw new Error('Secret scan path escaped its root.');
        const final = index === parts.length - 1;
        if (final ? !info.isFile() : !info.isDirectory())
            throw new Error('Secret scanner accepts regular repository files only.');
    }
    return target;
}

function prepareDestination(root, target) {
    const relative = path.relative(path.resolve(root), path.dirname(target));
    let current = path.resolve(root);
    const rootInfo = lstatSync(current);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())
        throw new Error('Secret scanner requires a regular root directory.');
    const canonicalRoot = realpathSync(current);
    for (const part of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        try {
            mkdirSync(current);
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
        const info = lstatSync(current);
        if (
            info.isSymbolicLink() ||
            !info.isDirectory() ||
            !isInside(canonicalRoot, realpathSync(current))
        )
            throw new Error('Secret scanner rejects linked destination directories.');
    }
    regularPath(root, target, true);
}

export function regularScanFile(root, relative) {
    return regularPath(root, safeScanPath(root, relative));
}

export function scanReportPath(root, relative) {
    const target = safeScanPath(root, relative);
    prepareDestination(root, target);
    return target;
}

/** Input comes from git ls-files --cached --others --exclude-standard -z.
 * Ignored local credentials are never copied; tracked credentials are scanned.
 */
export function copyScanTree(root, destination, paths) {
    let files = 0;
    for (const relative of new Set(paths)) {
        const source = safeScanPath(root, relative);
        if (!regularPath(root, source, true)) continue;
        const target = safeScanPath(destination, relative);
        prepareDestination(destination, target);
        copyFileSync(source, target);
        files++;
    }
    return files;
}
