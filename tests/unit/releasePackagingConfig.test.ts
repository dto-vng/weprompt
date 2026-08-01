import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const projectRoot = resolve(__dirname, '../..');
const itWithBash = spawnSync('bash', ['--version'], { encoding: 'utf8' }).status === 0 ? it : it.skip;

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), 'utf8');
}

function readProjectJson<T>(path: string): T {
  return JSON.parse(readProjectFile(path)) as T;
}

function yamlBlock(content: string, key: string): string {
  const startMatch = content.match(new RegExp(`^${key}:\\s*$`, 'm'));
  if (!startMatch || startMatch.index === undefined) return '';

  const blockStart = startMatch.index + startMatch[0].length;
  const rest = content.slice(blockStart);
  const nextTopLevelKey = rest.search(/^[a-zA-Z][a-zA-Z0-9]*:\s*$/m);
  return nextTopLevelKey === -1 ? rest : rest.slice(0, nextTopLevelKey);
}

describe('release packaging configuration', () => {
  it('uses WePrompt as the visible application identity while preserving compatibility identifiers', () => {
    const rootPackage = readProjectJson<{
      author: { email?: string; name: string };
      name: string;
      productName: string;
    }>('package.json');
    const desktopPackage = readProjectJson<{ description: string }>('packages/desktop/package.json');
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const nsisBlock = yamlBlock(config, 'nsis');
    const linuxBlock = yamlBlock(config, 'linux');

    expect(rootPackage).toMatchObject({
      name: 'forge',
      productName: 'WePrompt',
      author: { name: 'VNG Corporation' },
    });
    expect(rootPackage.author.email).toBeUndefined();
    expect(desktopPackage.description).toContain('WePrompt');
    expect(config).toMatch(/^appId:\s+com\.aionui\.app$/m);
    expect(config).toMatch(/^productName:\s+WePrompt$/m);
    expect(config).toMatch(/^executableName:\s+WePrompt$/m);
    expect(config).toMatch(/^\s+- name:\s+WePrompt Protocol$/m);
    expect(config).toMatch(/^\s+- aionui$/m);
    expect(nsisBlock).toMatch(/^\s+shortcutName:\s+\$\{productName\}$/m);
    expect(nsisBlock).toMatch(/^\s+uninstallDisplayName:\s+\$\{productName\}$/m);
    expect(config).toMatch(/^\s+artifactName:\s+\$\{productName\}-\$\{version\}-\$\{os\}-\$\{arch\}\.\$\{ext\}$/m);
    expect(linuxBlock).toMatch(/^\s+Name:\s+WePrompt$/m);
    expect(linuxBlock).toMatch(/^\s+Icon:\s+WePrompt$/m);
  });

  it('keeps mac zip artifacts enabled', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const macBlock = yamlBlock(config, 'mac');

    expect(macBlock).toContain('    - dmg');
    expect(macBlock).toContain('    - zip');
  });

  it('does not build Windows zip artifacts', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const winBlock = yamlBlock(config, 'win');

    expect(winBlock).toContain('    - nsis');
    expect(winBlock).not.toContain('    - zip');
  });

  it('does not embed public publisher metadata in the internal desktop package config', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');

    expect(config).not.toMatch(/^publish:\s*$/m);
    expect(config).not.toContain('publishAutoUpdate');
    expect(config).not.toContain('repo: AionUi');
  });

  it('uploads mac zip artifacts without a stale Windows zip glob', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(workflow).toContain('out/AionUi-*-mac-*.zip');
    expect(workflow).not.toContain('out/AionUi-*-win32-*.zip');
  });

  it('retries mac prepackaged builds with both dmg and zip targets', () => {
    const script = readProjectFile('scripts/build-with-builder.js');

    expect(script).toMatch(/--mac\s+dmg\s+zip\s+--\$\{targetArch\}\s+--prepackaged/);
  });

  it('uses the nested local-date log path contract in both startup benchmarks', () => {
    const benchmarkScripts = ['scripts/benchmark-acp-startup.ts', 'scripts/benchmark-startup.ts'];

    for (const benchmarkScript of benchmarkScripts) {
      const source = readProjectFile(benchmarkScript);
      expect(source, `${benchmarkScript} should use the shared nested-date helper`).toContain(
        'buildBenchmarkLogRelativePath'
      );
      expect(source, `${benchmarkScript} should not derive dates in UTC`).not.toContain('toISOString().slice(0, 10)');
    }
  });

  itWithBash('fails release asset preparation when a mac zip is missing', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'aionui-release-assets-'));
    const artifactsDir = resolve(tempDir, 'build-artifacts');
    const outputDir = resolve(tempDir, 'release-assets');

    try {
      const env = { ...process.env, MOCK_VERSION: '1.0.0' };
      const createResult = spawnSync('bash', ['scripts/create-mock-release-artifacts.sh', artifactsDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });
      expect(createResult.status).toBe(0);

      rmSync(resolve(artifactsDir, 'macos-build-arm64', 'AionUi-1.0.0-mac-arm64.zip'), { force: true });

      const prepareResult = spawnSync('bash', ['scripts/prepare-release-assets.sh', artifactsDir, outputDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });

      expect(prepareResult.status).not.toBe(0);
      expect(`${prepareResult.stdout}\n${prepareResult.stderr}`).toContain('Missing macOS zip artifact');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
