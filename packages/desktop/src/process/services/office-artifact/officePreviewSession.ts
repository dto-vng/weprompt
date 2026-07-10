/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { session } from 'electron';

import { OFFICE_PREVIEW_PARTITION } from '@/common/types/office/artifactEditor';

const LOCAL_SCHEMES = new Set(['file:', 'data:', 'blob:']);
const LOOPBACK_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

let isInstalled = false;

export function isAllowedOfficePreviewRequest(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (LOCAL_SCHEMES.has(parsed.protocol)) return true;
    return LOOPBACK_SCHEMES.has(parsed.protocol) && LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function installOfficePreviewSession(): void {
  if (isInstalled) return;

  const officeSession = session.fromPartition(OFFICE_PREVIEW_PARTITION);
  officeSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedOfficePreviewRequest(details.url) });
  });
  isInstalled = true;
}
