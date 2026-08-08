import {
  normalizeProviderHealthCheckFailure,
  type ProviderHealthCheckResponse,
} from '@/common/types/provider/providerApi';

const failedHealthResponse = (overrides: Partial<ProviderHealthCheckResponse>): ProviderHealthCheckResponse => ({
  provider_id: 'provider-a',
  platform: 'openai',
  model: 'model-a',
  status: 'unhealthy',
  elapsed_ms: 25,
  message: 'Provider request failed',
  ...overrides,
});

describe('provider health failure contract', () => {
  it('preserves structured overload through a conflicting 429 fallback', () => {
    expect(
      normalizeProviderHealthCheckFailure(
        failedHealthResponse({
          provider_error_type: 'engine_overloaded_error',
          error_kind: 'rate_limited',
          http_status: 429,
        })
      )
    ).toMatchObject({
      failureClass: 'overload',
      providerErrorType: 'engine_overloaded_error',
      actionKey: 'settings.providerHealth.overload.action',
      statusKey: 'settings.providerHealth.configuredInferenceUnavailable',
    });
  });

  it('preserves structured rate limiting with its wait recovery action', () => {
    expect(
      normalizeProviderHealthCheckFailure(
        failedHealthResponse({ provider_error_type: 'rate_limit_exceeded', http_status: 503 })
      )
    ).toMatchObject({
      failureClass: 'rate_limit',
      actionKey: 'settings.providerHealth.rateLimit.action',
      statusKey: 'settings.providerHealth.configuredInferenceUnavailable',
    });
  });

  it('preserves structured setup failure with its configuration recovery action', () => {
    expect(
      normalizeProviderHealthCheckFailure(
        failedHealthResponse({ provider_error_type: 'invalid_api_key', http_status: 429 })
      )
    ).toMatchObject({
      failureClass: 'setup',
      actionKey: 'settings.providerHealth.setup.action',
      statusKey: 'settings.providerHealth.setupNeedsAttention',
    });
  });

  it('preserves structured connectivity failure with its network recovery action', () => {
    expect(
      normalizeProviderHealthCheckFailure(
        failedHealthResponse({ provider_error_type: 'connection_error', http_status: 429 })
      )
    ).toMatchObject({
      failureClass: 'connectivity',
      actionKey: 'settings.providerHealth.connectivity.action',
      statusKey: 'settings.providerHealth.configuredInferenceUnavailable',
    });
  });

  it('uses HTTP status only when structured provider type and kind are absent', () => {
    expect(normalizeProviderHealthCheckFailure(failedHealthResponse({ http_status: 429 }))).toMatchObject({
      failureClass: 'rate_limit',
    });
    expect(normalizeProviderHealthCheckFailure(failedHealthResponse({ http_status: 503 }))).toMatchObject({
      failureClass: 'overload',
    });
  });

  it('treats an unrecognized error kind as a structured provider type before HTTP fallback', () => {
    const response = {
      ...failedHealthResponse({ http_status: 429 }),
      error_kind: 'engine_overloaded_error',
    } as unknown as ProviderHealthCheckResponse;

    expect(normalizeProviderHealthCheckFailure(response)).toMatchObject({
      failureClass: 'overload',
      providerErrorType: 'engine_overloaded_error',
    });
  });

  it('keeps only bounded provider retry guidance', () => {
    expect(
      normalizeProviderHealthCheckFailure(
        failedHealthResponse({ provider_error_type: 'rate_limit_exceeded', retry_after_ms: 250 })
      )
    ).toMatchObject({ retryAfterMs: 250 });
    expect(
      normalizeProviderHealthCheckFailure(
        failedHealthResponse({ provider_error_type: 'rate_limit_exceeded', retry_after_ms: 120_000 })
      )
    ).not.toHaveProperty('retryAfterMs');
  });
});
