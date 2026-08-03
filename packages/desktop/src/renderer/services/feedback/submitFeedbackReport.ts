import type {
  FeedbackScreenshotAttachment,
  LocalFeedbackDiagnosticExportInput,
  LocalFeedbackDiagnosticExportResult,
} from '@/common/types/platform/electron';

const LOG_PREFIX = '[FeedbackReport]';

export type FeedbackAttachment = {
  contentType: 'image/jpeg' | 'image/png';
  data: Uint8Array<ArrayBuffer>;
  filename: string;
};

export type FeedbackEventTags = Record<string, string>;
export type SubmitFeedbackReportResult = LocalFeedbackDiagnosticExportResult;

export type SubmitFeedbackReportInput = {
  attachments?: FeedbackAttachment[];
  collectLogs?: boolean;
  description: string;
  module: string;
  moduleLabel: string;
  tags?: FeedbackEventTags;
};

function logFeedbackEvent(event: 'local-export-cancelled' | 'local-export-failed' | 'local-export-saved'): void {
  if (event === 'local-export-failed') {
    console.error(`${LOG_PREFIX} ${event}`);
  } else if (event === 'local-export-cancelled') {
    console.warn(`${LOG_PREFIX} ${event}`);
  } else {
    console.info(`${LOG_PREFIX} ${event}`);
  }
}

function toBridgeScreenshot(attachment: FeedbackAttachment): FeedbackScreenshotAttachment {
  return {
    contentType: attachment.contentType,
    data: Array.from(attachment.data),
    filename: attachment.filename,
  };
}

function buildLocalExportInput(input: SubmitFeedbackReportInput): LocalFeedbackDiagnosticExportInput {
  return {
    collectLogs: input.collectLogs === true,
    description: input.description.trim(),
    module: input.module.trim(),
    moduleLabel: input.moduleLabel.trim(),
    screenshots: (input.attachments ?? []).map(toBridgeScreenshot),
    tags: input.tags,
  };
}

/**
 * Ask Electron to save a local-only diagnostic archive. No report data is
 * uploaded; the main process validates, bounds, and packages the request.
 */
export async function submitFeedbackReport(input: SubmitFeedbackReportInput): Promise<SubmitFeedbackReportResult> {
  try {
    const electronAPI = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!electronAPI?.exportLocalFeedbackDiagnostics) {
      logFeedbackEvent('local-export-failed');
      return { status: 'failed' };
    }

    const result = await electronAPI.exportLocalFeedbackDiagnostics(buildLocalExportInput(input));
    logFeedbackEvent(`local-export-${result.status}`);
    return result;
  } catch {
    logFeedbackEvent('local-export-failed');
    return { status: 'failed' };
  }
}
