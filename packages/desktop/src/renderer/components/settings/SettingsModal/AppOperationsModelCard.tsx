/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AppOperationsModelCard — the app operations status card.
 *
 * The block lives beside the Settings > Models page title (and in the modal
 * header) so the page body can start with providers immediately. It carries only
 * what is worth glancing at — mode, resolved model, health and consumer — while
 * everything mutable lives one click deeper in a popover.
 *
 * The card is a THREE-BAND vertical block, never a one-line strip: a header row
 * (label + info + mode pill + gear), an identity row (provider logo, provider
 * name over model id) and a status footer (dot + word + last check + consumer).
 * Every label gets its own line so nothing has to be truncated to fit.
 *
 * There is still ONE component and ONE state machine. Quiet states (ready,
 * checking) render the three bands and nothing else; actionable states escalate
 * the card with a keyline, a plain-language cause and the one action that fixes
 * it, and drop the bands that no longer say anything true.
 */

import { Button, Message, Popover, Tooltip } from '@arco-design/web-react';
import { Caution, Info, LinkCloud, LoadingFour, Refresh, SettingTwo } from '@icon-park/react';
import classNames from 'classnames';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { appOperationsModel } from '@/common/adapter/ipcBridge';
import type { IProvider } from '@/common/config/storage';
import type {
  AppOperationsModelReasonCode,
  AppOperationsModelRef,
  AppOperationsModelResponse,
  AppOperationsModelSetting,
} from '@/common/types/appOperations';
import AionSelect from '@/renderer/components/base/AionSelect';
import { getProviderLogo } from '@/renderer/utils/model/modelPlatforms';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * What this card knows about the current assignment, published for the provider
 * and model rows below it. The card owns the only fetch of the setting, so the
 * rows consume this rather than re-deriving an eligibility policy the desktop app
 * is explicitly not allowed to reproduce.
 */
export type AppOperationsAssignment = {
  /** The pair the backend says is actually serving app operations. Undefined when nothing resolves. */
  resolved?: AppOperationsModelRef;
  /** The pair a Fixed setting pins, whether or not it currently resolves. Undefined in Auto mode. */
  pinned?: AppOperationsModelRef;
};

export type AppOperationsModelCardProps = {
  providers: IProvider[];
  providersLoading: boolean;
  persistedProvidersRevision: number;
  onAddModel: () => void;
  /** Optional. Called only when the assignment actually changes. */
  onAssignmentChange?: (assignment: AppOperationsAssignment) => void;
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

const assignmentSignature = (resolved?: AppOperationsModelRef, pinned?: AppOperationsModelRef): string =>
  JSON.stringify([resolved ?? null, pinned ?? null]);

/**
 * Seeds the publish guard so the render before the first load resolves does not
 * emit an empty assignment. A load that 404s therefore publishes nothing at all,
 * and a genuinely emptied assignment after a real one still publishes.
 */
const EMPTY_ASSIGNMENT_SIGNATURE = assignmentSignature();

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

/** The status word is tinted to match its dot so the pair reads as one signal. */
const TONE_TEXT_CLASS: Record<StatusTone, string> = {
  neutral: 'text-t-secondary',
  success: 'text-success-6',
  warning: 'text-warning-7',
  danger: 'text-danger-6',
};

/**
 * Only warning and danger escalate the card, and they escalate it with a 3px left
 * keyline on top of the tone-coloured hairline. Quiet states stay quiet.
 *
 * Two UnoCSS traps are load-bearing here, both verified by generating the CSS:
 *
 * 1. Use `border-arco-2`, never `border-b-base`: UnoCSS parses the latter as the
 *    side utility `border-b-*` and compiles it to
 *    `border-bottom-color: var(--bg-base)` — one edge only, painted in the page
 *    background, i.e. an invisible keyline.
 * 2. `border-l-warning-6` compiles to NOTHING (the numeric Arco scale rule only
 *    matches `border-<tone>-<n>`, and presetWind3 cannot resolve `warning-6` as a
 *    theme colour for a side). Combining a side colour with the four-side
 *    shorthand does not work either: `border-warning-3` is emitted AFTER
 *    `border-l-warning`, so the shorthand wins and repaints the left edge. So the
 *    tone colour is applied once, to all four sides, and only the WIDTH differs.
 */
const TONE_KEYLINE_CLASS: Record<StatusTone, string> = {
  neutral: 'border-arco-2',
  success: 'border-arco-2',
  warning: 'border-warning border-l-3px',
  danger: 'border-danger border-l-3px',
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

/** Section labels inside the popover — unchanged. */
const SECTION_LABEL_CLASS = 'text-10px font-600 uppercase tracking-wide text-t-tertiary';

/**
 * Band 1's own label: mono, wider tracking, smaller than the popover's. `shrink-0`
 * is the point of the whole rework — this label must never be the thing that gives
 * way to fit a row.
 */
const PANEL_LABEL_CLASS = 'shrink-0 font-mono text-10px font-600 uppercase tracking-[0.12em] text-t-tertiary';

/**
 * The card surface. `bg-fill-0` is the same raised surface the provider rows on
 * this settings page use (white in light, a translucent lift in dark), so the
 * card matches its siblings instead of inventing a surface.
 */
const CARD_SURFACE_CLASS =
  'box-border flex w-full min-w-0 flex-col rounded-12px border border-solid bg-fill-0 px-16px py-14px shadow-[var(--shadow-card)]';

/** A 12px spinner. Used wherever a status is in flight instead of settled. */
const StatusSpinner: React.FC<{ className?: string }> = ({ className }) => (
  <LoadingFour
    theme='outline'
    size='12'
    aria-hidden='true'
    data-testid='app-operations-status-spinner'
    className={classNames('flex shrink-0 animate-spin', className)}
  />
);

/**
 * Band 3's leading signal plus its word. Settled statuses get a 7px dot, statuses
 * still resolving get the spinner — never colour alone, and never a bare glyph.
 */
const StatusIndicator: React.FC<{ status: PanelStatus; label: string; className?: string; spinning?: boolean }> = ({
  status,
  label,
  className,
  spinning = false,
}) => {
  const tone = STATUS_TONES[status];
  return (
    <span
      data-testid='app-operations-status'
      data-tone={tone}
      className={classNames('flex min-w-0 items-center gap-8px', className)}
    >
      {spinning ? (
        <StatusSpinner />
      ) : (
        <span
          aria-hidden='true'
          data-testid='app-operations-status-dot'
          className={classNames('h-7px w-7px shrink-0 rounded-999px', TONE_DOT_CLASS[tone])}
        />
      )}
      <span className='truncate'>{label}</span>
    </span>
  );
};

/**
 * Band 2's 26px logo tile. Falls back to the provider's initial on a neutral fill
 * so the tile always occupies the same box and the two text lines never shift.
 */
const ProviderAvatar: React.FC<{ provider?: IProvider; name: string }> = ({ provider, name }) => {
  const logo = getProviderLogo({
    name: provider?.name ?? name,
    base_url: provider?.base_url,
    platform: provider?.platform,
  });
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden='true'
      data-testid='app-operations-avatar'
      className='grid h-26px w-26px shrink-0 place-items-center overflow-hidden rounded-6px border border-solid border-arco-2 bg-fill-1'
    >
      {logo ? (
        <img src={logo} alt='' className='h-16px w-16px object-contain' />
      ) : initial ? (
        <span className='text-11px font-800 leading-none text-t-secondary'>{initial}</span>
      ) : (
        <LinkCloud theme='outline' size='14' className='flex text-t-tertiary' />
      )}
    </span>
  );
};

export default function AppOperationsModelCard({
  providers,
  providersLoading,
  persistedProvidersRevision,
  onAddModel,
  onAssignmentChange,
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

  /**
   * Publish the assignment upward so the model rows can tag it. This card owns
   * the only fetch, so row and card render from one value and cannot disagree.
   * The signature guard is load-bearing: the parent re-renders this card on every
   * publish, and an unguarded call would loop.
   */
  const publishedAssignmentRef = useRef<string>(EMPTY_ASSIGNMENT_SIGNATURE);
  useEffect(() => {
    if (!onAssignmentChange) return;
    const resolved = response?.resolved_model;
    const pinned = isFixedSetting(response?.setting)
      ? { provider_id: response.setting.provider_id, model_id: response.setting.model_id }
      : undefined;
    const signature = assignmentSignature(resolved, pinned);
    if (publishedAssignmentRef.current === signature) return;
    publishedAssignmentRef.current = signature;
    onAssignmentChange({ resolved, pinned });
  }, [onAssignmentChange, response]);

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

  /**
   * Band 3 states the last check only on the settled card. A stale timestamp next
   * to Checking, Unavailable or Setup required would date the wrong thing.
   */
  const panelCheckedLabel =
    panelStatus === 'ready' && response?.checked_at !== undefined ? formatCheckedAt(response.checked_at) : undefined;

  const isFixedMode = draft?.mode === 'fixed';
  const modeLabel = isFixedMode ? t('settings.appOperationsModel.fixed') : t('settings.appOperationsModel.auto');

  /**
   * Band 2 only renders where an identity is both known and still true. In
   * setup_required nothing resolved, and while a save is in flight the identity on
   * screen is the one being replaced — showing either would state a falsehood.
   */
  const showIdentity =
    responseIdentity !== undefined &&
    identityProviderName !== undefined &&
    (panelStatus === 'ready' || panelStatus === 'checking' || panelStatus === 'unavailable');

  /** The consumer is context, not status: it belongs to the quiet card only. */
  const showConsumer = panelStatus === 'ready' || panelStatus === 'checking';

  /**
   * The gear disappears wherever the card already carries the one action that
   * matters, so there are never two competing ways in. `popoverOpen` keeps it
   * mounted for a popover the user already opened — otherwise choosing a model
   * would unmount the picker mid-save, the moment the status turns to `saving`.
   */
  const gearAllowed =
    phase === 'ready' &&
    panelStatus !== 'setup_required' &&
    panelStatus !== 'saving' &&
    panelStatus !== 'save_failed' &&
    !keptUnavailable;
  const showGear = phase === 'ready' && (gearAllowed || popoverOpen);

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

  /**
   * The plain-language cause. Escalated states say what happened in a sentence
   * before they offer anything to click — never a status word on its own.
   */
  const causeSentence = ((): string | undefined => {
    if (panelStatus === 'load_error') return t('settings.appOperationsModel.loadFailed');
    if (showAddModelAction) return t('settings.appOperationsModel.setupRequiredImpact');
    return undefined;
  })();

  /**
   * The one action that fixes the state, full width — or, for a kept-but-dead
   * Fixed pair, the two that do (leave Fixed, or stay in Fixed and repick).
   */
  const actionRow = ((): React.ReactNode => {
    if (panelStatus === 'load_error') {
      return (
        <Button data-testid='app-operations-retry' long type='primary' size='small' onClick={() => void load()}>
          {t('common.retry')}
        </Button>
      );
    }
    if (showAddModelAction) {
      return (
        <Button long type='primary' size='small' onClick={onAddModel}>
          {t('settings.addModel')}
        </Button>
      );
    }
    if (keptUnavailable && panelStatus === 'unavailable') {
      return (
        // Equal widths side by side, but `flex-wrap` + a floor lets a long
        // translation take a row of its own rather than clip inside the button.
        <div className='flex flex-wrap gap-8px'>
          <Button
            className='min-w-120px flex-1'
            size='small'
            disabled={!canMutate}
            onClick={() => handleModeChange('auto')}
          >
            {t('settings.appOperationsModel.switchToAuto')}
          </Button>
          <Button className='min-w-120px flex-1' size='small' onClick={() => setPopoverOpen(true)}>
            {t('settings.appOperationsModel.pickAnother')}
          </Button>
        </div>
      );
    }
    return null;
  })();

  // State 8 — zero providers configured. The screen is already an empty state
  // telling the user to add a provider and it carries both entry points, so the
  // panel would only repeat it. Providers that exist but are not eligible keep
  // the panel visible in SETUP REQUIRED.
  if (providers.length === 0) return null;

  // State 7 — the backend does not serve the setting. This is not a status of the
  // card, it is the absence of one, so it replaces the card with a notice rather
  // than leaving a live control stack behind an unsupported backend.
  if (panelStatus === 'backend_update_required') {
    return (
      <section
        aria-label={t('settings.appOperationsModel.title')}
        data-testid='app-operations-panel'
        data-status={panelStatus}
        data-tone={tone}
        className='w-full min-w-0'
      >
        {messageContext}
        {/* The notice is the inner box so the Message context holder can never
            become a flex item and claim a gap of its own. */}
        <div className='flex min-w-0 items-start gap-11px rounded-12px border border-solid border-warning-3 bg-warning-light-1 px-16px py-14px'>
          <Caution theme='outline' size='16' aria-hidden='true' className='mt-1px flex shrink-0 text-warning' />
          <div className='min-w-0'>
            <div
              data-testid='app-operations-backend-title'
              className='text-13px font-700 leading-[1.35] text-warning-7'
            >
              {t('settings.appOperationsModel.backendUpdateRequired')}
            </div>
            <div className='mt-4px text-12px leading-relaxed text-t-secondary'>
              {t('settings.appOperationsModel.backendUpdateRequiredDetail')}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={t('settings.appOperationsModel.title')}
      data-testid='app-operations-panel'
      data-status={panelStatus}
      data-tone={tone}
      className={classNames(CARD_SURFACE_CLASS, TONE_KEYLINE_CLASS[tone], panelStatus === 'saving' && 'opacity-94')}
    >
      {messageContext}

      {/* Band 1 — what this block is, which mode it runs in, and the way in. */}
      <div data-testid='app-operations-header' className='flex min-w-0 items-center gap-8px'>
        <span className={PANEL_LABEL_CLASS}>{t('settings.appOperationsModel.panelLabel')}</span>
        <Tooltip content={t('settings.appOperationsModel.panelInfo')}>
          <span
            data-testid='app-operations-info'
            aria-label={t('settings.appOperationsModel.panelInfo')}
            className='flex shrink-0 cursor-help text-t-tertiary'
          >
            <Info theme='outline' size='13' />
          </span>
        </Tooltip>
        <span
          data-testid='app-operations-mode'
          className={classNames(
            'ml-auto shrink-0 rounded-5px border border-solid px-7px py-2px text-10px font-700 uppercase tracking-wide',
            isFixedMode ? 'border-arco-2 bg-fill-1 text-t-secondary' : 'border-aou-3 bg-aou-2 text-aou-7'
          )}
        >
          {modeLabel}
        </span>
        {showGear && (
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
              disabled={panelStatus === 'checking'}
              className='!h-24px !w-24px !min-w-24px shrink-0 !rounded-6px'
              icon={<SettingTwo theme='outline' size='14' />}
            />
          </Popover>
        )}
      </div>

      {/* Band 2 — who is doing the work. Two full lines, both ellipsized with a
          title so a long provider or model id is recoverable on hover. */}
      {showIdentity && responseIdentity && identityProviderName && (
        <div data-testid='app-operations-identity' className='mt-10px flex min-w-0 items-center gap-9px'>
          <ProviderAvatar provider={identityProvider} name={identityProviderName} />
          <div className='min-w-0 flex-1'>
            <div
              data-testid='app-operations-provider'
              title={identityProviderName}
              className={classNames(
                'truncate text-15px font-700 leading-[1.25]',
                keptUnavailable ? 'text-t-secondary' : 'text-t-primary'
              )}
            >
              {identityProviderName}
            </div>
            <div className='flex min-w-0 items-center gap-7px'>
              <span
                data-testid='app-operations-model'
                title={responseIdentity.model_id}
                className={classNames(
                  'truncate font-mono text-12px text-t-secondary',
                  keptUnavailable && 'line-through'
                )}
              >
                {responseIdentity.model_id}
              </span>
              {keptUnavailable && (
                <span
                  data-testid='app-operations-kept'
                  className='shrink-0 rounded-4px border border-solid border-danger-3 bg-danger-1 px-6px py-1px font-mono text-[9.5px] uppercase tracking-wide text-danger-6'
                >
                  {t('settings.appOperationsModel.kept')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Band 3 — the status footer. The keyline above it only exists when band 2
          does; without an identity to divide from, it would be a line to nowhere. */}
      <div
        aria-live='polite'
        data-testid='app-operations-status-line'
        className={classNames(
          'flex min-w-0 items-center gap-8px',
          showIdentity ? 'mt-11px border-t border-solid border-arco-2 pt-11px' : 'mt-11px'
        )}
      >
        {panelStatus === 'checking' ? (
          <StatusIndicator
            status={panelStatus}
            label={t(STATUS_KEYS[panelStatus])}
            spinning
            className='text-[12.5px] font-700 text-aou-7'
          />
        ) : panelStatus === 'saving' ? (
          <StatusIndicator
            status={panelStatus}
            label={t(STATUS_KEYS[panelStatus])}
            spinning
            className='text-[12.5px] text-t-secondary'
          />
        ) : (
          <StatusIndicator
            status={panelStatus}
            label={t(STATUS_KEYS[panelStatus])}
            className={classNames(
              'font-700',
              panelStatus === 'setup_required' ? 'text-[13.5px]' : 'text-[12.5px]',
              TONE_TEXT_CLASS[tone]
            )}
          />
        )}
        {panelCheckedLabel && (
          <span data-testid='app-operations-checked' className='min-w-0 truncate text-[11.5px] text-t-tertiary'>
            {`· ${panelCheckedLabel}`}
          </span>
        )}
        {showConsumer && (
          <span data-testid='app-operations-consumer' className='ml-auto shrink-0 text-[11.5px] text-t-tertiary'>
            {t('settings.appOperationsModel.contextCompaction')}
          </span>
        )}
      </div>

      {causeSentence && (
        <div data-testid='app-operations-cause' className='mt-5px text-[12.5px] leading-relaxed text-t-secondary'>
          {causeSentence}
        </div>
      )}

      {reasonCode && (
        <div
          className={classNames(
            'mt-5px leading-relaxed',
            // An escalated card has to be readable, not merely present: the reason
            // is the cause the user acts on, so it takes the cause type there.
            tone === 'warning' || tone === 'danger' ? 'text-[12.5px] text-t-secondary' : 'text-12px text-t-tertiary'
          )}
          data-testid='app-operations-reason'
        >
          {t(REASON_KEYS[reasonCode])}
        </div>
      )}

      {actionRow && (
        <div data-testid='app-operations-actions' className='mt-11px'>
          {actionRow}
        </div>
      )}

      {/* A failed save is the one thing the card cannot state as a status: the
          setting did not change, so the card still describes the old truth. The
          toast sits on top of it instead of rewriting it. */}
      {panelStatus === 'save_failed' && (
        <div
          data-testid='app-operations-save-failed-toast'
          className='mt-12px flex items-center gap-9px rounded-9px bg-[var(--color-tooltip-bg)] px-12px py-9px'
        >
          <Caution theme='outline' size='14' aria-hidden='true' className='flex shrink-0 text-warning' />
          <span className='min-w-0 text-12px text-white'>{t('settings.appOperationsModel.saveFailedToast')}</span>
          <Button
            data-testid='app-operations-retry'
            className='ml-auto shrink-0'
            size='mini'
            type='primary'
            onClick={() => failedSetting && void save(failedSetting)}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
    </section>
  );
}
