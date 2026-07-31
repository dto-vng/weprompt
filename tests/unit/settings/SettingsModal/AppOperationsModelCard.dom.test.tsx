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
import type { AppOperationsModelResponse } from '@/common/types/appOperations';

const { checkMock, getMock, updateMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
  checkMock: vi.fn(),
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

const getFixedSelect = () => screen.getByLabelText('settings.appOperationsModel.fixedModel');

describe('AppOperationsModelCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue(autoReady);
    updateMock.mockResolvedValue(autoReady);
    checkMock.mockResolvedValue(autoReady);
  });

  afterEach(() => {
    cleanup();
  });

  it('loads and presents the auto resolution with its compaction scope', async () => {
    renderCard();

    await screen.findByText('Provider A');

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'settings.appOperationsModel.auto' })).toBeChecked();
    expect(screen.getByText('Provider A')).toBeVisible();
    expect(screen.getByText('model-a')).toBeVisible();
    expect(screen.getByText('settings.appOperationsModel.status.ready')).toBeVisible();
    expect(screen.getByText('settings.appOperationsModel.contextCompaction')).toBeVisible();
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

  it('restores auto and only shows localized save-failure copy after a rejected update', async () => {
    updateMock.mockRejectedValueOnce(new Error('secret backend error'));
    renderCard();
    await screen.findByText('Provider A');

    fireEvent.click(screen.getByRole('radio', { name: 'settings.appOperationsModel.fixed' }));

    await screen.findByText('settings.appOperationsModel.saveFailed');
    expect(screen.getByRole('radio', { name: 'settings.appOperationsModel.auto' })).toBeChecked();
    expect(screen.queryByText('secret backend error')).not.toBeInTheDocument();
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

    const checkButton = screen.getByRole('button', { name: 'settings.appOperationsModel.check' });
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
    expect(screen.getByRole('button', { name: 'settings.appOperationsModel.check' })).toBeEnabled();
  });

  it('restores the prior response and only shows localized check-failure copy after a rejected check', async () => {
    checkMock.mockRejectedValueOnce(new Error('secret check error'));
    renderCard();
    await screen.findByText('Provider A');

    fireEvent.click(screen.getByRole('button', { name: 'settings.appOperationsModel.check' }));

    await screen.findByText('settings.appOperationsModel.checkFailed');
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

    const retry = await screen.findByRole('button', { name: 'settings.appOperationsModel.retry' });
    expect(screen.getByText('settings.appOperationsModel.loadFailed')).toBeVisible();
    fireEvent.click(retry);

    await screen.findByText('Provider A');
    expect(getMock).toHaveBeenCalledTimes(2);
  });
});
