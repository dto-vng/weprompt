/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';
import {
  OCR_MODEL_PATTERNS,
  pickOcrCandidates,
  probeOcrModel,
  resolveOcrModel,
} from '@/process/services/projectKnowledge/ocrProviderPicker';

const provider = (over: Partial<IProvider>): IProvider =>
  ({
    id: 'p1',
    platform: 'openai',
    name: 'P',
    base_url: 'https://maas.example/v1',
    api_key: 'sk-1',
    models: [],
    ...over,
  }) as IProvider;

describe('pickOcrCandidates', () => {
  it('resolves through a list of patterns rather than one pinned model id', () => {
    // The deployment's entitlements shift, so a single pinned id would go dead.
    // This asserts the shape of the mechanism, not any one model.
    expect(OCR_MODEL_PATTERNS.length).toBeGreaterThan(1);
    expect(OCR_MODEL_PATTERNS.every((pattern) => pattern instanceof RegExp)).toBe(true);
  });

  it('finds a multimodal model the repo vision regex does not match', () => {
    // google/gemma-4-31b-it is the model verified end to end against a real
    // Vietnamese scan, and `hasSpecificModelCapability(..., 'vision')` returns
    // undefined for it. Relying on capability tags alone would find nothing.
    const candidates = pickOcrCandidates([provider({ models: ['google/gemma-4-31b-it'] })]);
    expect(candidates.map((c) => c.config.model)).toEqual(['google/gemma-4-31b-it']);
  });

  it('skips providers with no base URL or no key', () => {
    expect(
      pickOcrCandidates([
        provider({ id: 'a', base_url: '', models: ['gpt-4o'] }),
        provider({ id: 'b', api_key: '   ', models: ['gpt-4o'] }),
      ])
    ).toEqual([]);
  });

  it('takes the first key when several are configured', () => {
    const [candidate] = pickOcrCandidates([provider({ api_key: ' sk-a , sk-b ', models: ['gpt-4o'] })]);
    expect(candidate.config.apiKey).toBe('sk-a');
  });

  it('vetoes embedding and rerank models even when a pattern would match', () => {
    // `baai/bge-m3` and `qwen/qwen3-reranker-8b` sit on the same endpoint as the
    // chat models. Sending a page image to an embedding model is a guaranteed
    // waste of a call.
    const candidates = pickOcrCandidates([
      provider({ models: ['baai/bge-m3', 'qwen/qwen3-reranker-8b', 'openai/text-embedding-3-large'] }),
    ]);
    expect(candidates).toEqual([]);
  });

  it('ignores models that give no signal of reading images at all', () => {
    const candidates = pickOcrCandidates([provider({ models: ['some/plain-text-llm-7b'] })]);
    expect(candidates).toEqual([]);
  });

  it('orders by the preference list, so the verified model beats a later pattern', () => {
    const candidates = pickOcrCandidates([
      provider({ models: ['vendor/thing-vision', 'google/gemini-2.0-flash', 'google/gemma-4-31b-it'] }),
    ]);
    expect(candidates.map((c) => c.config.model)).toEqual([
      'google/gemma-4-31b-it',
      'google/gemini-2.0-flash',
      'vendor/thing-vision',
    ]);
  });

  it('keeps provider order as a tie-break within one rank', () => {
    const candidates = pickOcrCandidates([
      provider({ id: 'first', models: ['gpt-4o'] }),
      provider({ id: 'second', models: ['gpt-4o'] }),
    ]);
    expect(candidates.map((c) => c.providerId)).toEqual(['first', 'second']);
  });
});

describe('probeOcrModel', () => {
  const config = { baseUrl: 'https://maas.example/v1', apiKey: 'sk-1', model: 'm' };

  it('sends a text-only request small enough to be free', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    expect(await probeOcrModel(config, fetchImpl as never)).toEqual({ status: 'ok' });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ model: 'm', max_tokens: 4 });
    expect(JSON.stringify(body)).not.toContain('image_url');
  });

  it('reports the status for a model the key is not entitled to', async () => {
    const fetchImpl = vi.fn(async () => new Response('no such model', { status: 404 }));
    expect(await probeOcrModel(config, fetchImpl as never)).toEqual({ status: 'rejected', detail: 'HTTP 404' });
  });

  it('rejects a candidate that never answers, rather than stalling resolution', async () => {
    // Resolution runs before any page is encoded, on the per-project ingestion
    // queue — so an unresponsive candidate would block the whole project.
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted.')));
        })
    );
    const result = await probeOcrModel(config, fetchImpl as never, 20);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.detail).toMatch(/abort/i);
  });

  it('reports a transport failure rather than throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(await probeOcrModel(config, fetchImpl as never)).toEqual({ status: 'rejected', detail: 'ECONNREFUSED' });
  });
});

describe('resolveOcrModel', () => {
  it('returns the first candidate that answers the probe', async () => {
    const probeImpl = vi.fn(async (config: { model: string }) => ({
      status: config.model === 'google/gemini-2.0-flash' ? 'ok' : 'rejected',
      detail: 'HTTP 404',
    }));
    const result = await resolveOcrModel([provider({ models: ['google/gemini-2.0-flash'] })], {
      probeImpl: probeImpl as never,
    });
    expect(result).toEqual({
      status: 'resolved',
      config: { baseUrl: 'https://maas.example/v1', apiKey: 'sk-1', model: 'google/gemini-2.0-flash' },
    });
  });

  it('moves to the next candidate when the first 404s', async () => {
    // The measured reality of this deployment: the catalogue advertises far more
    // than the key may call, so the FIRST choice routinely 404s.
    const probeImpl = vi.fn(async (config: { model: string }) =>
      config.model === 'google/gemma-4-31b-it' ? { status: 'rejected', detail: 'HTTP 404' } : { status: 'ok' }
    );
    const result = await resolveOcrModel([provider({ models: ['google/gemma-4-31b-it', 'google/gemini-2.0-flash'] })], {
      probeImpl: probeImpl as never,
    });
    expect(result).toMatchObject({ status: 'resolved' });
    if (result.status === 'resolved') expect(result.config.model).toBe('google/gemini-2.0-flash');
    expect(probeImpl).toHaveBeenCalledTimes(2);
  });

  it('explains that no provider is configured', async () => {
    const result = await resolveOcrModel([], { probeImpl: async () => ({ status: 'ok' }) });
    expect(result).toMatchObject({ status: 'unavailable' });
    if (result.status === 'unavailable') expect(result.reason).toMatch(/no provider is configured/);
  });

  it('explains that the configured models cannot read images', async () => {
    const probeImpl = vi.fn(async () => ({ status: 'ok' }));
    const result = await resolveOcrModel([provider({ models: ['plain-llm', 'baai/bge-m3'] })], {
      probeImpl: probeImpl as never,
    });
    expect(result).toMatchObject({ status: 'unavailable' });
    if (result.status === 'unavailable') expect(result.reason).toMatch(/looks able to read images/);
    expect(probeImpl).not.toHaveBeenCalled(); // nothing worth spending a call on
  });

  it('names the models it tried when every probe is refused', async () => {
    const result = await resolveOcrModel([provider({ models: ['gpt-4o', 'google/gemini-2.0-flash'] })], {
      probeImpl: async () => ({ status: 'rejected', detail: 'HTTP 403' }),
    });
    expect(result).toMatchObject({ status: 'unavailable' });
    if (result.status === 'unavailable') {
      // Actionable: the user learns which models were tried and why each failed.
      expect(result.reason).toContain('gpt-4o (HTTP 403)');
      expect(result.reason).toContain('google/gemini-2.0-flash (HTTP 403)');
    }
  });
});
