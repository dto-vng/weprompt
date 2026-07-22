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
  }, [mutate, t]);

  const removeTemplate = useCallback(
    async (id: string) => {
      await ipcBridge.presentationTemplates.remove.invoke({ id });
      setSelectedTemplate((current) => (current?.manifest.id === id ? null : current));
      await mutate();
    },
    [mutate]
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
