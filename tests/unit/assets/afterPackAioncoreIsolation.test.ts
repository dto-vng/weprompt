import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

type AfterPackModule = {
  assertBundledRuntimeIsolation: (resourcesDir: string, platform: string, arch: string) => string;
  verifyPresentationTemplateResources: (resourcesDir: string) => string[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertBundledRuntimeIsolation, verifyPresentationTemplateResources } =
  require('../../../scripts/afterPack.js') as AfterPackModule;

const PRESENTATION_TEMPLATE_INVENTORY = [
  { id: 'editorial-field-report', format: 'html', packagedReferenceFile: null },
  { id: 'simple-light', format: 'html', packagedReferenceFile: null },
  { id: 'simple-dark', format: 'html', packagedReferenceFile: null },
  { id: 'market-trends-report', format: 'html', packagedReferenceFile: null },
  { id: 'business-review', format: 'pptx', packagedReferenceFile: 'business-review.pptx' },
  { id: 'project-kickoff', format: 'pptx', packagedReferenceFile: 'project-kickoff.pptx' },
  { id: 'monthly-steerco', format: 'pptx', packagedReferenceFile: 'monthly-steerco.pptx' },
  { id: 'connected-ops', format: 'pptx', packagedReferenceFile: 'connected-ops.pptx' },
  { id: 'business-report', format: 'docx', packagedReferenceFile: 'business-report.docx' },
  { id: 'decision-memo', format: 'docx', packagedReferenceFile: 'decision-memo.docx' },
  { id: 'operations-guide', format: 'docx', packagedReferenceFile: 'operations-guide.docx' },
  { id: 'proposal-sow', format: 'docx', packagedReferenceFile: 'proposal-sow.docx' },
];

const EXPECTED_PRESENTATION_TEMPLATE_FILES = PRESENTATION_TEMPLATE_INVENTORY.flatMap((entry) =>
  entry.packagedReferenceFile ? [entry.packagedReferenceFile] : []
);

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

function createPackagedPresentationTemplates(): string {
  const resourcesDir = mkdtempSync(join(tmpdir(), 'weprompt-after-pack-templates-'));
  tempRoots.push(resourcesDir);
  const templatesDir = join(resourcesDir, 'presentation-templates');
  mkdirSync(templatesDir);
  writeFileSync(join(templatesDir, 'manifest.json'), `${JSON.stringify(PRESENTATION_TEMPLATE_INVENTORY, null, 2)}\n`);
  for (const fileName of EXPECTED_PRESENTATION_TEMPLATE_FILES) {
    writeFileSync(join(templatesDir, fileName), fileName);
  }
  return resourcesDir;
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

describe('afterPack presentation template verification', () => {
  it('checks the exact inventory under the packaged resources directory', () => {
    const resourcesDir = createPackagedPresentationTemplates();

    expect(verifyPresentationTemplateResources(resourcesDir)).toEqual(EXPECTED_PRESENTATION_TEMPLATE_FILES);
  });

  it('fails closed when a declared reference is absent', () => {
    const resourcesDir = createPackagedPresentationTemplates();
    const missingFile = EXPECTED_PRESENTATION_TEMPLATE_FILES[0];
    rmSync(join(resourcesDir, 'presentation-templates', missingFile));

    expect(() => verifyPresentationTemplateResources(resourcesDir)).toThrow(
      new RegExp(`missing.*${missingFile.replace('.', '\\.')}`, 'i')
    );
  });

  it('fails closed when the packaged manifest and file both omit a required template', () => {
    const resourcesDir = createPackagedPresentationTemplates();
    const templatesDir = join(resourcesDir, 'presentation-templates');
    const omittedEntry = PRESENTATION_TEMPLATE_INVENTORY.find((entry) => entry.id === 'business-review');
    const truncatedInventory = PRESENTATION_TEMPLATE_INVENTORY.filter((entry) => entry !== omittedEntry);
    writeFileSync(join(templatesDir, 'manifest.json'), `${JSON.stringify(truncatedInventory, null, 2)}\n`);
    rmSync(join(templatesDir, omittedEntry!.packagedReferenceFile!));

    expect(() => verifyPresentationTemplateResources(resourcesDir)).toThrow(/exact required inventory/i);
  });
});
