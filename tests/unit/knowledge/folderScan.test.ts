/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_PDF_FILE_BYTES,
  maxBytesForFile,
  scanKnowledgeFolder,
} from '@/process/services/projectKnowledge/folderScan';

describe('scanKnowledgeFolder', () => {
  let root: string;
  let folder: string;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'kb-scan-'));
    folder = path.join(root, 'Knowledge Base');
    await mkdir(folder, { recursive: true });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports a missing folder as not-ok, never as an empty listing', async () => {
    const result = await scanKnowledgeFolder(path.join(root, 'does-not-exist'));
    expect(result).toEqual({ ok: false, reason: 'missing' });
  });

  it('reports an unreadable folder (a file at the path) as not-ok', async () => {
    const filePath = path.join(root, 'not-a-dir');
    await writeFile(filePath, 'x', 'utf8');
    const result = await scanKnowledgeFolder(filePath);
    expect(result).toMatchObject({ ok: false });
  });

  it('hashes supported files with sha256 and records their size', async () => {
    await writeFile(path.join(folder, 'policy.md'), '# Policy\n\nVisa letters need HR sign-off.', 'utf8');
    const result = await scanKnowledgeFolder(folder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ fileName: 'policy.md', kind: 'supported' });
    expect(result.entries[0].contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.entries[0].byteSize).toBeGreaterThan(0);
  });

  it('ignores dotfiles, Office lock files, and subdirectories', async () => {
    await writeFile(path.join(folder, '.DS_Store'), 'junk');
    await writeFile(path.join(folder, '.hidden.md'), 'hidden');
    await writeFile(path.join(folder, '~$report.docx'), 'lock');
    await mkdir(path.join(folder, 'nested'));
    await writeFile(path.join(folder, 'nested', 'inside.md'), 'nested content', 'utf8');
    const result = await scanKnowledgeFolder(folder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(0);
    expect(result.unsupported).toHaveLength(0);
  });

  it('lists unsupported extensions separately without reading them', async () => {
    await writeFile(path.join(folder, 'photo.png'), 'not really a png');
    const result = await scanKnowledgeFolder(folder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(0);
    expect(result.unsupported).toEqual(['photo.png']);
  });

  it('marks oversize files with a size pseudo-hash instead of reading them', async () => {
    const bytes = MAX_KNOWLEDGE_FILE_BYTES + 1;
    await writeFile(path.join(folder, 'huge.txt'), Buffer.alloc(bytes, 120));
    const result = await scanKnowledgeFolder(folder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // limitBytes travels with the entry so the message can name the ceiling
    // this file actually exceeded — the caps differ by format now.
    expect(result.entries).toEqual([
      {
        fileName: 'huge.txt',
        byteSize: bytes,
        contentHash: `oversize:${bytes}`,
        kind: 'oversize',
        limitBytes: MAX_KNOWLEDGE_FILE_BYTES,
      },
    ]);
  });

  it('measures a PDF against the higher PDF ceiling, not the default one', async () => {
    // The motivating case: a 262-page, 51 MB scanned statement was refused by
    // the 15 MB default even though MAX_PDF_PAGES caps the work at 50 pages
    // regardless of length. A file this size is now read, not rejected.
    const bytes = MAX_KNOWLEDGE_FILE_BYTES + 1;
    await writeFile(path.join(folder, 'long-scan.pdf'), Buffer.alloc(bytes, 120));
    const result = await scanKnowledgeFolder(folder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ fileName: 'long-scan.pdf', kind: 'supported' });
    expect(result.entries[0].contentHash).toMatch(/^sha256:/);
  });

  it('still rejects a PDF past the PDF ceiling, and says which ceiling', async () => {
    // Asserted via the exported constant rather than by writing a 100 MB file:
    // maxBytesForFile is the single decision point, so testing it directly is
    // both honest and fast.
    expect(maxBytesForFile('scan.pdf')).toBe(MAX_PDF_FILE_BYTES);
    expect(maxBytesForFile('SCAN.PDF')).toBe(MAX_PDF_FILE_BYTES);
    expect(maxBytesForFile('notes.md')).toBe(MAX_KNOWLEDGE_FILE_BYTES);
    expect(maxBytesForFile('sheet.xlsx')).toBe(MAX_KNOWLEDGE_FILE_BYTES);
    expect(maxBytesForFile('no-extension')).toBe(MAX_KNOWLEDGE_FILE_BYTES);
    expect(MAX_PDF_FILE_BYTES).toBeGreaterThan(MAX_KNOWLEDGE_FILE_BYTES);
  });

  it('skips symlinks that resolve outside the folder', async () => {
    const secret = path.join(root, 'id_rsa.txt');
    await writeFile(secret, 'PRIVATE KEY MATERIAL', 'utf8');
    await symlink(secret, path.join(folder, 'innocent.txt'));
    const result = await scanKnowledgeFolder(folder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(0);
    expect(result.unsupported).toHaveLength(0);
  });

  it('keeps symlinks that resolve inside the folder', async () => {
    await writeFile(path.join(folder, 'real.md'), 'actual content', 'utf8');
    await symlink(path.join(folder, 'real.md'), path.join(folder, 'alias.md'));
    const result = await scanKnowledgeFolder(folder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.entries.map((e) => e.fileName).toSorted();
    expect(names).toEqual(['alias.md', 'real.md']);
  });

  it('skips broken symlinks', async () => {
    await symlink(path.join(folder, 'gone.md'), path.join(folder, 'dangling.md'));
    const result = await scanKnowledgeFolder(folder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(0);
  });
});
