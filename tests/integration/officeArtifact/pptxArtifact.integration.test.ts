/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createOfficeArtifactIntegrationContext,
  resolveOfficeCliPath,
  type OfficeArtifactIntegrationContext,
} from './helpers';

const officeCliPath = resolveOfficeCliPath();
const presentationFixture = resolve('packages/desktop/resources/presentation-templates/business-review.pptx');

describe.skipIf(officeCliPath === undefined)('OfficeArtifactService real PPTX preview integration', () => {
  let context: OfficeArtifactIntegrationContext | undefined;

  afterEach(async () => {
    try {
      await context?.cleanup();
    } finally {
      context = undefined;
    }
  });

  it('renders the saved presentation as soon as its preview starts', async () => {
    if (!officeCliPath) throw new Error('OfficeCLI path was not resolved');
    context = await createOfficeArtifactIntegrationContext(officeCliPath);
    const filePath = join(context.workspace, 'completed.pptx');
    await copyFile(presentationFixture, filePath);

    const prepared = await context.service.preparePreview({ workspace: context.workspace, filePath });
    if (prepared.ok === false) throw new Error(`Preview preparation failed: ${prepared.code}`);
    const started = await context.service.startPreview({ leaseId: prepared.leaseId });
    if (started.ok === false) throw new Error(`Preview start failed: ${started.code}`);

    const response = await fetch(started.url);
    const html = await response.text();

    expect(response.ok).toBe(true);
    expect(html).toContain('Q3 FY26 Business Review');
    expect(html).not.toContain('Waiting for first update');
  }, 60_000);

  it('rejects a malformed presentation without starting a preview server', async () => {
    if (!officeCliPath) throw new Error('OfficeCLI path was not resolved');
    context = await createOfficeArtifactIntegrationContext(officeCliPath);
    const filePath = join(context.workspace, 'malformed.pptx');
    await writeFile(filePath, 'not an Open XML presentation');

    await expect(context.service.preparePreview({ workspace: context.workspace, filePath })).resolves.toEqual({
      ok: false,
      code: 'INVALID_OFFICE_ARTIFACT',
    });
  }, 60_000);
});
