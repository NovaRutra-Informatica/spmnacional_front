import { describe, expect, it } from 'vitest';
import {
    copyScanTree,
    safeScanPath,
    regularScanFile,
    scanReportPath,
} from '../../scripts/lib/security-scan-tree.mjs';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    rmSync,
    symlinkSync,
    existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('secret scanning boundaries', () => {
    it.each([
        '../private.env',
        '/etc/passwd',
        'C:/private.env',
        '.git/config',
        'dir/.git/config',
        'dir\\private.env',
        'file\nname',
        '',
    ])('rejects unsafe path %s', (value) => {
        expect(() => safeScanPath(path.resolve('fixture'), value)).toThrow('Unsafe');
    });
    it('copies only inventory files, scans tracked credential files and skips deletions', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'spm-scan-test-'));
        try {
            const source = path.join(root, 'source');
            const destination = path.join(root, 'scan');
            mkdirSync(source);
            mkdirSync(destination);
            writeFileSync(path.join(source, 'tracked.env'), 'synthetic-credential');
            writeFileSync(path.join(source, '.env'), 'ignored-local-secret');
            expect(
                copyScanTree(source, destination, ['tracked.env', 'deleted.ts', 'tracked.env']),
            ).toBe(1);
            expect(readFileSync(path.join(destination, 'tracked.env'), 'utf8')).toBe(
                'synthetic-credential',
            );
            expect(() => readFileSync(path.join(destination, '.env'))).toThrow();
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it('rejects a parent directory link before reading an outside file or skipping a missing leaf', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'spm-scan-links-'));
        try {
            const source = path.join(root, 'source');
            const destination = path.join(root, 'scan');
            const outside = path.join(root, 'outside');
            mkdirSync(source);
            mkdirSync(destination);
            mkdirSync(outside);
            writeFileSync(path.join(outside, 'private.env'), 'synthetic-outside-data');
            symlinkSync(
                outside,
                path.join(source, 'linked'),
                process.platform === 'win32' ? 'junction' : 'dir',
            );
            expect(() => copyScanTree(source, destination, ['linked/private.env'])).toThrow(
                'symbolic links',
            );
            expect(() => copyScanTree(source, destination, ['linked/missing.env'])).toThrow(
                'symbolic links',
            );
            expect(existsSync(path.join(destination, 'linked/private.env'))).toBe(false);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it('rejects a destination parent link without writing outside the scan root', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'spm-scan-destination-'));
        try {
            const source = path.join(root, 'source');
            const destination = path.join(root, 'scan');
            const outside = path.join(root, 'outside');
            mkdirSync(source);
            mkdirSync(destination);
            mkdirSync(outside);
            mkdirSync(path.join(source, 'nested'));
            writeFileSync(path.join(source, 'nested/file.ts'), 'synthetic-scannable-data');
            symlinkSync(
                outside,
                path.join(destination, 'nested'),
                process.platform === 'win32' ? 'junction' : 'dir',
            );
            expect(() => copyScanTree(source, destination, ['nested/file.ts'])).toThrow(
                'linked destination',
            );
            expect(existsSync(path.join(outside, 'file.ts'))).toBe(false);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it('rejects a linked root directory', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'spm-scan-root-'));
        try {
            const actual = path.join(root, 'actual');
            const source = path.join(root, 'alias');
            const destination = path.join(root, 'scan');
            mkdirSync(actual);
            mkdirSync(destination);
            writeFileSync(path.join(actual, 'file.ts'), 'synthetic-scannable-data');
            symlinkSync(actual, source, process.platform === 'win32' ? 'junction' : 'dir');
            expect(() => copyScanTree(source, destination, ['file.ts'])).toThrow('regular root');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it('guards config and report paths with the same directory boundaries', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'spm-scan-reports-'));
        try {
            const source = path.join(root, 'source');
            const outside = path.join(root, 'outside');
            mkdirSync(source);
            mkdirSync(outside);
            writeFileSync(path.join(source, '.gitleaks.toml'), 'synthetic-config');
            expect(regularScanFile(source, '.gitleaks.toml')).toBe(
                path.join(source, '.gitleaks.toml'),
            );
            expect(scanReportPath(source, 'normal/result.json')).toBe(
                path.join(source, 'normal/result.json'),
            );
            symlinkSync(
                outside,
                path.join(source, 'tmp'),
                process.platform === 'win32' ? 'junction' : 'dir',
            );
            expect(() => scanReportPath(source, 'tmp/report.json')).toThrow('linked destination');
            expect(() => regularScanFile(source, 'tmp/config.toml')).toThrow('symbolic links');
            expect(existsSync(path.join(outside, 'report.json'))).toBe(false);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
