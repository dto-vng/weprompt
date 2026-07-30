/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { app } from 'electron';
import { ipcBridge } from '@/common';
import { BUILTIN_DASHBOARD_PACKS } from '@process/resources/dashboard-templates/index';
import { DashboardStoreService } from './DashboardStoreService';

let service: DashboardStoreService | null = null;

const getService = (): DashboardStoreService => {
  service ??= new DashboardStoreService({
    rootDir: path.join(app.getPath('userData'), 'dashboards'),
    builtinPacks: BUILTIN_DASHBOARD_PACKS,
  });
  return service;
};

export function initDashboardBridge(): void {
  ipcBridge.dashboards.list.provider(() => getService().list());
  ipcBridge.dashboards.read.provider(({ id }) => getService().read(id));
  ipcBridge.dashboards.publish.provider(async ({ name, html }) => {
    try {
      return { ok: true as const, dashboard: await getService().publish({ name, html }) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcBridge.dashboards.remove.provider(({ id }) => getService().remove(id));
}
