/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';
import { composePresentationSend } from './directive';

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
export function usePresentationTemplates() {
  const { t } = useTranslation();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PresentationTemplateSummary | null>(null);

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

  const composeSend = useCallback(
    (message: string, files: string[]) =>
      selectedTemplate
        ? composePresentationSend(selectedTemplate, message, files)
        : { input: message, files, injectSkills: [] as string[] },
    [selectedTemplate]
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
    composeSend,
  };
}
