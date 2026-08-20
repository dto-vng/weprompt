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

  /**
   * BUG-055: measured against a suspended Moonshot key. The provider reported
   * `exceeded_current_quota_error`, and both classifiers folded it into
   * `rate_limit` — the structured branch because its own pattern already
   * matched /quota/, the normalized branch because `insufficient_quota` and
   * `rate_limited` shared a line. The app then told the user to wait out an
   * account that no amount of waiting restores.
   */
  it.each([
    ['the provider structured type', { provider_error_type: 'exceeded_current_quota_error' }],
    ['the normalized error kind', { error_kind: 'insufficient_quota' as const }],
    ['an insufficient_balance type', { provider_error_type: 'insufficient_balance' }],
  ])('separates an exhausted quota from a rate limit via %s', (_case, overrides) => {
    expect(normalizeProviderHealthCheckFailure(failedHealthResponse(overrides))).toMatchObject({
      failureClass: 'quota',
      actionKey: 'settings.providerHealth.quota.action',
      // Quota needs the user to act, so it reads like setup rather than like a
      // provider that is momentarily unavailable.
      statusKey: 'settings.providerHealth.setupNeedsAttention',
    });
  });

  it('never carries retry guidance for an exhausted quota', () => {
    // `retry_after_ms` is honoured for overload and rate_limit. Waiting out a
    // suspended account is exactly the advice this bug was filed about.
    const normalized = normalizeProviderHealthCheckFailure(
      failedHealthResponse({ provider_error_type: 'exceeded_current_quota_error', retry_after_ms: 5_000 })
    );

    expect(normalized.retryAfterMs).toBeUndefined();
  });

  it('still classifies a genuine rate limit as one', () => {
    // The guard against over-matching: these must not be swept into quota.
    for (const providerErrorType of ['rate_limit_exceeded', 'too_many_requests', 'requests_throttled']) {
      expect(
        normalizeProviderHealthCheckFailure(failedHealthResponse({ provider_error_type: providerErrorType }))
      ).toMatchObject({
        failureClass: 'rate_limit',
      });
    }
    expect(normalizeProviderHealthCheckFailure(failedHealthResponse({ error_kind: 'rate_limited' }))).toMatchObject({
      failureClass: 'rate_limit',
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
