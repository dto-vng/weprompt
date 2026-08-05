/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AionUI应用程序共用常量
 */

// ===== 文件处理相关常量 =====

/** 临时文件时间戳分隔符 */
export const AIONUI_TIMESTAMP_SEPARATOR = '_aionui_';

/** 用于匹配和清理时间戳后缀的正则表达式 */
export const AIONUI_TIMESTAMP_REGEX = /_aionui_\d{13}(\.\w+)?$/;
export const AIONUI_FILES_MARKER = '[[AION_FILES]]';

// ===== 媒体类型相关常量 =====

/** 支持的图片文件扩展名 */
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'] as const;

/** 文件扩展名到MIME类型的映射 */
export const MIME_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
};

/** MIME类型到文件扩展名的映射 */
export const MIME_TO_EXT_MAP: Record<string, string> = {
  jpeg: '.jpg',
  jpg: '.jpg',
  png: '.png',
  gif: '.gif',
  webp: '.webp',
  bmp: '.bmp',
  tiff: '.tiff',
  'svg+xml': '.svg',
};

/** 默认图片文件扩展名 */
export const DEFAULT_IMAGE_EXTENSION = '.png';

// ===== WebUI 相关常量 =====

/** WebUI default port: 25808 for production, 25809 for development, 25810 for multi-instance dev */
export const WEBUI_DEFAULT_PORT = (() => {
  if (process.env.NODE_ENV === 'production') return 25808;
  if (process.env.AIONUI_MULTI_INSTANCE === '1') return 25810;
  return 25809;
})();

export const TEAM_MODE_ENABLED = true;

// ===== Feature flags =====

/** Desktop Pet feature flag: when false, the pet is hidden from all UI entry points (settings tab, route, tray menu, startup). Backend code stays dormant. */
export const DESKTOP_PET_ENABLED = false;

export const PRESENTATION_RUN_V2_ENABLED = false;

export const PRESENTATION_RUN_DIRECTIVE_PREFIX = 'Create a presentation from the request below.';

export const PRESENTATION_RUN_DISPATCH_STATUSES = [
  'allocating',
  'committed',
  'dispatching',
  'bound',
  'terminal_verified',
  'retained',
  'failed_retained',
  'dispatch_uncertain',
  'discarded',
] as const;

export const PRESENTATION_RUN_ARTIFACT_PHASES = [
  'none',
  'sources_snapshotted',
  'sources_extracted',
  'candidate_retained',
  'candidate_copied',
  'structurally_valid',
  'ooxml_inspected',
  'rendered_exact_hash',
] as const;

export const PRESENTATION_RUN_DISPOSITIONS = ['TRACKING_REQUIRED', 'REVIEW_REQUIRED'] as const;

export const PRESENTATION_RUN_FAILURE_STATES = [
  'preflight',
  'lookup',
  'draft_expired',
  'draft_active',
  'grant_validation',
  'grant_expired',
  'committed',
  'dispatch_uncertain',
  'bound',
  'retained',
] as const;

export const PRESENTATION_RUN_LIMITS = {
  MAX_SOURCES_PER_RUN: 16,
  MAX_SOURCE_BYTES: 64 * 1_024 * 1_024,
  MAX_TOTAL_SOURCE_BYTES: 256 * 1_024 * 1_024,
  GRANT_TTL_MS: 15 * 60_000,
  QUEUED_GRANT_TTL_MS: 24 * 60 * 60_000,
  GRANT_SWEEP_INTERVAL_MS: 5 * 60_000,
  MAX_UNBOUND_GRANTS_PER_OWNER: 16,
  MAX_UNBOUND_GRANTS_PER_APP: 64,
  MAX_LIVE_GUID_DRAFTS_PER_APP: 16,
  MAX_UNBOUND_GRANT_BYTES_PER_OWNER: 256 * 1_024 * 1_024,
  MAX_UNBOUND_GRANT_BYTES_PER_APP: 512 * 1_024 * 1_024,
  MAX_EXTRACTED_CHARS_PER_SOURCE: 200_000,
  MAX_EXTRACTED_CHARS_TOTAL: 1_000_000,
  MAX_PDF_PAGES: 50,
  MAX_EXTRACTION_ATTEMPTS: 2,
  EXTRACTION_ATTEMPT_TIMEOUT_MS: 30_000,
  MAX_OFFICECLI_STDOUT_BYTES: 8 * 1_024 * 1_024,
  MAX_THEME_BYTES: 1_024 * 1_024,
  MAX_REFERENCE_BYTES: 64 * 1_024 * 1_024,
  MAX_TEMPLATE_REFERENCE_BYTES: 128 * 1_024 * 1_024,
  MAX_CANDIDATE_COMPRESSED_BYTES: 256 * 1_024 * 1_024,
  MAX_NON_RENDER_COPY_WRITE_BYTES_PER_RUN: 1_024 * 1_024 * 1_024,
  MAX_PLAN_JSON_BYTES: 1_024 * 1_024,
  MAX_SOURCE_REFS_PER_SLIDE: 16,
  MAX_ZIP_ENTRIES: 4_096,
  MAX_ZIP_ENTRY_BYTES: 32 * 1_024 * 1_024,
  MAX_ZIP_EXPANDED_BYTES: 512 * 1_024 * 1_024,
  MAX_XML_BYTES: 16 * 1_024 * 1_024,
  MAX_XML_NESTING_DEPTH: 64,
  MAX_SLIDES: 100,
  MAX_SHAPES_PER_SLIDE: 512,
  MAX_TEXT_CHARS_PER_SLIDE: 100_000,
  MAX_TEXT_CHARS_TOTAL: 2_000_000,
  MAX_RENDER_BYTES_PER_SLIDE: 25 * 1_024 * 1_024,
  MAX_RENDER_BYTES_TOTAL: 500 * 1_024 * 1_024,
  RENDER_TIMEOUT_MS: 90_000,
  ACTIVE_GENERATION_TTL_MS: 30 * 60_000,
  MAX_LIVE_RUNS_PER_CONVERSATION: 1,
  MAX_LIVE_RUNS_PER_APP: 2,
  MAX_PREDISPATCH_INTENTS_PER_APP: 8,
  MAX_EXTRACTION_CONCURRENCY: 2,
  MAX_RENDER_CONCURRENCY: 1,
  RECOVERABLE_LIST_MIN_LIMIT: 1,
  RECOVERABLE_LIST_DEFAULT_LIMIT: 20,
  RECOVERABLE_LIST_MAX_LIMIT: 20,
  MAX_RETAINED_RUNS_PER_CONVERSATION: 10,
  MAX_RETAINED_RUNS_PER_APP: 100,
  MAX_RETAINED_BYTES_PER_CONVERSATION: 640 * 1_024 * 1_024,
  MAX_RETAINED_BYTES_PER_APP: 3 * 1_024 * 1_024 * 1_024,
  TRANSIENT_DISK_RESERVATION_BYTES_PER_RUN: 2 * 1_024 * 1_024 * 1_024,
  MIN_FREE_BYTES_BEFORE_START: 3 * 1_024 * 1_024 * 1_024,
  MIN_UNRESERVED_BYTES_AFTER_RESERVATIONS: 1_024 * 1_024 * 1_024,
  START_RATE_WINDOW_MS: 60_000,
  MAX_STARTS_PER_CONVERSATION_PER_WINDOW: 2,
  STARTS_PER_CONVERSATION_BURST: 1,
  MAX_STARTS_PER_APP_PER_WINDOW: 6,
  STARTS_PER_APP_BURST: 2,
  INITIAL_CLAIM_LEASE_MS: 30_000,
  INITIAL_CLAIM_RENEWAL_MS: 10_000,
  MAX_WEBSOCKET_INBOUND_FRAME_BYTES: 256 * 1_024,
  WEBSOCKET_EVENT_RATE_WINDOW_MS: 60_000,
  MAX_WEBSOCKET_EVENTS_PER_WINDOW: 120,
  WEBSOCKET_EVENT_BURST: 20,
  MAX_TERMINAL_BEFORE_BIND_PENDING: 32,
  TERMINAL_BEFORE_BIND_TTL_MS: 120_000,
  MAX_RECONNECT_MESSAGE_BUFFER: 0,
  WEBSOCKET_DIAGNOSTIC_INTERVAL_MS: 60_000,
  ALLOCATING_TTL_MS: 10 * 60_000,
  COMMITTED_TTL_MS: 24 * 60 * 60_000,
  FAILED_OR_REVIEW_RETENTION_MS: 7 * 24 * 60 * 60_000,
  UNCERTAIN_OPERATOR_ALERT_MS: 30 * 24 * 60 * 60_000,
  TOMBSTONE_RETENTION_MS: 7 * 24 * 60 * 60_000,
  OWNED_DIRECTORY_MODE: 0o700,
  OWNED_FILE_MODE: 0o600,
} as const;

/**
 * Builtin (official) skills hidden from the app UI.
 * These ship inside the aioncore backend and cannot be deleted via its API,
 * so they are filtered out of every skills listing at the bridge layer.
 */
export const HIDDEN_BUILTIN_SKILLS: readonly string[] = ['xiaohongshu-recruiter', 'x-recruiter', 'weixin-file-send'];

// ===== AI Provider 相关常量 =====

// Stable ID for the Google Auth virtual provider.
// Shared between frontend (useModelProviderList) and backend (SystemActions).
export const GOOGLE_AUTH_PROVIDER_ID = 'google-auth-gemini';
