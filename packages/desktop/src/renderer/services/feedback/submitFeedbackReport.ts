import { httpRequest } from '@/common/adapter/httpBridge';
import type {
  FeedbackDiagnosticAttachment,
  LocalFeedbackDiagnosticExportInput,
  LocalFeedbackDiagnosticExportResult,
} from '@/common/types/platform/electron';
import type { FeedbackDiagnosticsContextInput } from '@/common/types/feedbackDiagnostics';

const LOG_PREFIX = '[FeedbackReport]';
const REDACTED_VALUE = '[redacted]';
const SENSITIVE_KEY =
  /(?:api[_-]?key|auth(?:orization)?|bearer|credential|password|secret|token|prompt|conversation(?:[_-]?(?:body|content|message))?|(?:raw|provider)[_-]?error|stack)/i;
const SENSITIVE_TEXT =
  /(?:api[_ -]?key|authorization|bearer|credential|password|secret|(?:^|[^A-Za-z])token(?:[^A-Za-z]|$)|(?:^|[^A-Za-z])prompt(?:[^A-Za-z]|$)|conversation[_ -]+(?:body|content|message)|(?:raw|provider)[_-]?error|stack)/i;
const SENSITIVE_TOKEN_VALUE = /(?:\bsk-[A-Za-z0-9_-]{8,}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b)/;
const SENSITIVE_METADATA_VALUE =
  /(?:\b(?:api[_ -]?key|authorization|credential|password|secret|token)\s*[:=]\s*\S+|\bbearer\s+\S+)/i;

function containsSensitiveText(value: string): boolean {
  return SENSITIVE_TEXT.test(value) || SENSITIVE_TOKEN_VALUE.test(value);
}

function containsSensitiveMetadataValue(value: string): boolean {
  return SENSITIVE_METADATA_VALUE.test(value) || SENSITIVE_TOKEN_VALUE.test(value);
}

type FeedbackLogLevel = 'info' | 'warn' | 'error';
type FeedbackLogAttachmentStatus = 'collected' | 'empty' | 'failed' | 'skipped' | 'unavailable';
type FeedbackDbDiagnosticsAttachmentStatus = 'collected' | 'empty' | 'failed' | 'skipped' | 'unavailable';
type FeedbackDiagnosticsAttachmentPayload = {
  contentType: string;
  data: Uint8Array<ArrayBuffer>;
  filename: string;
};
type JsonValue = JsonValue[] | { [key: string]: JsonValue } | boolean | null | number | string;

export type FeedbackAttachment = {
  contentType: string;
  data: Uint8Array<ArrayBuffer>;
  filename: string;
};

export type FeedbackEventTags = Record<string, string>;
export type FeedbackEventExtra = Record<string, unknown>;
export type SubmitFeedbackReportResult = LocalFeedbackDiagnosticExportResult;

export type SubmitFeedbackReportInput = {
  attachments?: FeedbackAttachment[];
  collectDbDiagnostics?: FeedbackDiagnosticsContextInput;
  collectLogs?: boolean;
  description: string;
  extra?: FeedbackEventExtra;
  module: string;
  moduleLabel: string;
  tags?: FeedbackEventTags;
};

function redactDiagnosticValue(value: unknown, key = ''): JsonValue | undefined {
  if (SENSITIVE_KEY.test(key)) return undefined;
  if (typeof value === 'string') return containsSensitiveText(value) ? REDACTED_VALUE : value;
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => redactDiagnosticValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
  }
  if (typeof value !== 'object') return undefined;

  const record: Record<string, JsonValue> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    const redacted = redactDiagnosticValue(entryValue, entryKey);
    if (redacted !== undefined) record[entryKey] = redacted;
  }
  return record;
}

function normalizeDescription(description: string): string {
  const normalized = description.trim().replace(/\s+/g, ' ');
  return containsSensitiveText(normalized) ? REDACTED_VALUE : normalized;
}

function sanitizeMetadataText(value: string, fallback: string): string {
  const normalized = value.trim();
  return !normalized || containsSensitiveMetadataValue(normalized) ? fallback : normalized;
}

function sanitizeAttachmentFilename(value: string): string {
  const filename = value.split(/[\\/]/).pop()?.trim() ?? '';
  return !filename || containsSensitiveText(filename) ? 'diagnostic-attachment' : filename;
}

function summarizeAttachment(
  attachment: FeedbackAttachment | null,
  status: string
): { filename?: string; size?: number; status: string } {
  if (!attachment) return { status };
  return { filename: sanitizeAttachmentFilename(attachment.filename), size: attachment.data.byteLength, status };
}

export function logFeedbackReport(level: FeedbackLogLevel, message: string, details?: unknown): void {
  const consoleMessage = `${LOG_PREFIX} ${message}`;
  if (level === 'error') {
    console.error(consoleMessage, details);
  } else if (level === 'warn') {
    console.warn(consoleMessage, details);
  } else {
    console.info(consoleMessage, details);
  }

  try {
    window.electronAPI?.logFeedbackEvent?.({ level, message, details });
  } catch {
    // Renderer console logging is the local fallback.
  }
}

async function collectLogAttachment(): Promise<{
  attachment: FeedbackAttachment | null;
  status: FeedbackLogAttachmentStatus;
}> {
  try {
    const electronAPI = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!electronAPI?.collectFeedbackLogs) return { attachment: null, status: 'unavailable' };

    const logData = await electronAPI.collectFeedbackLogs();
    if (!logData) return { attachment: null, status: 'empty' };
    return {
      attachment: {
        contentType: 'application/gzip',
        data: new Uint8Array(logData.data),
        filename: logData.filename,
      },
      status: 'collected',
    };
  } catch {
    return { attachment: null, status: 'failed' };
  }
}

async function collectDbDiagnosticsAttachment(
  request: FeedbackDiagnosticsContextInput
): Promise<{ attachment: FeedbackAttachment | null; status: FeedbackDbDiagnosticsAttachmentStatus }> {
  try {
    if (typeof fetch === 'undefined') return { attachment: null, status: 'unavailable' };

    const diagnostics = await httpRequest<unknown>('GET', buildFeedbackDiagnosticsPath(request), undefined, {
      silentStatuses: [400, 401, 403, 404, 500, 502, 503, 504],
    });
    if (!diagnostics) return { attachment: null, status: 'empty' };
    const payload = await encodeDiagnosticsAttachmentPayload(diagnostics);
    return {
      attachment: {
        contentType: payload.contentType,
        data: payload.data,
        filename: payload.filename,
      },
      status: 'collected',
    };
  } catch {
    return { attachment: null, status: 'failed' };
  }
}

function buildFeedbackDiagnosticsPath(request: FeedbackDiagnosticsContextInput): string {
  const params = new URLSearchParams();
  appendQueryParam(params, 'route_at_open', request.routeAtOpen);
  appendQueryParam(params, 'route_at_submit', request.routeAtSubmit);
  appendQueryParam(params, 'selected_module', request.selectedModule);
  appendQueryParam(params, 'profiles', request.explicitProfiles?.join(','));
  appendQueryParam(params, 'conversation_id', request.explicitContext?.conversationId);
  appendQueryParam(params, 'provider_id', request.explicitContext?.providerId);
  appendQueryParam(params, 'agent_id', request.explicitContext?.agentId);
  appendQueryParam(params, 'team_id', request.explicitContext?.teamId);
  appendQueryParam(params, 'mcp_server_id', request.explicitContext?.mcpServerId);
  const query = params.toString();
  return query ? `/api/system/diagnostics/feedback-report?${query}` : '/api/system/diagnostics/feedback-report';
}

function appendQueryParam(params: URLSearchParams, key: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) params.set(key, trimmed);
}

async function encodeDiagnosticsAttachmentPayload(value: unknown): Promise<FeedbackDiagnosticsAttachmentPayload> {
  const data = new TextEncoder().encode(JSON.stringify(value, null, 2));
  try {
    if (typeof CompressionStream !== 'function') {
      return { contentType: 'application/json', data, filename: 'db-diagnostics.json' };
    }
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'));
    return {
      contentType: 'application/gzip',
      data: new Uint8Array(await new Response(stream).arrayBuffer()),
      filename: 'db-diagnostics.json.gz',
    };
  } catch {
    return { contentType: 'application/json', data, filename: 'db-diagnostics.json' };
  }
}

function toBridgeAttachment(attachment: FeedbackAttachment): FeedbackDiagnosticAttachment {
  return {
    contentType: attachment.contentType,
    data: Array.from(attachment.data),
    filename: sanitizeAttachmentFilename(attachment.filename),
  };
}

function buildLocalExportInput(
  input: SubmitFeedbackReportInput,
  attachments: FeedbackAttachment[]
): LocalFeedbackDiagnosticExportInput {
  return {
    attachments: attachments.map(toBridgeAttachment),
    description: normalizeDescription(input.description),
    extra: redactDiagnosticValue(input.extra) as Record<string, unknown> | undefined,
    module: sanitizeMetadataText(input.module, 'diagnostic-module'),
    moduleLabel: sanitizeMetadataText(input.moduleLabel, 'Diagnostic report'),
    tags: redactDiagnosticValue(input.tags) as Record<string, string> | undefined,
  };
}

export async function submitFeedbackReport(input: SubmitFeedbackReportInput): Promise<SubmitFeedbackReportResult> {
  const attachments = [...(input.attachments ?? [])];
  let logAttachment: FeedbackAttachment | null = null;
  let logAttachmentStatus: FeedbackLogAttachmentStatus = input.collectLogs ? 'empty' : 'skipped';
  let dbDiagnosticsAttachment: FeedbackAttachment | null = null;
  let dbDiagnosticsAttachmentStatus: FeedbackDbDiagnosticsAttachmentStatus = input.collectDbDiagnostics
    ? 'empty'
    : 'skipped';

  try {
    if (input.collectLogs) {
      const collected = await collectLogAttachment();
      logAttachment = collected.attachment;
      logAttachmentStatus = collected.status;
      if (logAttachment) attachments.unshift(logAttachment);
    }
    if (input.collectDbDiagnostics) {
      const collected = await collectDbDiagnosticsAttachment(input.collectDbDiagnostics);
      dbDiagnosticsAttachment = collected.attachment;
      dbDiagnosticsAttachmentStatus = collected.status;
      if (dbDiagnosticsAttachment) attachments.unshift(dbDiagnosticsAttachment);
    }

    const electronAPI = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!electronAPI?.exportLocalFeedbackDiagnostics) {
      logFeedbackReport('error', 'local-export-unavailable', { module: input.module });
      return { status: 'failed' };
    }

    const exportInput = buildLocalExportInput(input, attachments);
    const result = await electronAPI.exportLocalFeedbackDiagnostics(exportInput);
    logFeedbackReport(result.status === 'saved' ? 'info' : 'warn', `local-export-${result.status}`, {
      attachmentCount: attachments.length,
      dbDiagnosticsAttachment: summarizeAttachment(dbDiagnosticsAttachment, dbDiagnosticsAttachmentStatus),
      logAttachment: summarizeAttachment(logAttachment, logAttachmentStatus),
      module: exportInput.module,
    });
    return result;
  } catch {
    logFeedbackReport('error', 'local-export-failed', {
      attachmentCount: attachments.length,
      dbDiagnosticsAttachment: summarizeAttachment(dbDiagnosticsAttachment, dbDiagnosticsAttachmentStatus),
      logAttachment: summarizeAttachment(logAttachment, logAttachmentStatus),
      module: sanitizeMetadataText(input.module, 'diagnostic-module'),
    });
    return { status: 'failed' };
  }
}
