import type { TContextHandoffItem, TContextSnapshot } from '@/common/config/storage';

export type AppOperationsModelSetting = { mode: 'auto' } | { mode: 'fixed'; provider_id: string; model_id: string };

export type AppOperationsModelHealth = 'ready' | 'checking' | 'setup_required' | 'unavailable';

export type AppOperationsModelReasonCode =
  | 'no_eligible_model'
  | 'provider_missing'
  | 'provider_disabled'
  | 'model_missing'
  | 'model_disabled'
  | 'auth_required'
  | 'health_check_failed';

export type AppOperationsModelRef = { provider_id: string; model_id: string };

export type AppOperationsModelResponse = {
  setting: AppOperationsModelSetting;
  resolved_model?: AppOperationsModelRef;
  health: AppOperationsModelHealth;
  reason_code?: AppOperationsModelReasonCode;
  checked_at?: number;
};

export type AppOperationErrorCode =
  | 'not_configured'
  | 'model_unavailable'
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'provider_timeout'
  | 'provider_request_failed'
  | 'queue_full'
  | 'invalid_input'
  | 'invalid_output'
  | 'canceled';

export type AppOperationMetadata = {
  task_id: string;
  prompt_version: string;
  provider_id?: string;
  model_id?: string;
  duration_ms: number;
  queue_wait_ms: number;
  attempts: number;
  deduplicated: boolean;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type AppOperationResult<Output> =
  | { ok: true; output: Output; operation: AppOperationMetadata }
  | {
      ok: false;
      error: { code: AppOperationErrorCode; retryable: boolean };
      operation: AppOperationMetadata;
    };

export type AppOperationsContextCompactRequest = {
  operation_id: string;
  conversation_id: string;
  trigger: 'auto' | 'manual' | 'handoff';
  previous_snapshot?: TContextSnapshot;
  previous_markdown?: string;
  pinned_context?: TContextHandoffItem[];
  last_compacted_turn_id?: string;
  target_turn_id?: string;
};

export type AppOperationsContextCompactOutput = {
  snapshot: unknown;
  through_turn_id: string;
};
