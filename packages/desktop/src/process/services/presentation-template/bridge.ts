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
import { httpRequest, isBackendHttpError } from '@/common/adapter/httpBridge';
import { PRESENTATION_RUN_V2_ENABLED } from '@/common/config/constants';
import type {
  ClaimInitialPresentationDispatchRequest,
  ClaimInitialPresentationDispatchResult,
  DispatchInitialPresentationRunRequest,
  DispatchInitialPresentationRunResult,
  FailureFor,
  GrantPresentationExternalDropResult,
  PresentationGrantOwner,
  RenewInitialPresentationDispatchRequest,
  RenewInitialPresentationDispatchResult,
  StartPresentationRunRequest,
  StartPresentationRunResult,
} from '@/common/types/office/presentationRun';
import { BUILTIN_TEMPLATE_PACKS } from '@process/resources/presentation-templates/index';
import { PresentationTemplateService } from './PresentationTemplateService';
import {
  ArtifactScratchService,
  createPresentationSourceGrantService,
  type PresentationConversationOwnerResolution,
  type PresentationRunAuthorityResolution,
  type PresentationRunFiles,
  type PresentationRunLifecycleCoordinator,
  type PresentationRunService,
  type PresentationRunStore,
  type PresentationScopeResolver,
  type PresentationScopeResolverOptions,
} from './run';
import * as presentationRunModule from './run';

const PRESENTATION_EXTERNAL_DROP_CHANNEL = 'presentation-sources:grant-external-drop';
const PRESENTATION_PRINCIPAL_ID = 'desktop-local-principal';
const PRESENTATION_TEAM_USER_ID = 'system_default_user';
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const isPresentationDesktopRuntime = (): boolean => process.type === 'browser';

type PresentationExternalDropPathRequest = {
  owner: PresentationGrantOwner;
  native_paths: readonly string[];
  expected_owner_revision: number;
};

type PresentationSourceGrantServiceInstance = ReturnType<typeof createPresentationSourceGrantService>;
type PresentationRunServices = {
  source: PresentationSourceGrantServiceInstance;
  run: PresentationRunService | null;
  files: PresentationRunFiles | null;
  store: PresentationRunStore | null;
};

let service: PresentationTemplateService | null = null;
let artifactScratchService: ArtifactScratchService | null = null;
let presentationRunServices: PresentationRunServices | null = null;
let presentationRunLifecycleCoordinator: Pick<
  PresentationRunLifecycleCoordinator,
  'claimInitialDispatch' | 'renewInitialDispatch' | 'dispatch'
> | null = null;
let presentationScopeResolver: PresentationScopeResolver | null = null;
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

const classifyConversationLookupError: PresentationScopeResolverOptions['classifyLookupError'] = (error) => {
  if (isBackendHttpError(error) && (error.status === 401 || error.status === 403)) return 'RUN_FORBIDDEN';
  if (isBackendHttpError(error) && error.status === 404) return 'RUN_NOT_FOUND';
  return null;
};

const getPresentationScopeResolver = (): PresentationScopeResolver | null => {
  if (!Object.prototype.hasOwnProperty.call(presentationRunModule, 'PresentationScopeResolver')) return null;
  const ScopeResolver = presentationRunModule.PresentationScopeResolver;
  if (typeof ScopeResolver !== 'function') return null;
  presentationScopeResolver ??= new ScopeResolver({
    getConversation: ({ conversationId }) => ipcBridge.conversation.get.invoke({ id: conversationId }),
    listTeams: ({ userId }) => httpRequest<unknown>('GET', `/api/teams?user_id=${encodeURIComponent(userId)}`),
    classifyLookupError: classifyConversationLookupError,
    teamUserId: PRESENTATION_TEAM_USER_ID,
  });
  return presentationScopeResolver;
};

const resolvePresentationScope = async (input: {
  conversationId: string;
  principalId: string;
}): Promise<Awaited<ReturnType<PresentationScopeResolver['resolve']>>> => {
  const resolver = getPresentationScopeResolver();
  if (resolver !== null) return resolver.resolve(input);

  // Compatibility for older isolated bridge tests that mock the Task-3 run barrel.
  try {
    await ipcBridge.conversation.get.invoke({ id: input.conversationId });
  } catch (error) {
    return { ok: false as const, code: classifyConversationLookupError(error) ?? 'SCOPE_UNAVAILABLE' };
  }
  return { ok: false as const, code: 'SCOPE_UNAVAILABLE' as const };
};

const resolveConversationOwner = async (input: {
  conversationId: string;
  principalId: string;
}): Promise<PresentationConversationOwnerResolution> => {
  const resolution = await resolvePresentationScope(input);
  if (resolution.ok === false) return resolution;
  if (resolution.workspace === null) return { ok: false, code: 'SCOPE_UNAVAILABLE' };
  return {
    ok: true,
    conversationId: resolution.conversationId,
    principalId: resolution.principalId,
    scope: resolution.scope,
    workspace: resolution.workspace,
  };
};

const resolveRunAuthority = async (input: { conversationId: string }): Promise<PresentationRunAuthorityResolution> => {
  const resolution = await resolvePresentationScope({
    conversationId: input.conversationId,
    principalId: PRESENTATION_PRINCIPAL_ID,
  });
  if (resolution.ok === false) return resolution;
  return {
    ok: true,
    principalId: resolution.principalId,
    scope: resolution.scope,
    runtime: resolution.runtime,
  };
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

const getPresentationRunServices = (): PresentationRunServices => {
  if (presentationRunServices !== null) return presentationRunServices;
  const userDataDir = app.getPath('userData');
  const tempDir = tmpdir();
  const sourceOptions = {
    getFreeDiskBytes: () => getFreeDiskBytes(userDataDir),
    isFeatureEnabled: () => PRESENTATION_RUN_V2_ENABLED,
    isDesktopRuntime: isPresentationDesktopRuntime,
    getPrincipalId: async () => PRESENTATION_PRINCIPAL_ID,
    resolveConversationOwner,
    pickNativeSourcePaths,
  };
  const sharedExportNames = [
    'PresentationRunFiles',
    'PresentationRunJournal',
    'PresentationRunStore',
    'PresentationSourceGrantService',
    'PresentationRunService',
    'PresentationScopeResolver',
  ] as const;
  const sharedStorageAvailable = sharedExportNames.every((name) =>
    Object.prototype.hasOwnProperty.call(presentationRunModule, name)
  );
  if (!sharedStorageAvailable) {
    presentationRunServices = {
      source: createPresentationSourceGrantService({ userDataDir, tempDir, ...sourceOptions }),
      run: null,
      files: null,
      store: null,
    };
    return presentationRunServices;
  }

  const {
    PresentationRunFiles,
    PresentationRunJournal,
    PresentationRunStore,
    PresentationSourceGrantService: PresentationSourceGrantServiceClass,
    PresentationRunService,
    PresentationScopeResolver,
  } = presentationRunModule;
  const sharedConstructorsAvailable =
    typeof PresentationRunFiles === 'function' &&
    typeof PresentationRunJournal === 'function' &&
    typeof PresentationRunStore === 'function' &&
    typeof PresentationSourceGrantServiceClass === 'function' &&
    typeof PresentationRunService === 'function' &&
    typeof PresentationRunService.prototype.get === 'function' &&
    typeof PresentationScopeResolver === 'function' &&
    typeof PresentationScopeResolver.prototype.resolve === 'function';
  if (!sharedConstructorsAvailable) {
    presentationRunServices = {
      source: createPresentationSourceGrantService({ userDataDir, tempDir, ...sourceOptions }),
      run: null,
      files: null,
      store: null,
    };
    return presentationRunServices;
  }

  const files = new PresentationRunFiles({ userDataDir, tempDir });
  const journal = new PresentationRunJournal({ files });
  const store = new PresentationRunStore({
    files,
    journal,
    getFreeDiskBytes: () => getFreeDiskBytes(userDataDir),
  });
  const source = new PresentationSourceGrantServiceClass({ ...sourceOptions, files, store });
  const run = new PresentationRunService({
    files,
    store,
    templates: { getById: (id) => getService().getById(id) },
    isFeatureEnabled: () => PRESENTATION_RUN_V2_ENABLED,
    isDesktopRuntime: isPresentationDesktopRuntime,
    resolveAuthority: resolveRunAuthority,
    lifecycle: {
      claimInitialDispatch: (request) => {
        const lifecycle = presentationRunLifecycleCoordinator;
        return lifecycle === null
          ? Promise.resolve(sourceFailure('INTERNAL_ERROR') as ClaimInitialPresentationDispatchResult)
          : lifecycle.claimInitialDispatch(request);
      },
      renewInitialDispatch: (request) => {
        const lifecycle = presentationRunLifecycleCoordinator;
        return lifecycle === null
          ? Promise.resolve(sourceFailure('INTERNAL_ERROR') as RenewInitialPresentationDispatchResult)
          : lifecycle.renewInitialDispatch(request);
      },
      dispatch: (request, runtime) => {
        const lifecycle = presentationRunLifecycleCoordinator;
        return lifecycle === null
          ? Promise.resolve(sourceFailure('INTERNAL_ERROR') as DispatchInitialPresentationRunResult)
          : lifecycle.dispatch(request, runtime);
      },
    },
  });
  presentationRunServices = { source, run, files, store };
  return presentationRunServices;
};

export function getPresentationRunLifecycleGraph(): {
  files: PresentationRunFiles;
  store: PresentationRunStore;
  run: PresentationRunService;
} | null {
  const services = getPresentationRunServices();
  return services.files === null || services.store === null || services.run === null
    ? null
    : { files: services.files, store: services.store, run: services.run };
}
export function setPresentationRunLifecycleCoordinator(
  coordinator: Pick<
    PresentationRunLifecycleCoordinator,
    'claimInitialDispatch' | 'renewInitialDispatch' | 'dispatch'
  > | null
): void {
  presentationRunLifecycleCoordinator = coordinator;
}

const getPresentationSourceGrantService = (): PresentationSourceGrantServiceInstance =>
  getPresentationRunServices().source;

const getPresentationRunService = (): PresentationRunService => {
  const run = getPresentationRunServices().run;
  if (run === null) throw new Error('Presentation run service is unavailable');
  return run;
};

type PresentationBoundaryFailureCode =
  | 'FEATURE_DISABLED'
  | 'DESKTOP_REQUIRED'
  | 'INVALID_REQUEST'
  | 'RUN_NOT_FOUND'
  | 'RUN_FORBIDDEN'
  | 'SCOPE_UNAVAILABLE'
  | 'TEAM_SCOPE_UNSUPPORTED'
  | 'RUNTIME_UNSUPPORTED'
  | 'INTERNAL_ERROR';

const sourceFailure = <Code extends PresentationBoundaryFailureCode>(code: Code): FailureFor<Code> =>
  ({
    ok: false,
    code,
    messageKey: `conversation.presentationRun.${code}`,
    retryable: false,
    state: code === 'RUN_NOT_FOUND' || code === 'RUN_FORBIDDEN' ? 'lookup' : 'preflight',
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

const callPresentationStartProvider = async (
  request: StartPresentationRunRequest
): Promise<StartPresentationRunResult> => {
  if (!PRESENTATION_RUN_V2_ENABLED) return sourceFailure('FEATURE_DISABLED');
  if (!isPresentationDesktopRuntime()) return sourceFailure('DESKTOP_REQUIRED');

  let authority: PresentationRunAuthorityResolution;
  try {
    authority = await resolveRunAuthority({ conversationId: request.conversation_id });
  } catch {
    return sourceFailure('SCOPE_UNAVAILABLE');
  }
  if (authority.ok === false) return sourceFailure(authority.code);
  if (authority.scope !== 'individual') return sourceFailure('TEAM_SCOPE_UNSUPPORTED');
  if (authority.runtime !== 'aionrs' && authority.runtime !== 'acp') {
    return sourceFailure('RUNTIME_UNSUPPORTED');
  }
  return callPresentationSourceService(() => getPresentationRunService().start(request));
};

const callPresentationMutationProvider = async <Result>(
  conversationId: string,
  operation: () => Promise<Result>
): Promise<Result> => {
  if (!PRESENTATION_RUN_V2_ENABLED) return sourceFailure('FEATURE_DISABLED') as Result;
  if (!isPresentationDesktopRuntime()) return sourceFailure('DESKTOP_REQUIRED') as Result;
  let authority: PresentationRunAuthorityResolution;
  try {
    authority = await resolveRunAuthority({ conversationId });
  } catch {
    return sourceFailure('SCOPE_UNAVAILABLE') as Result;
  }
  if (authority.ok === false) return sourceFailure(authority.code) as Result;
  if (authority.scope !== 'individual') return sourceFailure('TEAM_SCOPE_UNSUPPORTED') as Result;
  if (authority.runtime !== 'aionrs' && authority.runtime !== 'acp') {
    return sourceFailure('RUNTIME_UNSUPPORTED') as Result;
  }
  return callPresentationSourceService(operation);
};

const callPresentationRecoveryProvider = <Result>(operation: () => Promise<Result>): Promise<Result> => {
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
  const confirmQueuedProvider = (
    ipcBridge.presentationSources as typeof ipcBridge.presentationSources & {
      confirmQueued?: typeof ipcBridge.presentationSources.confirmQueued;
    }
  ).confirmQueued;
  confirmQueuedProvider?.provider((request) =>
    callPresentationSourceProvider(() => getPresentationSourceGrantService().confirmQueued(request))
  );
  const runProviders = (ipcBridge as typeof ipcBridge & { presentationRuns?: typeof ipcBridge.presentationRuns })
    .presentationRuns;
  runProviders?.start.provider(callPresentationStartProvider);
  runProviders?.get.provider((request) =>
    callPresentationRecoveryProvider(() => getPresentationRunService().get(request))
  );
  runProviders?.listRecoverable.provider((request) =>
    callPresentationRecoveryProvider(() => getPresentationRunService().listRecoverable(request))
  );
  runProviders?.openRecovery.provider((request) =>
    callPresentationRecoveryProvider(() => getPresentationRunService().openRecovery(request))
  );
  runProviders?.discard.provider((request) =>
    callPresentationRecoveryProvider(() => getPresentationRunService().discard(request))
  );
  runProviders?.claimInitialDispatch.provider((request: ClaimInitialPresentationDispatchRequest) =>
    callPresentationMutationProvider(request.conversation_id, () =>
      getPresentationRunService().claimInitialDispatch(request)
    )
  );
  runProviders?.renewInitialDispatch.provider((request: RenewInitialPresentationDispatchRequest) =>
    callPresentationMutationProvider(request.conversation_id, () =>
      getPresentationRunService().renewInitialDispatch(request)
    )
  );
  runProviders?.dispatch.provider((request: DispatchInitialPresentationRunRequest) =>
    callPresentationMutationProvider(request.conversation_id, () => getPresentationRunService().dispatch(request))
  );
  registerPresentationExternalDropHandler();
}
