/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { accessSync, constants, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

import type { OfficeArtifactMutationResult } from '@/common/types/office/artifactEditor';
import type { PresentationSourceRef, StartPresentationRunRequest } from '@/common/types/office/presentationRun';
import { OfficeArtifactService } from '@/process/services/office-artifact/service/OfficeArtifactService';
import { PresentationReadinessService } from '@/process/services/office-artifact/service/PresentationReadinessService';
import { inspectPptxOoxml } from '@/process/services/office-artifact/service/pptxOoxmlInspector';
import { hashOfficeArtifact, resolveOfficeArtifactPath } from '@/process/services/office-artifact/officeArtifactPath';
import { OfficeArtifactSnapshotStore } from '@/process/services/office-artifact/officeArtifactSnapshots';
import { OfficeArtifactWorkingFiles } from '@/process/services/office-artifact/officeArtifactWorkingFiles';
import { createOfficeCliRunner, type OfficeCliRunner } from '@/process/services/office-artifact/officeCliRunner';
import type {
  PresentationTemplateService,
  ResolvedPresentationTemplate,
} from '@/process/services/presentation-template/PresentationTemplateService';
import {
  PresentationRunLifecycleCoordinator,
  PresentationRunService,
  PresentationSourceGrantService,
  type PresentationRunAuthorityResolution,
  type PresentationSourceExtractionInput,
} from '@/process/services/presentation-template/run/service';
import {
  type PreparedPresentationSourceSnapshot,
  type PreparedRetainedCandidate,
  type PresentationRunDurableBoundary,
  type PresentationRunFileDurableBoundary,
  PresentationRunFiles,
  PresentationRunJournal,
  PresentationRunSimulatedProcessCrashError,
  PresentationRunStore,
} from '@/process/services/presentation-template/run/storage';

export type OfficeArtifactIntegrationContext = {
  workspace: string;
  service: OfficeArtifactService;
  runner: OfficeCliRunner;
  cleanup: () => Promise<void>;
};

export type OfficeCliRun = {
  text: string;
  format: Record<string, unknown>;
};

export type OfficeCliParagraph = {
  path: string;
  text: string;
  runs: OfficeCliRun[];
};

export type OfficeCliCell = {
  path: string;
  displayText: string;
  input: string;
};

type MutationSuccess = Extract<OfficeArtifactMutationResult, { ok: true }>;

type SyntheticZipEntry = {
  name: string;
  bytes: Buffer;
};

export type ManagedPresentationIntegrationOptions = {
  featureEnabled?: boolean;
  runtime?: 'aionrs' | 'acp';
  scope?: 'individual' | 'team' | 'unavailable';
  freeDiskBytes?: number;
  postInitialMessage?: () => Promise<unknown>;
  observeRuntime?: () => Promise<unknown>;
};

export type ManagedPresentationRestartContext = {
  store: PresentationRunStore;
  runs: PresentationRunService;
};

export type ManagedPresentationIntegrationContext = {
  root: string;
  principalId: string;
  conversationId: string;
  holderId: string;
  turnId: string;
  backendCredentials: { port: number; token: string };
  files: PresentationRunFiles;
  store: PresentationRunStore;
  grants: PresentationSourceGrantService;
  runs: PresentationRunService;
  lifecycle: PresentationRunLifecycleCoordinator;
  backendPosts: Array<{
    conversationId: string;
    content: string;
    files: [string, string];
    injectSkills: ['officecli'];
  }>;
  validationPaths: string[];
  inspectionPaths: string[];
  renderedSlides: number[];
  terminalAuthority: {
    signal: AbortSignal;
    deadlineAt: number;
    isCurrent: () => boolean;
  };
  now: () => Date;
  setNow: (value: Date) => void;
  setFeatureEnabled: (enabled: boolean) => void;
  setNativeSourcePaths: (paths: readonly string[] | null) => void;
  workspacePath: (relativePath: string) => string;
  startRequest: (sources?: readonly PresentationSourceRef[]) => StartPresentationRunRequest;
  restart: () => Promise<ManagedPresentationRestartContext>;
  cleanup: () => Promise<void>;
};

const SYNTHETIC_CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const SYNTHETIC_REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const SYNTHETIC_HOLDER_ID = '33333333-3333-4333-8333-333333333333';
const SYNTHETIC_TURN_ID = '44444444-4444-4444-8444-444444444444';
const SYNTHETIC_MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const SYNTHETIC_FAULT_RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SYNTHETIC_FAULT_GRANT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const SYNTHETIC_NOW = '2026-08-06T00:00:00.000Z';
const SYNTHETIC_TEMPLATE_ID = 'synthetic-review';
const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const CHART_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPE_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const SYNTHETIC_VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createSyntheticZip(entries: readonly SyntheticZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.bytes);
    const checksum = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100600 << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function syntheticXml(value: string): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${value}`);
}

/** Build a minimal, deterministic one-slide PPTX with a text shape and chart anchor. */
export function createSyntheticPptxBytes(): Buffer {
  const relationships = (value: string): Buffer =>
    syntheticXml(`<Relationships xmlns="${PACKAGE_REL_NS}">${value}</Relationships>`);
  return createSyntheticZip([
    {
      name: '[Content_Types].xml',
      bytes: syntheticXml(
        `<Types xmlns="${CONTENT_TYPE_NS}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`
      ),
    },
    {
      name: '_rels/.rels',
      bytes: relationships(
        `<Relationship Id="rIdPresentation" Type="${OFFICE_REL_NS}/officeDocument" Target="ppt/presentation.xml"/>`
      ),
    },
    {
      name: 'ppt/presentation.xml',
      bytes: syntheticXml(
        `<p:presentation xmlns:p="${PRESENTATION_NS}" xmlns:r="${OFFICE_REL_NS}"><p:sldIdLst><p:sldId id="256" r:id="rIdSlide1"/></p:sldIdLst></p:presentation>`
      ),
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      bytes: relationships(
        `<Relationship Id="rIdSlide1" Type="${OFFICE_REL_NS}/slide" Target="/ppt/slides/slide1.xml"/>`
      ),
    },
    {
      name: 'ppt/slides/slide1.xml',
      bytes: syntheticXml(
        `<p:sld xmlns:p="${PRESENTATION_NS}" xmlns:a="${DRAWING_NS}" xmlns:r="${OFFICE_REL_NS}" xmlns:c="${CHART_NS}"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Synthetic review</a:t></a:r></a:p></p:txBody></p:sp><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Chart"/></p:nvGraphicFramePr><a:graphic><a:graphicData uri="${CHART_NS}"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`
      ),
    },
    {
      name: 'ppt/slides/_rels/slide1.xml.rels',
      bytes: relationships(
        `<Relationship Id="rIdChart" Type="${OFFICE_REL_NS}/chart" Target="/ppt/charts/chart1.xml"/>`
      ),
    },
    {
      name: 'ppt/charts/chart1.xml',
      bytes: syntheticXml(`<c:chartSpace xmlns:c="${CHART_NS}"/>`),
    },
  ]);
}

/** Build strict synthetic bytes accepted by each managed source snapshot boundary. */
export function createSyntheticPresentationSourceBytes(format: PresentationSourceExtractionInput['format']): Buffer {
  if (format === 'pdf') return Buffer.from('%PDF-1.7\n% synthetic integration fixture\n%%EOF\n');
  if (format === 'txt' || format === 'md' || format === 'csv') {
    return Buffer.from(`synthetic ${format} source\n`, 'utf8');
  }
  if (format === 'pptx') return createSyntheticPptxBytes();
  const mainPart = format === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  return createSyntheticZip([
    {
      name: '[Content_Types].xml',
      bytes: syntheticXml(`<Types xmlns="${CONTENT_TYPE_NS}"/>`),
    },
    {
      name: mainPart,
      bytes: syntheticXml(format === 'docx' ? '<document><body/></document>' : '<workbook/>'),
    },
  ]);
}

type SyntheticCrashRecoveryResult = {
  injected: boolean;
  recovered: boolean;
};

const SOURCE_PROMOTION_BOUNDARIES = new Set<PresentationRunFileDurableBoundary>([
  'before-grant-promotion-rename',
  'after-grant-promotion-rename',
  'before-grant-promotion-directory-fsync',
  'after-grant-promotion-directory-fsync',
]);
const CANDIDATE_PROMOTION_BOUNDARIES = new Set<PresentationRunFileDurableBoundary>([
  'before-candidate-promotion-rename',
  'after-candidate-promotion-rename',
  'before-candidate-promotion-directory-fsync',
  'after-candidate-promotion-directory-fsync',
]);

async function createSyntheticFaultRoots(prefix: string): Promise<{
  root: string;
  userDataDir: string;
  systemTempDir: string;
}> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const userDataDir = join(root, 'user-data');
  const systemTempDir = join(root, 'system-temp');
  await Promise.all([mkdir(userDataDir, { mode: 0o700 }), mkdir(systemTempDir, { mode: 0o700 })]);
  return { root, userDataDir, systemTempDir };
}

/** Exercise and restart every write-ahead journal or derived-index durable boundary. */
export async function verifySyntheticJournalCrashRecovery(
  boundary: PresentationRunDurableBoundary
): Promise<SyntheticCrashRecoveryResult> {
  const roots = await createSyntheticFaultRoots('forge-presentation-journal-crash-');
  let armed = false;
  let injected = false;
  try {
    const files = new PresentationRunFiles({ userDataDir: roots.userDataDir, tempDir: roots.systemTempDir });
    const seed = new PresentationRunJournal({ files, now: () => new Date(SYNTHETIC_NOW) });
    const crashing = new PresentationRunJournal({
      files,
      now: () => new Date(SYNTHETIC_NOW),
      failureInjector: (point) => {
        if (!armed || injected || point.boundary !== boundary) return;
        injected = true;
        throw new PresentationRunSimulatedProcessCrashError(`synthetic crash:${boundary}`);
      },
    });

    if (boundary.includes('index')) {
      await seed.writeDerivedIndex({ version: 1, state: 'seed' });
      armed = true;
      await crashing.writeDerivedIndex({ version: 1, state: 'dispatch' }).catch((): undefined => undefined);
      const restarted = new PresentationRunJournal({ files, now: () => new Date(SYNTHETIC_NOW) });
      await restarted.writeDerivedIndex({ version: 1, state: 'recovered' });
      const recovered = JSON.parse(await readFile(files.getIndexPath(), 'utf8')) as unknown;
      return {
        injected,
        recovered:
          typeof recovered === 'object' &&
          recovered !== null &&
          'state' in recovered &&
          recovered.state === 'recovered',
      };
    }

    const allocated = { version: 1, revision: 0, phase: 'store-allocated' };
    const dispatching = { version: 1, revision: 1, phase: 'dispatch-committed' };
    await seed.transaction({
      mutations: [
        {
          entityKind: 'run',
          entityId: SYNTHETIC_FAULT_RUN_ID,
          expectedRevision: null,
          nextManifest: allocated,
        },
      ],
    });
    armed = true;
    await crashing
      .transaction({
        mutations: [
          {
            entityKind: 'run',
            entityId: SYNTHETIC_FAULT_RUN_ID,
            expectedRevision: 0,
            nextManifest: dispatching,
          },
        ],
      })
      .catch((): undefined => undefined);
    const restarted = new PresentationRunJournal({ files, now: () => new Date(SYNTHETIC_NOW) });
    await restarted.recover();
    const canonical = await restarted.readCanonical<{ revision: number; phase: string }>('run', SYNTHETIC_FAULT_RUN_ID);
    const expected = boundary === 'before-intent-append' ? allocated : dispatching;
    await restarted.recover();
    return { injected, recovered: JSON.stringify(canonical) === JSON.stringify(expected) };
  } finally {
    await rm(roots.root, { recursive: true, force: true });
  }
}

/** Exercise every source-snapshot file boundary and prove restart cleanup or promotion. */
export async function verifySyntheticSourceCrashRecovery(
  boundary: PresentationRunFileDurableBoundary
): Promise<SyntheticCrashRecoveryResult> {
  const roots = await createSyntheticFaultRoots('forge-presentation-source-crash-');
  const sourcePath = join(roots.root, 'source.pptx');
  await writeFile(sourcePath, createSyntheticPptxBytes(), { mode: 0o600 });
  let armed = false;
  let injected = false;
  let prepared: PreparedPresentationSourceSnapshot | undefined;
  try {
    const files = new PresentationRunFiles({
      userDataDir: roots.userDataDir,
      tempDir: roots.systemTempDir,
      failureInjector: (point) => {
        if (!armed || injected || point.boundary !== boundary) return;
        injected = true;
        throw new PresentationRunSimulatedProcessCrashError(`synthetic crash:${boundary}`);
      },
    });
    await files.initialize();
    const input = {
      grantId: SYNTHETIC_FAULT_GRANT_ID,
      sourcePath,
      format: 'pptx' as const,
    };
    if (SOURCE_PROMOTION_BOUNDARIES.has(boundary)) {
      prepared = await files.prepareSourceSnapshot(input);
      armed = true;
      await files.promoteSourceSnapshot(prepared).catch((): undefined => undefined);
    } else {
      armed = true;
      await files.prepareSourceSnapshot(input).catch((): undefined => undefined);
    }

    const restarted = new PresentationRunFiles({ userDataDir: roots.userDataDir, tempDir: roots.systemTempDir });
    if (prepared === undefined) {
      await restarted.removeAbandonedPreparedSourceGrant(SYNTHETIC_FAULT_GRANT_ID);
      return { injected, recovered: true };
    }
    await restarted.recoverSourceSnapshotPromotion(prepared);
    await restarted.verifySourceSnapshot({
      grantId: prepared.grantId,
      format: prepared.format,
      relativePath: prepared.finalRelativePath,
      sha256: prepared.sha256,
      byteLength: prepared.byteLength,
    });
    return { injected, recovered: true };
  } finally {
    await rm(roots.root, { recursive: true, force: true });
  }
}

/** Exercise every retained-candidate file boundary and prove restart cleanup or exact promotion. */
export async function verifySyntheticCandidateCrashRecovery(
  boundary: PresentationRunFileDurableBoundary
): Promise<SyntheticCrashRecoveryResult> {
  const roots = await createSyntheticFaultRoots('forge-presentation-candidate-crash-');
  const candidateBytes = createSyntheticPptxBytes();
  let armed = false;
  let injected = false;
  let prepared: PreparedRetainedCandidate | undefined;
  try {
    const files = new PresentationRunFiles({
      userDataDir: roots.userDataDir,
      tempDir: roots.systemTempDir,
      failureInjector: (point) => {
        if (!armed || injected || point.boundary !== boundary) return;
        injected = true;
        throw new PresentationRunSimulatedProcessCrashError(`synthetic crash:${boundary}`);
      },
    });
    await files.createRunLayout(SYNTHETIC_FAULT_RUN_ID);
    await writeFile(files.getStagingCandidatePath(SYNTHETIC_FAULT_RUN_ID), candidateBytes, { mode: 0o600 });
    if (boundary === 'before-run-cleanup') {
      armed = true;
      await files.removeRun(SYNTHETIC_FAULT_RUN_ID).catch((): undefined => undefined);
      const restarted = new PresentationRunFiles({ userDataDir: roots.userDataDir, tempDir: roots.systemTempDir });
      await restarted.removeRun(SYNTHETIC_FAULT_RUN_ID);
      return { injected, recovered: true };
    }
    if (CANDIDATE_PROMOTION_BOUNDARIES.has(boundary)) {
      prepared = await files.prepareRetainedCandidate(SYNTHETIC_FAULT_RUN_ID);
      armed = true;
      await files.promoteRetainedCandidate(prepared).catch((): undefined => undefined);
    } else {
      armed = true;
      await files.prepareRetainedCandidate(SYNTHETIC_FAULT_RUN_ID).catch((): undefined => undefined);
    }

    const restarted = new PresentationRunFiles({ userDataDir: roots.userDataDir, tempDir: roots.systemTempDir });
    if (prepared === undefined) {
      await restarted.removeRun(SYNTHETIC_FAULT_RUN_ID);
      return { injected, recovered: true };
    }
    await restarted.recoverRetainedCandidatePromotion(prepared);
    const exact = await restarted.withAuthorizedRetainedCandidate(
      SYNTHETIC_FAULT_RUN_ID,
      {
        relativePath: prepared.finalRelativePath,
        sha256: prepared.sha256,
        byteLength: prepared.byteLength,
      },
      async (reader) => reader.readAt(0, reader.byteLength)
    );
    return { injected, recovered: exact?.equals(candidateBytes) === true };
  } finally {
    await rm(roots.root, { recursive: true, force: true });
  }
}

function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function syntheticTemplate(candidateBytes: Buffer): ResolvedPresentationTemplate {
  const themeBytes = Buffer.from('# Synthetic theme\nUse a restrained business layout.\n');
  return {
    manifest: {
      id: SYNTHETIC_TEMPLATE_ID,
      name: 'Synthetic Review',
      description: 'Temporary integration fixture',
      format: 'pptx',
      kind: 'deck',
      source: 'user',
      themeFile: 'THEME.md',
      referenceFile: 'reference.pptx',
      preview: 'preview.svg',
      version: 1,
      createdAt: SYNTHETIC_NOW,
    },
    theme: {
      fileName: 'THEME.md',
      bytes: themeBytes,
      byteLength: themeBytes.byteLength,
      sha256: hashBytes(themeBytes),
    },
    reference: {
      fileName: 'reference.pptx',
      bytes: candidateBytes,
      byteLength: candidateBytes.byteLength,
      sha256: hashBytes(candidateBytes),
    },
  };
}

function releasedRuntime(): Record<string, unknown> {
  return {
    state: 'idle',
    can_send_message: true,
    has_task: false,
    task_status: 'finished',
    is_processing: false,
    pending_confirmations: 0,
    turn_id: null,
  };
}

async function extractSyntheticPresentationSources(sources: readonly PresentationSourceExtractionInput[]) {
  return Promise.all(
    sources.map(async (source) => {
      const bytes = await source.snapshot.readBytes();
      const text = ['txt', 'md', 'csv'].includes(source.format)
        ? bytes.toString('utf8')
        : `Synthetic ${source.format.toUpperCase()} evidence ${source.sha256}`;
      return {
        grantId: source.grantId,
        displayName: source.displayName,
        format: source.format,
        byteLength: source.byteLength,
        sha256: source.sha256,
        text,
        characterCount: text.length,
      };
    })
  );
}

/** Create a temp-only, real-store presentation lifecycle with synthetic external boundaries. */
export async function createManagedPresentationIntegrationContext(
  options: ManagedPresentationIntegrationOptions = {}
): Promise<ManagedPresentationIntegrationContext> {
  const root = await mkdtemp(join(tmpdir(), 'forge-managed-presentation-'));
  const userDataDir = join(root, 'user-data');
  const systemTempDir = join(root, 'system-temp');
  const workspace = join(root, 'workspace');
  await Promise.all([
    mkdir(userDataDir, { mode: 0o700 }),
    mkdir(systemTempDir, { mode: 0o700 }),
    mkdir(workspace, { mode: 0o700 }),
  ]);

  let featureEnabled = options.featureEnabled ?? true;
  let nativeSourcePaths: readonly string[] | null = null;
  let clock = new Date(SYNTHETIC_NOW);
  const now = (): Date => new Date(clock);
  const files = new PresentationRunFiles({ userDataDir, tempDir: systemTempDir });
  const journal = new PresentationRunJournal({ files, now });
  const createStore = (runJournal: PresentationRunJournal): PresentationRunStore =>
    new PresentationRunStore({
      files,
      journal: runJournal,
      now,
      getFreeDiskBytes: async () => options.freeDiskBytes ?? 8 * 1_024 * 1_024 * 1_024,
    });
  const store = createStore(journal);
  const scope = options.scope ?? 'individual';
  const runtime = options.runtime ?? 'aionrs';
  const principalId = 'synthetic-local-principal';
  const resolveAuthority = async (): Promise<PresentationRunAuthorityResolution> => {
    if (scope === 'unavailable') return { ok: false, code: 'SCOPE_UNAVAILABLE' };
    return { ok: true, principalId, scope, runtime };
  };
  const grants = new PresentationSourceGrantService({
    files,
    store,
    isFeatureEnabled: () => featureEnabled,
    isDesktopRuntime: () => true,
    getPrincipalId: async () => principalId,
    resolveConversationOwner: async ({ conversationId }) => {
      if (scope === 'unavailable') return { ok: false as const, code: 'SCOPE_UNAVAILABLE' as const };
      return { ok: true as const, conversationId, principalId, scope, workspace };
    },
    pickNativeSourcePaths: async () => nativeSourcePaths,
  });
  const candidateBytes = createSyntheticPptxBytes();
  const template = syntheticTemplate(candidateBytes);
  const templates: Pick<PresentationTemplateService, 'getById'> = {
    getById: async (id) => (id === SYNTHETIC_TEMPLATE_ID ? template : null),
  };
  const backendPosts: ManagedPresentationIntegrationContext['backendPosts'] = [];
  const validationPaths: string[] = [];
  const inspectionPaths: string[] = [];
  const renderedSlides: number[] = [];
  const eventClient = {
    connect: (): void => undefined,
    disconnect: (): void => undefined,
    consumePending: async (): Promise<'missing'> => 'missing',
  };
  let runs: PresentationRunService;
  const lifecycle = new PresentationRunLifecycleCoordinator({
    store,
    files,
    eventClient,
    getPreparedRun: async (runId) => {
      const prepared = await runs.getPreparedRun(runId);
      if (prepared === null) throw new Error('Synthetic run preparation is unavailable');
      return prepared;
    },
    preflightDispatch: async () => ({ ok: true }),
    postInitialMessage: async (_credentials, request) => {
      backendPosts.push(request);
      if (options.postInitialMessage !== undefined) return options.postInitialMessage();
      return {
        msg_id: SYNTHETIC_MESSAGE_ID,
        turn_id: SYNTHETIC_TURN_ID,
        runtime: {
          state: 'busy',
          can_send_message: false,
          has_task: true,
          task_status: 'running',
          is_processing: true,
          pending_confirmations: 0,
          turn_id: SYNTHETIC_TURN_ID,
        },
      };
    },
    observeRuntime: async () => options.observeRuntime?.() ?? releasedRuntime(),
    inspectReadiness: (request, inspectionWorkspace) =>
      new PresentationReadinessService({
        runner: {
          validate: async (filePath) => {
            validationPaths.push(filePath);
            return {};
          },
          renderSlide: async (_filePath, slideNumber, outputPath) => {
            renderedSlides.push(slideNumber);
            await writeFile(outputPath, SYNTHETIC_VALID_PNG, { mode: 0o600 });
          },
        },
        inspectOoxml: async (filePath) => {
          inspectionPaths.push(filePath);
          return inspectPptxOoxml(filePath);
        },
        createInspectionWorkspace: async () => inspectionWorkspace,
      }).inspect(request),
    isFeatureEnabled: () => featureEnabled,
    now,
  });

  const createRunService = (runStore: PresentationRunStore): PresentationRunService =>
    new PresentationRunService({
      files,
      store: runStore,
      templates,
      lifecycle,
      isFeatureEnabled: () => featureEnabled,
      isDesktopRuntime: () => true,
      resolveAuthority: async () => resolveAuthority(),
      extractSources: extractSyntheticPresentationSources,
      recoveryCursorSecret: Buffer.alloc(32, 7),
      now,
    });
  runs = createRunService(store);
  const terminalController = new AbortController();

  return {
    root,
    principalId,
    conversationId: SYNTHETIC_CONVERSATION_ID,
    holderId: SYNTHETIC_HOLDER_ID,
    turnId: SYNTHETIC_TURN_ID,
    backendCredentials: { port: 43_123, token: 'synthetic-backend-token' },
    files,
    store,
    grants,
    runs,
    lifecycle,
    backendPosts,
    validationPaths,
    inspectionPaths,
    renderedSlides,
    terminalAuthority: {
      signal: terminalController.signal,
      deadlineAt: Date.parse(SYNTHETIC_NOW) + 60_000,
      isCurrent: () => true,
    },
    now,
    setNow: (value) => {
      clock = new Date(value);
    },
    setFeatureEnabled: (enabled) => {
      featureEnabled = enabled;
    },
    setNativeSourcePaths: (paths) => {
      nativeSourcePaths = paths;
    },
    workspacePath: (relativePath) => join(workspace, relativePath),
    startRequest: (sources = []) => ({
      conversation_id: SYNTHETIC_CONVERSATION_ID,
      client_request_id: SYNTHETIC_REQUEST_ID,
      input: 'Build a concise synthetic board review',
      selected_template_id: SYNTHETIC_TEMPLATE_ID,
      sources: [...sources],
    }),
    restart: async () => {
      const restartedStore = createStore(new PresentationRunJournal({ files, now }));
      await restartedStore.initialize();
      return { store: restartedStore, runs: createRunService(restartedStore) };
    },
    cleanup: async () => {
      grants.dispose();
      await lifecycle.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUsableBinary(candidate: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve an executable OfficeCLI binary in the same order used by the product. */
export function resolveOfficeCliPath(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = homedir(),
  platform: NodeJS.Platform = process.platform
): string | undefined {
  const explicit = environment.OFFICECLI_PATH?.trim();
  if (explicit && isAbsolute(explicit) && isUsableBinary(explicit, platform)) return explicit;

  const binaryName = platform === 'win32' ? 'officecli.exe' : 'officecli';
  const localBinary = join(homeDirectory, '.local', 'bin', binaryName);
  if (isUsableBinary(localBinary, platform)) return localBinary;

  const pathValue = environment.PATH ?? environment.Path ?? '';
  for (const pathEntry of pathValue.split(delimiter)) {
    const directory = pathEntry || process.cwd();
    const candidate = join(directory, binaryName);
    if (isUsableBinary(candidate, platform)) return candidate;
  }

  return undefined;
}

export function createOfficeArtifactService(
  workspace: string,
  runner: OfficeCliRunner,
  historyDirectory = '.history'
): OfficeArtifactService {
  return new OfficeArtifactService({
    runner,
    snapshots: new OfficeArtifactSnapshotStore(join(workspace, historyDirectory)),
    resolveArtifact: resolveOfficeArtifactPath,
    hashArtifact: hashOfficeArtifact,
    workingFiles: new OfficeArtifactWorkingFiles(),
    retainPreviewOrigin: (url) => ({ url, release: () => undefined }),
  });
}

export async function createOfficeArtifactIntegrationContext(
  officeCliPath: string
): Promise<OfficeArtifactIntegrationContext> {
  const workspace = await mkdtemp(join(tmpdir(), 'forge-office-artifact-'));
  const runner = createOfficeCliRunner({ binaryPath: officeCliPath });
  const service = createOfficeArtifactService(workspace, runner);

  return {
    workspace,
    service,
    runner,
    cleanup: async () => {
      try {
        await service.dispose();
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },
  };
}

function singleResult(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !Array.isArray(value.results) || value.results.length !== 1) {
    throw new Error('OfficeCLI did not return exactly one result');
  }

  const result = value.results[0];
  if (!isRecord(result)) throw new Error('OfficeCLI returned an invalid result');
  return result;
}

export async function getDocxParagraph(
  runner: OfficeCliRunner,
  filePath: string,
  path: string
): Promise<OfficeCliParagraph> {
  try {
    const paragraph = singleResult(await runner.get(filePath, path));
    if (
      paragraph.type !== 'paragraph' ||
      typeof paragraph.path !== 'string' ||
      typeof paragraph.text !== 'string' ||
      !Array.isArray(paragraph.children)
    ) {
      throw new Error('OfficeCLI returned an invalid DOCX paragraph');
    }

    const runs = paragraph.children.map((child): OfficeCliRun => {
      if (!isRecord(child) || child.type !== 'run' || typeof child.text !== 'string' || !isRecord(child.format)) {
        throw new Error('OfficeCLI returned an invalid DOCX run');
      }
      return { text: child.text, format: child.format };
    });

    return { path: paragraph.path, text: paragraph.text, runs };
  } finally {
    await runner.close(filePath);
  }
}

export async function getXlsxCell(runner: OfficeCliRunner, filePath: string, path: string): Promise<OfficeCliCell> {
  try {
    const cell = singleResult(await runner.get(filePath, path));
    if (
      cell.type !== 'cell' ||
      typeof cell.path !== 'string' ||
      typeof cell.text !== 'string' ||
      !isRecord(cell.format)
    ) {
      throw new Error('OfficeCLI returned an invalid XLSX cell');
    }

    const formula = cell.format.formula;
    if (formula !== undefined && typeof formula !== 'string') {
      throw new Error('OfficeCLI returned an invalid XLSX formula');
    }

    return {
      path: cell.path,
      displayText: cell.text,
      input: formula === undefined ? cell.text : `=${formula}`,
    };
  } finally {
    await runner.close(filePath);
  }
}

export function getRunsInRange(paragraph: OfficeCliParagraph, start: number, end: number): OfficeCliRun[] {
  const runs: OfficeCliRun[] = [];
  let offset = 0;

  for (const run of paragraph.runs) {
    const runStart = offset;
    offset += run.text.length;
    if (runStart < end && offset > start) runs.push(run);
  }

  return runs;
}

export function stableRunFidelity(run: OfficeCliRun): OfficeCliRun {
  return {
    text: run.text,
    format: Object.fromEntries(Object.entries(run.format).filter(([key]) => !key.endsWith('.src'))),
  };
}

export function formatEnabled(run: OfficeCliRun, property: 'bold' | 'italic' | 'underline'): boolean {
  const value = Object.prototype.hasOwnProperty.call(run.format, property)
    ? run.format[property]
    : run.format[`effective.${property}`];
  if (property !== 'underline') return value === true;
  return value === true || (typeof value === 'string' && !['', 'none', 'false'].includes(value.toLowerCase()));
}

export function assertMutationSuccess(result: OfficeArtifactMutationResult): MutationSuccess {
  if (!result.ok) throw new Error(`Expected mutation success, received ${result.code}`);
  return result;
}
