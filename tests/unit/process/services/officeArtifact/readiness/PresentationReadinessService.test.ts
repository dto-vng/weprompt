/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { access, link, mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PresentationReadinessService,
  type PresentationReadinessServiceDependencies,
  type PresentationReadinessServiceRequest,
} from '@/process/services/office-artifact/service/PresentationReadinessService';
import type { PptxOoxmlInspection } from '@/process/services/office-artifact/service/pptxOoxmlInspector';

const RUN_ID = '434393ce-dd45-44fe-a51c-262b2b181cc5';
const CANDIDATE = Buffer.from('stable retained presentation bytes');
const CANDIDATE_SHA256 = createHash('sha256').update(CANDIDATE).digest('hex');
const PNG_PREFIX = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ooxmlInspection = (): PptxOoxmlInspection => ({
  zipEntryCount: 12,
  expandedByteLength: 4_096,
  xmlByteLength: 3_072,
  slideCount: 3,
  totalTextChars: 46,
  slides: [
    {
      slideNumber: 1,
      shapeCount: 1,
      textCharCount: 16,
      textOnlyShapeCount: 1,
      notesTextCharCount: 0,
      text: 'Quarterly review',
      visualAnchorKinds: [],
    },
    {
      slideNumber: 2,
      shapeCount: 3,
      textCharCount: 21,
      textOnlyShapeCount: 2,
      notesTextCharCount: 18,
      text: 'Revenue versus plan',
      visualAnchorKinds: ['chart'],
    },
    {
      slideNumber: 3,
      shapeCount: 1,
      textCharCount: 9,
      textOnlyShapeCount: 1,
      notesTextCharCount: 0,
      text: 'Thank you',
      visualAnchorKinds: [],
    },
  ],
});

const planBytes = Buffer.from(
  JSON.stringify([{ sourceRefs: [] }, { sourceRefs: ['source-a'] }, { sourceRefs: [] }]),
  'utf8'
);

const reader = (bytes = CANDIDATE) => ({
  byteLength: bytes.byteLength,
  readAt: async (position: number, length: number): Promise<Buffer> =>
    Buffer.from(bytes.subarray(position, position + length)),
});

describe('PresentationReadinessService', () => {
  let fixtureRoot: string;
  let workspaceSequence: number;
  let runner: PresentationReadinessServiceDependencies['runner'];
  let inspectOoxml: PresentationReadinessServiceDependencies['inspectOoxml'];
  let createInspectionWorkspace: PresentationReadinessServiceDependencies['createInspectionWorkspace'];
  let request: PresentationReadinessServiceRequest;

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(path.join(tmpdir(), 'presentation-readiness-service-'));
    workspaceSequence = 0;
    runner = {
      validate: vi.fn(async () => ({})),
      renderSlide: vi.fn(async (_file, page, outputPath) => {
        await writeFile(outputPath, Buffer.concat([PNG_PREFIX, Buffer.from(`slide-${page}`)]), { mode: 0o600 });
      }),
    };
    inspectOoxml = vi.fn(async () => ooxmlInspection());
    createInspectionWorkspace = vi.fn(async () => {
      const directory = path.join(fixtureRoot, `inspection-${workspaceSequence++}`);
      await mkdir(directory, { mode: 0o700 });
      return {
        directory,
        dispose: async () => rm(directory, { recursive: true, force: true }),
      };
    });
    request = {
      runId: RUN_ID,
      candidate: reader(),
      expectedCandidate: { sha256: CANDIDATE_SHA256, byteLength: CANDIDATE.byteLength },
      retentionProof: {
        stagingBeforeRetain: CANDIDATE_SHA256,
        retainedTemp: CANDIDATE_SHA256,
        stagingAfterRetain: CANDIDATE_SHA256,
      },
      planBytes,
      knownSourceRefs: ['source-a'],
    };
  });

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const createService = (
    overrides: Partial<PresentationReadinessServiceDependencies> = {}
  ): PresentationReadinessService =>
    new PresentationReadinessService({ runner, inspectOoxml, createInspectionWorkspace, ...overrides });

  it('returns deeply frozen path-free exact-hash evidence and removes its private inspection workspace', async () => {
    const result = await createService().inspect(request);
    if (!result.ok) throw new Error('readiness inspection unexpectedly failed');

    expect(result.evidence).toMatchObject({
      version: 1,
      candidate: { sha256: CANDIDATE_SHA256, byteLength: CANDIDATE.byteLength },
      structure: { officeCliValidated: true },
      ooxml: { slideCount: 3 },
      policy: { blockers: [] },
      hashChain: {
        stagingBeforeRetain: CANDIDATE_SHA256,
        retainedTemp: CANDIDATE_SHA256,
        stagingAfterRetain: CANDIDATE_SHA256,
        manifestRetained: CANDIDATE_SHA256,
        inspectionCopy: CANDIDATE_SHA256,
        retainedAfterStructuralValidation: CANDIDATE_SHA256,
        retainedAfterOoxmlInspection: CANDIDATE_SHA256,
        retainedAfterEachSlideRender: [CANDIDATE_SHA256, CANDIDATE_SHA256, CANDIDATE_SHA256],
      },
    });
    expect(result.evidence.renders.map(({ slideNumber }) => slideNumber)).toEqual([1, 2, 3]);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(Object.isFrozen(result.evidence.hashChain.retainedAfterEachSlideRender)).toBe(true);
    expect(Object.isFrozen(result.evidence.policy.slides[0])).toBe(true);
    expect(JSON.stringify(result)).not.toContain(fixtureRoot);
    const workspace = await createInspectionWorkspace.mock.results[0]!.value;
    await expect(access(workspace.directory)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('creates a private 0600 inspection copy before validation and rendering', async () => {
    runner.validate = vi.fn(async (filePath) => {
      expect((await stat(path.dirname(filePath))).mode & 0o077).toBe(0);
      expect((await stat(filePath)).mode & 0o077).toBe(0);
      await expect(readFile(filePath)).resolves.toEqual(CANDIDATE);
      return {};
    });

    await expect(createService().inspect(request)).resolves.toMatchObject({ ok: true });
  });

  it('rejects same-byte replacement and hardlink drift of the inspection path', async () => {
    runner.validate = vi.fn(async (filePath) => {
      await unlink(filePath);
      await writeFile(filePath, CANDIDATE, { mode: 0o600 });
      return {};
    });
    await expect(createService().inspect(request)).resolves.toEqual({
      ok: false,
      blockers: [{ code: 'HASH_MISMATCH', slideNumber: null }],
    });

    runner.validate = vi.fn(async (filePath) => {
      await link(filePath, path.join(path.dirname(filePath), 'candidate-alias.pptx'));
      return {};
    });
    await expect(createService().inspect(request)).resolves.toEqual({
      ok: false,
      blockers: [{ code: 'HASH_MISMATCH', slideNumber: null }],
    });
  });

  it('rejects stale or missing retention evidence before allocating inspection resources', async () => {
    await expect(
      createService().inspect({
        ...request,
        retentionProof: { ...request.retentionProof, retainedTemp: 'b'.repeat(64) },
      })
    ).resolves.toEqual({ ok: false, blockers: [{ code: 'EVIDENCE_STALE', slideNumber: null }] });
    expect(createInspectionWorkspace).not.toHaveBeenCalled();

    await expect(
      createService().inspect({
        ...request,
        retentionProof: { ...request.retentionProof, stagingBeforeRetain: '' },
      })
    ).resolves.toEqual({ ok: false, blockers: [{ code: 'EVIDENCE_MISSING', slideNumber: null }] });
    expect(createInspectionWorkspace).not.toHaveBeenCalled();
  });

  it('fails closed when retained bytes or the inspection copy change between phases', async () => {
    let readPass = 0;
    const mutatingReader = {
      byteLength: CANDIDATE.byteLength,
      readAt: async (position: number, length: number): Promise<Buffer> => {
        readPass += 1;
        const source = readPass === 1 ? CANDIDATE : Buffer.from(CANDIDATE.map((byte) => byte ^ 1));
        return Buffer.from(source.subarray(position, position + length));
      },
    };

    await expect(createService().inspect({ ...request, candidate: mutatingReader })).resolves.toEqual({
      ok: false,
      blockers: [{ code: 'HASH_MISMATCH', slideNumber: null }],
    });
    expect(runner.renderSlide).not.toHaveBeenCalled();

    runner.validate = vi.fn(async (filePath) => {
      await writeFile(filePath, Buffer.from(CANDIDATE.map((byte) => byte ^ 1)));
      return {};
    });
    await expect(createService().inspect(request)).resolves.toEqual({
      ok: false,
      blockers: [{ code: 'HASH_MISMATCH', slideNumber: null }],
    });
  });

  it.each([
    ['immediately after the inspection copy', 2, 0],
    ['after structural validation', 3, 0],
    ['after OOXML inspection', 4, 0],
    ['after slide 1 render', 5, 1],
    ['after slide 2 render', 6, 2],
    ['after slide 3 render', 7, 3],
  ])('rejects retained-candidate mutation %s', async (_phase, mutationRead, expectedRenderCalls) => {
    let readPass = 0;
    const mutatingReader = {
      byteLength: CANDIDATE.byteLength,
      readAt: async (position: number, length: number): Promise<Buffer> => {
        readPass += 1;
        const source = readPass === mutationRead ? Buffer.from(CANDIDATE.map((byte) => byte ^ 1)) : CANDIDATE;
        return Buffer.from(source.subarray(position, position + length));
      },
    };

    await expect(createService().inspect({ ...request, candidate: mutatingReader })).resolves.toEqual({
      ok: false,
      blockers: [{ code: 'HASH_MISMATCH', slideNumber: null }],
    });
    expect(runner.renderSlide).toHaveBeenCalledTimes(expectedRenderCalls);
  });

  it('rejects a missing, oversized, or timed-out render with a typed blocker', async () => {
    runner.renderSlide = vi.fn(async () => undefined);
    await expect(createService().inspect(request)).resolves.toEqual({
      ok: false,
      blockers: [{ code: 'RENDER_MISSING', slideNumber: 1 }],
    });

    runner.renderSlide = vi.fn(async (_file, _page, outputPath) => {
      await writeFile(outputPath, Buffer.concat([PNG_PREFIX, Buffer.alloc(5)]));
    });
    await expect(
      createService({ limits: { maxRenderBytesPerSlide: PNG_PREFIX.byteLength + 4 } }).inspect(request)
    ).resolves.toEqual({
      ok: false,
      blockers: [{ code: 'RENDER_LIMIT_EXCEEDED', slideNumber: 1 }],
    });

    runner.renderSlide = vi.fn(async () => {
      throw Object.assign(new Error('render timed out'), { code: 'ETIMEDOUT' });
    });
    await expect(createService().inspect(request)).resolves.toEqual({
      ok: false,
      blockers: [{ code: 'RENDER_TIMEOUT', slideNumber: 1 }],
    });
  });

  it('rejects the slide that exceeds the total render-byte limit', async () => {
    const oneRenderBytes = PNG_PREFIX.byteLength + Buffer.byteLength('slide-1');

    await expect(createService({ limits: { maxRenderBytesTotal: oneRenderBytes } }).inspect(request)).resolves.toEqual({
      ok: false,
      blockers: [{ code: 'RENDER_LIMIT_EXCEEDED', slideNumber: 2 }],
    });
    expect(runner.renderSlide).toHaveBeenCalledTimes(2);
  });

  it('rechecks every render before returning and rejects stale render evidence', async () => {
    let firstRenderPath = '';
    runner.renderSlide = vi.fn(async (_file, page, outputPath) => {
      if (page === 1) firstRenderPath = outputPath;
      if (page === 2) await writeFile(firstRenderPath, Buffer.concat([PNG_PREFIX, Buffer.from('changed')]));
      await writeFile(outputPath, Buffer.concat([PNG_PREFIX, Buffer.from(`slide-${page}`)]));
    });

    await expect(createService().inspect(request)).resolves.toEqual({
      ok: false,
      blockers: [{ code: 'HASH_MISMATCH', slideNumber: 1 }],
    });
  });

  it('serializes rendering across concurrent service instances', async () => {
    let active = 0;
    let maximumActive = 0;
    runner.renderSlide = vi.fn(async (_file, page, outputPath) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeFile(outputPath, Buffer.concat([PNG_PREFIX, Buffer.from(`slide-${page}`)]));
      active -= 1;
    });

    const [first, second] = await Promise.all([createService().inspect(request), createService().inspect(request)]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(maximumActive).toBe(1);
  });
});
