/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AppOperationsModelCard — the app operations status panel.
 *
 * The block lives in the Settings > Models page header (and in the modal
 * header's action row) so the page body can start with providers immediately.
 * It carries only what is worth glancing at — mode, resolved model, health and
 * consumer — while everything mutable lives one click deeper in a popover.
 *
 * There is ONE component, ONE state machine and THREE widths, not three views:
 * the panel, the narrow full-width strip and every status are the same block.
 * Only the keyline colour, the status line and the action row change.
 */

import { Alert, Button, Message, Popover, Tag } from '@arco-design/web-react';
import { LinkCloud, Refresh, SettingTwo } from '@icon-park/react';
import classNames from 'classnames';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { appOperationsModel } from '@/common/adapter/ipcBridge';
import type { IProvider } from '@/common/config/storage';
import type {
  AppOperationsModelReasonCode,
  AppOperationsModelResponse,
  AppOperationsModelSetting,
} from '@/common/types/appOperations';
import AionSelect from '@/renderer/components/base/AionSelect';
import { getProviderLogo } from '@/renderer/utils/model/modelPlatforms';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type AppOperationsModelCardProps = {
  providers: IProvider[];
  providersLoading: boolean;
  persistedProvidersRevision: number;
  onAddModel: () => void;
};

type ModelOption = {
  value: string;
  providerId: string;
  providerName: string;
  modelId: string;
  disabled: boolean;
  synthetic: boolean;
};

type LoadPhase = 'loading' | 'ready' | 'backend_update_required' | 'load_error';
type PendingAction = 'idle' | 'saving' | 'checking';

/**
 * The single status the whole panel renders from. It folds the load phase, the
 * in-flight action and the server-reported health into one value so the keyline,
 * the status word and the action row can never disagree.
 */
type PanelStatus =
  | 'loading'
  | 'backend_update_required'
  | 'load_error'
  | 'saving'
  | 'save_failed'
  | 'checking'
  | 'ready'
  | 'setup_required'
  | 'unavailable';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

const providerHasAuth = (provider: IProvider): boolean =>
  provider.api_key.trim().length > 0 || (provider.platform === 'bedrock' && provider.bedrock_config !== undefined);

const providerSupportsText = (provider: IProvider): boolean => {
  const capabilities = provider.capabilities ?? [];
  if (capabilities.length === 0) return true;
  if (
    capabilities.some((capability) => capability.type === 'excludeFromPrimary' && capability.isUserSelected !== false)
  ) {
    return false;
  }
  return capabilities.some(
    (capability) =>
      capability.type === 'text' || (capability.type === 'excludeFromPrimary' && capability.isUserSelected === false)
  );
};

const isFixedSetting = (
  setting: AppOperationsModelSetting | undefined
): setting is Extract<AppOperationsModelSetting, { mode: 'fixed' }> => setting?.mode === 'fixed';

const modelOptionValue = (providerId: string, modelId: string): string => JSON.stringify([providerId, modelId]);

const STATUS_KEYS: Record<PanelStatus, string> = {
  loading: 'settings.appOperationsModel.status.loading',
  backend_update_required: 'settings.appOperationsModel.status.unavailable',
  load_error: 'settings.appOperationsModel.status.loadFailed',
  saving: 'settings.appOperationsModel.status.saving',
  save_failed: 'settings.appOperationsModel.status.saveFailed',
  checking: 'settings.appOperationsModel.status.checking',
  ready: 'settings.appOperationsModel.status.ready',
  setup_required: 'settings.appOperationsModel.status.setupRequired',
  unavailable: 'settings.appOperationsModel.status.unavailable',
};

const STATUS_TONES: Record<PanelStatus, StatusTone> = {
  loading: 'neutral',
  backend_update_required: 'warning',
  load_error: 'danger',
  saving: 'neutral',
  save_failed: 'danger',
  checking: 'neutral',
  ready: 'success',
  setup_required: 'warning',
  unavailable: 'danger',
};

/** Status is always a dot plus a word — the dot never carries the meaning alone. */
const TONE_DOT_CLASS: Record<StatusTone, string> = {
  neutral: 'bg-t-tertiary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/**
 * Only warning and danger escalate the panel keyline; quiet states stay quiet.
 *
 * Use `border-arco-2`, never `border-b-base`: UnoCSS parses the latter as the
 * side utility `border-b-*` and compiles it to `border-bottom-color: var(--bg-base)`
 * — one edge only, painted in the page background, i.e. an invisible keyline.
 */
const TONE_KEYLINE_CLASS: Record<StatusTone, string> = {
  neutral: 'border-arco-2',
  success: 'border-arco-2',
  warning: 'border-warning-6',
  danger: 'border-danger-6',
};

const REASON_KEYS: Record<AppOperationsModelReasonCode, string> = {
  no_eligible_model: 'settings.appOperationsModel.reason.noEligibleModel',
  provider_missing: 'settings.appOperationsModel.reason.providerMissing',
  provider_disabled: 'settings.appOperationsModel.reason.providerDisabled',
  model_missing: 'settings.appOperationsModel.reason.modelMissing',
  model_disabled: 'settings.appOperationsModel.reason.modelDisabled',
  auth_required: 'settings.appOperationsModel.reason.authRequired',
  health_check_failed: 'settings.appOperationsModel.reason.healthCheckFailed',
};

const JUST_CHECKED_MS = 60_000;

const SECTION_LABEL_CLASS = 'text-10px font-600 uppercase tracking-wide text-t-tertiary';

const StatusIndicator: React.FC<{ status: PanelStatus; label: string }> = ({ status, label }) => {
  const tone = STATUS_TONES[status];
  return (
    <span
      data-testid='app-operations-status'
      data-tone={tone}
      className='flex shrink-0 items-center gap-4px text-t-primary'
    >
      <span
        aria-hidden='true'
        data-testid='app-operations-status-dot'
        className={classNames('h-6px w-6px shrink-0 rounded-999px', TONE_DOT_CLASS[tone])}
      />
      {label}
    </span>
  );
};

const ProviderAvatar: React.FC<{ provider?: IProvider; name: string }> = ({ provider, name }) => {
  const logo = getProviderLogo({
    name: provider?.name ?? name,
    base_url: provider?.base_url,
    platform: provider?.platform,
  });
  if (logo) {
    return <img src={logo} alt='' aria-hidden='true' className='h-14px w-14px shrink-0 object-contain' />;
  }
  return <LinkCloud theme='outline' size='14' aria-hidden='true' className='flex shrink-0 text-t-tertiary' />;
};

export default function AppOperationsModelCard({
  providers,
  providersLoading,
  persistedProvidersRevision,
  onAddModel,
}: AppOperationsModelCardProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [message, messageContext] = Message.useMessage();
  const [response, setResponse] = useState<AppOperationsModelResponse | undefined>();
  const [draft, setDraft] = useState<AppOperationsModelSetting | undefined>();
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [pending, setPending] = useState<PendingAction>('idle');
  const [failedSetting, setFailedSetting] = useState<AppOperationsModelSetting | undefined>();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const requestRef = useRef(0);
  const unmountedRef = useRef(false);
  const previousPersistedProvidersRevisionRef = useRef(persistedProvidersRevision);
  const providerRefreshQueuedRef = useRef(false);

  const selectableOptions = useMemo<ModelOption[]>(
    () =>
      providers.flatMap((provider) => {
        if (provider.enabled === false || !providerHasAuth(provider) || !providerSupportsText(provider)) return [];
        return provider.models.flatMap((modelId) => {
          if (provider.model_enabled?.[modelId] === false) return [];
          return [
            {
              value: modelOptionValue(provider.id, modelId),
              providerId: provider.id,
              providerName: provider.name,
              modelId,
              disabled: false,
              synthetic: false,
            },
          ];
        });
      }),
    [providers]
  );

  const options = useMemo<ModelOption[]>(() => {
    const confirmedSetting = response?.setting;
    if (!isFixedSetting(confirmedSetting)) return selectableOptions;
    const existing = selectableOptions.some(
      (option) => option.providerId === confirmedSetting.provider_id && option.modelId === confirmedSetting.model_id
    );
    if (existing) return selectableOptions;
    return [
      ...selectableOptions,
      {
        value: modelOptionValue(confirmedSetting.provider_id, confirmedSetting.model_id),
        providerId: confirmedSetting.provider_id,
        providerName: confirmedSetting.provider_id,
        modelId: confirmedSetting.model_id,
        disabled: true,
        synthetic: true,
      },
    ];
  }, [response?.setting, selectableOptions]);

  const selectableOptionMap = useMemo(
    () => new Map(selectableOptions.map((option) => [option.value, option])),
    [selectableOptions]
  );

  const load = useCallback(async (): Promise<void> => {
    const requestId = ++requestRef.current;
    setPhase('loading');
    setFailedSetting(undefined);
    try {
      const nextResponse = await appOperationsModel.get.invoke();
      if (unmountedRef.current || requestId !== requestRef.current) return;
      setResponse(nextResponse);
      setDraft(nextResponse.setting);
      setPhase('ready');
    } catch (error) {
      if (unmountedRef.current || requestId !== requestRef.current) return;
      setPhase(isBackendHttpError(error) && error.status === 404 ? 'backend_update_required' : 'load_error');
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    void load();
    return () => {
      unmountedRef.current = true;
      requestRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (previousPersistedProvidersRevisionRef.current !== persistedProvidersRevision) {
      previousPersistedProvidersRevisionRef.current = persistedProvidersRevision;
      providerRefreshQueuedRef.current = true;
    }
    if (!providerRefreshQueuedRef.current || pending !== 'idle' || phase === 'loading') return;
    providerRefreshQueuedRef.current = false;
    void load();
  }, [load, pending, persistedProvidersRevision, phase]);

  const canMutate = phase === 'ready' && pending === 'idle' && response !== undefined;
  const canSelectFixed = canMutate && !providersLoading;
  const responseIdentity =
    response?.resolved_model ?? (isFixedSetting(response?.setting) ? response.setting : undefined);
  const identityProvider = responseIdentity
    ? providers.find((provider) => provider.id === responseIdentity.provider_id)
    : undefined;
  const identityProviderName = responseIdentity ? (identityProvider?.name ?? responseIdentity.provider_id) : undefined;
  const canCheck =
    canMutate &&
    response !== undefined &&
    (response.resolved_model !== undefined ||
      (isFixedSetting(response.setting) && response.reason_code === 'health_check_failed'));

  const save = useCallback(
    async (nextSetting: AppOperationsModelSetting): Promise<void> => {
      if (!response || !canMutate) return;
      const requestId = ++requestRef.current;
      setDraft(nextSetting);
      setFailedSetting(undefined);
      setPending('saving');
      try {
        const nextResponse = await appOperationsModel.update.invoke(nextSetting);
        if (unmountedRef.current || requestId !== requestRef.current) return;
        setResponse(nextResponse);
        setDraft(nextResponse.setting);
      } catch {
        if (unmountedRef.current || requestId !== requestRef.current) return;
        setDraft(response.setting);
        setFailedSetting(nextSetting);
        message.error(t('settings.appOperationsModel.saveFailed'));
      } finally {
        if (!unmountedRef.current && requestId === requestRef.current) setPending('idle');
      }
    },
    [canMutate, message, response, t]
  );

  const handleModeChange = useCallback(
    (mode: 'auto' | 'fixed'): void => {
      if (!response || !canMutate) return;
      if (mode === 'auto') {
        void save({ mode: 'auto' });
        return;
      }
      if (!canSelectFixed) return;
      const resolvedValue = response.resolved_model
        ? modelOptionValue(response.resolved_model.provider_id, response.resolved_model.model_id)
        : undefined;
      const option = (resolvedValue ? selectableOptionMap.get(resolvedValue) : undefined) ?? selectableOptions[0];
      if (!option) {
        setDraft(response.setting);
        onAddModel();
        return;
      }
      void save({ mode: 'fixed', provider_id: option.providerId, model_id: option.modelId });
    },
    [canMutate, canSelectFixed, onAddModel, response, save, selectableOptionMap, selectableOptions]
  );

  const handleFixedSelection = useCallback(
    (value: string): void => {
      const option = selectableOptionMap.get(value);
      if (!option || !canSelectFixed) return;
      void save({ mode: 'fixed', provider_id: option.providerId, model_id: option.modelId });
    },
    [canSelectFixed, save, selectableOptionMap]
  );

  const handleCheck = useCallback(async (): Promise<void> => {
    if (!response || !canCheck) return;
    const previousResponse = response;
    const requestId = ++requestRef.current;
    setPending('checking');
    try {
      const nextResponse = await appOperationsModel.check.invoke();
      if (unmountedRef.current || requestId !== requestRef.current) return;
      setResponse(nextResponse);
      setDraft(nextResponse.setting);
      setFailedSetting(undefined);
    } catch {
      if (unmountedRef.current || requestId !== requestRef.current) return;
      setResponse(previousResponse);
      setDraft(previousResponse.setting);
      message.error(t('settings.appOperationsModel.checkFailed'));
    } finally {
      if (!unmountedRef.current && requestId === requestRef.current) setPending('idle');
    }
  }, [canCheck, message, response, t]);

  const panelStatus = useMemo<PanelStatus>(() => {
    if (phase === 'loading') return 'loading';
    if (phase === 'backend_update_required') return 'backend_update_required';
    if (phase === 'load_error') return 'load_error';
    if (pending === 'checking') return 'checking';
    if (pending === 'saving') return 'saving';
    if (failedSetting !== undefined) return 'save_failed';
    return response?.health ?? 'loading';
  }, [failedSetting, pending, phase, response?.health]);

  const tone = STATUS_TONES[panelStatus];
  const selectedFixedValue = isFixedSetting(draft) ? modelOptionValue(draft.provider_id, draft.model_id) : undefined;
  const reasonCode: AppOperationsModelReasonCode | undefined = phase === 'ready' ? response?.reason_code : undefined;
  const showAddModelAction =
    response?.setting.mode === 'auto' && response.health === 'setup_required' && reasonCode === 'no_eligible_model';
  /** A Fixed pair WePrompt kept rather than silently swapping away from. */
  const keptUnavailable = isFixedSetting(response?.setting) && response?.health === 'unavailable';

  /** "Checked today, 5:58 AM" — a sentence, not a raw locale timestamp. */
  const formatCheckedAt = useCallback(
    (checkedAt: number | undefined): string => {
      if (checkedAt === undefined) return t('settings.appOperationsModel.checkTime.never');
      const now = Date.now();
      if (Math.abs(now - checkedAt) < JUST_CHECKED_MS) return t('settings.appOperationsModel.checkTime.justNow');
      const checked = new Date(checkedAt);
      const time = checked.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      if (checked.toDateString() === new Date(now).toDateString()) {
        return t('settings.appOperationsModel.checkTime.today', { time });
      }
      return t('settings.appOperationsModel.checkTime.date', {
        date: checked.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        time,
      });
    },
    [t]
  );

  const panelCheckedLabel =
    phase === 'ready' && response?.checked_at !== undefined && panelStatus !== 'checking'
      ? formatCheckedAt(response.checked_at)
      : undefined;

  const modeLabel =
    draft?.mode === 'fixed' ? t('settings.appOperationsModel.fixed') : t('settings.appOperationsModel.auto');

  const popoverContent = (
    <div data-testid='app-operations-popover' className='flex w-300px max-w-full flex-col gap-14px'>
      <div className='flex flex-col gap-2px'>
        <div className='text-14px font-600 text-t-primary'>{t('settings.appOperationsModel.title')}</div>
        <div className='text-12px leading-relaxed text-t-tertiary'>
          {t('settings.appOperationsModel.popoverSubtitle')}
        </div>
      </div>

      <div className='flex flex-col gap-6px'>
        <div className={SECTION_LABEL_CLASS}>{t('settings.appOperationsModel.selectionLabel')}</div>
        <div role='group' aria-label={t('settings.appOperationsModel.selectionLabel')}>
          <Button.Group>
            <Button
              size='small'
              aria-pressed={draft?.mode !== 'fixed'}
              type={draft?.mode !== 'fixed' ? 'primary' : 'secondary'}
              disabled={!canMutate}
              onClick={() => handleModeChange('auto')}
            >
              {t('settings.appOperationsModel.auto')}
            </Button>
            <Button
              size='small'
              aria-pressed={draft?.mode === 'fixed'}
              type={draft?.mode === 'fixed' ? 'primary' : 'secondary'}
              disabled={!canSelectFixed}
              onClick={() => handleModeChange('fixed')}
            >
              {t('settings.appOperationsModel.fixed')}
            </Button>
          </Button.Group>
        </div>
        {draft?.mode !== 'fixed' && (
          <div className='text-12px leading-relaxed text-t-tertiary'>
            {t('settings.appOperationsModel.autoExplainer')}
          </div>
        )}
      </div>

      <div className='flex flex-col gap-6px'>
        <div className={SECTION_LABEL_CLASS}>{t('settings.appOperationsModel.modelLabel')}</div>
        {draft?.mode === 'fixed' ? (
          <AionSelect
            aria-label={t('settings.selectModel')}
            value={selectedFixedValue}
            disabled={!canSelectFixed}
            onChange={handleFixedSelection}
          >
            {providers.map((provider) => {
              const providerOptions = options.filter((option) => option.providerId === provider.id);
              if (providerOptions.length === 0) return null;
              return (
                <AionSelect.OptGroup key={provider.id} label={provider.name}>
                  {providerOptions.map((option) => (
                    <AionSelect.Option key={option.value} value={option.value} disabled={option.disabled}>
                      {option.modelId}
                    </AionSelect.Option>
                  ))}
                </AionSelect.OptGroup>
              );
            })}
            {options
              .filter((option) => option.synthetic && !providers.some((provider) => provider.id === option.providerId))
              .map((option) => (
                <AionSelect.Option key={option.value} value={option.value} disabled>
                  {`${option.providerId} / ${option.modelId}`}
                </AionSelect.Option>
              ))}
          </AionSelect>
        ) : (
          <div
            data-testid='app-operations-managed-by-auto'
            aria-disabled='true'
            className='rounded-4px border border-solid border-arco-2 bg-fill-1 px-10px py-6px text-13px text-t-disabled'
          >
            {t('settings.appOperationsModel.managedByAuto')}
          </div>
        )}
      </div>

      <div className='flex flex-wrap items-center gap-x-10px gap-y-4px border-t border-solid border-arco-2 pt-10px text-12px text-t-tertiary'>
        <span data-testid='app-operations-popover-checked'>{formatCheckedAt(response?.checked_at)}</span>
        <span>{t('settings.appOperationsModel.usedByCompaction')}</span>
        <Button
          size='mini'
          type='text'
          icon={<Refresh theme='outline' size='12' />}
          disabled={!canCheck}
          loading={pending === 'checking'}
          onClick={() => void handleCheck()}
        >
          {t('settings.appOperationsModel.checkNow')}
        </Button>
      </div>
    </div>
  );

  const actionRow = ((): React.ReactNode => {
    if (panelStatus === 'load_error') {
      return (
        <>
          <span>{t('settings.appOperationsModel.loadFailed')}</span>
          <Button data-testid='app-operations-retry' size='mini' type='secondary' onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </>
      );
    }
    if (panelStatus === 'save_failed') {
      return (
        <>
          <span>{t('settings.appOperationsModel.saveFailed')}</span>
          <Button
            data-testid='app-operations-retry'
            size='mini'
            type='secondary'
            onClick={() => failedSetting && void save(failedSetting)}
          >
            {t('common.retry')}
          </Button>
        </>
      );
    }
    if (showAddModelAction) {
      return (
        <>
          <span>{t('settings.appOperationsModel.setupRequiredImpact')}</span>
          <Button size='mini' type='secondary' onClick={onAddModel}>
            {t('settings.addModel')}
          </Button>
        </>
      );
    }
    if (keptUnavailable) {
      return (
        <>
          <Button size='mini' type='secondary' disabled={!canMutate} onClick={() => handleModeChange('auto')}>
            {t('settings.appOperationsModel.switchToAuto')}
          </Button>
          <Button size='mini' type='secondary' onClick={() => setPopoverOpen(true)}>
            {t('settings.appOperationsModel.pickAnother')}
          </Button>
        </>
      );
    }
    return null;
  })();

  // State 8 — zero providers configured. The screen is already an empty state
  // telling the user to add a provider and it carries both entry points, so the
  // panel would only repeat it. Providers that exist but are not eligible keep
  // the panel visible in SETUP REQUIRED.
  if (providers.length === 0) return null;

  return (
    <section
      aria-label={t('settings.appOperationsModel.title')}
      data-testid='app-operations-panel'
      data-status={panelStatus}
      data-tone={tone}
      className={classNames(
        'mt-10px flex w-full min-w-0 flex-col gap-6px rounded-8px border border-solid px-10px py-6px min-[900px]:ms-auto min-[900px]:w-auto min-[900px]:max-w-560px',
        TONE_KEYLINE_CLASS[tone]
      )}
    >
      {messageContext}
      {panelStatus === 'backend_update_required' ? (
        // The alert REPLACES the panel: leaving a live control stack behind an
        // unsupported backend would offer changes that cannot be saved.
        <Alert type='warning' content={t('settings.appOperationsModel.backendUpdateRequired')} />
      ) : (
        <>
          <div className='flex min-w-0 flex-nowrap items-center gap-8px overflow-hidden'>
            <span className={classNames(SECTION_LABEL_CLASS, 'shrink-0')}>
              {t('settings.appOperationsModel.panelLabel')}
            </span>
            <div
              aria-live='polite'
              data-testid='app-operations-status-line'
              className='flex min-w-0 flex-1 flex-nowrap items-center gap-6px overflow-hidden text-12px text-t-secondary'
            >
              {panelStatus === 'loading' || panelStatus === 'load_error' ? (
                <StatusIndicator status={panelStatus} label={t(STATUS_KEYS[panelStatus])} />
              ) : (
                <>
                  <Tag size='small' data-testid='app-operations-mode' className='shrink-0 uppercase'>
                    {modeLabel}
                  </Tag>
                  {responseIdentity && identityProviderName ? (
                    <span
                      data-testid='app-operations-identity'
                      className={classNames(
                        'flex min-w-0 flex-nowrap items-center gap-4px overflow-hidden',
                        keptUnavailable && 'line-through'
                      )}
                    >
                      <ProviderAvatar provider={identityProvider} name={identityProviderName} />
                      <span data-testid='app-operations-provider' className='truncate text-t-primary'>
                        {identityProviderName}
                      </span>
                      <span aria-hidden='true' className='shrink-0'>
                        ·
                      </span>
                      <span data-testid='app-operations-model' className='truncate font-mono text-t-primary'>
                        {responseIdentity.model_id}
                      </span>
                    </span>
                  ) : (
                    <span data-testid='app-operations-identity'>—</span>
                  )}
                  {keptUnavailable && (
                    <Tag size='small' data-testid='app-operations-kept' className='shrink-0 uppercase'>
                      {t('settings.appOperationsModel.kept')}
                    </Tag>
                  )}
                  <StatusIndicator status={panelStatus} label={t(STATUS_KEYS[panelStatus])} />
                  {panelCheckedLabel && (
                    <>
                      <span aria-hidden='true' className='shrink-0'>
                        ·
                      </span>
                      <span data-testid='app-operations-checked' className='truncate'>
                        {panelCheckedLabel}
                      </span>
                    </>
                  )}
                  <Tag size='small' data-testid='app-operations-consumer' className='shrink-0'>
                    {t('settings.appOperationsModel.contextCompaction')}
                  </Tag>
                </>
              )}
            </div>
            {phase === 'ready' && (
              <Popover
                trigger='click'
                position='br'
                popupVisible={popoverOpen}
                onVisibleChange={setPopoverOpen}
                content={popoverContent}
              >
                <Button
                  data-testid='app-operations-popover-trigger'
                  aria-label={t('settings.appOperationsModel.openSettings')}
                  size='mini'
                  type='text'
                  className='shrink-0'
                  icon={<SettingTwo theme='outline' size='14' />}
                />
              </Popover>
            )}
          </div>

          {reasonCode && (
            <div className='text-12px leading-relaxed text-t-tertiary' data-testid='app-operations-reason'>
              {t(REASON_KEYS[reasonCode])}
            </div>
          )}

          {actionRow && (
            <div
              data-testid='app-operations-actions'
              className='flex flex-wrap items-center gap-8px text-12px text-t-secondary'
            >
              {actionRow}
            </div>
          )}
        </>
      )}
    </section>
  );
}
