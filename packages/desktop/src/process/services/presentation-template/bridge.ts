/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { tmpdir } from 'node:os';
import { statfs } from 'node:fs/promises';
import { app, dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';
import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { PRESENTATION_RUN_V2_ENABLED } from '@/common/config/constants';
import type {
  FailureFor,
  GrantPresentationExternalDropResult,
  PresentationGrantOwner,
} from '@/common/types/office/presentationRun';
import { BUILTIN_TEMPLATE_PACKS } from '@process/resources/presentation-templates/index';
import { PresentationTemplateService } from './PresentationTemplateService';
import { ArtifactScratchService, createPresentationSourceGrantService } from './run';

const PRESENTATION_EXTERNAL_DROP_CHANNEL = 'presentation-sources:grant-external-drop';
const PRESENTATION_PRINCIPAL_ID = 'desktop-local-principal';
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const isPresentationDesktopRuntime = (): boolean => process.type === 'browser';

type PresentationExternalDropPathRequest = {
  owner: PresentationGrantOwner;
  native_paths: readonly string[];
  expected_owner_revision: number;
};

type PresentationSourceGrantService = ReturnType<typeof createPresentationSourceGrantService>;

let service: PresentationTemplateService | null = null;
let artifactScratchService: ArtifactScratchService | null = null;
let presentationSourceGrantService: PresentationSourceGrantService | null = null;
let presentationSourceMainWindow: BrowserWindow | null = null;
let presentationExternalDropHandlerRegistered = false;

const getService = (): PresentationTemplateService => {
  service ??= new PresentationTemplateService({
    rootDir: path.join(app.getPath('userData'), 'presentation-templates'),
    builtinPacks: BUILTIN_TEMPLATE_PACKS,
  });
  return service;
};

const getArtifactScratchService = (): ArtifactScratchService => {
  artifactScratchService ??= new ArtifactScratchService({
    rootDir: path.join(tmpdir(), 'aionui-artifact-runs'),
  });
  return artifactScratchService;
};

const getFreeDiskBytes = async (directory: string): Promise<number> => {
  const statistics = await statfs(directory, { bigint: true });
  const availableBytes = statistics.bavail * statistics.bsize;
  return availableBytes > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(availableBytes);
};

const resolveConversationOwner = async ({
  conversationId,
  principalId: _principalId,
}: {
  conversationId: string;
  principalId: string;
}) => {
  try {
    await ipcBridge.conversation.get.invoke({ id: conversationId });
  } catch (error) {
    if (isBackendHttpError(error) && (error.status === 401 || error.status === 403)) {
      return { ok: false as const, code: 'RUN_FORBIDDEN' as const };
    }
    if (isBackendHttpError(error) && error.status === 404) {
      return { ok: false as const, code: 'RUN_NOT_FOUND' as const };
    }
    return { ok: false as const, code: 'SCOPE_UNAVAILABLE' as const };
  }

  return { ok: false as const, code: 'SCOPE_UNAVAILABLE' as const };
};

const pickNativeSourcePaths = async (): Promise<readonly string[] | null> => {
  const options: OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
  };
  const currentWindow = presentationSourceMainWindow;
  const result =
    currentWindow !== null && !currentWindow.isDestroyed()
      ? await dialog.showOpenDialog(currentWindow, options)
      : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths;
};

const getPresentationSourceGrantService = (): PresentationSourceGrantService => {
  const userDataDir = app.getPath('userData');
  presentationSourceGrantService ??= createPresentationSourceGrantService({
    userDataDir,
    tempDir: tmpdir(),
    getFreeDiskBytes: () => getFreeDiskBytes(userDataDir),
    isFeatureEnabled: () => PRESENTATION_RUN_V2_ENABLED,
    isDesktopRuntime: isPresentationDesktopRuntime,
    getPrincipalId: async () => PRESENTATION_PRINCIPAL_ID,
    resolveConversationOwner,
    pickNativeSourcePaths,
  });
  return presentationSourceGrantService;
};

const sourceFailure = <Code extends 'FEATURE_DISABLED' | 'DESKTOP_REQUIRED' | 'INVALID_REQUEST' | 'INTERNAL_ERROR'>(
  code: Code
): FailureFor<Code> =>
  ({
    ok: false,
    code,
    messageKey: `conversation.presentationRun.${code}`,
    retryable: false,
    state: 'preflight',
    details: null,
  }) as FailureFor<Code>;

const callPresentationSourceService = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
  try {
    return await operation();
  } catch {
    return sourceFailure('INTERNAL_ERROR') as Result;
  }
};

const callPresentationSourceProvider = <Result>(operation: () => Promise<Result>): Promise<Result> => {
  if (!PRESENTATION_RUN_V2_ENABLED) {
    return Promise.resolve(sourceFailure('FEATURE_DISABLED') as Result);
  }
  if (!isPresentationDesktopRuntime()) {
    return Promise.resolve(sourceFailure('DESKTOP_REQUIRED') as Result);
  }
  return callPresentationSourceService(operation);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
};

const isPresentationGrantOwner = (value: unknown): value is PresentationGrantOwner => {
  if (!isRecord(value) || typeof value.owner_type !== 'string') return false;
  if (value.owner_type === 'draft') {
    return (
      hasExactKeys(value, ['owner_type', 'draft_id']) &&
      typeof value.draft_id === 'string' &&
      UUID_PATTERN.test(value.draft_id)
    );
  }
  return (
    value.owner_type === 'conversation' &&
    hasExactKeys(value, ['owner_type', 'conversation_id']) &&
    typeof value.conversation_id === 'string' &&
    UUID_PATTERN.test(value.conversation_id)
  );
};

const parsePresentationExternalDropPathRequest = (value: unknown): PresentationExternalDropPathRequest | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['owner', 'native_paths', 'expected_owner_revision']) ||
    !isPresentationGrantOwner(value.owner) ||
    !Number.isSafeInteger(value.expected_owner_revision) ||
    (value.expected_owner_revision as number) < 0 ||
    !Array.isArray(value.native_paths) ||
    value.native_paths.length < 1 ||
    value.native_paths.length > 16
  ) {
    return null;
  }

  const nativePaths = value.native_paths;
  if (
    !nativePaths.every(
      (nativePath) =>
        typeof nativePath === 'string' &&
        nativePath.length >= 1 &&
        nativePath.length <= 4096 &&
        !nativePath.includes('\0') &&
        path.isAbsolute(nativePath)
    ) ||
    new Set(nativePaths).size !== nativePaths.length
  ) {
    return null;
  }

  return {
    owner: value.owner,
    native_paths: nativePaths,
    expected_owner_revision: value.expected_owner_revision as number,
  };
};

const isAuthorizedPresentationSourceSender = (event: IpcMainInvokeEvent): boolean => {
  const window = presentationSourceMainWindow;
  return (
    window !== null &&
    !window.isDestroyed() &&
    !window.webContents.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame
  );
};

export function setPresentationSourceMainWindow(window: BrowserWindow): void {
  presentationSourceMainWindow = window;
}

const registerPresentationExternalDropHandler = (): void => {
  if (presentationExternalDropHandlerRegistered) return;
  presentationExternalDropHandlerRegistered = true;
  ipcMain.handle(
    PRESENTATION_EXTERNAL_DROP_CHANNEL,
    async (event, value): Promise<GrantPresentationExternalDropResult> => {
      if (!isAuthorizedPresentationSourceSender(event)) return sourceFailure('INVALID_REQUEST');
      if (!PRESENTATION_RUN_V2_ENABLED) return sourceFailure('FEATURE_DISABLED');
      if (!isPresentationDesktopRuntime()) return sourceFailure('DESKTOP_REQUIRED');
      const request = parsePresentationExternalDropPathRequest(value);
      if (request === null) return sourceFailure('INVALID_REQUEST');
      return callPresentationSourceService(() => getPresentationSourceGrantService().grantExternalDropPaths(request));
    }
  );
};

export function initPresentationTemplateBridge(): void {
  ipcBridge.presentationTemplates.list.provider(() => getService().list());
  ipcBridge.presentationTemplates.importSpec.provider(async ({ file_path }) => {
    try {
      return { ok: true as const, template: await getService().importThemeSpec(file_path) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcBridge.presentationTemplates.remove.provider(({ id }) => getService().remove(id));
  ipcBridge.presentationTemplates.allocateScratch.provider(({ conversation_id, template_id }) =>
    getArtifactScratchService().allocate({ conversationId: conversation_id, templateId: template_id })
  );
  ipcBridge.presentationTemplates.completeScratch.provider(({ run_id }) =>
    getArtifactScratchService().complete(run_id)
  );
  ipcBridge.presentationTemplates.retainScratch.provider(({ run_id, reason }) =>
    getArtifactScratchService().retain(run_id, reason)
  );
  ipcBridge.presentationTemplates.discardScratch.provider(({ run_id }) => getArtifactScratchService().discard(run_id));
  ipcBridge.presentationSources.getSourceOwner.provider((request) =>
    callPresentationSourceProvider(() => getPresentationSourceGrantService().getSourceOwner(request))
  );
  ipcBridge.presentationSources.createDraft.provider((request) =>
    callPresentationSourceProvider(() => getPresentationSourceGrantService().createDraft(request))
  );
  ipcBridge.presentationSources.bindDraft.provider((request) =>
    callPresentationSourceProvider(() => getPresentationSourceGrantService().bindDraft(request))
  );
  ipcBridge.presentationSources.pickSources.provider((request) =>
    callPresentationSourceProvider(() => getPresentationSourceGrantService().pickSources(request))
  );
  ipcBridge.presentationSources.grantWorkspaceSource.provider((request) =>
    callPresentationSourceProvider(() => getPresentationSourceGrantService().grantWorkspaceSource(request))
  );
  ipcBridge.presentationSources.revoke.provider((request) =>
    callPresentationSourceProvider(() => getPresentationSourceGrantService().revoke(request))
  );
  registerPresentationExternalDropHandler();
}
