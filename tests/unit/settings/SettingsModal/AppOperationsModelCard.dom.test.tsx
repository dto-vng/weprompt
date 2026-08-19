/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { IProvider } from '@/common/config/storage';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { AppOperationsModelReasonCode, AppOperationsModelResponse } from '@/common/types/appOperations';
import enUsSettings from '@renderer/services/i18n/locales/en-US/settings.json';

const { checkMock, getMock, messageErrorMock, updateMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
  checkMock: vi.fn(),
  messageErrorMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'settings.appOperationsModel.checkTime.today') return `checkedToday:${String(options?.time)}`;
      if (key === 'settings.appOperationsModel.checkTime.date') {
        return `checkedOn:${String(options?.date)}:${String(options?.time)}`;
      }
      return key;
    },
  }),
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

/** Providers exist but none is eligible — the panel must stay visible in SETUP REQUIRED. */
const ineligibleProviders: IProvider[] = [{ ...providers[0], enabled: false }];

const autoReady: AppOperationsModelResponse = {
  setting: { mode: 'auto' },
  resolved_model: { provider_id: 'provider-a', model_id: 'model-a' },
  health: 'ready',
};

const fixedReady: AppOperationsModelResponse = {
  setting: { mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' },
  resolved_model: { provider_id: 'provider-a', model_id: 'model-a' },
  health: 'ready',
};

const renderCard = (overrides: Partial<React.ComponentProps<typeof AppOperationsModelCard>> = {}) => {
  const onAddModel = vi.fn();
  const { rerender } = render(
    <AppOperationsModelCard
      providers={providers}
      providersLoading={false}
      persistedProvidersRevision={0}
      onAddModel={onAddModel}
      {...overrides}
    />
  );
  return { onAddModel, rerender };
};

const panel = () => screen.getByTestId('app-operations-panel');
/** Band 1 — label, info affordance, mode pill, gear. */
const headerBand = () => screen.getByTestId('app-operations-header');
/** Band 2 — logo tile, provider name over model id. Absent in several states. */
const identityBand = () => screen.queryByTestId('app-operations-identity');
/** Band 3 — status dot/spinner, status word, last check, consumer. */
const statusLine = () => screen.getByTestId('app-operations-status-line');
const statusWord = () => screen.getByTestId('app-operations-status');
const openPopover = async () => {
  fireEvent.click(screen.getByTestId('app-operations-popover-trigger'));
  return screen.findByTestId('app-operations-popover');
};
/**
 * A kept-but-dead Fixed pair has no gear — the card carries the two actions that
 * fix it instead, and Pick another is the way back into the picker.
 */
const openPopoverViaPickAnother = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'settings.appOperationsModel.pickAnother' }));
  return screen.findByTestId('app-operations-popover');
};
const getFixedSelect = () => screen.getByLabelText('settings.selectModel');
const timeOf = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dateOf = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

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

  describe('state 8 — no providers', () => {
    it('hides the panel entirely when no provider is configured', async () => {
      renderCard({ providers: [] });

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      expect(screen.queryByTestId('app-operations-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('app-operations-popover-trigger')).not.toBeInTheDocument();
    });

    it('keeps the panel visible when providers exist but none is eligible', async () => {
      getMock.mockResolvedValue({
        setting: { mode: 'auto' },
        health: 'setup_required',
        reason_code: 'no_eligible_model',
      });
      renderCard({ providers: ineligibleProviders });

      expect(await screen.findByTestId('app-operations-panel')).toBeVisible();
      expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.setupRequired');
    });
  });

  describe('state 1 — ready', () => {
    it('states mode, provider, model, status and consumer at a glance', async () => {
      renderCard();

      await screen.findByText('Provider A');
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(panel()).toHaveAttribute('data-status', 'ready');
      // A quiet keyline still has to be visible on all four sides: `border-b-base`
      // compiles to `border-bottom-color: var(--bg-base)` — one edge, page background.
      expect(panel()).toHaveClass('border-arco-2');
      expect(panel().className).not.toMatch(/border-b-base/);
      expect(screen.getByTestId('app-operations-mode')).toHaveTextContent('settings.appOperationsModel.auto');
      expect(screen.getByTestId('app-operations-model')).toHaveTextContent('model-a');
      expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.ready');
      expect(screen.getByTestId('app-operations-consumer')).toHaveTextContent(
        'settings.appOperationsModel.contextCompaction'
      );
      expect(screen.getByText('settings.appOperationsModel.panelLabel')).toBeVisible();
    });

    it('stacks the card into three bands rather than one horizontal row', async () => {
      renderCard();
      await screen.findByText('Provider A');

      // Band 1 carries the identity of the block and the way in — never the status.
      const header = headerBand();
      expect(within(header).getByText('settings.appOperationsModel.panelLabel')).toBeVisible();
      expect(within(header).getByTestId('app-operations-info')).toBeVisible();
      expect(within(header).getByTestId('app-operations-mode')).toBeVisible();
      expect(within(header).getByTestId('app-operations-popover-trigger')).toBeVisible();
      expect(within(header).queryByTestId('app-operations-status')).not.toBeInTheDocument();

      // Band 2 is its own row: logo tile plus two stacked lines.
      const identity = identityBand();
      expect(identity).not.toBeNull();
      expect(within(identity as HTMLElement).getByTestId('app-operations-avatar')).toBeVisible();
      expect(within(identity as HTMLElement).getByTestId('app-operations-provider')).toHaveTextContent('Provider A');
      expect(within(identity as HTMLElement).getByTestId('app-operations-model')).toHaveTextContent('model-a');
      expect(within(identity as HTMLElement).queryByTestId('app-operations-status')).not.toBeInTheDocument();

      // Band 3 is the footer, divided from band 2 by a visible keyline.
      expect(within(statusLine()).getByTestId('app-operations-status')).toBeVisible();
      expect(statusLine()).toHaveClass('border-t');
      expect(statusLine()).toHaveClass('border-arco-2');
      expect(statusLine().className).not.toMatch(/border-b-base/);
    });

    it('keeps both identity lines recoverable when they are too long to fit', async () => {
      renderCard();
      await screen.findByText('Provider A');

      // jsdom cannot measure truncation, so this asserts the two things that make
      // an ellipsis survivable: the class that clips and the title that recovers.
      const provider = screen.getByTestId('app-operations-provider');
      expect(provider).toHaveClass('truncate');
      expect(provider).toHaveAttribute('title', 'Provider A');
      const model = screen.getByTestId('app-operations-model');
      expect(model).toHaveClass('truncate');
      expect(model).toHaveAttribute('title', 'model-a');
    });

    it('explains what the block is through an info affordance, not the label alone', async () => {
      renderCard();
      await screen.findByText('Provider A');

      expect(screen.getByTestId('app-operations-info')).toHaveAttribute(
        'aria-label',
        'settings.appOperationsModel.panelInfo'
      );
    });

    it('states status as a dot plus a word, never colour alone', async () => {
      renderCard();

      await screen.findByText('Provider A');
      const dot = within(statusWord()).getByTestId('app-operations-status-dot');
      expect(dot).toHaveAttribute('aria-hidden', 'true');
      expect(statusWord()).toHaveAttribute('data-tone', 'success');
      expect(statusWord().textContent?.trim()).toBe('settings.appOperationsModel.status.ready');
    });

    it('keeps the polite announcement region around the status line', async () => {
      renderCard();

      await screen.findByText('Provider A');
      expect(statusLine()).toHaveAttribute('aria-live', 'polite');
      expect(statusWord().closest('[aria-live="polite"]')).not.toBeNull();
    });

    it('drops the identity band entirely when Auto resolves no model', async () => {
      getMock.mockResolvedValue({
        setting: { mode: 'auto' },
        health: 'setup_required',
        reason_code: 'no_eligible_model',
      });
      renderCard({ providers: ineligibleProviders });

      await screen.findByTestId('app-operations-panel');
      // Nothing resolved, so there is no provider or model to state — and no
      // placeholder standing in for one.
      expect(identityBand()).toBeNull();
      expect(screen.queryByTestId('app-operations-avatar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('app-operations-model')).not.toBeInTheDocument();
      // Without band 2 above it, band 3 is not divided from anything.
      expect(statusLine()).not.toHaveClass('border-t');
    });
  });

  describe('state 2 — fixed and pinned', () => {
    it('reads FIXED in the mode chip without marking the pair as kept', async () => {
      getMock.mockResolvedValue(fixedReady);
      renderCard();

      await screen.findByText('Provider A');
      expect(screen.getByTestId('app-operations-mode')).toHaveTextContent('settings.appOperationsModel.fixed');
      expect(screen.getByTestId('app-operations-model')).not.toHaveClass('line-through');
      expect(screen.queryByTestId('app-operations-kept')).not.toBeInTheDocument();
    });

    it('renders the pinned model id in mono, ellipsized, on its own line', async () => {
      getMock.mockResolvedValue(fixedReady);
      renderCard();

      await screen.findByText('Provider A');
      const model = screen.getByTestId('app-operations-model');
      expect(model).toHaveClass('font-mono');
      expect(model).toHaveClass('truncate');
      // Provider name and model id are siblings in the stacked column, not one line.
      expect(model.parentElement).not.toBe(screen.getByTestId('app-operations-provider'));
      expect(identityBand()).toContainElement(model);
    });

    it('stays a quiet card — the same shape as ready, with no keyline escalation', async () => {
      getMock.mockResolvedValue(fixedReady);
      renderCard();

      await screen.findByText('Provider A');
      expect(panel()).toHaveClass('border-arco-2');
      expect(panel().className).not.toMatch(/border-l-3px/);
      expect(screen.getByTestId('app-operations-consumer')).toBeVisible();
      expect(screen.queryByTestId('app-operations-actions')).not.toBeInTheDocument();
    });

    it('turns the popover model row into the picker without echoing what it resolved to', async () => {
      getMock.mockResolvedValue(fixedReady);
      renderCard();

      await screen.findByText('Provider A');
      const popover = await openPopover();

      expect(within(popover).getByLabelText('settings.selectModel')).toBeInTheDocument();
      expect(within(popover).queryByTestId('app-operations-managed-by-auto')).not.toBeInTheDocument();
      expect(within(popover).queryByTestId('app-operations-popover-resolved')).not.toBeInTheDocument();
    });

    it('shows Managed by Auto instead of a picker in auto mode', async () => {
      renderCard();

      await screen.findByText('Provider A');
      const popover = await openPopover();

      expect(within(popover).getByTestId('app-operations-managed-by-auto')).toHaveTextContent(
        'settings.appOperationsModel.managedByAuto'
      );
      expect(within(popover).queryByLabelText('settings.selectModel')).not.toBeInTheDocument();
      expect(within(popover).getByText('settings.appOperationsModel.autoExplainer')).toBeVisible();
    });
  });

  describe('state 3 — checking', () => {
    it('retains identity, states Checking, and refuses a duplicate check', async () => {
      let resolveCheck: (response: AppOperationsModelResponse) => void = () => undefined;
      checkMock.mockImplementation(
        () =>
          new Promise<AppOperationsModelResponse>((resolve) => {
            resolveCheck = resolve;
          })
      );
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      const checkNow = within(popover).getByRole('button', { name: 'settings.appOperationsModel.checkNow' });
      fireEvent.click(checkNow);

      await waitFor(() => expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.checking'));
      expect(screen.getByText('Provider A')).toBeVisible();
      expect(screen.getByTestId('app-operations-model')).toHaveTextContent('model-a');
      expect(checkNow).toBeDisabled();
      fireEvent.click(checkNow);
      expect(checkMock).toHaveBeenCalledTimes(1);

      resolveCheck({ ...autoReady, resolved_model: { provider_id: 'provider-a', model_id: 'model-b' } });
      await screen.findByText('model-b');
    });

    it('swaps the dot for a spinner, drops the timestamp and keeps the consumer', async () => {
      checkMock.mockImplementation(() => new Promise<AppOperationsModelResponse>(() => undefined));
      getMock.mockResolvedValue({ ...autoReady, checked_at: Date.now() });
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.checkNow' }));

      await waitFor(() => expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.checking'));
      expect(within(statusWord()).getByTestId('app-operations-status-spinner')).toBeVisible();
      expect(within(statusWord()).queryByTestId('app-operations-status-dot')).not.toBeInTheDocument();
      // A stale "checked at" next to Checking would date the wrong thing.
      expect(screen.queryByTestId('app-operations-checked')).not.toBeInTheDocument();
      expect(screen.getByTestId('app-operations-consumer')).toBeVisible();
      // Quiet state: no keyline escalation while a check is merely in flight.
      expect(panel()).toHaveClass('border-arco-2');
    });

    it('mutes the gear while checking instead of removing it', async () => {
      checkMock.mockImplementation(() => new Promise<AppOperationsModelResponse>(() => undefined));
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.checkNow' }));

      await waitFor(() => expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.checking'));
      expect(screen.getByTestId('app-operations-popover-trigger')).toBeDisabled();
    });

    it('disables Check now when nothing resolves and enables it when a resolved model is unhealthy', async () => {
      getMock.mockResolvedValue({
        setting: { mode: 'auto' },
        health: 'setup_required',
        reason_code: 'no_eligible_model',
      });
      renderCard({ providers: ineligibleProviders });
      await screen.findByTestId('app-operations-panel');
      // Setup required has no gear at all — Add Model is the only way forward, so
      // Check now is not merely disabled, it is unreachable.
      expect(screen.queryByTestId('app-operations-popover-trigger')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'settings.appOperationsModel.checkNow' })).not.toBeInTheDocument();

      cleanup();
      getMock.mockResolvedValue({ ...autoReady, health: 'unavailable', reason_code: 'health_check_failed' });
      renderCard();
      await screen.findByText('Provider A');
      const enabledPopover = await openPopover();
      expect(
        within(enabledPopover).getByRole('button', { name: 'settings.appOperationsModel.checkNow' })
      ).toBeEnabled();
    });

    it('restores the prior response and localized copy after a rejected check', async () => {
      checkMock.mockRejectedValueOnce(new Error('secret check error'));
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.checkNow' }));

      await waitFor(() => expect(messageErrorMock).toHaveBeenCalledWith('settings.appOperationsModel.checkFailed'));
      expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.ready');
      expect(screen.queryByText('secret check error')).not.toBeInTheDocument();
    });
  });

  describe('state 4 — setup required', () => {
    it('escalates the keyline, states what is affected and offers Add Model', async () => {
      getMock.mockResolvedValue({
        setting: { mode: 'auto' },
        health: 'setup_required',
        reason_code: 'no_eligible_model',
      });
      const { onAddModel } = renderCard({ providers: ineligibleProviders });

      await screen.findByTestId('app-operations-panel');
      expect(panel()).toHaveAttribute('data-tone', 'warning');
      // A 3px left keyline in the warning tone. `border-l-warning-6` compiles to
      // nothing, so the tone colour is set once for all four sides and only the
      // left WIDTH is raised — asserting both halves keeps that pairing honest.
      expect(panel()).toHaveClass('border-warning');
      expect(panel()).toHaveClass('border-l-3px');
      expect(panel().className).not.toMatch(/border-b-base/);
      expect(screen.getByText('settings.appOperationsModel.setupRequiredImpact')).toBeVisible();
      expect(screen.getByText('settings.appOperationsModel.reason.noEligibleModel')).toBeVisible();

      fireEvent.click(screen.getByRole('button', { name: 'settings.addModel' }));
      expect(onAddModel).toHaveBeenCalledTimes(1);
    });

    it('replaces the whole card body with cause then action — no identity, no consumer, no gear', async () => {
      getMock.mockResolvedValue({
        setting: { mode: 'auto' },
        health: 'setup_required',
        reason_code: 'no_eligible_model',
      });
      renderCard({ providers: ineligibleProviders });

      await screen.findByTestId('app-operations-panel');
      // Band 1 keeps only the label, the info affordance and the mode pill.
      expect(within(headerBand()).getByTestId('app-operations-mode')).toHaveTextContent(
        'settings.appOperationsModel.auto'
      );
      expect(within(headerBand()).queryByTestId('app-operations-popover-trigger')).not.toBeInTheDocument();
      expect(identityBand()).toBeNull();
      expect(screen.queryByTestId('app-operations-consumer')).not.toBeInTheDocument();
      expect(screen.queryByTestId('app-operations-checked')).not.toBeInTheDocument();
      expect(within(statusWord()).getByTestId('app-operations-status-dot')).toBeVisible();
      expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.setupRequired');
    });

    it('gives Add Model the full width of the card as the one action that fixes it', async () => {
      getMock.mockResolvedValue({
        setting: { mode: 'auto' },
        health: 'setup_required',
        reason_code: 'no_eligible_model',
      });
      renderCard({ providers: ineligibleProviders });

      await screen.findByTestId('app-operations-panel');
      const actions = screen.getByTestId('app-operations-actions');
      const addModel = within(actions).getByRole('button', { name: 'settings.addModel' });
      // Arco's `long` prop is what makes a Button span its container.
      expect(addModel).toHaveClass('arco-btn-long');
      expect(addModel).toHaveClass('arco-btn-primary');
      expect(within(actions).getAllByRole('button')).toHaveLength(1);
    });

    it('describes the compaction fallback truthfully as a rules-based summary, not trimming', () => {
      const impact = enUsSettings.appOperationsModel.setupRequiredImpact;

      expect(impact).toMatch(/rules-based/i);
      expect(impact).not.toMatch(/trim/i);
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
  });

  describe('state 5 — fixed model unavailable', () => {
    it('keeps the saved pair on screen, struck through and marked KEPT', async () => {
      getMock.mockResolvedValue({
        setting: { mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' },
        health: 'unavailable',
        reason_code: 'model_disabled',
      });
      renderCard();

      await screen.findByText('Provider A');
      expect(panel()).toHaveAttribute('data-tone', 'danger');
      expect(panel()).toHaveClass('border-danger');
      expect(panel()).toHaveClass('border-l-3px');
      expect(panel().className).not.toMatch(/border-b-base/);
      // Only the model id is struck through — the provider is merely muted, since
      // the provider still exists; it is the pair that stopped working.
      expect(screen.getByTestId('app-operations-model')).toHaveClass('line-through');
      expect(screen.getByTestId('app-operations-provider')).toHaveClass('text-t-secondary');
      expect(screen.getByTestId('app-operations-provider')).not.toHaveClass('line-through');
      expect(screen.getByTestId('app-operations-kept')).toHaveTextContent('settings.appOperationsModel.kept');
      expect(screen.getByTestId('app-operations-model')).toHaveTextContent('model-a');
      // The Kept badge belongs to the model line, not to the status footer.
      expect(identityBand()).toContainElement(screen.getByTestId('app-operations-kept'));
    });

    it('states the cause, drops the timestamp and the consumer, and hides the gear', async () => {
      getMock.mockResolvedValue({
        setting: { mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' },
        health: 'unavailable',
        checked_at: Date.now(),
        reason_code: 'model_disabled',
      });
      renderCard();

      await screen.findByText('Provider A');
      expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.unavailable');
      expect(screen.getByText('settings.appOperationsModel.reason.modelDisabled')).toBeVisible();
      expect(screen.queryByTestId('app-operations-checked')).not.toBeInTheDocument();
      expect(screen.queryByTestId('app-operations-consumer')).not.toBeInTheDocument();
      expect(screen.queryByTestId('app-operations-popover-trigger')).not.toBeInTheDocument();
      // Band 2 still stands, so band 3 is still divided from it.
      expect(statusLine()).toHaveClass('border-t');
    });

    it('offers Switch to Auto and Pick another as two equal-width actions', async () => {
      getMock.mockResolvedValue({
        setting: { mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' },
        health: 'unavailable',
        reason_code: 'model_disabled',
      });
      renderCard();
      await screen.findByText('Provider A');

      const actions = screen.getByTestId('app-operations-actions');
      const buttons = within(actions).getAllByRole('button');
      expect(buttons).toHaveLength(2);
      for (const button of buttons) expect(button).toHaveClass('flex-1');

      const popover = await openPopoverViaPickAnother();
      expect(within(popover).getByLabelText('settings.selectModel')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'settings.appOperationsModel.switchToAuto' }));
      await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ mode: 'auto' }));
    });

    it('never silently swaps a missing pair — it stays a disabled synthetic option', async () => {
      getMock.mockResolvedValue({
        setting: { mode: 'fixed', provider_id: 'missing-provider', model_id: 'missing-model' },
        health: 'unavailable',
        reason_code: 'provider_missing',
      });
      renderCard();
      await screen.findByTestId('app-operations-panel');
      await openPopoverViaPickAnother();

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
      await screen.findByTestId('app-operations-panel');
      await openPopoverViaPickAnother();

      const synthetic = await screen.findAllByRole('option', { name: 'missing-model' });
      expect(synthetic).toHaveLength(1);
      expect(synthetic[0]).toBeDisabled();
    });
  });

  describe('state 6 — saving then failed', () => {
    it('disables the selection in place while a save is pending', async () => {
      let resolveUpdate: (response: AppOperationsModelResponse) => void = () => undefined;
      updateMock.mockImplementation(
        () =>
          new Promise<AppOperationsModelResponse>((resolve) => {
            resolveUpdate = resolve;
          })
      );
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' }));

      await waitFor(() => expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.saving'));
      expect(within(popover).getByRole('button', { name: 'settings.appOperationsModel.auto' })).toBeDisabled();
      expect(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' })).toBeDisabled();

      resolveUpdate(autoReady);
      await waitFor(() => expect(statusWord()).not.toHaveTextContent('settings.appOperationsModel.status.saving'));
    });

    it('dims the card to a spinner and no identity while the save is in flight', async () => {
      let resolveUpdate: (response: AppOperationsModelResponse) => void = () => undefined;
      updateMock.mockImplementation(
        () =>
          new Promise<AppOperationsModelResponse>((resolve) => {
            resolveUpdate = resolve;
          })
      );
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' }));

      await waitFor(() => expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.saving'));
      expect(panel()).toHaveClass('opacity-94');
      // The identity on screen would be the one being replaced, so it goes away.
      expect(identityBand()).toBeNull();
      expect(within(statusWord()).getByTestId('app-operations-status-spinner')).toBeVisible();
      expect(within(statusWord()).queryByTestId('app-operations-status-dot')).not.toBeInTheDocument();
      // Saving is not bold and stays a quiet card.
      expect(statusWord().className).not.toMatch(/font-700/);
      expect(panel()).toHaveClass('border-arco-2');

      resolveUpdate(autoReady);
      await waitFor(() => expect(statusWord()).not.toHaveTextContent('settings.appOperationsModel.status.saving'));
    });

    it('reverts to the last confirmed value and offers a retry that re-attempts the save', async () => {
      updateMock.mockRejectedValueOnce(new Error('secret backend error'));
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' }));

      await waitFor(() => expect(messageErrorMock).toHaveBeenCalledWith('settings.appOperationsModel.saveFailed'));
      expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.saveFailed');
      expect(screen.getByTestId('app-operations-mode')).toHaveTextContent('settings.appOperationsModel.auto');
      expect(screen.queryByText('secret backend error')).not.toBeInTheDocument();

      updateMock.mockResolvedValueOnce(fixedReady);
      fireEvent.click(screen.getByTestId('app-operations-retry'));

      await waitFor(() =>
        expect(updateMock).toHaveBeenLastCalledWith({ mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' })
      );
      await waitFor(() => expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.ready'));
    });

    it('escalates a failed save onto the card as an inline toast, not only a message', async () => {
      updateMock.mockRejectedValueOnce(new Error('secret backend error'));
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' }));

      const toast = await screen.findByTestId('app-operations-save-failed-toast');
      expect(within(toast).getByText('settings.appOperationsModel.saveFailedToast')).toBeVisible();
      // The retry lives in the toast, so the one thing to do is where the problem is.
      expect(within(toast).getByTestId('app-operations-retry')).toBeVisible();
      expect(panel()).toHaveAttribute('data-status', 'save_failed');
      expect(panel()).toHaveAttribute('data-tone', 'danger');
      expect(identityBand()).toBeNull();
    });
  });

  describe('state 7 — backend update required', () => {
    it('replaces the panel with the notice and leaves no live control stack behind it', async () => {
      getMock.mockRejectedValueOnce(
        new BackendHttpError({ method: 'GET', path: '/api/app-operations/model', status: 404, body: {} })
      );
      renderCard();

      await screen.findByText('settings.appOperationsModel.backendUpdateRequired');
      expect(screen.queryByTestId('app-operations-status-line')).not.toBeInTheDocument();
      expect(screen.queryByTestId('app-operations-popover-trigger')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'settings.appOperationsModel.auto' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'settings.appOperationsModel.fixed' })).not.toBeInTheDocument();
    });

    it('is a different block entirely — a titled notice, none of the three bands', async () => {
      getMock.mockRejectedValueOnce(
        new BackendHttpError({ method: 'GET', path: '/api/app-operations/model', status: 404, body: {} })
      );
      renderCard();

      await screen.findByText('settings.appOperationsModel.backendUpdateRequired');
      expect(panel()).toHaveAttribute('data-status', 'backend_update_required');
      expect(panel()).toHaveAttribute('data-tone', 'warning');
      expect(screen.getByTestId('app-operations-backend-title')).toHaveTextContent(
        'settings.appOperationsModel.backendUpdateRequired'
      );
      // The notice says what the user can do about it and what it does not break.
      expect(screen.getByText('settings.appOperationsModel.backendUpdateRequiredDetail')).toBeVisible();
      expect(screen.queryByTestId('app-operations-header')).not.toBeInTheDocument();
      expect(identityBand()).toBeNull();
      expect(screen.queryByTestId('app-operations-mode')).not.toBeInTheDocument();
      expect(screen.queryByTestId('app-operations-consumer')).not.toBeInTheDocument();
    });
  });

  // The provider and model rows below the card tag the assignment rather than
  // re-deriving it: `docs/prds/settings/app-operations-model.md` forbids the desktop
  // app from reproducing the Auto ranking policy, and three eligibility predicates
  // in this codebase already disagree. The card owns the only fetch, so it publishes.
  describe('assignment publishing', () => {
    it('publishes the resolved pair with no pin in Auto mode', async () => {
      getMock.mockResolvedValueOnce(autoReady);
      const onAssignmentChange = vi.fn();
      renderCard({ onAssignmentChange });

      await waitFor(() => expect(onAssignmentChange).toHaveBeenCalledTimes(1));
      expect(onAssignmentChange).toHaveBeenCalledWith({
        resolved: { provider_id: 'provider-a', model_id: 'model-a' },
        pinned: undefined,
      });
    });

    it('publishes the Fixed setting as the pin, alongside what actually resolved', async () => {
      getMock.mockResolvedValueOnce(fixedReady);
      const onAssignmentChange = vi.fn();
      renderCard({ onAssignmentChange });

      await waitFor(() => expect(onAssignmentChange).toHaveBeenCalledTimes(1));
      expect(onAssignmentChange).toHaveBeenCalledWith({
        resolved: { provider_id: 'provider-a', model_id: 'model-a' },
        pinned: { provider_id: 'provider-a', model_id: 'model-a' },
      });
    });

    it('does not republish on a re-render that did not change the assignment', async () => {
      getMock.mockResolvedValueOnce(autoReady);
      const onAssignmentChange = vi.fn();
      const { rerender } = renderCard({ onAssignmentChange });

      await waitFor(() => expect(onAssignmentChange).toHaveBeenCalledTimes(1));
      rerender(
        <AppOperationsModelCard
          providers={providers}
          providersLoading={false}
          persistedProvidersRevision={0}
          onAddModel={vi.fn()}
          onAssignmentChange={onAssignmentChange}
        />
      );

      expect(onAssignmentChange).toHaveBeenCalledTimes(1);
    });

    it('publishes nothing at all when the backend 404s the endpoint', async () => {
      getMock.mockRejectedValueOnce(
        new BackendHttpError({ method: 'GET', path: '/api/app-operations/model', status: 404, body: {} })
      );
      const onAssignmentChange = vi.fn();
      renderCard({ onAssignmentChange });

      await screen.findByText('settings.appOperationsModel.backendUpdateRequired');
      expect(onAssignmentChange).not.toHaveBeenCalled();
    });
  });

  describe('state 9 — load error', () => {
    it('gives a generic load failure a home in the panel with a retry', async () => {
      getMock.mockRejectedValueOnce(new Error('hidden error')).mockResolvedValueOnce(autoReady);
      renderCard();

      await screen.findByText('settings.appOperationsModel.loadFailed');
      expect(panel()).toHaveAttribute('data-status', 'load_error');
      expect(panel()).toHaveAttribute('data-tone', 'danger');
      expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.loadFailed');
      expect(screen.queryByText('hidden error')).not.toBeInTheDocument();
      // Actionable, so it takes the keyline, a cause and one full-width action.
      expect(panel()).toHaveClass('border-danger');
      expect(panel()).toHaveClass('border-l-3px');
      expect(screen.getByTestId('app-operations-cause')).toHaveTextContent('settings.appOperationsModel.loadFailed');
      expect(identityBand()).toBeNull();
      expect(screen.getByTestId('app-operations-retry')).toHaveClass('arco-btn-long');

      fireEvent.click(screen.getByTestId('app-operations-retry'));

      await screen.findByText('Provider A');
      expect(getMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('state 0 — loading', () => {
    it('states Loading with no identity and no keyline escalation', async () => {
      getMock.mockImplementation(() => new Promise<AppOperationsModelResponse>(() => undefined));
      renderCard();

      await screen.findByTestId('app-operations-panel');
      expect(panel()).toHaveAttribute('data-status', 'loading');
      expect(panel()).toHaveAttribute('data-tone', 'neutral');
      expect(panel()).toHaveClass('border-arco-2');
      expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.loading');
      expect(identityBand()).toBeNull();
      expect(screen.queryByTestId('app-operations-popover-trigger')).not.toBeInTheDocument();
    });
  });

  describe('popover', () => {
    it('stays closed until the panel asks for it', async () => {
      renderCard();
      await screen.findByText('Provider A');

      expect(screen.queryByTestId('app-operations-popover')).not.toBeInTheDocument();
      await openPopover();
      expect(screen.getByTestId('app-operations-popover')).toBeVisible();
    });

    it('saves on selection with no Save button and keeps the panel stating the outcome', async () => {
      updateMock.mockResolvedValue(fixedReady);
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      expect(within(popover).queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' }));

      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith({ mode: 'fixed', provider_id: 'provider-a', model_id: 'model-a' })
      );
      await waitFor(() =>
        expect(screen.getByTestId('app-operations-mode')).toHaveTextContent('settings.appOperationsModel.fixed')
      );
      expect(screen.getByTestId('app-operations-popover')).toBeVisible();
    });

    it('marks the active option with aria-pressed rather than a radio group', async () => {
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      expect(within(popover).queryAllByRole('radio')).toHaveLength(0);
      expect(within(popover).getByRole('button', { name: 'settings.appOperationsModel.auto' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    it('switches a fixed selection using the serialized provider and model pair', async () => {
      getMock.mockResolvedValue(fixedReady);
      renderCard();
      await screen.findByText('Provider A');
      await openPopover();

      fireEvent.change(getFixedSelect(), { target: { value: JSON.stringify(['provider-a', 'model-b']) } });

      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith({ mode: 'fixed', provider_id: 'provider-a', model_id: 'model-b' })
      );
    });

    it('keeps Fixed disabled while providers load but still allows a return to Auto', async () => {
      getMock.mockResolvedValue(fixedReady);
      renderCard({ providersLoading: true });
      await screen.findByText('Provider A');
      const popover = await openPopover();

      expect(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' })).toBeDisabled();
      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.auto' }));

      await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ mode: 'auto' }));
    });

    it('opens model setup instead of saving when no selectable pair exists', async () => {
      // The card only keeps its gear while the state is quiet, so this drives the
      // no-selectable-pair path through a healthy response whose providers have
      // since become ineligible — the same branch the popover's Fixed button hits.
      getMock.mockResolvedValue(autoReady);
      const { onAddModel } = renderCard({ providers: ineligibleProviders });
      await screen.findByTestId('app-operations-panel');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' }));

      expect(onAddModel).toHaveBeenCalledTimes(1);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('keeps an open popover mounted when choosing a model turns the card to Saving', async () => {
      // The gear is gone in `saving`, but unmounting the anchor would take the
      // picker with it the instant the user chose — mid-save, from under them.
      updateMock.mockImplementation(() => new Promise<AppOperationsModelResponse>(() => undefined));
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' }));

      await waitFor(() => expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.saving'));
      expect(screen.getByTestId('app-operations-popover')).toBeVisible();
      expect(screen.getByTestId('app-operations-popover-trigger')).toBeInTheDocument();
    });

    it('states the last check and the consumer in the footer', async () => {
      const checkedAt = Date.now();
      getMock.mockResolvedValue({ ...autoReady, checked_at: checkedAt });
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      expect(within(popover).getByTestId('app-operations-popover-checked')).toHaveTextContent(
        'settings.appOperationsModel.checkTime.justNow'
      );
      expect(within(popover).getByText('settings.appOperationsModel.usedByCompaction')).toBeVisible();
    });
  });

  describe('check time', () => {
    it('keeps the 60s just-now shorthand', async () => {
      getMock.mockResolvedValue({ ...autoReady, checked_at: Date.now() - 1_000 });
      renderCard();

      expect(await screen.findByTestId('app-operations-checked')).toHaveTextContent(
        'settings.appOperationsModel.checkTime.justNow'
      );
    });

    it('reads as a day-relative sentence for an older check made today', async () => {
      const checkedAt = Date.now() - 5 * 60_000;
      getMock.mockResolvedValue({ ...autoReady, checked_at: checkedAt });
      renderCard();

      expect(await screen.findByTestId('app-operations-checked')).toHaveTextContent(
        `checkedToday:${timeOf(checkedAt)}`
      );
    });

    it('reads as a dated sentence for a check restored from an earlier day', async () => {
      const checkedAt = Date.UTC(2026, 6, 31, 7, 30);
      getMock.mockResolvedValue({ ...autoReady, checked_at: checkedAt });
      renderCard();

      expect(await screen.findByTestId('app-operations-checked')).toHaveTextContent(
        `checkedOn:${dateOf(checkedAt)}:${timeOf(checkedAt)}`
      );
    });

    it('replaces the persisted completion time after a repeated check', async () => {
      const previousCheckedAt = Date.UTC(2026, 6, 30, 7, 30);
      const nextCheckedAt = Date.UTC(2026, 6, 31, 8, 45);
      getMock.mockResolvedValue({ ...autoReady, checked_at: previousCheckedAt });
      checkMock.mockResolvedValue({ ...autoReady, checked_at: nextCheckedAt });
      renderCard();
      await screen.findByText('Provider A');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.checkNow' }));

      await waitFor(() =>
        expect(screen.getByTestId('app-operations-checked')).toHaveTextContent(
          `checkedOn:${dateOf(nextCheckedAt)}:${timeOf(nextCheckedAt)}`
        )
      );
      expect(screen.getByTestId('app-operations-checked')).not.toHaveTextContent(
        `checkedOn:${dateOf(previousCheckedAt)}:${timeOf(previousCheckedAt)}`
      );
    });
  });

  describe('server-owned resolution', () => {
    it('refreshes only after changed providers persist', async () => {
      let requestCount = 0;
      getMock.mockImplementation(async () => {
        requestCount += 1;
        return requestCount === 1
          ? autoReady
          : { setting: { mode: 'auto' }, health: 'setup_required', reason_code: 'no_eligible_model' };
      });
      const { rerender } = renderCard();
      await screen.findByText('model-a');

      rerender(
        <AppOperationsModelCard
          providers={ineligibleProviders}
          providersLoading={false}
          persistedProvidersRevision={0}
          onAddModel={vi.fn()}
        />
      );
      expect(getMock).toHaveBeenCalledTimes(1);

      rerender(
        <AppOperationsModelCard
          providers={ineligibleProviders}
          providersLoading={false}
          persistedProvidersRevision={1}
          onAddModel={vi.fn()}
        />
      );

      await waitFor(() => expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.setupRequired'));
      expect(screen.queryByText('model-a')).not.toBeInTheDocument();
      expect(getMock).toHaveBeenCalledTimes(2);
    });

    it('coalesces provider refreshes until an in-flight save settles', async () => {
      let resolveUpdate: ((response: AppOperationsModelResponse) => void) | undefined;
      updateMock.mockImplementation(
        () =>
          new Promise<AppOperationsModelResponse>((resolve) => {
            resolveUpdate = resolve;
          })
      );
      let requestCount = 0;
      getMock.mockImplementation(async () => {
        requestCount += 1;
        return requestCount === 1
          ? autoReady
          : { setting: { mode: 'auto' }, health: 'setup_required', reason_code: 'no_eligible_model' };
      });
      const { rerender } = renderCard();
      await screen.findByText('model-a');
      const popover = await openPopover();

      fireEvent.click(within(popover).getByRole('button', { name: 'settings.appOperationsModel.fixed' }));
      await waitFor(() => expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.saving'));

      rerender(
        <AppOperationsModelCard
          providers={providers}
          providersLoading={false}
          persistedProvidersRevision={1}
          onAddModel={vi.fn()}
        />
      );
      rerender(
        <AppOperationsModelCard
          providers={providers}
          providersLoading={false}
          persistedProvidersRevision={2}
          onAddModel={vi.fn()}
        />
      );
      expect(getMock).toHaveBeenCalledTimes(1);

      resolveUpdate?.(autoReady);

      await waitFor(() => expect(statusWord()).toHaveTextContent('settings.appOperationsModel.status.setupRequired'));
      expect(getMock).toHaveBeenCalledTimes(2);
    });
  });
});
