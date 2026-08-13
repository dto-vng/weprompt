import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

type AfterPackModule = {
  assertBundledRuntimeIsolation: (resourcesDir: string, platform: string, arch: string) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertBundledRuntimeIsolation } = require('../../../scripts/afterPack.js') as AfterPackModule;

const tempRoots: string[] = [];

function createResources(runtimeKeys: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'weprompt-after-pack-'));
  tempRoots.push(root);
  const bundledRoot = join(root, 'bundled-aioncore');
  mkdirSync(bundledRoot, { recursive: true });
  for (const runtimeKey of runtimeKeys) {
    mkdirSync(join(bundledRoot, runtimeKey), { recursive: true });
  }
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe('afterPack bundled AionCore isolation', () => {
  it('accepts exactly the runtime key for the packaged target', () => {
    const resourcesDir = createResources(['darwin-arm64']);

    expect(assertBundledRuntimeIsolation(resourcesDir, 'darwin', 'arm64')).toBe('darwin-arm64');
  });

  it.each([
    { runtimeKeys: [], platform: 'darwin', arch: 'arm64' },
    { runtimeKeys: ['darwin-x64'], platform: 'darwin', arch: 'arm64' },
    { runtimeKeys: ['darwin-arm64', 'darwin-x64'], platform: 'darwin', arch: 'arm64' },
  ])('rejects runtime entries $runtimeKeys for $platform-$arch', ({ runtimeKeys, platform, arch }) => {
    const resourcesDir = createResources(runtimeKeys);

    expect(() => assertBundledRuntimeIsolation(resourcesDir, platform, arch)).toThrow(
      /exactly one bundled AionCore runtime/i
    );
  });
});
