/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import {
  OFFICE_ARTIFACT_MAX_SELECTED_CELLS,
  OFFICE_ARTIFACT_MAX_SELECTION_MESSAGE_BYTES,
} from '../../types/office/artifactEditor';
import { PRESENTATION_RUN_LIMITS } from '../../types/office/presentationRunPolicy';
import type { NativeBridgeProviderKey } from './constants';

const MAX_PATH_LENGTH = 4096;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_SHORT_TEXT_LENGTH = 256;
const MAX_TEXT_LENGTH = 64 * 1024;
const MAX_URL_LENGTH = 2048;
const MAX_THEME_CONTENT_LENGTH = 15 * 1024 * 1024;
const MAX_THEME_TOKEN_COUNT = 1024;
const MAX_CONTEXT_MARKDOWN_LENGTH = 24 * 1024;
const MAX_CONTEXT_PINS = 20;
const MAX_CONTEXT_PIN_LENGTH = 2_000;
const MAX_CONTEXT_SNAPSHOT_ITEMS = 256;
const MAX_PROJECT_KB_FILE_PATHS = 100;

const voidPayloadSchema = z.undefined();
const pathSchema = z.string().min(1).max(MAX_PATH_LENGTH);
const identifierSchema = z.string().min(1).max(MAX_IDENTIFIER_LENGTH);
const shortTextSchema = z.string().min(1).max(MAX_SHORT_TEXT_LENGTH);
const textSchema = z.string().max(MAX_TEXT_LENGTH);
const urlSchema = z.string().max(MAX_URL_LENGTH).url();
const portSchema = z.number().finite().int().min(1).max(65535);
const booleanSettingSchema = z.object({ enabled: z.boolean() }).strict();

const dialogPropertySchema = z.enum([
  'openFile',
  'openDirectory',
  'multiSelections',
  'showHiddenFiles',
  'createDirectory',
  'promptToCreate',
  'noResolveAliases',
  'treatPackageAsDirectory',
  'dontAddToRecent',
]);

const dialogFilterSchema = z
  .object({
    name: shortTextSchema,
    extensions: z.array(z.string().min(1).max(32)).max(64),
  })
  .strict();

const themeTokensSchema = z
  .record(z.string().min(1).max(128), z.string().max(4096))
  .refine((tokens) => Object.keys(tokens).length <= MAX_THEME_TOKEN_COUNT);

const themeSchema = z
  .object({
    id: identifierSchema,
    name: shortTextSchema,
    cover: z.string().max(MAX_THEME_CONTENT_LENGTH).optional(),
    appearance: z.enum(['light', 'dark']),
    tokens: themeTokensSchema.optional(),
    css: z.string().max(MAX_THEME_CONTENT_LENGTH).optional(),
    builtin: z.boolean(),
    created_at: z.number().finite().int().nonnegative(),
    updated_at: z.number().finite().int().nonnegative(),
  })
  .strict();

const contextSnapshotItemSchema = z.string().max(MAX_TEXT_LENGTH);
const contextSnapshotItemsSchema = z.array(contextSnapshotItemSchema).max(MAX_CONTEXT_SNAPSHOT_ITEMS);
const contextSnapshotSchema = z
  .object({
    goal: contextSnapshotItemSchema,
    current_state: contextSnapshotItemsSchema,
    decisions: contextSnapshotItemsSchema,
    artifacts: contextSnapshotItemsSchema,
    user_preferences: contextSnapshotItemsSchema,
    open_questions: contextSnapshotItemsSchema,
    next_steps: contextSnapshotItemsSchema,
    do_not_forget: contextSnapshotItemsSchema,
  })
  .strict();
const contextPinSchema = z
  .object({
    id: identifierSchema,
    title: z.string().max(MAX_CONTEXT_PIN_LENGTH),
    content: z.string().max(MAX_CONTEXT_PIN_LENGTH),
    source: z.enum(['manual', 'context_md']),
    created_at: z.number().finite().int().nonnegative(),
    updated_at: z.number().finite().int().nonnegative(),
  })
  .strict();
const appOperationsContextCompactSchema = z
  .object({
    operation_id: identifierSchema,
    conversation_id: identifierSchema,
    trigger: z.enum(['auto', 'manual', 'handoff']),
    previous_snapshot: contextSnapshotSchema.optional(),
    previous_markdown: z.string().max(MAX_CONTEXT_MARKDOWN_LENGTH).optional(),
    pinned_context: z.array(contextPinSchema).max(MAX_CONTEXT_PINS).optional(),
    last_compacted_turn_id: identifierSchema.optional(),
    target_turn_id: identifierSchema.optional(),
  })
  .strict();

const officeArtifactRequestShape = {
  conversationId: identifierSchema.optional(),
  workspace: z.string().max(MAX_PATH_LENGTH),
  filePath: pathSchema,
};
const officeWordSelectionSchema = z
  .object({
    kind: z.literal('word'),
    path: pathSchema,
    paragraphText: z.string().max(OFFICE_ARTIFACT_MAX_SELECTION_MESSAGE_BYTES),
    selectedText: z.string().max(OFFICE_ARTIFACT_MAX_SELECTION_MESSAGE_BYTES),
    start: z.number().finite().int().nonnegative(),
    end: z.number().finite().int().nonnegative(),
  })
  .strict();
const officeExcelCellSchema = z
  .object({
    path: shortTextSchema,
    displayText: z.string().max(OFFICE_ARTIFACT_MAX_SELECTION_MESSAGE_BYTES),
  })
  .strict();
const officeExcelSelectionSchema = z
  .object({
    kind: z.literal('excel'),
    paths: z.array(shortTextSchema).max(OFFICE_ARTIFACT_MAX_SELECTED_CELLS),
    cells: z.array(officeExcelCellSchema).max(OFFICE_ARTIFACT_MAX_SELECTED_CELLS),
  })
  .strict();
const officeSelectionSchema = z.discriminatedUnion('kind', [officeWordSelectionSchema, officeExcelSelectionSchema]);
const officeEditSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('replaceText'), value: textSchema }).strict(),
  z
    .object({
      kind: z.literal('formatText'),
      property: z.enum(['bold', 'italic', 'underline']),
      enabled: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal('setCell'), input: textSchema }).strict(),
]);
const officeInspectRequestSchema = z
  .object({
    ...officeArtifactRequestShape,
    expectedVersion: identifierSchema,
    selection: officeSelectionSchema,
  })
  .strict();

// Project-knowledge ids are interpolated into filesystem paths by the main
// process, so restrict them to characters that cannot traverse or escape.
const safeIdSchema = z
  .string()
  .min(1)
  .max(MAX_IDENTIFIER_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/);

const projectKnowledgeProjectIdSchema = z.object({ projectId: safeIdSchema }).strict();
const projectKnowledgeSourceRefSchema = z.object({ projectId: safeIdSchema, sourceId: safeIdSchema }).strict();
const projectKnowledgeFolderSchema = z.object({ projectId: safeIdSchema, workspace: pathSchema }).strict();
const presentationUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const presentationRevisionSchema = z
  .number()
  .finite()
  .int()
  .nonnegative()
  .refine((value) => Number.isSafeInteger(value));
const presentationGrantOwnerSchema = z.discriminatedUnion('owner_type', [
  z.object({ owner_type: z.literal('draft'), draft_id: presentationUuidSchema }).strict(),
  z.object({ owner_type: z.literal('conversation'), conversation_id: presentationUuidSchema }).strict(),
]);
const presentationRelativePathSchema = z
  .string()
  .min(1)
  .max(MAX_PATH_LENGTH)
  .refine((value) => {
    if (
      value.includes('\0') ||
      value.includes('\\') ||
      value.startsWith('/') ||
      /^[A-Za-z]:/.test(value) ||
      value.endsWith('/')
    ) {
      return false;
    }

    const segments = value.split('/');
    return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
  });
const presentationSha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const presentationTemplateIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]+$/);
const presentationSourceRefSchema = z
  .object({
    grantId: presentationUuidSchema,
    expectedByteLength: z.number().finite().int().min(1).max(PRESENTATION_RUN_LIMITS.MAX_SOURCE_BYTES),
    expectedSha256: presentationSha256Schema,
  })
  .strict();
const startPresentationRunSchema = z
  .object({
    conversation_id: presentationUuidSchema,
    client_request_id: presentationUuidSchema,
    input: z
      .string()
      .min(1)
      .max(PRESENTATION_RUN_LIMITS.MAX_EXTRACTED_CHARS_PER_SOURCE)
      .refine((value) => value.trim().length > 0),
    selected_template_id: presentationTemplateIdSchema,
    sources: z.array(presentationSourceRefSchema).max(PRESENTATION_RUN_LIMITS.MAX_SOURCES_PER_RUN),
  })
  .strict()
  .superRefine((request, context) => {
    const grantIds = new Set(request.sources.map(({ grantId }) => grantId.toLowerCase()));
    const totalBytes = request.sources.reduce((total, source) => total + source.expectedByteLength, 0);
    if (grantIds.size !== request.sources.length)
      context.addIssue({ code: 'custom', message: 'duplicate source grant' });
    if (totalBytes > PRESENTATION_RUN_LIMITS.MAX_TOTAL_SOURCE_BYTES) {
      context.addIssue({ code: 'custom', message: 'aggregate source bytes exceeded' });
    }
  });
const getPresentationRunSchema = z.union([
  z.object({ conversation_id: presentationUuidSchema, run_id: presentationUuidSchema }).strict(),
  z.object({ conversation_id: presentationUuidSchema, client_request_id: presentationUuidSchema }).strict(),
]);
const presentationRecoveryCursorSchema = z
  .string()
  .min(3)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

export const INVALID_NATIVE_BRIDGE_PAYLOAD_MESSAGE = '[adapter] Native IPC request rejected: invalid operation payload';

export const nativeBridgePayloadSchemas = {
  'restart-app': voidPayloadSchema,
  'open-dev-tools': voidPayloadSchema,
  'is-dev-tools-opened': voidPayloadSchema,
  'app.get-path': z.object({ name: z.enum(['desktop', 'home', 'downloads']) }).strict(),
  'update-system-info': z.object({ cacheDir: pathSchema, workDir: pathSchema, logDir: pathSchema.optional() }).strict(),
  'app.get-zoom-factor': voidPayloadSchema,
  'app.set-zoom-factor': z.object({ factor: z.number().finite().min(0.8).max(1.3) }).strict(),
  'app.get-cdp-status': voidPayloadSchema,
  'app.update-cdp-config': z.object({ enabled: z.boolean().optional(), port: portSchema.optional() }).strict(),
  'app.get-start-on-boot-status': voidPayloadSchema,
  'app.set-start-on-boot': booleanSettingSchema,
  'app.get-gpu-status': voidPayloadSchema,
  'app.set-gpu-override': z.object({ override: z.enum(['force-on', 'force-off']).nullable() }).strict(),
  'app.write-renderer-log': z
    .object({
      level: z.enum(['debug', 'info', 'warn', 'error']),
      tag: z.string().min(1).max(128),
      message: textSchema,
      data: z.unknown().optional(),
    })
    .strict(),
  'update.check': z
    .object({
      includePrerelease: z.boolean().optional(),
      repo: z
        .string()
        .min(3)
        .max(200)
        .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
        .optional(),
    })
    .strict(),
  'update.installer-last-failure.consume': voidPayloadSchema,
  'update.download': z
    .object({
      downloadId: identifierSchema.optional(),
      url: urlSchema,
      fallbackUrl: urlSchema.optional(),
      file_name: z.string().min(1).max(255).optional(),
    })
    .strict(),
  'update.download.cancel': z.object({ downloadId: identifierSchema }).strict(),
  'auto-update.check': z.object({ includePrerelease: z.boolean().optional() }).strict(),
  'auto-update.restore-downloaded': voidPayloadSchema,
  'auto-update.download': voidPayloadSchema,
  'auto-update.download.cancel': voidPayloadSchema,
  'auto-update.quit-and-install': voidPayloadSchema,
  'show-open': z
    .object({
      defaultPath: pathSchema.optional(),
      properties: z.array(dialogPropertySchema).max(9).optional(),
      filters: z.array(dialogFilterSchema).max(32).optional(),
    })
    .strict()
    .optional(),
  'presentation-templates.list': voidPayloadSchema,
  'presentation-templates.import-spec': z.object({ file_path: pathSchema }).strict(),
  'presentation-templates.remove': z.object({ id: identifierSchema }).strict(),
  'presentation-templates.scratch.allocate': z
    .object({ conversation_id: identifierSchema, template_id: identifierSchema })
    .strict(),
  'presentation-templates.scratch.complete': z.object({ run_id: z.string().uuid() }).strict(),
  'presentation-templates.scratch.retain': z
    .object({ run_id: z.string().uuid(), reason: z.enum(['failed', 'interrupted']) })
    .strict(),
  'presentation-templates.scratch.discard': z.object({ run_id: z.string().uuid() }).strict(),
  'presentation-sources.get-source-owner': z.object({ owner: presentationGrantOwnerSchema }).strict(),
  'presentation-sources.create-draft': z.object({ client_request_id: presentationUuidSchema }).strict(),
  'presentation-sources.bind-draft': z
    .object({
      draft_id: presentationUuidSchema,
      conversation_id: presentationUuidSchema,
      expected_revision: presentationRevisionSchema,
    })
    .strict(),
  'presentation-sources.pick-sources': z
    .object({ owner: presentationGrantOwnerSchema, expected_owner_revision: presentationRevisionSchema })
    .strict(),
  'presentation-sources.grant-workspace-source': z
    .object({
      conversation_id: presentationUuidSchema,
      relative_path: presentationRelativePathSchema,
      expected_owner_revision: presentationRevisionSchema,
    })
    .strict(),
  'presentation-sources.revoke': z
    .object({
      owner: presentationGrantOwnerSchema,
      grant_id: presentationUuidSchema,
      expected_owner_revision: presentationRevisionSchema,
    })
    .strict(),
  'presentation-runs.start': startPresentationRunSchema,
  'presentation-runs.get': getPresentationRunSchema,
  'presentation-runs.list-recoverable': z
    .object({
      conversation_id: presentationUuidSchema,
      cursor: presentationRecoveryCursorSchema.optional(),
      limit: z
        .number()
        .finite()
        .int()
        .min(PRESENTATION_RUN_LIMITS.RECOVERABLE_LIST_MIN_LIMIT)
        .max(PRESENTATION_RUN_LIMITS.RECOVERABLE_LIST_MAX_LIMIT)
        .optional(),
    })
    .strict(),
  'presentation-runs.open-recovery': z
    .object({
      conversation_id: presentationUuidSchema,
      run_id: presentationUuidSchema,
      expected_sha256: presentationSha256Schema,
    })
    .strict(),
  'presentation-runs.discard': z
    .object({
      conversation_id: presentationUuidSchema,
      run_id: presentationUuidSchema,
      expected_revision: presentationRevisionSchema,
    })
    .strict(),
  'presentation-runs.claim-initial-dispatch': z
    .object({
      conversation_id: presentationUuidSchema,
      run_id: presentationUuidSchema,
      holder_id: presentationUuidSchema,
      expected_revision: presentationRevisionSchema,
    })
    .strict(),
  'presentation-runs.renew-initial-dispatch': z
    .object({
      conversation_id: presentationUuidSchema,
      run_id: presentationUuidSchema,
      lease_token: z
        .string()
        .min(32)
        .max(256)
        .regex(/^[A-Za-z0-9_-]+$/),
      expected_revision: presentationRevisionSchema,
    })
    .strict(),
  'presentation-runs.dispatch': z
    .object({
      conversation_id: presentationUuidSchema,
      run_id: presentationUuidSchema,
      lease_token: z
        .string()
        .min(32)
        .max(256)
        .regex(/^[A-Za-z0-9_-]+$/),
      expected_revision: presentationRevisionSchema,
    })
    .strict(),
  'app-operations.context-compact': appOperationsContextCompactSchema,
  'app-operations.cancel': z.object({ operation_id: identifierSchema }).strict(),
  'project-knowledge.list-sources': projectKnowledgeProjectIdSchema,
  'project-knowledge.add-sources': z
    .object({
      projectId: safeIdSchema,
      filePaths: z.array(pathSchema).max(MAX_PROJECT_KB_FILE_PATHS),
      workspace: pathSchema,
    })
    .strict(),
  'project-knowledge.remove-source': z
    .object({ projectId: safeIdSchema, sourceId: safeIdSchema, workspace: pathSchema })
    .strict(),
  'project-knowledge.get-source-text': projectKnowledgeSourceRefSchema,
  'project-knowledge.retry-source': z
    .object({ projectId: safeIdSchema, sourceId: safeIdSchema, workspace: pathSchema })
    .strict(),
  'project-knowledge.sync-folder': projectKnowledgeFolderSchema,
  'project-knowledge.watch-folder': projectKnowledgeFolderSchema,
  'project-knowledge.unwatch-folder': projectKnowledgeProjectIdSchema,
  'project-knowledge.remove-store': projectKnowledgeProjectIdSchema,
  'project-knowledge.get-session-mcp-server': projectKnowledgeProjectIdSchema,
  'office-artifact.get-state': z.object(officeArtifactRequestShape).strict(),
  'office-artifact.prepare-preview': z.object(officeArtifactRequestShape).strict(),
  'office-artifact.start-preview': z.object({ leaseId: identifierSchema, url: urlSchema.optional() }).strict(),
  'office-artifact.release-preview': z.object({ leaseId: identifierSchema }).strict(),
  'office-artifact.inspect': officeInspectRequestSchema,
  'office-artifact.apply': z
    .object({
      ...officeArtifactRequestShape,
      expectedVersion: identifierSchema,
      selection: officeSelectionSchema,
      edit: officeEditSchema,
    })
    .strict(),
  'office-artifact.undo': z.object({ ...officeArtifactRequestShape, expectedVersion: identifierSchema }).strict(),
  'window-controls:minimize': voidPayloadSchema,
  'window-controls:maximize': voidPayloadSchema,
  'window-controls:unmaximize': voidPayloadSchema,
  'window-controls:close': voidPayloadSchema,
  'window-controls:is-maximized': voidPayloadSchema,
  'theme:set-active': themeSchema,
  'theme:request-current': voidPayloadSchema,
  'system-settings:get-close-to-tray': voidPayloadSchema,
  'system-settings:set-close-to-tray': booleanSettingSchema,
  'system-settings:get-pet-enabled': voidPayloadSchema,
  'system-settings:set-pet-enabled': booleanSettingSchema,
  'system-settings:get-pet-size': voidPayloadSchema,
  'system-settings:set-pet-size': z
    .object({ size: z.union([z.literal(200), z.literal(280), z.literal(360)]) })
    .strict(),
  'system-settings:get-pet-dnd': voidPayloadSchema,
  'system-settings:set-pet-dnd': z.object({ dnd: z.boolean() }).strict(),
  'system-settings:get-pet-confirm-enabled': voidPayloadSchema,
  'system-settings:set-pet-confirm-enabled': booleanSettingSchema,
  'notification.show': z
    .object({
      title: shortTextSchema,
      body: z.string().max(4096),
      icon: pathSchema.optional(),
      conversation_id: identifierSchema.optional(),
    })
    .strict(),
  'webui.get-status': voidPayloadSchema,
  'webui.start': z.object({ port: portSchema.optional(), allowRemote: z.boolean().optional() }).strict(),
  'webui.stop': voidPayloadSchema,
} satisfies Record<NativeBridgeProviderKey, z.ZodTypeAny>;

export function parseNativeBridgePayload(providerKey: NativeBridgeProviderKey, payload: unknown): unknown {
  const result = nativeBridgePayloadSchemas[providerKey].safeParse(payload);
  if (!result.success) {
    throw new Error(INVALID_NATIVE_BRIDGE_PAYLOAD_MESSAGE);
  }
  return result.data;
}
