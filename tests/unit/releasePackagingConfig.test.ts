import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { gte, major } from 'semver';

const projectRoot = resolve(__dirname, '../..');
const itWithBash = spawnSync('bash', ['--version'], { encoding: 'utf8' }).status === 0 ? it : it.skip;

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), 'utf8');
}

function readProjectJson<T>(path: string): T {
  return JSON.parse(readProjectFile(path)) as T;
}

function readSourceTree(directory: string): string {
  return readdirSync(resolve(projectRoot, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = join(directory, entry.name);
      if (entry.isDirectory()) return [readSourceTree(relativePath)];
      return /\.tsx?$/.test(entry.name) ? [readProjectFile(relativePath)] : [];
    })
    .join('\n');
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
  it('keeps packaging and updater code on the fixed compatible builder runtime', () => {
    const rootPackage = readProjectJson<{
      dependencies: Record<string, string>;
      resolutions: Record<string, string>;
    }>('package.json');
    const projectRequire = createRequire(resolve(projectRoot, 'package.json'));
    const electronBuilderPackagePath = projectRequire.resolve('electron-builder/package.json');
    const electronBuilderRequire = createRequire(electronBuilderPackagePath);
    const appBuilderPackagePath = electronBuilderRequire.resolve('app-builder-lib/package.json');
    const appBuilderRequire = createRequire(appBuilderPackagePath);
    const appBuilderRuntime = appBuilderRequire('builder-util-runtime') as {
      deepAssign?: unknown;
    };
    const appBuilderRuntimePackage = appBuilderRequire('builder-util-runtime/package.json') as { version: string };
    const electronUpdaterPackagePath = projectRequire.resolve('electron-updater/package.json');
    const electronUpdaterRequire = createRequire(electronUpdaterPackagePath);
    const electronUpdaterRuntime = electronUpdaterRequire('builder-util-runtime') as {
      CancellationToken?: unknown;
      deepAssign?: unknown;
    };
    const electronUpdaterRuntimePackage = electronUpdaterRequire('builder-util-runtime/package.json') as {
      version: string;
    };

    expect(rootPackage.dependencies['builder-util-runtime']).toBe('9.7.0');
    expect(rootPackage.resolutions['builder-util-runtime']).toBe('9.7.0');
    expect(appBuilderRuntimePackage.version).toBe('9.7.0');
    expect(appBuilderRuntime.deepAssign).toBeTypeOf('function');
    expect(electronUpdaterRuntimePackage.version).toBe('9.7.0');
    expect(electronUpdaterRuntime.CancellationToken).toBeTypeOf('function');
    expect(electronUpdaterRuntime.deepAssign).toBeTypeOf('function');
  });

  it('locks audited dependency families at or above their fixed release floors', () => {
    const lockfile = readProjectFile('bun.lock');
    const rootPackage = readProjectJson<{
      dependencies: Record<string, string>;
      resolutions: Record<string, string>;
    }>('package.json');
    const lockedVersions = (packageName: string): string[] =>
      [...lockfile.matchAll(new RegExp(`\\["${packageName}@([^"]+)"`, 'g'))].map((match) => match[1]);
    const expectFixed = (packageName: string, floors: Record<number, string>) => {
      const versions = lockedVersions(packageName);
      expect(versions.length, `${packageName} must remain represented in bun.lock`).toBeGreaterThan(0);
      for (const version of versions) {
        const floor = floors[major(version)];
        expect(floor, `${packageName}@${version} has no reviewed security floor`).toBeDefined();
        expect(gte(version, floor), `${packageName}@${version} is below ${floor}`).toBe(true);
      }
    };

    expect(rootPackage.dependencies.sharp).toBe('^0.35.3');
    expect(rootPackage.dependencies['react-router-dom']).toBe('^7.18.2');
    expect(rootPackage.resolutions).toMatchObject({
      'builder-util-runtime': '9.7.0',
      postcss: '^8.5.25',
      tar: '^7.5.22',
    });
    expectFixed('brace-expansion', { 1: '1.1.17', 2: '2.1.3', 5: '5.0.8' });
    expectFixed('builder-util-runtime', { 9: '9.7.0' });
    expectFixed('js-yaml', { 3: '3.15.0', 4: '4.3.0' });
    expectFixed('postcss', { 8: '8.5.18' });
    expectFixed('react-router', { 7: '7.18.2' });
    expectFixed('react-router-dom', { 7: '7.18.2' });
    expectFixed('sharp', { 0: '0.35.0' });
    expectFixed('tar', { 7: '7.5.21' });
  });

  it('uses declarative renderer routing without unstable React Server Component APIs', () => {
    const rootPackage = readProjectJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>('package.json');
    const router = readProjectFile('packages/desktop/src/renderer/components/layout/Router.tsx');
    const desktopSource = readSourceTree('packages/desktop/src');
    const packageNames = [...Object.keys(rootPackage.dependencies), ...Object.keys(rootPackage.devDependencies)];

    expect(router).toContain('<HashRouter>');
    expect(packageNames.some((name) => /^@react-router\/(dev|node|cloudflare|express|serve)$/.test(name))).toBe(false);
    for (const rscApi of [
      'unstable_RSCHydratedRouter',
      'unstable_RSCStaticRouter',
      'unstable_createCallServer',
      'unstable_getRSCStream',
      'unstable_matchRSCServerRequest',
      'unstable_routeRSCServerRequest',
    ]) {
      expect(desktopSource).not.toContain(rscApi);
    }
  });

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

  it('uploads WePrompt mac zip artifacts and fails when release artifacts are missing', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(workflow).toContain('out/WePrompt-*-win-*.exe');
    expect(workflow).toContain('out/WePrompt-*-mac-*.dmg');
    expect(workflow).toContain('out/WePrompt-*-linux-*.deb');
    expect(workflow).toContain('out/WePrompt-*-mac-*.zip');
    expect(workflow).not.toContain('out/AionUi-*-mac-*.zip');
    expect(workflow).not.toContain('out/AionUi-*-win32-*.zip');
    expect(workflow).toContain('if-no-files-found: error');
    expect(workflow).toMatch(
      /- name: Verify expected WePrompt artifacts[\s\S]*?WePrompt-\$\{VERSION\}-win-\$\{\{ matrix\.arch \}\}\.exe[\s\S]*?WePrompt-\$\{VERSION\}-mac-\$\{\{ matrix\.arch \}\}\.dmg[\s\S]*?WePrompt-\$\{VERSION\}-mac-\$\{\{ matrix\.arch \}\}\.zip[\s\S]*?WePrompt-\$\{VERSION\}-linux-\$\{\{ matrix\.arch \}\}\.deb/
    );
    expect(workflow).toContain('::error title=Missing build artifact');
  });

  it('keeps the reusable internal build path free of updater and Sentry configuration', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const manualWorkflow = readProjectFile('.github/workflows/build-manual.yml');

    expect(workflow).toMatch(/internal_release:\s*\n[\s\S]*?type:\s*boolean/);
    expect(workflow).toContain("WEPROMPT_INTERNAL_RELEASE: ${{ inputs.internal_release && '1' || '0' }}");
    expect(manualWorkflow).toContain('internal_release: true');
    expect(workflow).toMatch(/- name: Resolve Sentry release name\s*\n\s+if: \$\{\{ !inputs\.internal_release \}\}/);
    expect(workflow).toMatch(
      /- name: Configure Sentry source map upload owner\s*\n\s+if: \$\{\{ !inputs\.internal_release \}\}/
    );
    expect(workflow).toMatch(
      /- name: Validate Sentry source map upload configuration\s*\n\s+if: \$\{\{ !inputs\.internal_release && matrix\.platform == 'linux-x64' \}\}/
    );
    expect(workflow).toMatch(
      /- name: Setup macOS code signing \(macOS only\)\s*\n\s+if: \$\{\{ startsWith\(matrix\.platform, 'macos'\) && !inputs\.internal_release \}\}/
    );

    const windowsBuildBlock = workflow.match(
      /- name: Build with electron-builder \(Windows\)([\s\S]*?)(?=\n\s*- name:|\n\s*# Clean up stale disk images)/
    )?.[1];
    const macBuildBlock = workflow.match(
      /- name: Build with electron-builder \(macOS\)([\s\S]*?)(?=\n\s*- name:|\n\s*# Linux)/
    )?.[1];

    expect(windowsBuildBlock).toBeTruthy();
    expect(macBuildBlock).toBeTruthy();
    for (const name of [
      'WEPROMPT_UPDATE_BASE_URL',
      'SENTRY_DSN',
      'SENTRY_AUTH_TOKEN',
      'SENTRY_UPLOAD_SOURCE_MAPS',
      'SENTRY_ORG',
      'SENTRY_PROJECT',
      'SENTRY_RELEASE',
      'CSC_LINK',
      'CSC_KEY_PASSWORD',
      'WIN_CSC_LINK',
      'WIN_CSC_KEY_PASSWORD',
      'BUILD_CERTIFICATE_BASE64',
      'P12_PASSWORD',
      'KEYCHAIN_PASSWORD',
      'APPLE_ID',
      'APPLE_ID_PASSWORD',
      'TEAM_ID',
      'IDENTITY',
      'appleId',
      'appleIdPassword',
      'teamId',
      'identity',
    ]) {
      expect(workflow).toMatch(new RegExp(`Validate internal release environment[\\s\\S]*?${name}`));
    }

    for (const name of ['appleId', 'appleIdPassword', 'teamId', 'identity', 'CSC_NAME']) {
      expect(windowsBuildBlock).not.toContain(`${name}:`);
      expect(macBuildBlock).toContain(`${name}: \${{ !inputs.internal_release && secrets.`);
    }
    expect(macBuildBlock).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'");

    expect(windowsBuildBlock).toContain('$BuildExitCode');
    expect(windowsBuildBlock).toContain('$LASTEXITCODE');
    expect(windowsBuildBlock).toContain('"result=failure"');
    expect(windowsBuildBlock).toContain('exit $BuildExitCode');
    expect(windowsBuildBlock).not.toContain('will not block the workflow');
    expect(macBuildBlock).toContain('out/WePrompt-${VERSION}-mac-${{ matrix.arch }}.dmg');
  });

  it('uses current WePrompt names in platform smoke checks while retaining the Forge install-directory fallback', () => {
    const workflow = readProjectFile('.github/workflows/pr-checks.yml');

    expect(workflow).toContain('WePrompt-*-win-*.exe');
    expect(workflow).toContain('Programs\\Forge\\WePrompt.exe');
    expect(workflow).toContain('Contents/MacOS/WePrompt');
    expect(workflow).not.toContain('Forge-*-win-*.exe');
    expect(workflow).not.toContain('Contents/MacOS/Forge');
  });

  it('keeps desktop release assets on WePrompt names without renaming web-cli artifacts', () => {
    const prepareScript = readProjectFile('scripts/prepare-release-assets.sh');
    const verifyScript = readProjectFile('scripts/verify-release-assets.sh');
    const mockScript = readProjectFile('scripts/create-mock-release-artifacts.sh');
    const ubuntuInstaller = readProjectFile('scripts/install-ubuntu.sh');

    expect(prepareScript).toContain('WePrompt-${VERSION}-mac-${arch}.${ext}');
    expect(verifyScript).toContain('WePrompt-${VERSION}-win-x64.exe');
    expect(verifyScript).toContain('WePrompt-${VERSION}-mac-x64.zip');
    expect(verifyScript).toContain('WePrompt-${VERSION}-mac-arm64.zip');
    expect(mockScript).toContain('WePrompt-1.0.0-linux-x64.deb');
    expect(mockScript).toContain('WePrompt-1.0.0-linux-arm64.deb');
    expect(ubuntuInstaller).toContain('DEB_FILENAME="WePrompt-${VERSION}-linux-${DEB_ARCH}.deb"');

    for (const source of [prepareScript, verifyScript, mockScript]) {
      expect(source).not.toMatch(/AionUi-(?:1\.0\.0|\$\{VERSION\})/);
    }
    for (const source of [prepareScript, verifyScript, mockScript]) {
      expect(source).toContain('aionui-web-');
      expect(source).not.toContain('weprompt-web-');
    }
  });

  it('discovers only the current WePrompt executable while retaining legacy cleanup names', () => {
    const launchHarness = readProjectFile('scripts/packaged-launch.mjs');
    const e2eFixtures = readProjectFile('tests/e2e/fixtures.ts');

    for (const source of [launchHarness, e2eFixtures]) {
      expect(source).toContain("'WePrompt.exe'");
      expect(source).toContain("'Contents', 'MacOS', 'WePrompt'");
      expect(source).not.toMatch(/path\.join\([^\n]*'AionUi\.exe'/);
      expect(source).not.toMatch(/path\.join\([^\n]*'MacOS', 'AionUi'/);
    }

    expect(launchHarness).toContain("killProcessByName('Forge.exe')");
    expect(launchHarness).toContain("killProcessByName('AionUi.exe')");
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

  for (const arch of ['x64', 'arm64']) {
    itWithBash(`fails release asset preparation when the ${arch} mac zip is missing`, () => {
      const tempDir = mkdtempSync(resolve(tmpdir(), 'weprompt-release-assets-'));
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

        rmSync(resolve(artifactsDir, `macos-build-${arch}`, `WePrompt-1.0.0-mac-${arch}.zip`), { force: true });

        const prepareResult = spawnSync('bash', ['scripts/prepare-release-assets.sh', artifactsDir, outputDir], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
        });

        expect(prepareResult.status).not.toBe(0);
        expect(`${prepareResult.stdout}\n${prepareResult.stderr}`).toContain(
          `Missing macOS zip artifact: WePrompt-1.0.0-mac-${arch}.zip`
        );
      } finally {
        rmSync(tempDir, { force: true, recursive: true });
      }
    });
  }

  itWithBash('prepares and verifies the complete WePrompt release fixture', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'weprompt-release-assets-'));
    const artifactsDir = resolve(tempDir, 'build-artifacts');
    const outputDir = resolve(tempDir, 'release-assets');

    try {
      const env = { ...process.env, MOCK_VERSION: '1.0.0' };
      const createResult = spawnSync('bash', ['scripts/create-mock-release-artifacts.sh', artifactsDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });
      const prepareResult = spawnSync('bash', ['scripts/prepare-release-assets.sh', artifactsDir, outputDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });
      const verifyResult = spawnSync('bash', ['scripts/verify-release-assets.sh', outputDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });

      expect(createResult.status).toBe(0);
      expect(prepareResult.status).toBe(0);
      expect(verifyResult.status).toBe(0);
      expect(verifyResult.stdout).toContain('ALL CHECKS PASSED');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
