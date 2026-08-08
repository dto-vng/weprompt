/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { IProvider } from '@/common/config/storage';

const {
  addPlatformModalOptions,
  addPlatformOpenMock,
  appOperationsCardProps,
  checkProviderHealthMock,
  createProviderMock,
  creativeStudioEnabled,
  listProvidersMock,
  messageErrorMock,
  messageSuccessMock,
  providersQueryData,
  updateProviderMock,
} = vi.hoisted(() => ({
  addPlatformModalOptions: {
    current: undefined as { onSubmit: (platform: IProvider) => void } | undefined,
  },
  addPlatformOpenMock: vi.fn(),
  appOperationsCardProps: {
    current: undefined as
      | {
          onAddModel: () => void;
          persistedProvidersRevision: number;
          providers: IProvider[];
          providersLoading: boolean;
        }
      | undefined,
  },
  checkProviderHealthMock: vi.fn(),
  createProviderMock: vi.fn(),
  creativeStudioEnabled: { current: true },
  listProvidersMock: vi.fn(),
  messageErrorMock: vi.fn(),
  messageSuccessMock: vi.fn(),
  providersQueryData: {
    current: undefined as IProvider[] | undefined,
  },
  updateProviderMock: vi.fn(),
}));

vi.mock('@/common/config/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/config/constants')>();
  return {
    ...actual,
    get CREATIVE_STUDIO_ENABLED() {
      return creativeStudioEnabled.current;
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      checkProviderHealth: { invoke: checkProviderHealthMock },
    },
    mode: {
      createProvider: { invoke: createProviderMock },
      deleteProvider: { invoke: vi.fn() },
      listProviders: { invoke: listProvidersMock },
      updateProvider: { invoke: updateProviderMock },
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
    useModal: (options: NonNullable<typeof addPlatformModalOptions.current>) => {
      addPlatformModalOptions.current = options;
      return [{ close: vi.fn(), open: addPlatformOpenMock }, null];
    },
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

vi.mock('@/renderer/components/settings/SettingsModal/contents/ModelModalContent/StudioMediaModelsSection', () => ({
  StudioMediaModelsSection: () => <section aria-label='Studio media models' />,
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      error: messageErrorMock,
      success: messageSuccessMock,
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

const clickModelHealthCheck = (): void => {
  screen.getByRole('button', { name: 'settings.healthCheck' }).click();
};

const failedHealthResponse = (overrides: Record<string, unknown>) => ({
  provider_id: provider.id,
  platform: provider.platform,
  model: 'model-a',
  status: 'unhealthy' as const,
  elapsed_ms: 25,
  message: 'Provider request failed',
  ...overrides,
});

describe('ModelModalContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addPlatformModalOptions.current = undefined;
    appOperationsCardProps.current = undefined;
    checkProviderHealthMock.mockReset();
    createProviderMock.mockResolvedValue(undefined);
    creativeStudioEnabled.current = true;
    listProvidersMock.mockResolvedValue([provider]);
    updateProviderMock.mockResolvedValue(undefined);
    providersQueryData.current = [];
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('labels the retained upstream setup link instead of presenting it as a WePrompt destination', () => {
    render(<ModelModalContent />);

    expect(screen.getByText('settings.upstreamAionUiDocumentation')).toBeInTheDocument();
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

  it('signals a persisted provider revision only after provider creation succeeds', async () => {
    let resolveCreate: (() => void) | undefined;
    createProviderMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        })
    );
    render(<ModelModalContent />);

    expect(appOperationsCardProps.current?.persistedProvidersRevision).toBe(0);

    act(() => addPlatformModalOptions.current?.onSubmit(provider));

    expect(createProviderMock).toHaveBeenCalledWith(provider);
    expect(appOperationsCardProps.current?.persistedProvidersRevision).toBe(0);

    await act(async () => resolveCreate?.());

    await waitFor(() => expect(appOperationsCardProps.current?.persistedProvidersRevision).toBe(1));
  });

  it('hides Studio media models when Creative Studio is disabled', () => {
    creativeStudioEnabled.current = false;
    render(<ModelModalContent />);

    expect(screen.queryByRole('region', { name: 'Studio media models' })).not.toBeInTheDocument();
  });

  it('shows Studio media models when Creative Studio is enabled', () => {
    render(<ModelModalContent />);

    expect(screen.getByRole('region', { name: 'Studio media models' })).toBeInTheDocument();
  });

  it('preserves a structured overload instead of relabeling its 429 status as rate limiting', async () => {
    providersQueryData.current = [provider];
    checkProviderHealthMock.mockResolvedValue(
      failedHealthResponse({
        provider_error_type: 'engine_overloaded_error',
        error_kind: 'rate_limited',
        http_status: 429,
      })
    );
    render(<ModelModalContent />);

    clickModelHealthCheck();

    await waitFor(() =>
      expect(messageErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('settings.providerHealth.overload.action') })
      )
    );
    expect(updateProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model_health: expect.objectContaining({
          'model-a': expect.objectContaining({ failure_class: 'overload' }),
        }),
      })
    );
  });

  it('preserves structured rate limiting with the localized wait action', async () => {
    providersQueryData.current = [provider];
    checkProviderHealthMock.mockResolvedValue(
      failedHealthResponse({ provider_error_type: 'rate_limit_exceeded', http_status: 503 })
    );
    render(<ModelModalContent />);

    clickModelHealthCheck();

    await waitFor(() =>
      expect(messageErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('settings.providerHealth.rateLimit.action') })
      )
    );
    expect(updateProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model_health: expect.objectContaining({
          'model-a': expect.objectContaining({ failure_class: 'rate_limit' }),
        }),
      })
    );
  });

  it('preserves structured setup failure with the localized configuration recovery action', async () => {
    providersQueryData.current = [provider];
    checkProviderHealthMock.mockResolvedValue(
      failedHealthResponse({ provider_error_type: 'invalid_api_key', http_status: 429 })
    );
    render(<ModelModalContent />);

    clickModelHealthCheck();

    await waitFor(() =>
      expect(messageErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('settings.providerHealth.setup.action') })
      )
    );
    expect(updateProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model_health: expect.objectContaining({
          'model-a': expect.objectContaining({ failure_class: 'setup' }),
        }),
      })
    );
  });

  it('preserves connectivity failure with the localized network recovery action', async () => {
    providersQueryData.current = [provider];
    checkProviderHealthMock.mockResolvedValue(
      failedHealthResponse({ provider_error_type: 'connection_error', http_status: 429 })
    );
    render(<ModelModalContent />);

    clickModelHealthCheck();

    await waitFor(() =>
      expect(messageErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('settings.providerHealth.connectivity.action') })
      )
    );
    expect(updateProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model_health: expect.objectContaining({
          'model-a': expect.objectContaining({ failure_class: 'connectivity' }),
        }),
      })
    );
  });

  it('retries once only when the provider supplies bounded retry guidance', async () => {
    vi.useFakeTimers();
    providersQueryData.current = [provider];
    checkProviderHealthMock
      .mockResolvedValueOnce(
        failedHealthResponse({
          provider_error_type: 'engine_overloaded_error',
          retry_after_ms: 250,
        })
      )
      .mockResolvedValueOnce({
        provider_id: provider.id,
        platform: provider.platform,
        model: 'model-a',
        status: 'healthy',
        elapsed_ms: 20,
      });
    render(<ModelModalContent />);

    clickModelHealthCheck();
    await vi.waitFor(() => expect(checkProviderHealthMock).toHaveBeenCalledTimes(1));
    await act(async () => vi.advanceTimersByTime(250));

    await vi.waitFor(() => expect(checkProviderHealthMock).toHaveBeenCalledTimes(2));
    expect(messageSuccessMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
