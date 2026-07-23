/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { app } from 'electron';
import { ipcBridge } from '@/common';
import { BUILTIN_TEMPLATE_PACKS } from '@process/resources/presentation-templates/index';
import { PresentationTemplateService } from './PresentationTemplateService';

let service: PresentationTemplateService | null = null;

const getService = (): PresentationTemplateService => {
  service ??= new PresentationTemplateService({
    rootDir: path.join(app.getPath('userData'), 'presentation-templates'),
    builtinPacks: BUILTIN_TEMPLATE_PACKS,
  });
  return service;
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
}
