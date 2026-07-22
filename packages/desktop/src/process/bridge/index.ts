/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initApplicationBridge } from './applicationBridge';
import { initDialogBridge } from './dialogBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWebuiBridge } from './webuiBridge';
import { initThemeBridge } from './themeBridge';
import { ipcBridge } from '@/common';
import { runContextCompact } from '@process/services/appOperations';

type AppOperationsBridgeDependencies = {
  runContextCompact: typeof runContextCompact;
};

const defaultAppOperationsBridgeDependencies: AppOperationsBridgeDependencies = {
  runContextCompact,
};

export function initAppOperationsBridge(
  dependencies: AppOperationsBridgeDependencies = defaultAppOperationsBridgeDependencies
): void {
  const controllers = new Map<string, AbortController>();

  ipcBridge.appOperations.contextCompact.provider(async ({ operation_id, ...input }) => {
    const controller = new AbortController();
    controllers.set(operation_id, controller);
    try {
      return await dependencies.runContextCompact(input, { signal: controller.signal });
    } finally {
      if (controllers.get(operation_id) === controller) {
        controllers.delete(operation_id);
      }
    }
  });

  ipcBridge.appOperations.cancel.provider(async ({ operation_id }) => {
    controllers.get(operation_id)?.abort();
  });
}

export type BridgeDependencies = Record<string, never>;

export function initAllBridges(_deps: BridgeDependencies = {}): void {
  initDialogBridge();
  initApplicationBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initWebuiBridge();
  initThemeBridge();
  initAppOperationsBridge();
}

export {
  initApplicationBridge,
  initDialogBridge,
  initNotificationBridge,
  initSystemSettingsBridge,
  initThemeBridge,
  initUpdateBridge,
  initWindowControlsBridge,
  initWebuiBridge,
};
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
