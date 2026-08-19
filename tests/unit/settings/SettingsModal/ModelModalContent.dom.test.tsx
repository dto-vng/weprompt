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
  deleteProviderMock,
  listProvidersMock,
  messageErrorMock,
  messageSuccessMock,
  modalConfirmMock,
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
          onAssignmentChange?: (assignment: {
            resolved?: { provider_id: string; model_id: string };
            pinned?: { provider_id: string; model_id: string };
          }) => void;
          persistedProvidersRevision: number;
          providers: IProvider[];
          providersLoading: boolean;
        }
      | undefined,
  },
  checkProviderHealthMock: vi.fn(),
  createProviderMock: vi.fn(),
  creativeStudioEnabled: { current: true },
  deleteProviderMock: vi.fn(),
  listProvidersMock: vi.fn(),
  messageErrorMock: vi.fn(),
  messageSuccessMock: vi.fn(),
  modalConfirmMock: vi.fn(),
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
      deleteProvider: { invoke: deleteProviderMock },
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

// Arco's imperative Modal.confirm and Message mount through the legacy
// ReactDOM.render that React 19 removed; the app restores them by importing
// `@arco-design/web-react/es/_util/react-19-adapter` in main.tsx, which no test
// loads. Both are stubbed here, matching tests/unit/pages/project/ProjectHeader.
// Dropdown and Menu are left REAL so the overflow trigger is genuinely exercised
// against the action cluster's click/mousedown stopPropagation.
vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  const ActualModal = actual.Modal;
  return {
    ...actual,
    // Spreading a function yields a non-callable object, so Object.assign keeps
    // <Modal> renderable while replacing only the imperative `confirm`.
    Modal: Object.assign((props: React.ComponentProps<typeof ActualModal>) => <ActualModal {...props} />, ActualModal, {
      confirm: (options: unknown) => modalConfirmMock(options),
    }),
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

// The model rows live inside a collapsed Arco panel, so the panel has to be
// expanded before the per-model health-check button exists in the DOM.
const clickModelHealthCheck = async (): Promise<void> => {
  const header = await screen.findByText(provider.name);
  await act(async () => {
    header.click();
  });
  const healthCheckButton = await screen.findByRole('button', { name: 'settings.healthCheck' });
  await act(async () => {
    healthCheckButton.click();
  });
};

/** The subset of Arco's Modal.confirm options this suite reads back. */
type ConfirmOptions = {
  title?: React.ReactNode;
  content?: React.ReactNode;
  okButtonProps?: { status?: string };
  onOk?: () => void | Promise<void>;
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
    deleteProviderMock.mockResolvedValue(undefined);
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

  it('renders the app operations panel in the header action row, not in the scrolled body', () => {
    providersQueryData.current = [provider];
    render(<ModelModalContent />);

    const card = screen.getByTestId('app-operations-card');
    // The support note closes the header block, so a panel that precedes it sits
    // inside the header actions rather than at the top of the provider list.
    const supportNote = screen.getByText('settings.customModelSupportNote');
    expect(card.compareDocumentPosition(supportNote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    await clickModelHealthCheck();

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

    await clickModelHealthCheck();

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

    await clickModelHealthCheck();

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

    await clickModelHealthCheck();

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

  // The counts and the health phrase are the two things the redesign promises are
  // readable without hovering. jsdom compiles no UnoCSS and models no hover, so
  // these assert the absence of the reveal utilities and the presence of one node
  // — the same shape the repo's other row tests use.
  describe('provider row summary', () => {
    const providerWith = (overrides: Partial<IProvider>): IProvider => ({ ...provider, ...overrides });

    it('renders the counts with no hover-reveal utilities left on them', async () => {
      providersQueryData.current = [provider];
      render(<ModelModalContent />);

      const counts = await screen.findByTestId('provider-counts-provider-a');
      expect(counts).toHaveTextContent('settings.providerRow.counts');
      expect(counts.className).not.toContain('opacity-0');
      expect(counts.className).not.toContain('group-hover:');
      expect(counts.className).not.toContain('max-w-0');
    });

    it('renders the counts exactly once, with no breakpoint duplicate beside them', async () => {
      providersQueryData.current = [provider];
      render(<ModelModalContent />);

      await screen.findByTestId('provider-counts-provider-a');
      expect(screen.getAllByTestId('provider-counts-provider-a')).toHaveLength(1);
      expect(screen.getAllByText('settings.providerRow.counts')).toHaveLength(1);
      // The deleted md:hidden fallback rendered a bare "models / keys" pair.
      expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
    });

    it('leads with the failure when any model is unhealthy', async () => {
      providersQueryData.current = [
        providerWith({
          models: ['model-a', 'model-b'],
          model_health: { 'model-a': { status: 'healthy' }, 'model-b': { status: 'unhealthy' } },
        }),
      ];
      render(<ModelModalContent />);

      const summary = await screen.findByTestId('provider-health-provider-a');
      expect(summary).toHaveTextContent('settings.providerRow.healthFailing');
    });

    it('reports the checked fraction when the catalog is only partly measured', async () => {
      providersQueryData.current = [
        providerWith({
          models: ['model-a', 'model-b'],
          model_health: { 'model-a': { status: 'healthy' } },
        }),
      ];
      render(<ModelModalContent />);

      const summary = await screen.findByTestId('provider-health-provider-a');
      expect(summary).toHaveTextContent('settings.providerRow.healthChecked');
    });

    it('says the provider is unchecked before any health check has run', async () => {
      providersQueryData.current = [provider];
      render(<ModelModalContent />);

      const summary = await screen.findByTestId('provider-health-provider-a');
      expect(summary).toHaveTextContent('settings.providerRow.healthNotChecked');
    });

    it('renders no health summary at all for a provider with no models', async () => {
      providersQueryData.current = [providerWith({ models: [] })];
      render(<ModelModalContent />);

      await screen.findByTestId('provider-counts-provider-a');
      expect(screen.queryByTestId('provider-health-provider-a')).not.toBeInTheDocument();
    });
  });

  describe('provider row actions', () => {
    /** The action cluster stops click and mousedown, so the trigger is worth exercising for real. */
    const openProviderMenu = async (index = 0): Promise<void> => {
      await screen.findAllByRole('button', { name: 'common.more' });
      const more = screen.getAllByRole('button', { name: 'common.more' })[index];
      await act(async () => {
        more.click();
      });
    };

    it('exposes add, edit and overflow as the three named provider actions, in that order', async () => {
      providersQueryData.current = [provider];
      render(<ModelModalContent />);

      await screen.findByTestId('provider-counts-provider-a');
      const cluster = screen.getByRole('button', { name: 'settings.addModel' }).parentElement;
      expect(cluster).not.toBeNull();
      const names = Array.from(cluster?.querySelectorAll('button') ?? []).map((button) =>
        button.getAttribute('aria-label')
      );
      expect(names).toEqual(['settings.addModel', 'settings.editModel', 'common.more']);
    });

    it('offers delete only from the overflow menu, never as a bare row button', async () => {
      providersQueryData.current = [provider];
      render(<ModelModalContent />);

      await screen.findByTestId('provider-counts-provider-a');
      expect(screen.queryByTestId('menu-delete-provider-provider-a')).not.toBeInTheDocument();

      await openProviderMenu();

      expect(await screen.findByTestId('menu-delete-provider-provider-a')).toBeInTheDocument();
    });

    it('confirms before deleting the provider, then deletes exactly that provider', async () => {
      providersQueryData.current = [provider];
      render(<ModelModalContent />);

      await screen.findByTestId('provider-counts-provider-a');
      await openProviderMenu();
      const menuItem = await screen.findByTestId('menu-delete-provider-provider-a');
      await act(async () => {
        menuItem.click();
      });

      // The menu click must not delete on its own — the confirm is the gate.
      expect(deleteProviderMock).not.toHaveBeenCalled();
      await waitFor(() => expect(modalConfirmMock).toHaveBeenCalledTimes(1));

      const options = modalConfirmMock.mock.calls[0][0] as ConfirmOptions;
      expect(options.title).toBe('settings.providerRow.deleteConfirmTitle');
      expect(options.okButtonProps?.status).toBe('danger');
      const body = render(<>{options.content}</>);
      expect(body.getByText('settings.providerRow.deleteConfirmBody')).toBeInTheDocument();
      expect(body.getByText('settings.providerRow.deleteConfirmDetail')).toBeInTheDocument();

      await act(async () => {
        await options.onOk?.();
      });

      await waitFor(() => expect(deleteProviderMock).toHaveBeenCalledWith({ id: 'provider-a' }));
    });

    it('clears health status for one provider only, behind its own confirm', async () => {
      providersQueryData.current = [provider, { ...provider, id: 'provider-b', name: 'Provider B' }];
      render(<ModelModalContent />);

      await screen.findByTestId('provider-counts-provider-a');
      await openProviderMenu();
      const menuItem = await screen.findByTestId('menu-clear-health-provider-a');
      await act(async () => {
        menuItem.click();
      });

      expect(updateProviderMock).not.toHaveBeenCalled();
      await waitFor(() => expect(modalConfirmMock).toHaveBeenCalledTimes(1));

      const options = modalConfirmMock.mock.calls[0][0] as ConfirmOptions;
      expect(options.title).toBe('settings.providerRow.clearHealthConfirmTitle');
      // Recoverable by re-running the check, so it must not borrow the danger button.
      expect(options.okButtonProps?.status).toBeUndefined();

      await act(async () => {
        await options.onOk?.();
      });

      await waitFor(() => expect(updateProviderMock).toHaveBeenCalledWith({ id: 'provider-a', model_health: {} }));
      expect(updateProviderMock).toHaveBeenCalledTimes(1);
    });

    // The pin is disclosed at the destructive moment because that is the last point
    // where the provider's human-readable name still exists; the card can only show
    // the raw id afterwards. The aftermath itself is deliberately not auto-repaired.
    describe('app operations pin disclosure', () => {
      const publish = async (pinned?: { provider_id: string; model_id: string }): Promise<void> => {
        await act(async () => {
          appOperationsCardProps.current?.onAssignmentChange?.({ pinned });
        });
      };

      const openDeleteConfirm = async (): Promise<ConfirmOptions> => {
        await openProviderMenu();
        const menuItem = await screen.findByTestId('menu-delete-provider-provider-a');
        await act(async () => {
          menuItem.click();
        });
        await waitFor(() => expect(modalConfirmMock).toHaveBeenCalled());
        return modalConfirmMock.mock.calls.at(-1)?.[0] as ConfirmOptions;
      };

      beforeEach(() => {
        providersQueryData.current = [provider];
      });

      it('warns when the provider being deleted is the pinned one', async () => {
        render(<ModelModalContent />);
        await screen.findByTestId('provider-counts-provider-a');
        await publish({ provider_id: 'provider-a', model_id: 'model-a' });

        const body = render(<>{(await openDeleteConfirm()).content}</>);
        expect(body.getByText('settings.providerRow.deleteAppOperationsWarning')).toBeInTheDocument();
      });

      it('stays silent when a different provider holds the pin', async () => {
        render(<ModelModalContent />);
        await screen.findByTestId('provider-counts-provider-a');
        await publish({ provider_id: 'provider-b', model_id: 'model-b' });

        const body = render(<>{(await openDeleteConfirm()).content}</>);
        expect(body.queryByText('settings.providerRow.deleteAppOperationsWarning')).not.toBeInTheDocument();
      });

      it('stays silent in Auto mode, where nothing is pinned', async () => {
        render(<ModelModalContent />);
        await screen.findByTestId('provider-counts-provider-a');
        await publish(undefined);

        const body = render(<>{(await openDeleteConfirm()).content}</>);
        expect(body.queryByText('settings.providerRow.deleteAppOperationsWarning')).not.toBeInTheDocument();
      });
    });
  });

  describe('model row', () => {
    const expandProvider = async (): Promise<void> => {
      const header = await screen.findByText(provider.name);
      await act(async () => {
        header.click();
      });
    };

    it('shows the measured latency inline instead of only in a tooltip', async () => {
      providersQueryData.current = [{ ...provider, model_health: { 'model-a': { status: 'healthy', latency: 412 } } }];
      render(<ModelModalContent />);
      await expandProvider();

      const latency = await screen.findByTestId('model-latency-provider-a-model-a');
      expect(latency).toHaveTextContent('settings.modelRow.latency');
    });

    it('still shows a latency of zero, which a falsy guard would hide', async () => {
      providersQueryData.current = [{ ...provider, model_health: { 'model-a': { status: 'healthy', latency: 0 } } }];
      render(<ModelModalContent />);
      await expandProvider();

      const latency = await screen.findByTestId('model-latency-provider-a-model-a');
      expect(latency).toHaveTextContent('settings.modelRow.latency');
    });

    it('says the model was never checked when no health has been recorded', async () => {
      providersQueryData.current = [provider];
      render(<ModelModalContent />);
      await expandProvider();

      const latency = await screen.findByTestId('model-latency-provider-a-model-a');
      expect(latency).toHaveTextContent('settings.modelRow.neverChecked');
    });

    it('tags only the resolved model, and nothing before the card publishes', async () => {
      providersQueryData.current = [{ ...provider, models: ['model-a', 'model-b'] }];
      render(<ModelModalContent />);
      await expandProvider();

      expect(screen.queryByTestId('model-app-operations-provider-a-model-a')).not.toBeInTheDocument();

      await act(async () => {
        appOperationsCardProps.current?.onAssignmentChange?.({
          resolved: { provider_id: 'provider-a', model_id: 'model-a' },
        });
      });

      expect(await screen.findByTestId('model-app-operations-provider-a-model-a')).toHaveTextContent(
        'settings.appOperationsModel.panelLabel'
      );
      expect(screen.queryByTestId('model-app-operations-provider-a-model-b')).not.toBeInTheDocument();
    });
  });

  it('retries once only when the provider supplies bounded retry guidance', async () => {
    // shouldAdvanceTime keeps Testing Library's real-timer polling alive while the
    // component's retry delay stays under advanceTimersByTime control.
    vi.useFakeTimers({ shouldAdvanceTime: true });
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

    await clickModelHealthCheck();
    await vi.waitFor(() => expect(checkProviderHealthMock).toHaveBeenCalledTimes(1));
    await act(async () => vi.advanceTimersByTime(250));

    await vi.waitFor(() => expect(checkProviderHealthMock).toHaveBeenCalledTimes(2));
    expect(messageSuccessMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
