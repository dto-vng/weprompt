/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createElement, useCallback, useRef, useState } from 'react';
import useSWR from 'swr';
import { Button, Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type {
  ArtifactScratchAllocation,
  PresentationTemplateFormat,
  PresentationTemplateSummary,
} from '@/common/types/office/presentationTemplate';
import { composePresentationSend } from './directive';
import { useAddEventListener } from '@/renderer/utils/emitter';

export type PresentationRunEligibilityInput = {
  featureEnabled: boolean;
  isDesktop: boolean;
  scope: 'individual' | 'team' | 'unknown';
  runtime: string | null;
  templateFormat: PresentationTemplateFormat | null;
};

/**
 * Renderer-only UX hint for the managed presentation path.
 *
 * Main remains authoritative for feature enablement, runtime, ownership, and
 * source grants. Keep this helper path-free so its result cannot be mistaken
 * for authority to start a run.
 */
export function getPresentationRunEligibility(input: PresentationRunEligibilityInput): boolean {
  return (
    input.featureEnabled &&
    input.isDesktop &&
    input.scope === 'individual' &&
    (input.runtime === 'aionrs' || input.runtime === 'acp') &&
    input.templateFormat === 'pptx'
  );
}

/**
 * Display name + description for a template.
 *
 * Built-in packs carry English strings in their manifest (the canonical source
 * lives in process/resources/presentation-templates), so the catalog under
 * `conversation.presentationTemplates.catalog.<id>` supplies the localized
 * copy. User-imported templates are the user's own content and cannot be
 * pre-translated, so they always fall back to the manifest — as does any
 * built-in whose id is missing from the catalog.
 *
 * Lives here rather than in its own module because this directory already sits
 * at the 10-child limit from the architecture guide.
 */
export function useTemplateLabels() {
  const { t } = useTranslation();
  return useCallback(
    (template: PresentationTemplateSummary) => {
      const { id, name, description, source } = template.manifest;
      if (source !== 'builtin') return { name, description };
      const key = `conversation.presentationTemplates.catalog.${id}`;
      return {
        name: t(`${key}.name`, { defaultValue: name }),
        description: t(`${key}.description`, { defaultValue: description }),
      };
    },
    [t]
  );
}

/**
 * Owns all state for the presentation template gallery: the fetched template
 * list (via SWR), gallery open/close, the currently selected template, and
 * the import/remove actions. Consumed by the SendBox area to render the
 * toolbar button + gallery panel and to compose outgoing messages.
 */
export function usePresentationTemplates(conversationId?: string) {
  const { t } = useTranslation();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PresentationTemplateSummary | null>(null);
  const scratchRunByTurnRef = useRef(new Map<string, string>());

  const {
    data: templates,
    isLoading,
    mutate,
  } = useSWR('presentation-templates', () => ipcBridge.presentationTemplates.list.invoke());

  const openGallery = useCallback(() => setGalleryOpen(true), []);
  const closeGallery = useCallback(() => setGalleryOpen(false), []);
  const toggleGallery = useCallback(() => setGalleryOpen((open) => !open), []);

  const selectTemplate = useCallback((template: PresentationTemplateSummary) => {
    setSelectedTemplate(template);
    setGalleryOpen(false);
  }, []);

  const clearSelection = useCallback(() => setSelectedTemplate(null), []);

  const importFromDialog = useCallback(async () => {
    try {
      const paths = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openFile'],
        filters: [{ name: 'Theme spec', extensions: ['md'] }],
      });
      const filePath = paths?.[0];
      if (!filePath) return;
      const result = await ipcBridge.presentationTemplates.importSpec.invoke({ file_path: filePath });
      if (result.ok) {
        Message.success(t('conversation.presentationTemplates.importSuccess'));
        await mutate();
      } else if ('error' in result) {
        // `else if` (rather than plain `else`) so the discriminated union narrows
        // correctly under this project's tsconfig, which does not set
        // strictNullChecks — negating a boolean-literal discriminant alone does
        // not narrow the other branch without it.
        Message.error(t('conversation.presentationTemplates.importError', { error: result.error }));
      }
    } catch (error) {
      Message.error(t('conversation.presentationTemplates.importError', { error: String(error) }));
    }
  }, [mutate, t]);

  const removeTemplate = useCallback(
    async (id: string) => {
      try {
        await ipcBridge.presentationTemplates.remove.invoke({ id });
        setSelectedTemplate((current) => (current?.manifest.id === id ? null : current));
        await mutate();
      } catch (error) {
        Message.error(t('conversation.presentationTemplates.removeError', { error: String(error) }));
      }
    },
    [mutate, t]
  );

  const prepareScratch = useCallback(
    async (targetConversationId: string): Promise<ArtifactScratchAllocation | undefined> => {
      if (!selectedTemplate?.referencePath || !['pptx', 'docx'].includes(selectedTemplate.manifest.format)) {
        return undefined;
      }
      try {
        return await ipcBridge.presentationTemplates.allocateScratch.invoke({
          conversation_id: targetConversationId,
          template_id: selectedTemplate.manifest.id,
        });
      } catch (error) {
        Message.error(t('conversation.presentationTemplates.scratch.prepareError', { error: String(error) }));
        throw error;
      }
    },
    [selectedTemplate, t]
  );

  const composeSend = useCallback(
    (message: string, files: string[], scratch?: ArtifactScratchAllocation) =>
      selectedTemplate
        ? composePresentationSend(selectedTemplate, message, files, scratch)
        : { input: message, files, injectSkills: [] as string[] },
    [selectedTemplate]
  );

  const discardScratch = useCallback(
    async (runId: string): Promise<void> => {
      try {
        await ipcBridge.presentationTemplates.discardScratch.invoke({ run_id: runId });
        Message.success(t('conversation.presentationTemplates.scratch.cleanupSuccess'));
      } catch (error) {
        Message.error(t('conversation.presentationTemplates.scratch.cleanupError', { error: String(error) }));
      }
    },
    [t]
  );

  const showRetainedScratch = useCallback(
    (runId: string, directory: string): void => {
      Message.warning({
        duration: 0,
        closable: true,
        content: createElement(
          'span',
          null,
          t('conversation.presentationTemplates.scratch.retained', { path: directory }),
          createElement(
            Button,
            {
              size: 'mini',
              type: 'text',
              className: 'ml-8px',
              onClick: () => void discardScratch(runId),
            },
            t('conversation.presentationTemplates.scratch.cleanup')
          )
        ),
      });
    },
    [discardScratch, t]
  );

  const registerScratchTurn = useCallback((turnId: string | undefined, runId: string | undefined): void => {
    if (!turnId || !runId) return;
    scratchRunByTurnRef.current.set(turnId, runId);
  }, []);

  const retainScratchRun = useCallback(
    async (runId: string | undefined, reason: 'failed' | 'interrupted'): Promise<void> => {
      if (!runId) return;
      const result = await ipcBridge.presentationTemplates.retainScratch.invoke({ run_id: runId, reason });
      if (result.status === 'retained') showRetainedScratch(runId, result.directory);
    },
    [showRetainedScratch]
  );

  const handleScratchTerminal = useCallback(
    async (event: { turnId?: string; outcome: 'completed' | 'failed' }): Promise<void> => {
      if (!event.turnId) return;
      const runId = scratchRunByTurnRef.current.get(event.turnId);
      if (!runId) return;
      scratchRunByTurnRef.current.delete(event.turnId);

      if (event.outcome === 'failed') {
        await retainScratchRun(runId, 'failed');
        return;
      }

      const result = await ipcBridge.presentationTemplates.completeScratch.invoke({ run_id: runId });
      if (result.status === 'retained') showRetainedScratch(runId, result.directory);
    },
    [retainScratchRun, showRetainedScratch]
  );

  const interruptScratchTurn = useCallback(
    async (turnId: string | null): Promise<void> => {
      if (!turnId) return;
      const runId = scratchRunByTurnRef.current.get(turnId);
      if (!runId) return;
      scratchRunByTurnRef.current.delete(turnId);
      await retainScratchRun(runId, 'interrupted');
    },
    [retainScratchRun]
  );

  useAddEventListener(
    'artifact.scratch.terminal',
    (event) => {
      if (event.conversationId !== conversationId) return;
      void handleScratchTerminal(event);
    },
    [conversationId, handleScratchTerminal]
  );

  return {
    templates: templates ?? [],
    templatesLoading: isLoading,
    galleryOpen,
    openGallery,
    closeGallery,
    toggleGallery,
    selectedTemplate,
    selectTemplate,
    clearSelection,
    importFromDialog,
    removeTemplate,
    prepareScratch,
    composeSend,
    registerScratchTurn,
    retainScratchRun,
    handleScratchTerminal,
    interruptScratchTurn,
    discardScratch,
  };
}
