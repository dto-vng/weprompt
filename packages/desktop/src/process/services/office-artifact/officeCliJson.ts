/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OfficeArtifactErrorCode } from '@/common/types/office/artifactEditor';

export class OfficeArtifactError extends Error {
  readonly code: OfficeArtifactErrorCode;

  constructor(code: OfficeArtifactErrorCode) {
    super(code);
    this.name = 'OfficeArtifactError';
    this.code = code;
  }
}

type OfficeCliEnvelope = {
  success: boolean;
  data?: unknown;
};

function isOfficeCliEnvelope(value: unknown): value is OfficeCliEnvelope {
  return typeof value === 'object' && value !== null && 'success' in value && typeof value.success === 'boolean';
}

export function parseOfficeCliEnvelope<T = unknown>(output: string): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    throw new OfficeArtifactError('OFFICECLI_FAILED');
  }

  if (!isOfficeCliEnvelope(parsed) || !parsed.success) {
    throw new OfficeArtifactError('OFFICECLI_FAILED');
  }

  return parsed.data as T;
}
