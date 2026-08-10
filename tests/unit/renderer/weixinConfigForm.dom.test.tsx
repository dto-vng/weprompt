import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WeixinConfigForm from '@renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm';
import type { GoogleModelSelection } from '@renderer/pages/conversation/platforms/gemini/useGoogleModelSelection';

const eventSourceUrls: string[] = [];

class FakeEventSource {
  onerror: (() => void) | null = null;

  constructor(url: string | URL) {
    eventSourceUrls.push(String(url));
  }

  addEventListener(): void {}
  close(): void {}
}

vi.mock('@/common/adapter/httpBridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/adapter/httpBridge')>()),
  getBaseUrl: () => 'http://127.0.0.1:24680',
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  assistants: { list: { invoke: vi.fn(() => new Promise<never>(() => {})) } },
  channel: {
    getPendingPairings: { invoke: vi.fn(() => new Promise<never>(() => {})) },
    getAuthorizedUsers: { invoke: vi.fn(() => new Promise<never>(() => {})) },
    getPlatformSettings: { invoke: vi.fn(() => new Promise<never>(() => {})) },
    pairingRequested: { on: vi.fn(() => () => {}) },
    userAuthorized: { on: vi.fn(() => () => {}) },
  },
}));

vi.mock('@renderer/pages/conversation/platforms/gemini/GoogleModelSelector', () => ({
  default: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'en-US' },
  }),
}));

describe('WeixinConfigForm login transport', () => {
  beforeEach(() => {
    eventSourceUrls.length = 0;
    (window as Window & { __backendLocalToken?: string }).__backendLocalToken = 'weixin-secret';
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    delete (window as Window & { __backendLocalToken?: string }).__backendLocalToken;
    vi.unstubAllGlobals();
  });

  it('keeps the local secret out of the WeChat login EventSource URL', () => {
    render(
      <WeixinConfigForm pluginStatus={null} modelSelection={{} as GoogleModelSelection} onStatusChange={() => {}} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scan to Login' }));

    expect(eventSourceUrls).toEqual(['http://127.0.0.1:24680/api/channel/weixin/login']);
  });
});
