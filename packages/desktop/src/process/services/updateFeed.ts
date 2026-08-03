/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CdnGenericProvider } from './cdnGenericProvider';
import type { CdnGenericProviderConfiguration } from './cdnGenericProvider';
import { getConfiguredUpdateBaseUrl } from '@/common/update/updatePolicy';

export type CdnFeedOptions = CdnGenericProviderConfiguration & {
  updateProvider: typeof CdnGenericProvider;
};

export function buildCdnFeedOptions(updateBaseUrl = getConfiguredUpdateBaseUrl()): CdnFeedOptions {
  if (!updateBaseUrl) {
    throw new Error('updates-disabled');
  }

  return {
    provider: 'custom',
    url: updateBaseUrl,
    updateProvider: CdnGenericProvider,
  };
}
