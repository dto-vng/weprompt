/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { CREATIVE_STUDIO_ENABLED } from '@/common/config/constants';
import type { IProvider } from '@/common/config/storage';
import {
  normalizeProviderHealthCheckFailure,
  type ProviderHealthCheckResponse,
} from '@/common/types/provider/providerApi';
import { supportsOpenAiApiMode } from '@/common/utils/modelCapabilities';
import {
  Button,
  Divider,
  Dropdown,
  Menu,
  Message,
  Modal,
  Popconfirm,
  Collapse,
  Tag,
  Switch,
  Tooltip,
} from '@arco-design/web-react';
import {
  DeleteFour,
  Heartbeat,
  Info,
  MoreOne,
  Plus,
  PreviewClose,
  PreviewOpen,
  SettingTwo,
  Write,
} from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddModelModal from '@/renderer/pages/settings/components/AddModelModal';
import AddPlatformModal from '@/renderer/pages/settings/components/AddPlatformModal';
import { isNewApiPlatform, NEW_API_PROTOCOL_OPTIONS } from '@/renderer/utils/model/modelPlatforms';
import EditModeModal from '@/renderer/pages/settings/components/EditModeModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import TalkToButlerButton from '@/renderer/components/base/TalkToButlerButton';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import AppOperationsModelCard, { type AppOperationsAssignment } from '../../AppOperationsModelCard';
import { useSettingsViewMode } from '../../settingsViewContext';
import SettingsPageHeader from '@/renderer/pages/settings/components/SettingsPageHeader';
import { consumePendingDeepLink } from '@/renderer/hooks/system/useDeepLink';
import { StudioMediaModelsSection } from './StudioMediaModelsSection';
import { getApiKeyCount, summarizeProviderHealth } from './providerRowSummary';
import '../../model-provider.css';

/**
 * 获取协议显示标签颜色
 * Get protocol badge color
 */
const getProtocolColor = (protocol: string): string => {
  switch (protocol) {
    case 'gemini':
      return 'blue';
    case 'anthropic':
      return 'orange';
    case 'openai':
    default:
      return 'green';
  }
};

/**
 * 获取协议显示名称
 * Get protocol display name
 */
const getProtocolLabel = (protocol: string): string => {
  return NEW_API_PROTOCOL_OPTIONS.find((p) => p.value === protocol)?.label || 'OpenAI';
};

/**
 * 获取下一个协议（循环切换）
 * Get next protocol (cycle through options)
 */
const getNextProtocol = (current: string): string => {
  const idx = NEW_API_PROTOCOL_OPTIONS.findIndex((p) => p.value === current);
  const nextIdx = (idx + 1) % NEW_API_PROTOCOL_OPTIONS.length;
  return NEW_API_PROTOCOL_OPTIONS[nextIdx].value;
};

/**
 * 获取供应商的启用状态（全选/半选/全不选）
 * Get provider enable state (all/partial/none)
 */
const getProviderState = (platform: IProvider): { checked: boolean; indeterminate: boolean } => {
  if (!platform.model_enabled) {
    // 没有 model_enabled 记录，默认全部启用
    return { checked: true, indeterminate: false };
  }

  const models = platform.models ?? [];
  const enabledCount = models.filter((model) => platform.model_enabled?.[model] !== false).length;
  const totalCount = models.length;

  if (enabledCount === 0) {
    return { checked: false, indeterminate: false }; // 全不选
  } else if (enabledCount === totalCount) {
    return { checked: true, indeterminate: false }; // 全选
  } else {
    return { checked: true, indeterminate: true }; // 半选（有模型开启，显示为开启状态）
  }
};

/**
 * 检查模型是否启用
 * Check if model is enabled
 */
const isModelEnabled = (platform: IProvider, model: string): boolean => {
  if (!platform.model_enabled) return true; // 默认启用
  return platform.model_enabled[model] !== false;
};

const ModelModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const [collapseKey, setCollapseKey] = useState<Record<string, boolean>>({});
  /** Controlled so the ⋯ trigger can report aria-expanded; only one menu is ever open. */
  const [openProviderMenuId, setOpenProviderMenuId] = useState<string | undefined>(undefined);
  const [healthCheckLoading, setHealthCheckLoading] = useState<Record<string, boolean>>({});
  const [providerRefreshToken, setProviderRefreshToken] = useState(0);
  const { data, mutate } = useProvidersQuery();
  const [message, messageContext] = Message.useMessage();
  const markProviderCatalogChanged = (): void => setProviderRefreshToken((value) => value + 1);
  const [persistedProvidersRevision, setPersistedProvidersRevision] = useState(0);
  /**
   * Published by AppOperationsModelCard, which owns the only fetch of the setting.
   * Stays empty until it publishes — including permanently on builds whose backend
   * 404s the endpoint, where no row carries the tag and no delete warns about a pin.
   */
  const [appOperations, setAppOperations] = useState<AppOperationsAssignment>({});
  const handleAppOperationsAssignment = useCallback(
    (assignment: AppOperationsAssignment) => setAppOperations(assignment),
    []
  );

  const signalProviderPersisted = (): void => {
    setPersistedProvidersRevision((revision) => revision + 1);
  };

  /**
   * Create when the provider id is new, update otherwise.
   * The caller is expected to have mutated the id-bearing record already.
   */
  const persistPlatform = async (platform: IProvider): Promise<void> => {
    const existing = (data || []).some((item) => item.id === platform.id);
    if (existing) {
      const { id, ...body } = platform;
      await ipcBridge.mode.updateProvider.invoke({ id, ...body });
    } else {
      await ipcBridge.mode.createProvider.invoke(platform);
    }
  };

  const updatePlatform = (platform: IProvider, success: () => void) => {
    const existing = (data || []).find((item) => item.id === platform.id);
    const nextArray = existing
      ? (data || []).map((item) => (item.id === platform.id ? { ...item, ...platform } : item))
      : [...(data || []), platform];

    // Optimistic update
    void mutate(nextArray, false);

    persistPlatform(platform)
      .then(() => {
        signalProviderPersisted();
        void mutate();
        markProviderCatalogChanged();
        success();
      })
      .catch((error) => {
        void mutate();
        console.error('Failed to save provider:', error);
        // 409 Conflict — duplicate id (rare pre-launch); different toast
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('409')) {
          message.error(t('settings.providerIdConflict', { defaultValue: 'Provider id already exists, retry.' }));
        } else {
          message.error(t('settings.saveModelConfigFailed'));
        }
      });
  };

  const removePlatform = (id: string) => {
    const nextArray = (data ?? []).filter((item: IProvider) => item.id !== id);
    void mutate(nextArray, false);
    ipcBridge.mode.deleteProvider
      .invoke({ id })
      .then(() => {
        signalProviderPersisted();
        void mutate();
        markProviderCatalogChanged();
      })
      .catch((error) => {
        void mutate();
        console.error('Failed to delete provider:', error);
        message.error(t('settings.saveModelConfigFailed'));
      });
  };

  /**
   * "2 models · 1 key" as one translated string. The separator lives in the
   * locale rather than in JSX so a language can reorder or replace it.
   */
  const providerCountsLabel = (platform: IProvider): string =>
    t('settings.providerRow.counts', {
      models: t('settings.providerRow.modelCount', { count: (platform.models ?? []).length }),
      keys: t('settings.providerRow.apiKeyCount', { count: getApiKeyCount(platform.api_key) }),
    });

  /** "2 · 1" — the same template with bare numerals, for the narrow row. */
  const providerCountsCompactLabel = (platform: IProvider): string =>
    t('settings.providerRow.counts', {
      models: (platform.models ?? []).length,
      keys: getApiKeyCount(platform.api_key),
    });

  /**
   * Every row repeats the same three action icons, so a bare "Add Model" is heard
   * N times with nothing distinguishing the rows. The target is folded into the
   * accessible name; the visible tooltip keeps the short verb.
   */
  const providerActionLabel = (action: string, platform: IProvider): string =>
    t('settings.providerRow.actionLabel', { action, provider: platform.name });

  const modelActionLabel = (action: string, model: string): string =>
    t('settings.modelRow.actionLabel', { action, model });

  /**
   * Per-provider replacement for the global "Clear status" button removed in
   * 06a2f7eea, which wiped model_health for EVERY provider with no confirmation.
   * Same write, scoped to one provider, and confirmed.
   */
  const clearProviderHealth = (platform: IProvider) => {
    const nextArray = (data ?? []).map((item: IProvider) =>
      item.id === platform.id ? { ...item, model_health: undefined as IProvider['model_health'] } : item
    );
    void mutate(nextArray, false);

    ipcBridge.mode.updateProvider
      .invoke({ id: platform.id, model_health: {} })
      .then(async () => {
        signalProviderPersisted();
        markProviderCatalogChanged();
        // Every other write in this file sends a POPULATED map, so an empty one is
        // the single place that depends on the backend treating `model_health` as a
        // replacement rather than a merge — a contract nothing in this repo pins.
        // The refetch is therefore the authority: success is claimed only once the
        // server agrees the health is gone, never on the optimistic paint alone.
        const refreshed = await mutate();
        const remaining = refreshed?.find((item: IProvider) => item.id === platform.id)?.model_health;
        if (remaining && Object.keys(remaining).length > 0) {
          message.error(t('settings.saveModelConfigFailed'));
          return;
        }
        Message.success({
          content: t('settings.providerRow.healthCleared', { provider: platform.name }),
          duration: 2000,
        });
      })
      .catch((error) => {
        void mutate();
        console.error('Failed to clear provider health status:', error);
        message.error(t('settings.saveModelConfigFailed'));
      });
  };

  /**
   * Confirmed even though the data is recoverable by re-running a health check:
   * the item sits one row above Delete in the same menu.
   */
  const confirmClearProviderHealth = (platform: IProvider) => {
    Modal.confirm({
      title: t('settings.providerRow.clearHealthConfirmTitle'),
      content: <span>{t('settings.providerRow.clearHealthConfirmBody', { provider: platform.name })}</span>,
      okText: t('settings.providerRow.clearHealth'),
      cancelText: t('common.cancel'),
      alignCenter: true,
      getPopupContainer: () => document.body,
      onOk: () => clearProviderHealth(platform),
    });
  };

  /**
   * Deleting a provider destroys its API keys, every model it configures and all
   * per-model state, so the confirm names the provider and its scale. It replaces
   * a Popconfirm, which cannot survive the move into a menu: clicking a Menu.Item
   * unmounts the Dropdown popup, so the Popconfirm would never resolve.
   */
  const confirmDeleteProvider = (platform: IProvider) => {
    // The Fixed setting's own pair, not resolved_model: a pin that is already
    // unavailable still has to warn, and an Auto resolution must not. Deletion is
    // the last moment the provider's human-readable name still exists.
    const pinnedHere = appOperations.pinned?.provider_id === platform.id;
    Modal.confirm({
      title: t('settings.providerRow.deleteConfirmTitle'),
      content: (
        <div className='flex flex-col gap-6px text-14px'>
          <span className='text-t-primary'>
            {t('settings.providerRow.deleteConfirmBody', {
              provider: platform.name,
              counts: providerCountsLabel(platform),
            })}
          </span>
          <span className='text-t-secondary'>{t('settings.providerRow.deleteConfirmDetail')}</span>
          {pinnedHere && <span className='text-danger-6'>{t('settings.providerRow.deleteAppOperationsWarning')}</span>}
        </div>
      ),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      okButtonProps: { status: 'danger' },
      alignCenter: true,
      getPopupContainer: () => document.body,
      onOk: () => removePlatform(platform.id),
    });
  };

  const renderProviderMenu = (platform: IProvider) => (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'add-model') addModelModalCtrl.open({ data: platform });
        if (key === 'edit-provider') editModalCtrl.open({ data: platform });
        if (key === 'clear-health') confirmClearProviderHealth(platform);
        if (key === 'delete') confirmDeleteProvider(platform);
      }}
    >
      {/* Hidden wherever the row still shows the icons, so the menu never offers a
          second copy of a button that is one pixel to its left. */}
      <Menu.Item key='add-model' className='md:!hidden'>
        <span data-testid={`menu-add-model-${platform.id}`}>{t('settings.addModel')}</span>
      </Menu.Item>
      <Menu.Item key='edit-provider' className='md:!hidden'>
        <span data-testid={`menu-edit-provider-${platform.id}`}>{t('settings.editModel')}</span>
      </Menu.Item>
      <Menu.Item key='clear-health'>
        <span data-testid={`menu-clear-health-${platform.id}`}>{t('settings.providerRow.clearHealth')}</span>
      </Menu.Item>
      <Menu.Item key='delete'>
        <span data-testid={`menu-delete-provider-${platform.id}`} className='text-danger-6'>
          {t('common.delete')}
        </span>
      </Menu.Item>
    </Menu>
  );

  // 切换供应商启用状态（全选 ↔ 全不选）
  const toggleProviderEnabled = (platform: IProvider) => {
    const { checked } = getProviderState(platform);
    const newState = !checked; // 切换状态

    // 批量更新所有模型状态
    const model_enabled: Record<string, boolean> = {};
    (platform.models ?? []).forEach((model) => {
      model_enabled[model] = newState;
    });

    const updated = {
      ...platform,
      model_enabled,
    };
    updatePlatform(updated, () => {});
  };

  // 切换模型启用状态
  const toggleModelEnabled = (platform: IProvider, model: string, enabled: boolean) => {
    const model_enabled = { ...platform.model_enabled };
    model_enabled[model] = enabled;

    const updated = {
      ...platform,
      model_enabled,
    };

    updatePlatform(updated, () => {});
  };

  // Execute provider/model health check without creating a conversation.
  const performHealthCheck = async (platform: IProvider, modelName: string) => {
    const loadingKey = `${platform.id}-${modelName}`;
    setHealthCheckLoading((prev) => ({ ...prev, [loadingKey]: true }));

    const startTime = Date.now();

    try {
      const request = {
        provider_id: platform.id,
        model: modelName,
      };
      let result: ProviderHealthCheckResponse = await ipcBridge.acpConversation.checkProviderHealth.invoke(request);
      if (result.status !== 'healthy') {
        const initialFailure = normalizeProviderHealthCheckFailure(result);
        if (initialFailure.retryAfterMs !== undefined) {
          await new Promise<void>((resolve) => setTimeout(resolve, initialFailure.retryAfterMs));
          result = await ipcBridge.acpConversation.checkProviderHealth.invoke(request);
        }
      }
      const latency = result.elapsed_ms || Date.now() - startTime;
      const success = result.status === 'healthy';
      const failure = success ? undefined : normalizeProviderHealthCheckFailure(result);
      const errorMessage = failure ? `${t(failure.statusKey)} ${t(failure.actionKey)}` : t('common.unknownError');

      if (failure) {
        console.warn('[provider-health] check failed', {
          failure_class: failure.failureClass,
          ...(failure.httpStatus !== undefined ? { http_status: failure.httpStatus } : {}),
          ...(failure.requestId !== undefined ? { request_id: failure.requestId } : {}),
        });
      }

      try {
        // 先获取最新的数据，确保不会覆盖其他并发的更新
        const latestData = await ipcBridge.mode.listProviders.invoke();
        const latestPlatform = (latestData || []).find((item) => item.id === platform.id);
        const model_health = { ...latestPlatform?.model_health };
        model_health[modelName] = {
          status: success ? 'healthy' : 'unhealthy',
          last_check: Date.now(),
          latency,
          error: success ? undefined : errorMessage,
          failure_class: failure?.failureClass,
          http_status: failure?.httpStatus,
          request_id: failure?.requestId,
          retry_after_ms: failure?.retryAfterMs,
          provider_error_type: failure?.providerErrorType,
        };

        await ipcBridge.mode.updateProvider.invoke({ id: platform.id, model_health });
        signalProviderPersisted();
        await mutate();
        markProviderCatalogChanged();
        if (success) {
          Message.success({
            content: `${platform.name} - ${modelName}: ${t('common.success')} (${latency}ms)`,
            duration: 3000,
          });
        } else {
          Message.error({
            content: `${platform.name} - ${modelName}: ${t('common.failed')} - ${errorMessage}`,
            duration: 5000,
          });
        }
      } catch (saveError) {
        console.error('Failed to save health check result:', saveError);
        Message.error({
          content: t('settings.saveModelConfigFailed'),
          duration: 3000,
        });
      }
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      Message.error({
        content: `${platform.name} - ${modelName}: ${t('common.failed')} - ${errorMessage}`,
        duration: 5000,
      });

      try {
        // 先获取最新的数据，确保不会覆盖其他并发的更新
        const latestData = await ipcBridge.mode.listProviders.invoke();
        const latestPlatform = (latestData || []).find((item) => item.id === platform.id);
        const model_health = { ...latestPlatform?.model_health };
        model_health[modelName] = {
          status: 'unhealthy',
          last_check: Date.now(),
          latency,
          error: errorMessage,
        };

        await ipcBridge.mode.updateProvider.invoke({ id: platform.id, model_health });
        signalProviderPersisted();
        await mutate();
        markProviderCatalogChanged();
      } catch (saveError) {
        console.error('Failed to save health check result:', saveError);
      }
    } finally {
      setHealthCheckLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  const [addPlatformModalCtrl, addPlatformModalContext] = AddPlatformModal.useModal({
    onSubmit(platform) {
      updatePlatform(platform, () => {
        setCollapseKey((prev) => ({ ...prev, [platform.id]: true }));
        addPlatformModalCtrl.close();
      });
    },
  });

  // Consume pending deep-link data on mount (set by useDeepLink hook before navigation)
  useEffect(() => {
    const pending = consumePendingDeepLink();
    if (pending) {
      addPlatformModalCtrl.open({ deepLinkData: pending });
    }
  }, [addPlatformModalCtrl]);

  const [addModelModalCtrl, addModelModalContext] = AddModelModal.useModal({
    onSubmit(platform) {
      updatePlatform(platform, () => {
        setCollapseKey((prev) => ({ ...prev, [platform.id]: true }));
        addModelModalCtrl.close();
      });
    },
  });

  const [editModalCtrl, editModalContext] = EditModeModal.useModal({
    onChange(platform) {
      updatePlatform(platform, () => editModalCtrl.close());
    },
  });

  const headerActions = (
    <>
      <TalkToButlerButton
        label={t('settings.addModel')}
        chatLabel={t('settings.talkToButler.addViaChat', { defaultValue: 'Add via chat' })}
        onManual={() => addPlatformModalCtrl.open()}
        manualLabel={t('settings.talkToButler.addManually', { defaultValue: 'Add manually' })}
        prompt={t('settings.talkToButler.prompt.addModel', {
          defaultValue: 'Help me add a new LLM provider and API key, then set it as the default model.',
        })}
      />
    </>
  );

  // The app operations block is a status card in the header, not a body card, so
  // the page body starts with providers immediately. It renders `w-full` and lets
  // its container decide the width: `SettingsPageHeader`'s status column caps it at
  // the card width beside the title on wide viewports and wraps it full-width
  // below otherwise, and the modal header stacks it full-width. It must not join
  // `headerActions` — that slot is `shrink-0`, so a wide panel there sizes the
  // whole header to its max-content width and overflows the page.
  const appOperationsPanel = (
    <AppOperationsModelCard
      providers={data ?? []}
      providersLoading={data === undefined}
      persistedProvidersRevision={persistedProvidersRevision}
      onAddModel={() => addPlatformModalCtrl.open()}
      onAssignmentChange={handleAppOperationsAssignment}
    />
  );

  const supportNote = (
    <div
      className='rd-8px px-12px py-8px text-12px leading-5 border border-solid'
      style={{
        borderColor: 'rgba(var(--primary-6),0.32)',
        backgroundColor: 'rgba(var(--primary-6),0.08)',
        color: 'rgb(var(--primary-6))',
      }}
    >
      {t('settings.customModelSupportNote')}
    </div>
  );

  return (
    <div
      className={
        isPageMode
          ? 'flex flex-col gap-16px'
          : 'flex flex-col bg-2 rd-16px px-16px md:px-24px lg:px-28px py-16px md:py-18px'
      }
    >
      {messageContext}
      {addPlatformModalContext}
      {editModalContext}
      {addModelModalContext}

      {isPageMode ? (
        <SettingsPageHeader
          data-testid='model-header'
          title={t('settings.model')}
          description={t('settings.modelDescription', {
            defaultValue: 'Configure providers and API keys for text, image, and video models.',
          })}
          actions={headerActions}
          actionsPlacement='below-description'
          statusPanel={appOperationsPanel}
        />
      ) : (
        /* Modal mode keeps its compact self-contained header. */
        <div className='flex-shrink-0 border-b border-[var(--color-border-2)] pb-12px mb-14px flex flex-col gap-10px'>
          <div className='flex items-center justify-between gap-8px flex-wrap'>
            <div className='text-20px font-600 text-t-primary leading-34px'>{t('settings.model')}</div>
            <div className='flex items-center gap-8px flex-wrap'>{headerActions}</div>
          </div>
          {appOperationsPanel}
          {supportNote}
        </div>
      )}

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {!data || data.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-40px'>
              <Info theme='outline' size='48' className='text-t-secondary mb-16px' />
              <h3 className='text-16px font-500 text-t-primary mb-8px'>{t('settings.noConfiguredModels')}</h3>
              <p className='text-14px text-t-secondary text-center max-w-400px'>
                {t('settings.needHelpConfigGuide')}
                <a
                  href='https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-[rgb(var(--primary-6))] hover:text-[rgb(var(--primary-5))] underline ml-4px'
                >
                  {t('settings.upstreamAionUiDocumentation')}
                </a>
                {t('settings.configGuideSuffix')}
              </p>
            </div>
          ) : (
            <div className='space-y-16px'>
              {(data || []).map((platform: IProvider) => {
                const key = platform.id;
                const isExpanded = collapseKey[platform.id] ?? false;
                const healthSummary = summarizeProviderHealth(platform);
                return (
                  <Collapse
                    activeKey={isExpanded ? ['image-generation'] : []}
                    onChange={(_, activeKeys) => {
                      const expanded = activeKeys.includes('image-generation');
                      setCollapseKey((prev) => ({ ...prev, [platform.id]: expanded }));
                    }}
                    key={key}
                    bordered
                    expandIconPosition='left'
                    className={`[&_.arco-collapse-item]:!border-0 [&_.arco-collapse-item]:!rounded-12px [&_.arco-collapse-item]:!overflow-hidden [&_.arco-collapse-item]:!bg-[var(--color-bg-2)] [&_.arco-collapse-item-header]:!bg-[var(--fill-0)] [&_.arco-collapse-item-header]:!pl-36px [&_.arco-collapse-item-header]:!pr-12px [&_.arco-collapse-item-header]:!py-8px [&_.arco-collapse-item-header]:transition-colors [&_.arco-collapse-item-header]:hover:!bg-[var(--color-bg-2)] [&_.arco-collapse-item-header]:!gap-8px [&_.arco-collapse-item-header-title]:!min-w-0 [&_.arco-collapse-item-header-icon]:!text-2 [&_.arco-collapse-item-header:hover_.arco-collapse-item-header-icon]:!text-1 [&_.arco-collapse-item-content]:!bg-fill-1 [&_.arco-collapse-item-content-box]:!px-10px [&_.arco-collapse-item-content-box]:!py-8px [&_.arco-collapse-item-content]:!border-t [&_.arco-collapse-item-content]:!border-[var(--color-border-2)] ${
                      isExpanded
                        ? '[&_.arco-collapse-item-header]:!rounded-t-12px [&_.arco-collapse-item-header]:!rounded-b-0 [&_.arco-collapse-item-content]:!rounded-b-12px'
                        : '[&_.arco-collapse-item-header]:!rounded-12px'
                    }`}
                  >
                    <Collapse.Item
                      name='image-generation'
                      className='[&_.arco-collapse-item-header-title]:flex-1 group'
                      header={
                        <div className='group flex items-center justify-between w-full min-h-32px gap-8px min-w-0'>
                          {/* Name and counts read together as one phrase, always visible. */}
                          <div className='flex min-w-0 items-center gap-8px'>
                            <span
                              className={`text-14px font-500 truncate min-w-0 transition-colors ${isExpanded ? 'text-t-primary' : 'text-2 group-hover:text-1'}`}
                            >
                              {platform.name}
                            </span>
                            {/* One phrase above md, bare numerals below it — the design's
                                narrow row. Two spans rather than one because only CSS knows
                                the width; exactly one is ever displayed, so this is not the
                                always-on duplicate the previous markup shipped.
                                No font-mono on the phrase: it is translated prose, and CJK
                                drops out of the mono stack glyph by glyph. */}
                            <span
                              data-testid={`provider-counts-${platform.id}`}
                              className='hidden shrink-0 whitespace-nowrap text-11px text-t-tertiary md:inline'
                            >
                              {providerCountsLabel(platform)}
                            </span>
                            <span
                              data-testid={`provider-counts-compact-${platform.id}`}
                              className='shrink-0 whitespace-nowrap font-mono text-11px text-t-tertiary md:hidden'
                            >
                              {providerCountsCompactLabel(platform)}
                            </span>
                          </div>
                          <div
                            className='flex items-center gap-8px shrink-0'
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            {/* Health summary — always a dot plus a word, never colour alone.
                                Dropped below md, matching the design's narrow variant. */}
                            {healthSummary && (
                              <span
                                data-testid={`provider-health-${platform.id}`}
                                className={`hidden md:inline-flex items-center gap-6px whitespace-nowrap text-12px ${
                                  healthSummary.kind === 'failing' ? 'text-danger-6' : 'text-t-secondary'
                                }`}
                              >
                                {healthSummary.kind !== 'unchecked' && (
                                  <span
                                    className={`h-7px w-7px shrink-0 rounded-full ${
                                      healthSummary.kind === 'failing' ? 'bg-danger' : 'bg-success'
                                    }`}
                                  />
                                )}
                                {healthSummary.kind === 'failing'
                                  ? t('settings.providerRow.healthFailing', { count: healthSummary.failing })
                                  : healthSummary.kind === 'checked'
                                    ? t('settings.providerRow.healthChecked', {
                                        checked: healthSummary.checked,
                                        total: healthSummary.total,
                                      })
                                    : t('settings.providerRow.healthNotChecked')}
                              </span>
                            )}
                            {/* 供应商启用开关 / Provider enable switch */}
                            <Switch
                              size='small'
                              checked={getProviderState(platform).checked}
                              onChange={() => toggleProviderEnabled(platform)}
                            />
                            {/* Add and edit stay as icons; the destructive action moves
                                into the overflow menu so it is never the middle button.
                                Below md the two icons drop out and the menu carries them
                                instead — the design's narrow row leaves only the ⋯, which
                                is only honest if the ⋯ can still reach them. */}
                            <div className='flex items-center gap-4px'>
                              <Tooltip content={t('settings.addModel')}>
                                <Button
                                  aria-label={providerActionLabel(t('settings.addModel'), platform)}
                                  size='mini'
                                  className='model-provider-action-btn !hidden !w-28px !h-28px !min-w-28px text-t-secondary hover:text-t-primary md:!inline-flex'
                                  icon={<Plus size='14' />}
                                  onClick={() => addModelModalCtrl.open({ data: platform })}
                                />
                              </Tooltip>
                              <Tooltip content={t('settings.editModel')}>
                                <Button
                                  aria-label={providerActionLabel(t('settings.editModel'), platform)}
                                  size='mini'
                                  className='model-provider-action-btn !hidden !w-28px !h-28px !min-w-28px text-t-secondary hover:text-t-primary md:!inline-flex'
                                  icon={<Write size='14' />}
                                  onClick={() => editModalCtrl.open({ data: platform })}
                                />
                              </Tooltip>
                              <Dropdown
                                droplist={renderProviderMenu(platform)}
                                trigger='click'
                                position='br'
                                getPopupContainer={() => document.body}
                                popupVisible={openProviderMenuId === platform.id}
                                onVisibleChange={(visible) => setOpenProviderMenuId(visible ? platform.id : undefined)}
                                // Arco's Trigger defaults escToClose to false, so without this a
                                // keyboard user who opens the menu cannot close it.
                                triggerProps={{ escToClose: true }}
                              >
                                <Tooltip content={t('common.more')}>
                                  <Button
                                    aria-label={providerActionLabel(t('common.more'), platform)}
                                    aria-haspopup='menu'
                                    aria-expanded={openProviderMenuId === platform.id}
                                    size='mini'
                                    className='model-provider-action-btn !w-28px !h-28px !min-w-28px text-t-secondary hover:text-t-primary'
                                    icon={<MoreOne theme='outline' size='14' fill='currentColor' />}
                                  />
                                </Tooltip>
                              </Dropdown>
                            </div>
                          </div>
                        </div>
                      }
                    >
                      {(platform.models ?? []).map((model: string, index: number, arr: string[]) => {
                        const isNewApiProvider = isNewApiPlatform(platform.platform);
                        const modelProtocol = platform.model_protocols?.[model] || 'openai';
                        const modelSettings = platform.model_settings?.[model];
                        const imageInput = modelSettings?.image_input ?? 'auto';
                        const showOpenAiApiMode = supportsOpenAiApiMode(platform.platform, modelProtocol);
                        const model_health = platform.model_health?.[model];
                        const healthStatus = model_health?.status || 'unknown';
                        // The card's identity band falls back to the pin when nothing
                        // resolves, so a row that only matched `resolved` went silent in
                        // exactly the state where the user has to find the model —
                        // a Fixed pin the backend kept but cannot serve.
                        const isResolvedForAppOperations =
                          appOperations.resolved?.provider_id === platform.id &&
                          appOperations.resolved?.model_id === model;
                        const isPinnedForAppOperations =
                          appOperations.pinned?.provider_id === platform.id && appOperations.pinned?.model_id === model;
                        const servesAppOperations = isResolvedForAppOperations || isPinnedForAppOperations;
                        const appOperationsKept = !isResolvedForAppOperations && appOperations.keptUnavailable === true;
                        const healthLabel =
                          healthStatus === 'unknown'
                            ? t('settings.modelRow.neverChecked')
                            : healthStatus === 'healthy'
                              ? t('common.success')
                              : model_health?.failure_class === 'setup'
                                ? t('settings.providerHealth.setupNeedsAttention')
                                : t('settings.providerHealth.configuredInferenceUnavailable');
                        // `!== undefined`, not truthiness: `result.elapsed_ms || Date.now() - startTime`
                        // can legitimately record a latency of 0, which a falsy guard would hide.
                        const latencyLabel =
                          model_health?.latency !== undefined
                            ? t('settings.modelRow.latency', { latency: model_health.latency })
                            : healthStatus === 'unknown'
                              ? t('settings.modelRow.neverChecked')
                              : undefined;

                        return (
                          <div key={model}>
                            <div className='flex items-center justify-between gap-8px px-8px py-12px transition-colors hover:bg-[var(--fill-0)]'>
                              <div className='flex min-w-0 flex-1 items-center gap-8px'>
                                {/* 健康状态指示器 / Health status indicator.
                                    Rendered for `unknown` too, in grey: the design draws the dot
                                    in all three states, and a dot that disappears reads as "fine".
                                    `role='img'` + `aria-label` because the Arco Tooltip is not a
                                    text alternative — it never wires aria-describedby, and this
                                    element is not focusable, so hue alone would carry the status. */}
                                <Tooltip
                                  content={
                                    <div>
                                      <div className='flex items-center gap-4px'>
                                        <span>
                                          {healthStatus === 'healthy' ? '✅' : healthStatus === 'unknown' ? '•' : '❌'}
                                        </span>
                                        <span>{healthLabel}</span>
                                      </div>
                                      {model_health?.latency !== undefined && (
                                        <div className='text-12px mt-4px'>
                                          {t('settings.latency')}: {model_health.latency}ms
                                        </div>
                                      )}
                                      {model_health?.error && (
                                        <div className='text-12px mt-4px'>{model_health.error}</div>
                                      )}
                                      {model_health?.last_check && (
                                        <div className='text-12px mt-4px'>
                                          {t('mcp.lastCheck')}: {new Date(model_health.last_check).toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                  }
                                >
                                  <div
                                    role='img'
                                    aria-label={healthLabel}
                                    data-testid={`model-health-dot-${platform.id}-${model}`}
                                    className={`h-8px w-8px shrink-0 rounded-full ${
                                      healthStatus === 'healthy'
                                        ? 'bg-success'
                                        : healthStatus === 'unknown'
                                          ? 'bg-6'
                                          : 'bg-danger'
                                    }`}
                                  />
                                </Tooltip>

                                {/* Model id and its assignment tag read as one phrase, so they
                                    share a shrinkable group. `flex-1` deliberately does NOT sit on
                                    the id: it would absorb the free space and throw the tag into
                                    the right-hand cluster, away from the name it qualifies. */}
                                <div className='flex min-w-0 items-center gap-8px'>
                                  <span className='min-w-0 truncate text-14px text-t-primary'>{model}</span>

                                  {/* A plain span, not an Arco Tag: `.arco-tag` sets its own
                                      background at the same specificity as a utility class, so a
                                      utility background on a Tag is order-dependent. Navy, not the
                                      brand orange every toggle in this row already uses — and the
                                      same navy as the card's chip one row above, which is the whole
                                      point of showing the assignment twice. */}
                                  {servesAppOperations && (
                                    <span
                                      data-testid={`model-app-operations-${platform.id}-${model}`}
                                      className={`shrink-0 rounded-5px border border-solid px-7px py-2px font-mono text-10px uppercase tracking-[0.06em] ${
                                        appOperationsKept
                                          ? 'border-arco-2 bg-fill-1 text-t-secondary'
                                          : 'border-aou-3 bg-aou-2 text-aou-7'
                                      }`}
                                    >
                                      {t('settings.appOperationsModel.panelLabel')}
                                    </span>
                                  )}

                                  {/* The card's own word for a pin it kept rather than silently
                                      swapping away from, so "kept" is text and not a hue. */}
                                  {servesAppOperations && appOperationsKept && (
                                    <span
                                      data-testid={`model-app-operations-kept-${platform.id}-${model}`}
                                      className='shrink-0 rounded-4px border border-solid border-danger-3 bg-danger-1 px-6px py-1px font-mono text-[9.5px] uppercase tracking-wide text-danger-6'
                                    >
                                      {t('settings.appOperationsModel.kept')}
                                    </span>
                                  )}
                                </div>

                                {/* Everything from here hugs the right edge. `ml-auto` on the
                                    group, not on the model id, is what splits the row — the design's
                                    own split, and it keeps the id truncating instead of the tag. */}
                                <div className='ml-auto flex shrink-0 items-center gap-8px'>
                                  {/* New API 协议标签（点击循环切换）/ New API protocol badge (click to cycle) */}
                                  {isNewApiProvider && (
                                    <Tag
                                      size='small'
                                      color={getProtocolColor(modelProtocol)}
                                      className='shrink-0 cursor-pointer select-none'
                                      onClick={() => {
                                        const nextProtocol = getNextProtocol(modelProtocol);
                                        const newProtocols = { ...platform.model_protocols };
                                        newProtocols[model] = nextProtocol;
                                        updatePlatform({ ...platform, model_protocols: newProtocols }, () => {});
                                      }}
                                    >
                                      {getProtocolLabel(modelProtocol)}
                                    </Tag>
                                  )}

                                  <Tooltip
                                    content={
                                      imageInput === 'supported'
                                        ? t('settings.imageInputSupported')
                                        : imageInput === 'unsupported'
                                          ? t('settings.imageInputUnsupported')
                                          : t('settings.imageInputAuto')
                                    }
                                  >
                                    <span
                                      className={`inline-flex h-20px w-20px shrink-0 items-center justify-center ${
                                        imageInput === 'supported' ? 'text-success-6' : 'text-t-secondary'
                                      }`}
                                    >
                                      {imageInput !== 'unsupported' ? (
                                        <PreviewOpen theme='outline' size='15' />
                                      ) : (
                                        <PreviewClose theme='outline' size='15' />
                                      )}
                                    </span>
                                  </Tooltip>

                                  {showOpenAiApiMode && (
                                    <Tag size='small' className='hidden shrink-0 md:inline-flex'>
                                      {modelSettings?.openai_api_mode === 'responses'
                                        ? t('settings.openAiApiModeResponses')
                                        : modelSettings?.openai_api_mode === 'chat_completions'
                                          ? t('settings.openAiApiModeChatCompletions')
                                          : t('settings.openAiApiModeAuto')}
                                    </Tag>
                                  )}

                                  {latencyLabel !== undefined && (
                                    <span
                                      data-testid={`model-latency-${platform.id}-${model}`}
                                      className={`shrink-0 whitespace-nowrap text-12px ${
                                        model_health?.latency !== undefined ? 'text-t-secondary' : 'text-t-tertiary'
                                      }`}
                                    >
                                      {latencyLabel}
                                    </span>
                                  )}

                                  {/* 模型启用开关 / Model enable switch */}
                                  <Switch
                                    className='shrink-0'
                                    size='small'
                                    checked={isModelEnabled(platform, model)}
                                    onChange={(checked) => toggleModelEnabled(platform, model, checked)}
                                  />
                                </div>
                              </div>

                              <div className='flex items-center gap-6px shrink-0'>
                                <Tooltip content={t('settings.configureModel')}>
                                  <Button
                                    aria-label={modelActionLabel(t('settings.configureModel'), model)}
                                    size='mini'
                                    className='!w-28px !h-28px !min-w-28px !bg-[var(--color-bg-1)] text-t-secondary hover:text-t-primary hover:!bg-[var(--fill-0)]'
                                    icon={<SettingTwo theme='outline' size='16' />}
                                    onClick={() => addModelModalCtrl.open({ data: platform, model })}
                                  />
                                </Tooltip>

                                {/* 心跳检测按钮 / Health check button */}
                                <Tooltip content={t('settings.healthCheck')}>
                                  <Button
                                    aria-label={modelActionLabel(t('settings.healthCheck'), model)}
                                    size='mini'
                                    className='!w-28px !h-28px !min-w-28px !bg-[var(--color-bg-1)] text-t-secondary hover:text-t-primary hover:!bg-[var(--fill-0)]'
                                    icon={<Heartbeat theme='outline' size='16' />}
                                    loading={healthCheckLoading[`${platform.id}-${model}`]}
                                    onClick={() => performHealthCheck(platform, model)}
                                  />
                                </Tooltip>

                                <Popconfirm
                                  title={
                                    /* Symmetric with the provider delete: the row that now
                                       advertises the assignment must also say when deleting it
                                       is what breaks the assignment. Keyed on the pin, not on
                                       `resolved` — an already-unavailable pin still has to warn. */
                                    isPinnedForAppOperations ? (
                                      <div className='flex max-w-260px flex-col gap-6px'>
                                        <span>{t('settings.deleteModelConfirm')}</span>
                                        <span className='text-danger-6'>
                                          {t('settings.modelRow.deleteAppOperationsWarning')}
                                        </span>
                                      </div>
                                    ) : (
                                      t('settings.deleteModelConfirm')
                                    )
                                  }
                                  onOk={() => {
                                    const newModels = platform.models.filter((item: string) => item !== model);
                                    // 同时清理模型相关状态，避免删除后重加模型时复用脏状态
                                    // Clean all per-model state to avoid stale state on re-add.
                                    const newProtocols = { ...platform.model_protocols };
                                    const newModelEnabled = { ...platform.model_enabled };
                                    const newModelHealth = { ...platform.model_health };
                                    const newModelSettings = { ...platform.model_settings };
                                    delete newProtocols[model];
                                    delete newModelEnabled[model];
                                    delete newModelHealth[model];
                                    delete newModelSettings[model];

                                    updatePlatform(
                                      {
                                        ...platform,
                                        models: newModels,
                                        model_protocols:
                                          Object.keys(newProtocols).length > 0 ? newProtocols : undefined,
                                        model_enabled:
                                          Object.keys(newModelEnabled).length > 0 ? newModelEnabled : undefined,
                                        model_health:
                                          Object.keys(newModelHealth).length > 0 ? newModelHealth : undefined,
                                        model_settings: newModelSettings,
                                      },
                                      () => {}
                                    );
                                  }}
                                >
                                  <Button
                                    aria-label={modelActionLabel(t('settings.modelRow.removeModel'), model)}
                                    size='mini'
                                    className='!w-28px !h-28px !min-w-28px !bg-[var(--color-bg-1)] text-t-secondary hover:text-t-primary hover:!bg-[var(--fill-0)]'
                                    icon={<DeleteFour theme='outline' size='18' strokeWidth={2} />}
                                  />
                                </Popconfirm>
                              </div>
                            </div>
                            {index < arr.length - 1 && <Divider className='!my-0 !border-[var(--color-border-2)]/70' />}
                          </div>
                        );
                      })}
                    </Collapse.Item>
                  </Collapse>
                );
              })}
            </div>
          )}
        </div>
        {CREATIVE_STUDIO_ENABLED && (
          <StudioMediaModelsSection
            providerRefreshToken={providerRefreshToken}
            onAddProvider={() => addPlatformModalCtrl.open()}
          />
        )}
      </AionScrollArea>
    </div>
  );
};

export default ModelModalContent;
