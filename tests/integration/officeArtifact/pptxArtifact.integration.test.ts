/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  PresentationReadinessService,
  type PresentationReadinessServiceDependencies,
  type PresentationReadinessServiceRequest,
} from '@/process/services/office-artifact/service/PresentationReadinessService';
import {
  inspectPptxOoxml,
  type PptxOoxmlInspectionLimits,
} from '@/process/services/office-artifact/service/pptxOoxmlInspector';
import { inspectPresentationReadiness } from '@/process/services/office-artifact/service/presentationReadinessInspector';

import {
  createOfficeArtifactIntegrationContext,
  createSyntheticPptxBytes,
  resolveOfficeCliPath,
  type OfficeArtifactIntegrationContext,
} from './helpers';

const officeCliPath = resolveOfficeCliPath();
const presentationFixture = resolve('packages/desktop/resources/presentation-templates/business-review.pptx');
const SYNTHETIC_RUN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const ooxmlLimitCases: ReadonlyArray<{
  label: keyof PptxOoxmlInspectionLimits;
  limits: Partial<PptxOoxmlInspectionLimits>;
}> = [
  { label: 'maxZipEntries', limits: { maxZipEntries: 1 } },
  { label: 'maxZipEntryBytes', limits: { maxZipEntryBytes: 1 } },
  { label: 'maxZipExpandedBytes', limits: { maxZipExpandedBytes: 1 } },
  { label: 'maxXmlBytes', limits: { maxXmlBytes: 1 } },
  { label: 'maxXmlNestingDepth', limits: { maxXmlNestingDepth: 1 } },
  { label: 'maxSlides', limits: { maxSlides: 0 } },
  { label: 'maxShapesPerSlide', limits: { maxShapesPerSlide: 0 } },
  { label: 'maxTextCharsPerSlide', limits: { maxTextCharsPerSlide: 1 } },
  { label: 'maxTextCharsTotal', limits: { maxTextCharsTotal: 1 } },
];

function candidateReader(bytes: Buffer): PresentationReadinessServiceRequest['candidate'] {
  return {
    byteLength: bytes.byteLength,
    readAt: async (position, length) => Buffer.from(bytes.subarray(position, position + length)),
  };
}

async function inspectSyntheticReadiness(
  options: {
    limits?: PresentationReadinessServiceDependencies['limits'];
    renderSlide?: PresentationReadinessServiceDependencies['runner']['renderSlide'];
    retentionHash?: string;
    driftRetainedCandidate?: boolean;
    driftInspectionCopy?: boolean;
  } = {}
) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'forge-pptx-readiness-integration-'));
  try {
    const candidate = createSyntheticPptxBytes();
    const candidateSha256 = createHash('sha256').update(candidate).digest('hex');
    const driftedCandidate = Buffer.from(candidate);
    driftedCandidate[0] = driftedCandidate[0]! ^ 0xff;
    let candidateReadCount = 0;
    let workspaceSequence = 0;
    const service = new PresentationReadinessService({
      runner: {
        validate: async (filePath) => {
          if (options.driftInspectionCopy) await writeFile(filePath, driftedCandidate, { mode: 0o600 });
          return {};
        },
        renderSlide:
          options.renderSlide ??
          (async (_filePath, _slideNumber, outputPath) => {
            await writeFile(outputPath, VALID_PNG, { mode: 0o600 });
          }),
      },
      inspectOoxml: (filePath) => inspectPptxOoxml(filePath),
      createInspectionWorkspace: async () => {
        const directory = join(fixtureRoot, `inspection-${workspaceSequence++}`);
        await mkdir(directory, { mode: 0o700 });
        return { directory, dispose: async () => rm(directory, { recursive: true, force: true }) };
      },
      limits: options.limits,
    });
    const proofHash = options.retentionHash ?? candidateSha256;
    return await service.inspect({
      runId: SYNTHETIC_RUN_ID,
      candidate: options.driftRetainedCandidate
        ? {
            byteLength: candidate.byteLength,
            readAt: async (position, length) => {
              candidateReadCount += 1;
              const source = candidateReadCount === 1 ? candidate : driftedCandidate;
              return Buffer.from(source.subarray(position, position + length));
            },
          }
        : candidateReader(candidate),
      expectedCandidate: { sha256: candidateSha256, byteLength: candidate.byteLength },
      retentionProof: {
        stagingBeforeRetain: proofHash,
        retainedTemp: proofHash,
        stagingAfterRetain: proofHash,
      },
      planBytes: Buffer.from(JSON.stringify([{ sourceRefs: [] }])),
      knownSourceRefs: [],
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

describe.skipIf(officeCliPath === undefined)('OfficeArtifactService real PPTX preview integration', () => {
  let context: OfficeArtifactIntegrationContext | undefined;

  afterEach(async () => {
    try {
      await context?.cleanup();
    } finally {
      context = undefined;
    }
  });

  it('renders the saved presentation as soon as its preview starts', async () => {
    if (!officeCliPath) throw new Error('OfficeCLI path was not resolved');
    context = await createOfficeArtifactIntegrationContext(officeCliPath);
    const filePath = join(context.workspace, 'completed.pptx');
    await copyFile(presentationFixture, filePath);

    const prepared = await context.service.preparePreview({ workspace: context.workspace, filePath });
    if (prepared.ok === false) throw new Error(`Preview preparation failed: ${prepared.code}`);
    const started = await context.service.startPreview({ leaseId: prepared.leaseId });
    if (started.ok === false) throw new Error(`Preview start failed: ${started.code}`);

    const response = await fetch(started.url);
    const html = await response.text();

    expect(response.ok).toBe(true);
    expect(html).toContain('Q3 FY26 Business Review');
    expect(html).not.toContain('Waiting for first update');
  }, 60_000);

  it('rejects a malformed presentation without starting a preview server', async () => {
    if (!officeCliPath) throw new Error('OfficeCLI path was not resolved');
    context = await createOfficeArtifactIntegrationContext(officeCliPath);
    const filePath = join(context.workspace, 'malformed.pptx');
    await writeFile(filePath, 'not an Open XML presentation');

    await expect(context.service.preparePreview({ workspace: context.workspace, filePath })).resolves.toEqual({
      ok: false,
      code: 'INVALID_OFFICE_ARTIFACT',
    });
  }, 60_000);
});

describe('managed presentation synthetic PPTX inspection integration', () => {
  it('inspects a deterministic private PPTX package with bounded facts', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'forge-pptx-ooxml-integration-'));
    try {
      const filePath = join(fixtureRoot, 'synthetic.pptx');
      await writeFile(filePath, createSyntheticPptxBytes(), { mode: 0o600 });

      await expect(inspectPptxOoxml(filePath)).resolves.toMatchObject({
        slideCount: 1,
        slides: [
          {
            slideNumber: 1,
            shapeCount: 2,
            text: 'Synthetic review',
            visualAnchorKinds: ['chart'],
          },
        ],
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it.each(ooxmlLimitCases)('rejects the $label OOXML boundary', async ({ limits }) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'forge-pptx-ooxml-limit-'));
    try {
      const filePath = join(fixtureRoot, 'synthetic.pptx');
      await writeFile(filePath, createSyntheticPptxBytes(), { mode: 0o600 });

      await expect(inspectPptxOoxml(filePath, { limits })).rejects.toMatchObject({
        code: 'RESOURCE_LIMIT_EXCEEDED',
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ['candidate bytes', { maxCandidateBytes: createSyntheticPptxBytes().byteLength - 1 }],
    ['per-slide render bytes', { maxRenderBytesPerSlide: VALID_PNG.byteLength - 1 }],
    ['total render bytes', { maxRenderBytesTotal: VALID_PNG.byteLength - 1 }],
  ] as const)('rejects the %s limit before returning readiness', async (_label, limits) => {
    const result = await inspectSyntheticReadiness({ limits });

    expect(result).toMatchObject({
      ok: false,
      blockers: [
        {
          code: limits.maxCandidateBytes === undefined ? 'RENDER_LIMIT_EXCEEDED' : 'OOXML_UNSAFE',
        },
      ],
    });
  });

  it.each([
    ['timeout', Object.assign(new Error('synthetic timeout'), { code: 'ETIMEDOUT' }), 'RENDER_TIMEOUT'],
    ['output limit', Object.assign(new Error('synthetic output limit'), { code: 'EFBIG' }), 'RENDER_LIMIT_EXCEEDED'],
    ['missing output', new Error('synthetic render failure'), 'RENDER_MISSING'],
  ] as const)('maps a bounded %s render failure without readiness', async (_label, error, code) => {
    const result = await inspectSyntheticReadiness({
      renderSlide: async () => {
        throw error;
      },
    });

    expect(result).toEqual({ ok: false, blockers: [{ code, slideNumber: 1 }] });
  });

  it('rejects stale staging-to-retained evidence before validation or render', async () => {
    const result = await inspectSyntheticReadiness({ retentionHash: 'f'.repeat(64) });

    expect(result).toEqual({ ok: false, blockers: [{ code: 'EVIDENCE_STALE', slideNumber: null }] });
  });

  it.each([
    ['retained candidate reader', { driftRetainedCandidate: true }],
    ['private inspection copy', { driftInspectionCopy: true }],
  ] as const)('rejects %s drift before returning exact-hash readiness', async (_label, options) => {
    const result = await inspectSyntheticReadiness(options);

    expect(result).toEqual({ ok: false, blockers: [{ code: 'HASH_MISMATCH', slideNumber: null }] });
  });

  it('rejects the structurally bounded WMS-shaped plan with deterministic blockers', () => {
    const slides = Array.from({ length: 11 }, (_value, index) => ({
      slideNumber: index + 1,
      shapeCount: 2,
      textCharCount: 37,
      textOnlyShapeCount: 2,
      notesTextCharCount: 0,
      text: `Repeated title\\nRepeated body ${index + 1}`,
      visualAnchorKinds: [] as const,
    }));
    const evidence = inspectPresentationReadiness({
      planBytes: Buffer.from(JSON.stringify(slides.map(() => ({ sourceRefs: ['wms-source'] })))),
      knownSourceRefs: ['wms-source'],
      ooxml: {
        zipEntryCount: 32,
        expandedByteLength: 16_384,
        xmlByteLength: 12_288,
        slideCount: slides.length,
        totalTextChars: slides.reduce((total, slide) => total + slide.textCharCount, 0),
        slides,
      },
    });

    expect(evidence.blockers).toEqual([
      { code: 'LITERAL_ESCAPE_TOKEN', slideNumber: 1 },
      ...Array.from({ length: 10 }, (_value, index) => [
        { code: 'CONTENT_VISUAL_ANCHOR_MISSING' as const, slideNumber: index + 2 },
        { code: 'LITERAL_ESCAPE_TOKEN' as const, slideNumber: index + 2 },
        { code: 'REQUIRED_NOTES_MISSING' as const, slideNumber: index + 2 },
      ]).flat(),
    ]);
  });
});
