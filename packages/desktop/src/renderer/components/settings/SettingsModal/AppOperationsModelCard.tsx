/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Message, Radio, Spin, Tag } from '@arco-design/web-react';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { appOperationsModel } from '@/common/adapter/ipcBridge';
import type { IProvider } from '@/common/config/storage';
import type {
  AppOperationsModelReasonCode,
  AppOperationsModelResponse,
  AppOperationsModelSetting,
  AppOperationsModelHealth,
} from '@/common/types/appOperations';
import AionSelect from '@/renderer/components/base/AionSelect';
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

const STATUS_KEYS: Record<AppOperationsModelHealth, string> = {
  ready: 'settings.appOperationsModel.status.ready',
  checking: 'settings.appOperationsModel.status.checking',
  setup_required: 'settings.appOperationsModel.status.setupRequired',
  unavailable: 'settings.appOperationsModel.status.unavailable',
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

const CHECK_RESULT_KEYS: Record<Exclude<AppOperationsModelHealth, 'checking'>, string> = {
  ready: 'settings.appOperationsModel.checkResult.ready',
  setup_required: 'settings.appOperationsModel.checkResult.setupRequired',
  unavailable: 'settings.appOperationsModel.checkResult.unavailable',
};

const JUST_CHECKED_MS = 60_000;

export default function AppOperationsModelCard({
  providers,
  providersLoading,
  persistedProvidersRevision,
  onAddModel,
}: AppOperationsModelCardProps): React.ReactElement {
  const { t } = useTranslation();
  const [message, messageContext] = Message.useMessage();
  const [response, setResponse] = useState<AppOperationsModelResponse | undefined>();
  const [draft, setDraft] = useState<AppOperationsModelSetting | undefined>();
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [pending, setPending] = useState<PendingAction>('idle');
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
    ? (providers.find((provider) => provider.id === responseIdentity.provider_id)?.name ?? responseIdentity.provider_id)
    : undefined;
  const visibleHealth = pending === 'checking' ? 'checking' : response?.health;
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
      setPending('saving');
      try {
        const nextResponse = await appOperationsModel.update.invoke(nextSetting);
        if (unmountedRef.current || requestId !== requestRef.current) return;
        setResponse(nextResponse);
        setDraft(nextResponse.setting);
      } catch {
        if (unmountedRef.current || requestId !== requestRef.current) return;
        setDraft(response.setting);
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
    } catch {
      if (unmountedRef.current || requestId !== requestRef.current) return;
      setResponse(previousResponse);
      setDraft(previousResponse.setting);
      message.error(t('settings.appOperationsModel.checkFailed'));
    } finally {
      if (!unmountedRef.current && requestId === requestRef.current) setPending('idle');
    }
  }, [canCheck, message, response, t]);

  const selectedFixedValue = isFixedSetting(draft) ? modelOptionValue(draft.provider_id, draft.model_id) : undefined;
  const reasonCode: AppOperationsModelReasonCode | undefined = response?.reason_code;
  const showAddModelAction =
    response?.setting.mode === 'auto' && response.health === 'setup_required' && reasonCode === 'no_eligible_model';
  const checkResult = (() => {
    if (!response?.checked_at || response.health === 'checking') return undefined;
    const checked =
      Math.abs(Date.now() - response.checked_at) < JUST_CHECKED_MS
        ? t('settings.appOperationsModel.checkResult.checkedJustNow')
        : t('settings.appOperationsModel.checkResult.checkedAt', {
            time: new Date(response.checked_at).toLocaleString(),
          });
    return t(CHECK_RESULT_KEYS[response.health], { checked });
  })();

  return (
    <section className='flex flex-col gap-12px rounded-8px border border-border-2 p-16px'>
      {messageContext}
      <div className='flex flex-col gap-4px'>
        <div className='text-15px font-medium text-text-1'>{t('settings.appOperationsModel.title')}</div>
        <div className='text-13px text-text-3'>{t('settings.appOperationsModel.description')}</div>
      </div>

      {phase === 'loading' && <Spin className='self-start' />}

      {phase === 'backend_update_required' && (
        <Alert type='warning' content={t('settings.appOperationsModel.backendUpdateRequired')} />
      )}

      {phase === 'load_error' && (
        <Alert
          type='error'
          content={t('settings.appOperationsModel.loadFailed')}
          action={
            <Button size='mini' type='text' onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          }
        />
      )}

      {phase !== 'loading' && (
        <>
          <div className='flex flex-col gap-4px'>
            <span className='text-13px text-text-2'>{t('settings.appOperationsModel.selectionLabel')}</span>
            <Radio.Group
              value={draft?.mode}
              onChange={(value) => handleModeChange(value === 'fixed' ? 'fixed' : 'auto')}
            >
              <Radio value='auto' disabled={!canMutate}>
                {t('settings.appOperationsModel.auto')}
              </Radio>
              <Radio value='fixed' disabled={!canSelectFixed}>
                {t('settings.appOperationsModel.fixed')}
              </Radio>
            </Radio.Group>
          </div>

          {draft?.mode === 'fixed' && (
            <label className='flex flex-col gap-4px text-13px text-text-2'>
              {t('settings.selectModel')}
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
                  .filter(
                    (option) => option.synthetic && !providers.some((provider) => provider.id === option.providerId)
                  )
                  .map((option) => (
                    <AionSelect.Option key={option.value} value={option.value} disabled>
                      {`${option.providerId} / ${option.modelId}`}
                    </AionSelect.Option>
                  ))}
              </AionSelect>
            </label>
          )}

          <div aria-live='polite' className='flex flex-wrap items-center gap-8px text-13px text-text-2'>
            {pending === 'saving' && <span>{t('settings.appOperationsModel.saving')}</span>}
            <span>{t('settings.appOperationsModel.resolvedModelLabel')}</span>
            {responseIdentity ? (
              <>
                {identityProvider && <Tag>{identityProvider}</Tag>}
                <Tag>{responseIdentity.model_id}</Tag>
              </>
            ) : (
              <span>—</span>
            )}
            {visibleHealth && (
              <>
                <span>{t('settings.appOperationsModel.healthLabel')}</span>
                <Tag>{t(STATUS_KEYS[visibleHealth])}</Tag>
              </>
            )}
            <span>{t('settings.appOperationsModel.usedByLabel')}</span>
            <Tag>{t('settings.appOperationsModel.contextCompaction')}</Tag>
            {reasonCode && <span>{t(REASON_KEYS[reasonCode])}</span>}
            {checkResult && <span className='font-medium text-text-1'>{checkResult}</span>}
          </div>

          {showAddModelAction && (
            <Button type='secondary' onClick={onAddModel}>
              {t('settings.addModel')}
            </Button>
          )}

          <Button
            className='self-start !min-h-36px px-12px'
            type='secondary'
            disabled={!canCheck}
            loading={pending === 'checking'}
            onClick={() => void handleCheck()}
          >
            {t('settings.healthCheck')}
          </Button>
        </>
      )}
    </section>
  );
}
