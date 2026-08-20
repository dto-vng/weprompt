/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wire-contract types for `/api/providers/*`.
 *
 * Direct mirror of the Rust types in
 * `crates/aionui-api-types/src/provider.rs`. Keep in sync with the
 * backend spec.
 */

import type { IProvider, ModelCapability } from '@/common/config/storage';
import { isQuotaExhaustedErrorType } from './quotaExhaustion';

export interface CreateProviderRequest {
  /**
   * Optional caller-supplied id. When omitted, the server generates one.
   * Validated leniently (any non-empty string) to accept the frontend's
   * 8-char `uuid()` helper output.
   */
  id?: string;
  platform: string;
  name: string;
  base_url: string;
  api_key: string;
  models?: string[];
  enabled?: boolean;
  capabilities?: ModelCapability[];
  context_limit?: number;
  model_protocols?: Record<string, string>;
  model_enabled?: Record<string, boolean>;
  model_health?: IProvider['model_health'];
  model_settings?: IProvider['model_settings'];
  bedrock_config?: IProvider['bedrock_config'];
  is_full_url?: boolean;
}

/**
 * Partial-update shape for `PUT /api/providers/:id`.
 * Every field is optional — only fields sent are updated.
 */
export interface UpdateProviderRequest {
  platform?: string;
  name?: string;
  base_url?: string;
  api_key?: string;
  models?: string[];
  enabled?: boolean;
  capabilities?: ModelCapability[];
  context_limit?: number;
  model_protocols?: Record<string, string>;
  model_enabled?: Record<string, boolean>;
  model_health?: IProvider['model_health'];
  model_settings?: IProvider['model_settings'];
  bedrock_config?: IProvider['bedrock_config'];
  is_full_url?: boolean;
}

/**
 * Response for `POST /api/providers/:id/models` and
 * `POST /api/providers/fetch-models`.
 */
export interface FetchModelsResponse {
  /** Mixed-shape array: bare id strings or `{ id, name }` pairs. */
  models: Array<string | { id: string; name: string }>;
  /** Present when backend auto-corrected the provider's base_url. */
  fixed_base_url?: string;
}

/**
 * Anonymous fetch-models request used by the pre-create form flow.
 * No provider row needs to exist yet — credentials travel in the body.
 */
export interface FetchModelsAnonymousRequest {
  platform: string;
  base_url?: string;
  api_key: string;
  bedrock_config?: IProvider['bedrock_config'];
  try_fix?: boolean;
}

export type ProviderHealthCheckErrorKind =
  | 'timeout'
  | 'invalid_authorization_header'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'insufficient_quota'
  | 'aws_credentials'
  | 'invalid_request'
  | 'rate_limited'
  | 'connection_error'
  | 'api_error'
  | 'unknown';

export type ProviderHealthFailureClass = 'overload' | 'rate_limit' | 'quota' | 'setup' | 'connectivity' | 'provider';

export type NormalizedProviderHealthFailure = {
  failureClass: ProviderHealthFailureClass;
  statusKey: 'settings.providerHealth.configuredInferenceUnavailable' | 'settings.providerHealth.setupNeedsAttention';
  actionKey:
    | 'settings.providerHealth.overload.action'
    | 'settings.providerHealth.rateLimit.action'
    | 'settings.providerHealth.quota.action'
    | 'settings.providerHealth.setup.action'
    | 'settings.providerHealth.connectivity.action'
    | 'settings.providerHealth.provider.action';
  retryAfterMs?: number;
  httpStatus?: number;
  requestId?: string;
  providerErrorType?: string;
};

export interface ProviderHealthCheckRequest {
  provider_id: string;
  model: string;
}

export interface ProviderHealthCheckResponse {
  provider_id: string;
  platform: string;
  model: string;
  status: 'unknown' | 'healthy' | 'unhealthy';
  elapsed_ms: number;
  message?: string;
  error_kind?: ProviderHealthCheckErrorKind;
  /** Provider-supplied structured error type. Takes precedence over normalized status fields. */
  provider_error_type?: string;
  http_status?: number;
  timeout_stage?: string;
  /** Provider retry guidance. The renderer accepts only a short, bounded delay. */
  retry_after_ms?: number;
  /** Sanitized provider request identifier for support diagnostics. */
  request_id?: string;
}

const MAX_PROVIDER_HEALTH_RETRY_AFTER_MS = 30_000;

const classifyStructuredProviderType = (value: string): ProviderHealthFailureClass => {
  const normalized = value.trim().toLowerCase();
  if (/overload|server[_-]?busy|capacity|temporarily[_-]?unavailable/.test(normalized)) return 'overload';
  // Ordered before rate_limit deliberately: that branch's own /quota/ alternative
  // would otherwise swallow `exceeded_current_quota_error` (BUG-055).
  if (isQuotaExhaustedErrorType(normalized)) return 'quota';
  if (/rate[_-]?limit|too[_-]?many[_-]?requests|throttl|quota/.test(normalized)) return 'rate_limit';
  if (/auth|credential|api[_-]?key|forbidden|permission|config|aws/.test(normalized)) return 'setup';
  if (/connect|network|dns|timeout|tls|socket/.test(normalized)) return 'connectivity';
  return 'provider';
};

const classifyNormalizedKind = (value: ProviderHealthCheckErrorKind): ProviderHealthFailureClass | undefined => {
  if (value === 'insufficient_quota') return 'quota';
  if (value === 'rate_limited') return 'rate_limit';
  if (
    value === 'invalid_authorization_header' ||
    value === 'unauthorized' ||
    value === 'forbidden' ||
    value === 'aws_credentials' ||
    value === 'invalid_request' ||
    value === 'not_found'
  ) {
    return 'setup';
  }
  if (value === 'connection_error' || value === 'timeout') return 'connectivity';
  return undefined;
};

const classifyHttpStatus = (status: number | undefined): ProviderHealthFailureClass => {
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403 || status === 404) return 'setup';
  if (status === 408 || status === 504) return 'connectivity';
  if (status === 502 || status === 503 || status === 529) return 'overload';
  return 'provider';
};

const ACTION_KEYS: Record<ProviderHealthFailureClass, NormalizedProviderHealthFailure['actionKey']> = {
  overload: 'settings.providerHealth.overload.action',
  rate_limit: 'settings.providerHealth.rateLimit.action',
  quota: 'settings.providerHealth.quota.action',
  setup: 'settings.providerHealth.setup.action',
  connectivity: 'settings.providerHealth.connectivity.action',
  provider: 'settings.providerHealth.provider.action',
};

/** Normalize optional old/new AionCore health fields at the shared HTTP/IPC boundary. */
export const normalizeProviderHealthCheckFailure = (
  response: ProviderHealthCheckResponse
): NormalizedProviderHealthFailure => {
  const structuredType =
    typeof response.provider_error_type === 'string' && response.provider_error_type.trim().length > 0
      ? response.provider_error_type
      : undefined;
  const rawErrorKind = typeof response.error_kind === 'string' ? response.error_kind : undefined;
  const normalizedKind = rawErrorKind
    ? classifyNormalizedKind(rawErrorKind as ProviderHealthCheckErrorKind)
    : undefined;
  const effectiveStructuredType =
    structuredType ??
    (rawErrorKind && normalizedKind === undefined && rawErrorKind !== 'api_error' && rawErrorKind !== 'unknown'
      ? rawErrorKind
      : undefined);
  const providerErrorType =
    effectiveStructuredType && /^[\w.:-]{1,128}$/.test(effectiveStructuredType) ? effectiveStructuredType : undefined;
  const httpStatus =
    typeof response.http_status === 'number' &&
    Number.isSafeInteger(response.http_status) &&
    response.http_status >= 100 &&
    response.http_status <= 599
      ? response.http_status
      : undefined;
  const failureClass = effectiveStructuredType
    ? classifyStructuredProviderType(effectiveStructuredType)
    : (normalizedKind ?? classifyHttpStatus(httpStatus));
  const retryAfterMs =
    (failureClass === 'overload' || failureClass === 'rate_limit') &&
    typeof response.retry_after_ms === 'number' &&
    Number.isSafeInteger(response.retry_after_ms) &&
    response.retry_after_ms > 0 &&
    response.retry_after_ms <= MAX_PROVIDER_HEALTH_RETRY_AFTER_MS
      ? response.retry_after_ms
      : undefined;
  const requestId =
    typeof response.request_id === 'string' && /^[\w.:-]{1,128}$/.test(response.request_id)
      ? response.request_id
      : undefined;

  return {
    failureClass,
    statusKey:
      // Quota sits with setup, not with the transient classes: both need the user
      // to change something, and neither clears on its own (BUG-055).
      failureClass === 'setup' || failureClass === 'quota'
        ? 'settings.providerHealth.setupNeedsAttention'
        : 'settings.providerHealth.configuredInferenceUnavailable',
    actionKey: ACTION_KEYS[failureClass],
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(requestId !== undefined ? { requestId } : {}),
    ...(providerErrorType !== undefined ? { providerErrorType } : {}),
  };
};
