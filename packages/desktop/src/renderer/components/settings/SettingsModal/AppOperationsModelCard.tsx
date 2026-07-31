/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Radio, Spin, Tag } from '@arco-design/web-react';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { appOperationsModel } from '@/common/adapter/ipcBridge';
import type { IProvider } from '@/common/config/storage';
import type {
  AppOperationsModelReasonCode,
  AppOperationsModelResponse,
  AppOperationsModelSetting,
} from '@/common/types/appOperations';
import AionSelect from '@/renderer/components/base/AionSelect';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type AppOperationsModelCardProps = {
  providers: IProvider[];
  providersLoading: boolean;
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

const statusKey = (health: AppOperationsModelResponse['health']): string =>
  `settings.appOperationsModel.status.${health}`;

const updateAppOperationsModel = (setting: AppOperationsModelSetting): Promise<AppOperationsModelResponse> =>
  (appOperationsModel.update.invoke as (nextSetting: AppOperationsModelSetting) => Promise<AppOperationsModelResponse>)(
    setting
  );

export default function AppOperationsModelCard({
  providers,
  providersLoading,
  onAddModel,
}: AppOperationsModelCardProps): React.ReactElement {
  const { t } = useTranslation();
  const [response, setResponse] = useState<AppOperationsModelResponse | undefined>();
  const [draft, setDraft] = useState<AppOperationsModelSetting | undefined>();
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [pending, setPending] = useState<PendingAction>('idle');
  const [actionError, setActionError] = useState<'save' | 'check' | undefined>();
  const requestRef = useRef(0);
  const unmountedRef = useRef(false);

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
    setActionError(undefined);
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

  const canMutate = phase === 'ready' && pending === 'idle' && response !== undefined && !providersLoading;
  const responseIdentity =
    response?.resolved_model ?? (isFixedSetting(response?.setting) ? response.setting : undefined);
  const identityProvider = responseIdentity
    ? (providers.find((provider) => provider.id === responseIdentity.provider_id)?.name ?? responseIdentity.provider_id)
    : undefined;
  const visibleHealth = pending === 'checking' ? 'checking' : response?.health;
  const canCheck =
    canMutate &&
    response !== undefined &&
    (response.health === 'ready' ||
      response.health === 'setup_required' ||
      (isFixedSetting(response.setting) && response.reason_code === 'health_check_failed'));

  const save = useCallback(
    async (nextSetting: AppOperationsModelSetting): Promise<void> => {
      if (!response || !canMutate) return;
      const requestId = ++requestRef.current;
      setDraft(nextSetting);
      setPending('saving');
      setActionError(undefined);
      try {
        const nextResponse = await updateAppOperationsModel(nextSetting);
        if (unmountedRef.current || requestId !== requestRef.current) return;
        setResponse(nextResponse);
        setDraft(nextResponse.setting);
      } catch {
        if (unmountedRef.current || requestId !== requestRef.current) return;
        setDraft(response.setting);
        setActionError('save');
      } finally {
        if (!unmountedRef.current && requestId === requestRef.current) setPending('idle');
      }
    },
    [canMutate, response]
  );

  const handleModeChange = useCallback(
    (mode: 'auto' | 'fixed'): void => {
      if (!response || !canMutate) return;
      if (mode === 'auto') {
        void save({ mode: 'auto' });
        return;
      }
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
    [canMutate, onAddModel, response, save, selectableOptionMap, selectableOptions]
  );

  const handleFixedSelection = useCallback(
    (value: string): void => {
      const option = selectableOptionMap.get(value);
      if (!option || !canMutate) return;
      void save({ mode: 'fixed', provider_id: option.providerId, model_id: option.modelId });
    },
    [canMutate, save, selectableOptionMap]
  );

  const handleCheck = useCallback(async (): Promise<void> => {
    if (!response || !canCheck) return;
    const previousResponse = response;
    const requestId = ++requestRef.current;
    setPending('checking');
    setActionError(undefined);
    try {
      const nextResponse = await appOperationsModel.check.invoke();
      if (unmountedRef.current || requestId !== requestRef.current) return;
      setResponse(nextResponse);
      setDraft(nextResponse.setting);
    } catch {
      if (unmountedRef.current || requestId !== requestRef.current) return;
      setResponse(previousResponse);
      setDraft(previousResponse.setting);
      setActionError('check');
    } finally {
      if (!unmountedRef.current && requestId === requestRef.current) setPending('idle');
    }
  }, [canCheck, response]);

  const selectedFixedValue = isFixedSetting(draft) ? modelOptionValue(draft.provider_id, draft.model_id) : undefined;
  const mutationsDisabled = !canMutate;
  const reasonCode: AppOperationsModelReasonCode | undefined = response?.reason_code;

  return (
    <section className='flex flex-col gap-12px rounded-8px border border-border-2 p-16px'>
      <div className='flex flex-col gap-4px'>
        <div className='text-15px font-medium text-text-1'>{t('settings.appOperationsModel.title')}</div>
        <div className='text-13px text-text-3'>{t('settings.appOperationsModel.contextCompaction')}</div>
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
              {t('settings.appOperationsModel.retry')}
            </Button>
          }
        />
      )}

      {actionError && <Alert type='error' content={t(`settings.appOperationsModel.${actionError}Failed`)} />}

      {phase !== 'loading' && (
        <>
          <Radio.Group
            value={draft?.mode}
            disabled={mutationsDisabled}
            onChange={(value) => handleModeChange(value === 'fixed' ? 'fixed' : 'auto')}
          >
            <Radio value='auto'>{t('settings.appOperationsModel.auto')}</Radio>
            <Radio value='fixed'>{t('settings.appOperationsModel.fixed')}</Radio>
          </Radio.Group>

          {draft?.mode === 'fixed' && (
            <label className='flex flex-col gap-4px text-13px text-text-2'>
              {t('settings.appOperationsModel.fixedModel')}
              <AionSelect
                aria-label={t('settings.appOperationsModel.fixedModel')}
                value={selectedFixedValue}
                disabled={mutationsDisabled}
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
                  .filter((option) => option.synthetic)
                  .map((option) => (
                    <AionSelect.Option key={option.value} value={option.value} disabled>
                      {`${option.providerId} / ${option.modelId}`}
                    </AionSelect.Option>
                  ))}
              </AionSelect>
            </label>
          )}

          <div aria-live='polite' className='flex flex-wrap items-center gap-8px text-13px text-text-2'>
            {identityProvider && <Tag>{identityProvider}</Tag>}
            {responseIdentity && <Tag>{responseIdentity.model_id}</Tag>}
            {visibleHealth && <Tag>{t(statusKey(visibleHealth))}</Tag>}
            {reasonCode && <span>{t(`settings.appOperationsModel.reason.${reasonCode}`)}</span>}
          </div>

          <Button
            type='secondary'
            disabled={!canCheck}
            loading={pending === 'checking'}
            onClick={() => void handleCheck()}
          >
            {t('settings.appOperationsModel.check')}
          </Button>
        </>
      )}
    </section>
  );
}
