/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { app, dialog, ipcMain } from 'electron';
import * as path from 'node:path';
import type {
  LocalFeedbackDiagnosticExportInput,
  LocalFeedbackDiagnosticExportResult,
} from '@/common/types/platform/electron';
import {
  buildLocalDiagnosticArchive,
  createDiagnosticFilename,
  validateLocalDiagnosticExportInput,
  writeArchiveAtomically,
} from '../feedback/localExport';

let mainWindowRef: BrowserWindow | null = null;
let trustedApplicationDocuments = new Set<string>();
let handlersRegistered = false;

function normalizeApplicationDocumentUrl(documentUrl: string): string | null {
  try {
    const normalizedUrl = new URL(documentUrl);
    normalizedUrl.hash = '';
    return normalizedUrl.href;
  } catch {
    return null;
  }
}

function isAuthorizedMainWindowSender(event: IpcMainInvokeEvent): boolean {
  if (!mainWindowRef || mainWindowRef.isDestroyed() || mainWindowRef.webContents.isDestroyed()) {
    return false;
  }

  const boundWebContents = mainWindowRef.webContents;
  if (event.sender !== boundWebContents || event.senderFrame !== boundWebContents.mainFrame) {
    return false;
  }

  const senderDocument = normalizeApplicationDocumentUrl(event.senderFrame.url);
  return senderDocument !== null && trustedApplicationDocuments.has(senderDocument);
}

async function exportLocalDiagnostics(
  event: IpcMainInvokeEvent,
  input: unknown
): Promise<LocalFeedbackDiagnosticExportResult> {
  if (!isAuthorizedMainWindowSender(event)) {
    return { status: 'failed' };
  }

  try {
    const normalizedInput = input as LocalFeedbackDiagnosticExportInput;
    validateLocalDiagnosticExportInput(input);
    const result = await dialog.showSaveDialog(mainWindowRef!, {
      defaultPath: path.join(app.getPath('downloads'), createDiagnosticFilename()),
    });
    if (result.canceled) return { status: 'cancelled' };
    if (!result.filePath) return { status: 'failed' };

    const archive = await buildLocalDiagnosticArchive(normalizedInput);
    await writeArchiveAtomically(result.filePath, archive);
    return { path: result.filePath, status: 'saved' };
  } catch {
    console.error('[feedbackBridge] local-export-failed');
    return { status: 'failed' };
  }
}

async function captureScreenshot(event: IpcMainInvokeEvent) {
  if (!isAuthorizedMainWindowSender(event) || !mainWindowRef) {
    return null;
  }

  try {
    const image = await mainWindowRef.webContents.capturePage();
    const png = image.toPNG();
    if (!png || png.length === 0) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `screenshot-${timestamp}.png`,
      data: Array.from(png),
    };
  } catch {
    console.error('[feedbackBridge] screenshot-capture-failed');
    return null;
  }
}

/**
 * Bind feedback IPC to the exact application main window. Rebinding updates the
 * authorized sender when Electron recreates the window, while handlers remain
 * registered exactly once for the process lifetime.
 */
export function initializeFeedbackBridge(mainWindow: BrowserWindow, trustedRendererDocuments: Iterable<string>): void {
  mainWindowRef = mainWindow;
  trustedApplicationDocuments = new Set(
    [...trustedRendererDocuments]
      .map(normalizeApplicationDocumentUrl)
      .filter((documentUrl): documentUrl is string => documentUrl !== null)
  );
  if (handlersRegistered) return;

  ipcMain.handle('feedback:export-local', exportLocalDiagnostics);
  ipcMain.handle('feedback:capture-screenshot', captureScreenshot);
  handlersRegistered = true;
}
