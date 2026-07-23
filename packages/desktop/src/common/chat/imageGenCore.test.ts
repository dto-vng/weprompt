/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import { extractImagesApiDataUrl } from './imageGenCore';

const asResponse = (data: unknown) => data as OpenAI.Images.ImagesResponse;

describe('extractImagesApiDataUrl', () => {
  it('wraps b64_json output as a PNG data URL', () => {
    expect(extractImagesApiDataUrl(asResponse({ data: [{ b64_json: 'QUJD' }] }))).toBe('data:image/png;base64,QUJD');
  });

  it('returns a direct url when the model returns one', () => {
    expect(extractImagesApiDataUrl(asResponse({ data: [{ url: 'https://cdn.example/img.png' }] }))).toBe(
      'https://cdn.example/img.png'
    );
  });

  it('prefers b64_json over url when both are present', () => {
    expect(extractImagesApiDataUrl(asResponse({ data: [{ b64_json: 'QUJD', url: 'https://x/y.png' }] }))).toBe(
      'data:image/png;base64,QUJD'
    );
  });

  it('returns null when there is no image payload', () => {
    expect(extractImagesApiDataUrl(asResponse({ data: [] }))).toBeNull();
    expect(extractImagesApiDataUrl(asResponse({}))).toBeNull();
    expect(extractImagesApiDataUrl(asResponse({ data: [{}] }))).toBeNull();
  });
});
