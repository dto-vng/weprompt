/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { tmpdir } from 'node:os';
import { app } from 'electron';
import { ipcBridge } from '@/common';
import { BUILTIN_TEMPLATE_PACKS } from '@process/resources/presentation-templates/index';
import { PresentationTemplateService } from './PresentationTemplateService';
import { ArtifactScratchService } from './ArtifactScratchService';

let service: PresentationTemplateService | null = null;
let artifactScratchService: ArtifactScratchService | null = null;

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
}
