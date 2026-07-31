/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IProvider } from '@/common/config/storage';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { AppOperationsModelReasonCode, AppOperationsModelResponse } from '@/common/types/appOperations';

const { checkMock, getMock, messageErrorMock, updateMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
  checkMock: vi.fn(),
  messageErrorMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  appOperationsModel: {
    get: { invoke: getMock },
    update: { invoke: updateMock },
    check: { invoke: checkMock },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      useMessage: () => [{ error: messageErrorMock }, null],
    },
  };
});

vi.mock('@/renderer/components/base/AionSelect', () => {
  type NativeSelectProps = {
    'aria-label'?: string;
    children?: React.ReactNode;
    disabled?: boolean;
    onChange?: (value: string) => void;
    value?: string;
  };
  const Select = ({ children, onChange, ...props }: NativeSelectProps) => (
    <select {...props} onChange={(event) => onChange?.(event.target.value)}>
      {children}
    </select>
  );
  const Option = ({ children, ...props }: { children?: React.ReactNode; disabled?: boolean; value: string }) => (
    <option {...props}>{children}</option>
  );
  const OptGroup = ({ children, label }: { children?: React.ReactNode; label: string }) => (
    <optgroup label={label}>{children}</optgroup>
  );
  return { default: Object.assign(Select, { Option, OptGroup }) };
});

import AppOperationsModelCard from '@/renderer/components/settings/SettingsModal/AppOperationsModelCard';

const providers: IProvider[] = [
  {
    id: 'provider-a',
    platform: 'openai',
    name: 'Provider A',
    base_url: 'https://example.test/v1',
    api_key: 'secret',
    models: ['model-a', 'model-b'],
    enabled: true,
    model_enabled: { 'model-a': true, 'model-b': true },
    capabilities: [{ type: 'text' }],
  },
];

const autoReady: AppOperationsModelResponse = {
  setting: { mode: 'auto' },
  resolved_model: { provider_id: 'provider-a', model_id: 'model-a' },
  health: 'ready',
};

const renderCard = (overrides: Partial<React.ComponentProps<typeof AppOperationsModelCard>> = {}) => {
  const onAddModel = vi.fn();
  render(
    <AppOperationsModelCard providers={providers} providersLoading={false} onAddModel={onAddModel} {...overrides} />
  );
  return { onAddModel };
};

const getFixedSelect = () => screen.getByLabelText('settings.selectModel');

const reasonCases: Array<[AppOperationsModelReasonCode, string]> = [
  ['no_eligible_model', 'settings.appOperationsModel.reason.noEligibleModel'],
  ['provider_missing', 'settings.appOperationsModel.reason.providerMissing'],
  ['provider_disabled', 'settings.appOperationsModel.reason.providerDisabled'],
  ['model_missing', 'settings.appOperationsModel.reason.modelMissing'],
  ['model_disabled', 'settings.appOperationsModel.reason.modelDisabled'],
  ['auth_required', 'settings.appOperationsModel.reason.authRequired'],
  ['health_check_failed', 'settings.appOperationsModel.reason.healthCheckFailed'],
];

describe('AppOperationsModelCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue(autoReady);
    updateMock.mockResolvedValue(autoReady);
    checkMock.mockResolvedValue(autoReady);
    messageErrorMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads and presents the planned labels, auto resolution, and compaction scope', async () => {
    renderCard();

    await screen.findByText('Provider A');

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'settings.appOperationsModel.auto' })).toBeChecked();
    expect(screen.getByText('Provider A')).toBeVisible();
    expect(screen.getByText('model-a')).toBeVisible();
    expect(screen.getByText('settings.appOperationsModel.status.ready')).toBeVisible();
    expect(screen.getByText('settings.appOperationsModel.description')).toBeVisible();
    expect(screen.getByText('settings.appOperationsModel.selectionLabel')).toBeVisible();
    expect(screen.getByText('settings.appOperationsModel.resolvedModelLabel')).toBeVisible();
    expect(screen.getByText('settings.appOperationsModel.healthLabel')).toBeVisible();
    expect(screen.getByText('settings.appOperationsModel.usedByLabel')).toBeVisible();
    expect(screen.getByText('settings.appOperationsModel.contextCompaction')).toBeVisible();
  });

  it('uses the planned setup-required status key', async () => {
    getMock.mockResolvedValue({ ...autoReady, health: 'setup_required' });
    renderCard();

    expect(await screen.findByText('settings.appOperationsModel.status.setupRequired')).toBeVisible();
  });

  it.each(reasonCases)('uses the planned locale key for %s', async (reasonCode, reasonKey) => {
    getMock.mockResolvedValue({
      setting: { mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' },
      health: 'unavailable',
      reason_code: reasonCode,
    });
    renderCard();

    expect(await screen.findByText(reasonKey)).toBeVisible();
  });

  it('switches from auto to the resolved fixed pair', async () => {
    renderCard();
    await screen.findByText('Provider A');

    fireEvent.click(screen.getByRole('radio', { name: 'settings.appOperationsModel.fixed' }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        mode: 'fixed',
        provider_id: 'provider-a',
        model_id: 'model-a',
      });
    });
  });

  it('switches from fixed to auto', async () => {
    getMock.mockResolvedValue({
      ...autoReady,
      setting: { mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' },
    });
    renderCard();
    await screen.findByText('Provider A');

    fireEvent.click(screen.getByRole('radio', { name: 'settings.appOperationsModel.auto' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ mode: 'auto' }));
  });

  it('allows fixed to auto while providers are loading but keeps fixed selection disabled', async () => {
    getMock.mockResolvedValue({
      ...autoReady,
      setting: { mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' },
    });
    renderCard({ providersLoading: true });
    await screen.findByText('Provider A');

    expect(screen.getByRole('radio', { name: 'settings.appOperationsModel.fixed' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'settings.appOperationsModel.auto' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ mode: 'auto' }));
  });

  it('updates a fixed selection using the serialized provider and model pair', async () => {
    getMock.mockResolvedValue({
      ...autoReady,
      setting: { mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' },
    });
    renderCard();
    await screen.findByText('Provider A');

    fireEvent.change(getFixedSelect(), { target: { value: JSON.stringify(['provider-a', 'model-b']) } });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        mode: 'fixed',
        provider_id: 'provider-a',
        model_id: 'model-b',
      });
    });
  });

  it('opens model setup instead of saving when no selectable pair exists', async () => {
    const { onAddModel } = renderCard({ providers: [] });
    await screen.findByText('settings.appOperationsModel.status.ready');

    fireEvent.click(screen.getByRole('radio', { name: 'settings.appOperationsModel.fixed' }));

    expect(onAddModel).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('restores auto and notifies with localized save-failure copy after a rejected update', async () => {
    updateMock.mockRejectedValueOnce(new Error('secret backend error'));
    renderCard();
    await screen.findByText('Provider A');

    fireEvent.click(screen.getByRole('radio', { name: 'settings.appOperationsModel.fixed' }));

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledWith('settings.appOperationsModel.saveFailed'));
    expect(screen.getByRole('radio', { name: 'settings.appOperationsModel.auto' })).toBeChecked();
    expect(screen.queryByText('secret backend error')).not.toBeInTheDocument();
  });

  it('shows saving copy while a model update is pending', async () => {
    let resolveUpdate: (response: AppOperationsModelResponse) => void = () => undefined;
    updateMock.mockImplementation(
      () =>
        new Promise<AppOperationsModelResponse>((resolve) => {
          resolveUpdate = resolve;
        })
    );
    renderCard();
    await screen.findByText('Provider A');

    fireEvent.click(screen.getByRole('radio', { name: 'settings.appOperationsModel.fixed' }));

    expect(screen.getByText('settings.appOperationsModel.saving')).toBeVisible();
    resolveUpdate(autoReady);
    await waitFor(() => expect(screen.queryByText('settings.appOperationsModel.saving')).not.toBeInTheDocument());
  });

  it('keeps a missing fixed pair visible as a disabled synthetic selection', async () => {
    getMock.mockResolvedValue({
      setting: { mode: 'fixed', provider_id: 'missing-provider', model_id: 'missing-model' },
      health: 'unavailable',
      reason_code: 'provider_missing',
    });
    renderCard();

    const synthetic = await screen.findByRole('option', { name: 'missing-provider / missing-model' });
    expect(synthetic).toBeDisabled();
    expect(getFixedSelect()).toHaveValue(JSON.stringify(['missing-provider', 'missing-model']));
  });

  it('renders a synthetic fixed option exactly once under its existing provider', async () => {
    getMock.mockResolvedValue({
      setting: { mode: 'fixed', provider_id: 'provider-a', model_id: 'missing-model' },
      health: 'unavailable',
      reason_code: 'model_missing',
    });
    renderCard();

    const synthetic = await screen.findAllByRole('option', { name: 'missing-model' });
    expect(synthetic).toHaveLength(1);
    expect(synthetic[0]).toBeDisabled();
  });

  it('shows Add Model for an auto setup-required no-eligible-model response', async () => {
    getMock.mockResolvedValue({
      setting: { mode: 'auto' },
      health: 'setup_required',
      reason_code: 'no_eligible_model',
    });
    const { onAddModel } = renderCard({ providers: [] });

    const addModel = await screen.findByRole('button', { name: 'settings.addModel' });
    fireEvent.click(addModel);
    expect(onAddModel).toHaveBeenCalledTimes(1);
  });

  it('shows checking immediately, disables duplicate checks, and accepts a changed auto resolution', async () => {
    let resolveCheck: (response: AppOperationsModelResponse) => void = () => undefined;
    checkMock.mockImplementation(
      () =>
        new Promise<AppOperationsModelResponse>((resolve) => {
          resolveCheck = resolve;
        })
    );
    renderCard();
    await screen.findByText('Provider A');

    const checkButton = screen.getByRole('button', { name: 'settings.healthCheck' });
    fireEvent.click(checkButton);

    expect(screen.getByText('settings.appOperationsModel.status.checking')).toBeVisible();
    expect(checkButton).toBeDisabled();
    fireEvent.click(checkButton);
    expect(checkMock).toHaveBeenCalledTimes(1);

    resolveCheck({
      ...autoReady,
      resolved_model: { provider_id: 'provider-a', model_id: 'model-b' },
    });
    await screen.findByText('model-b');
  });

  it('keeps a fixed health-check failure without resolution visible and retryable', async () => {
    getMock.mockResolvedValue({
      setting: { mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' },
      health: 'unavailable',
      reason_code: 'health_check_failed',
    });
    renderCard();

    await screen.findByText('Provider A');
    expect(screen.getByRole('button', { name: 'settings.healthCheck' })).toBeEnabled();
  });

  it('restores the prior response and notifies with localized check-failure copy after a rejected check', async () => {
    checkMock.mockRejectedValueOnce(new Error('secret check error'));
    renderCard();
    await screen.findByText('Provider A');

    fireEvent.click(screen.getByRole('button', { name: 'settings.healthCheck' }));

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledWith('settings.appOperationsModel.checkFailed'));
    expect(screen.getByText('settings.appOperationsModel.status.ready')).toBeVisible();
    expect(screen.queryByText('secret check error')).not.toBeInTheDocument();
  });

  it('renders the backend update requirement and disables mutations for a missing endpoint', async () => {
    getMock.mockRejectedValueOnce(
      new BackendHttpError({ method: 'GET', path: '/api/app-operations/model', status: 404, body: {} })
    );
    renderCard();

    await screen.findByText('settings.appOperationsModel.backendUpdateRequired');
    expect(screen.getByRole('radio', { name: 'settings.appOperationsModel.auto' })).toBeDisabled();
  });

  it('renders a retry action for other load failures', async () => {
    getMock.mockRejectedValueOnce(new Error('hidden error')).mockResolvedValueOnce(autoReady);
    renderCard();

    const retry = await screen.findByRole('button', { name: 'common.retry' });
    expect(screen.getByText('settings.appOperationsModel.loadFailed')).toBeVisible();
    fireEvent.click(retry);

    await screen.findByText('Provider A');
    expect(getMock).toHaveBeenCalledTimes(2);
  });
});
