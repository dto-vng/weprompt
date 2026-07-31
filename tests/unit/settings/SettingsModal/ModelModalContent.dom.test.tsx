/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { IProvider } from '@/common/config/storage';

const { addPlatformOpenMock, appOperationsCardProps, providersQueryData } = vi.hoisted(() => ({
  addPlatformOpenMock: vi.fn(),
  appOperationsCardProps: {
    current: undefined as
      | {
          onAddModel: () => void;
          providers: IProvider[];
          providersLoading: boolean;
        }
      | undefined,
  },
  providersQueryData: {
    current: undefined as IProvider[] | undefined,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      createProvider: { invoke: vi.fn() },
      deleteProvider: { invoke: vi.fn() },
      listProviders: { invoke: vi.fn() },
      updateProvider: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({ data: providersQueryData.current, mutate: vi.fn() }),
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/base/TalkToButlerButton', () => ({
  default: () => <div>TalkToButlerButton</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

vi.mock('@/renderer/hooks/system/useDeepLink', () => ({
  consumePendingDeepLink: () => undefined,
}));

vi.mock('@/renderer/pages/settings/components/AddPlatformModal', () => ({
  default: {
    useModal: () => [{ close: vi.fn(), open: addPlatformOpenMock }, null],
  },
}));

vi.mock('@/renderer/pages/settings/components/AddModelModal', () => ({
  default: {
    useModal: () => [{ close: vi.fn(), open: vi.fn() }, null],
  },
}));

vi.mock('@/renderer/pages/settings/components/EditModeModal', () => ({
  default: {
    useModal: () => [{ close: vi.fn(), open: vi.fn() }, null],
  },
}));

vi.mock('@/renderer/components/settings/SettingsModal/AppOperationsModelCard', () => ({
  default: (props: NonNullable<typeof appOperationsCardProps.current>) => {
    appOperationsCardProps.current = props;
    return <div data-testid='app-operations-card'>App Operations</div>;
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      useMessage: () => [{ error: vi.fn() }, null],
    },
  };
});

import ModelModalContent from '@/renderer/components/settings/SettingsModal/contents/ModelModalContent';

const provider: IProvider = {
  id: 'provider-a',
  platform: 'openai',
  name: 'Provider A',
  base_url: 'https://example.test/v1',
  api_key: 'secret',
  models: ['model-a'],
  enabled: true,
};

describe('ModelModalContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appOperationsCardProps.current = undefined;
    providersQueryData.current = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('passes loaded-empty providers to the card before the empty provider state and opens provider setup', () => {
    render(<ModelModalContent />);

    const card = screen.getByTestId('app-operations-card');
    const empty = screen.getByText('settings.noConfiguredModels');
    expect(card.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card).toBeVisible();
    expect(empty).toBeVisible();
    expect(appOperationsCardProps.current?.providers).toEqual([]);
    expect(appOperationsCardProps.current?.providersLoading).toBe(false);

    appOperationsCardProps.current?.onAddModel();
    expect(addPlatformOpenMock).toHaveBeenCalledTimes(1);
  });

  it('passes a loading provider query to the card without treating it as configured providers', () => {
    providersQueryData.current = undefined;
    render(<ModelModalContent />);

    expect(appOperationsCardProps.current?.providers).toEqual([]);
    expect(appOperationsCardProps.current?.providersLoading).toBe(true);
  });

  it('passes the raw configured providers to the card before the existing provider row', () => {
    const rawProviders = [provider];
    providersQueryData.current = rawProviders;
    render(<ModelModalContent />);

    const card = screen.getByTestId('app-operations-card');
    const providerRow = screen.getByText('Provider A');
    expect(appOperationsCardProps.current?.providers).toBe(rawProviders);
    expect(appOperationsCardProps.current?.providersLoading).toBe(false);
    expect(card.compareDocumentPosition(providerRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
