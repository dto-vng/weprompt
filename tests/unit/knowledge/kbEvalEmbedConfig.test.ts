/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// How the eval harness decides whether it can measure the hybrid half.
//
// Lives here rather than beside its subject in tests/eval/harness/ because
// vitest.config.ts only collects tests/unit, tests/integration and
// tests/regression — a test file under tests/eval/ would never run.
//
// The thing under test is mostly a *message*, which is why it is tested at all.
// When this resolver gives up, its one-line reason is the entire explanation a
// reader gets for why half the report is missing, and a wrong explanation is
// worse than a vague one: "unreachable" sends someone restarting a backend that
// is running fine and refusing them on purpose.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveEvalEmbedConfig } from '../../eval/harness/embedConfig';

const ENV_CONFIG = {
  KB_EVAL_EMBED_BASE_URL: 'https://embeddings.example/v1',
  KB_EVAL_EMBED_API_KEY: 'not-a-real-key',
  KB_EVAL_EMBED_MODEL: 'test-embed-model',
};

/** A fetch that never resolves to a response — the no-backend-listening case. */
const refusingFetch = (message = 'fetch failed'): typeof fetch =>
  vi.fn(() => Promise.reject(new TypeError(message))) as unknown as typeof fetch;

const respondingFetch = (status: number, body: unknown = {}): typeof fetch =>
  vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    })
  ) as unknown as typeof fetch;

const stubFetch = (impl: typeof fetch): void => {
  vi.stubGlobal('fetch', impl);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('eval embedding config resolution', () => {
  it('uses the explicit env vars without touching the network', async () => {
    const fetchSpy = refusingFetch();
    stubFetch(fetchSpy);

    const result = await resolveEvalEmbedConfig(ENV_CONFIG);

    expect(result.config).toEqual({
      baseUrl: ENV_CONFIG.KB_EVAL_EMBED_BASE_URL,
      apiKey: ENV_CONFIG.KB_EVAL_EMBED_API_KEY,
      model: ENV_CONFIG.KB_EVAL_EMBED_MODEL,
    });
    expect(result.source).toBe('env');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls through to the app when the env vars are only partly set', async () => {
    // The trap this guards: a half-set env is easy to produce (one typo, one
    // forgotten export) and silently behaves like no env at all. The reason must
    // therefore still describe the app route, not claim the env was used.
    stubFetch(refusingFetch());

    const result = await resolveEvalEmbedConfig({
      KB_EVAL_EMBED_BASE_URL: ENV_CONFIG.KB_EVAL_EMBED_BASE_URL,
      KB_EVAL_EMBED_MODEL: ENV_CONFIG.KB_EVAL_EMBED_MODEL,
    });

    expect(result.config).toBeNull();
    expect(result.reason).toMatch(/no KB_EVAL_EMBED_\* env vars/);
  });

  it('names the port and the dev app when nothing is listening', async () => {
    stubFetch(refusingFetch());

    const result = await resolveEvalEmbedConfig({ AIONUI_BACKEND_PORT: '13999' });

    expect(result.config).toBeNull();
    expect(result.reason).toMatch(/nothing answered on 127\.0\.0\.1:13999/);
    expect(result.reason).toMatch(/is the dev app running\?/);
  });

  it('reports a 401 as a refusal that a headless run cannot satisfy, not as an outage', async () => {
    // The regression that motivated this: the app now requires a per-launch
    // secret it never persists. Calling that "unreachable" would send the reader
    // to restart a backend that is up and deliberately saying no.
    stubFetch(respondingFetch(401));

    const result = await resolveEvalEmbedConfig({});

    expect(result.reason).toMatch(/refused an unauthenticated request \(HTTP 401\)/);
    expect(result.reason).toMatch(/X-AionUI-Local-Token/);
    expect(result.reason).not.toMatch(/nothing answered/);
  });

  it('reports a 403 the same way as a 401', async () => {
    stubFetch(respondingFetch(403));

    const result = await resolveEvalEmbedConfig({});

    expect(result.reason).toMatch(/refused an unauthenticated request \(HTTP 403\)/);
  });

  it('always says how to get the hybrid half back, whatever the failure was', async () => {
    // Every reason reaches the report as the only actionable line the reader
    // gets, so none of them may end at the diagnosis.
    stubFetch(respondingFetch(500));

    const result = await resolveEvalEmbedConfig({});

    expect(result.reason).toMatch(/Set KB_EVAL_EMBED_BASE_URL \/ _API_KEY \/ _MODEL/);
  });

  it('says the providers expose no embedding model when the app answers with none', async () => {
    stubFetch(respondingFetch(200, [{ id: 'p1', name: 'Chat only', platform: 'custom', model: ['some/chat-model'] }]));

    const result = await resolveEvalEmbedConfig({});

    expect(result.config).toBeNull();
    expect(result.reason).toMatch(/expose an embedding model/);
  });

  it('rejects a provider payload whose shape it does not recognise', async () => {
    stubFetch(respondingFetch(200, { providers: 'not-an-array' }));

    const result = await resolveEvalEmbedConfig({});

    expect(result.config).toBeNull();
    expect(result.reason).toMatch(/unexpected \/api\/providers response shape/);
  });
});
