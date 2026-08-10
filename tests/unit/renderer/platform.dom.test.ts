import { afterEach, describe, expect, it } from 'vitest';
import { resolveBackendAssetUrl } from '@renderer/utils/platform';

describe('resolveBackendAssetUrl', () => {
  afterEach(() => {
    delete (window as Window & { __backendPort?: number }).__backendPort;
    delete (window as Window & { __backendLocalToken?: string }).__backendLocalToken;
  });

  it('keeps the local secret out of desktop backend asset URLs', () => {
    (window as Window & { __backendPort?: number }).__backendPort = 24680;
    (window as Window & { __backendLocalToken?: string }).__backendLocalToken = 'asset-secret';

    expect(resolveBackendAssetUrl('/api/media/image.png')).toBe('http://127.0.0.1:24680/api/media/image.png');
  });

  it('leaves remote asset origins untouched', () => {
    expect(resolveBackendAssetUrl('https://cdn.example.test/image.png')).toBe('https://cdn.example.test/image.png');
  });
});
