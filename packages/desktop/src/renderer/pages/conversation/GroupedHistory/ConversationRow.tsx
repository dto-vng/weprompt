/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAgentLogos } from '@/renderer/utils/model/agentLogo';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { CronJobIndicator } from '@/renderer/pages/cron';
import { resolveConversationLeadingMark } from '@/renderer/pages/conversation/utils/conversationAssistantIdentity';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { iconColors } from '@/renderer/styles/colors';
import { Checkbox, Dropdown, Menu, Spin, Tooltip } from '@arco-design/web-react';
import {
  Attention,
  CheckOne,
  CloseOne,
  DeleteOne,
  EditOne,
  Export,
  MessageOne,
  MoreOne,
  Pushpin,
  Robot,
  Square,
  Timer,
} from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

import styles from './ConversationRow.module.css';
import type { ConversationRowProps } from './types';
import {
  COMPLETION_MARK_DURATION_MS,
  STOPPED_MARK_DURATION_MS,
  resolveConversationStatusMark,
  resolveConversationStatusTooltipKey,
} from './utils/conversationStatus';
import { isConversationPinned } from './utils/groupingHelpers';

const ConversationRow: React.FC<ConversationRowProps> = (props) => {
  const {
    conversation,
    isGenerating,
    completion,
    recentFailureAt,
    recentStoppedAt,
    collapsed,
    tooltipEnabled,
    batchMode,
    checked,
    selected,
    menuVisible,
    dimIcon = false,
    dragHandle,
  } = props;
  const logos = useAgentLogos();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const {
    onToggleChecked,
    onConversationClick,
    onOpenMenu,
    onMenuVisibleChange,
    onEditStart,
    onCreateCronTask,
    onDelete,
    onExport,
    onTogglePin,
    getJobStatus,
  } = props;
  const { t } = useTranslation();
  const { info: assistantInfo } = usePresetAssistantInfo(conversation);
  const isPinned = isConversationPinned(conversation);
  const cronStatus = getJobStatus(conversation.id);
  const rowTooltipProps = getSiderTooltipProps(tooltipEnabled);
  const inlineNameTooltipEnabled = !collapsed && !isMobile && !!conversation.name;
  const pinnedHoverFade = isPinned ? 'group-hover:opacity-0 transition-opacity' : '';
  const conversationName = conversation.name || t('conversation.welcome.newConversation');
  const completionTransitionAt =
    completion?.seenAt !== undefined ? completion.completedAt + COMPLETION_MARK_DURATION_MS : 0;
  const stoppedExpiresAt = recentStoppedAt !== undefined ? recentStoppedAt + STOPPED_MARK_DURATION_MS : 0;
  const nextTransitionAt = [completionTransitionAt, stoppedExpiresAt]
    .filter((value) => value > Date.now())
    .toSorted((left, right) => left - right)[0];
  const [, setStatusTick] = React.useState(0);

  React.useEffect(() => {
    if (nextTransitionAt === undefined) {
      return;
    }
    const remainingMs = nextTransitionAt - Date.now();
    if (remainingMs <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatusTick((tick) => tick + 1);
    }, remainingMs);
    return () => window.clearTimeout(timeoutId);
  }, [nextTransitionAt]);

  const statusMark = resolveConversationStatusMark({
    runtime: conversation.runtime,
    isGenerating,
    recentFailureAt,
    recentStoppedAt,
    completion,
    now: Date.now(),
  });
  const cronOverridesStatus = cronStatus !== 'none' && (statusMark === 'done_idle' || statusMark === 'idle');
  const displayedStatusMark = batchMode || cronOverridesStatus ? 'idle' : statusMark;
  const statusTooltipKey = resolveConversationStatusTooltipKey(displayedStatusMark, completion);
  const statusDescription = statusTooltipKey ? t(statusTooltipKey) : null;
  const statusIconTooltipProps = getSiderTooltipProps(!tooltipEnabled && statusDescription !== null);
  const rowTooltipContent = statusDescription ? (
    <div className='flex flex-col gap-2px'>
      <span className='font-500'>{conversationName}</span>
      <span className='text-12px opacity-80'>{statusDescription}</span>
    </div>
  ) : (
    conversationName
  );

  const renderLeadingIcon = (preferAssistantIdentity = false) => {
    if (!preferAssistantIdentity && cronStatus !== 'none') {
      return <CronJobIndicator status={cronStatus} size={16} className='flex-shrink-0' />;
    }

    // When the row is pinned, hovering reveals an overlay on the leading icon —
    // the drag handle when the row is sortable, otherwise a pushpin marker.
    // We dim the resting icon on hover so the overlay reads cleanly.
    const composedClass = classNames(!batchMode && pinnedHoverFade);

    const leadingMark = resolveConversationLeadingMark(conversation, assistantInfo, logos);
    if (leadingMark.kind === 'emoji') {
      return (
        <span className={classNames('text-16px leading-none flex-shrink-0', composedClass)}>{leadingMark.value}</span>
      );
    }
    if (leadingMark.kind === 'image') {
      return (
        <img
          src={leadingMark.value}
          alt={leadingMark.label}
          className={classNames('w-16px h-16px rounded-50% flex-shrink-0', composedClass)}
        />
      );
    }
    if (leadingMark.kind === 'assistant_fallback') {
      return (
        <Robot
          theme='outline'
          size='16'
          className={classNames('line-height-0 flex-shrink-0 text-t-secondary', composedClass)}
        />
      );
    }

    return (
      <MessageOne
        theme='outline'
        size='16'
        className={classNames('line-height-0 flex-shrink-0 text-t-secondary', composedClass)}
      />
    );
  };

  const renderConversationStatus = () => {
    if (batchMode) {
      return renderLeadingIcon(true);
    }

    if (cronOverridesStatus) {
      return renderLeadingIcon();
    }

    if (displayedStatusMark === 'idle') {
      return null;
    }

    const commonProps = {
      'aria-label': `${conversationName} ${statusDescription ?? ''}`.trim(),
      'data-testid': `conversation-status-${displayedStatusMark}-${conversation.id}`,
      className: classNames(
        'conversation-status-mark flex-center',
        displayedStatusMark === 'done_idle' && pinnedHoverFade
      ),
      role: 'img',
    };

    if (displayedStatusMark === 'needs_you') {
      return (
        <span {...commonProps}>
          <Attention
            theme='filled'
            size='16'
            fill={iconColors.warning}
            className={classNames('line-height-0 flex-shrink-0', styles.statusPulse)}
          />
        </span>
      );
    }

    if (displayedStatusMark === 'failed') {
      return (
        <span {...commonProps}>
          <CloseOne theme='filled' size='16' fill={iconColors.danger} className='line-height-0 flex-shrink-0' />
        </span>
      );
    }

    if (displayedStatusMark === 'running') {
      return (
        <span {...commonProps}>
          <Spin size={16} />
        </span>
      );
    }

    if (displayedStatusMark === 'stopped') {
      return (
        <span {...commonProps}>
          <Square theme='outline' size='16' fill={iconColors.secondary} className='line-height-0 flex-shrink-0' />
        </span>
      );
    }

    if (displayedStatusMark === 'done_idle') {
      return (
        <span {...commonProps}>
          <CheckOne theme='outline' size='16' fill={iconColors.secondary} className='line-height-0 flex-shrink-0' />
        </span>
      );
    }

    return (
      <span {...commonProps}>
        <CheckOne theme='filled' size='16' fill={iconColors.success} className='line-height-0 flex-shrink-0' />
      </span>
    );
  };

  const renderConversationStatusWithTooltip = () => {
    const statusNode = renderConversationStatus();
    if (!statusDescription || tooltipEnabled) {
      return statusNode;
    }
    return (
      <Tooltip {...statusIconTooltipProps} content={statusDescription} position='top'>
        {statusNode}
      </Tooltip>
    );
  };

  const handleRowClick = () => {
    cleanupSiderTooltips();
    if (batchMode) {
      onToggleChecked(conversation);
      return;
    }
    onConversationClick(conversation);
  };

  const handleRowContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    cleanupSiderTooltips();
    if (batchMode) {
      return;
    }
    onOpenMenu(conversation);
  };

  return (
    <Tooltip key={conversation.id} {...rowTooltipProps} content={rowTooltipContent} position='right'>
      <div
        id={'c-' + conversation.id}
        className={classNames(
          'chat-history__item h-34px rd-8px flex items-center group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px min-w-0 transition-colors',
          collapsed ? 'justify-center px-0' : 'justify-start gap-8px pr-16px',
          // dimIcon means this row sits inside a project/cron parent — visually indent the row content while keeping the bg full-width
          !collapsed && (dimIcon ? 'pl-34px' : 'pl-10px'),
          {
            'hover:bg-fill-3': !batchMode && !selected,
            '!bg-fill-3': selected,
            'bg-[rgba(var(--primary-6),0.08)]': batchMode && checked,
          }
        )}
        onClick={handleRowClick}
        onContextMenu={handleRowContextMenu}
      >
        {batchMode && (
          <span
            className='mr-8px flex-center'
            onClick={(event) => {
              event.stopPropagation();
              onToggleChecked(conversation);
            }}
          >
            <Checkbox checked={checked} />
          </span>
        )}
        <span className='size-22px flex items-center justify-center shrink-0 relative'>
          {renderConversationStatusWithTooltip()}
          {/* Hover overlay on the leading icon: drag handle for sortable pinned rows, pushpin marker
              otherwise. Only shown while the leading icon is at rest — an active status mark owns the slot. */}
          {!batchMode &&
            isPinned &&
            !isMobile &&
            (displayedStatusMark === 'idle' || displayedStatusMark === 'done_idle') &&
            cronStatus === 'none' &&
            (dragHandle ?? (
              <span
                className='absolute inset-0 flex-center text-t-secondary pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity'
                style={{ lineHeight: 0 }}
              >
                <Pushpin theme='outline' size='14' />
              </span>
            ))}
        </span>
        <FlexFullContainer className='h-24px min-w-0 flex-1 collapsed-hidden'>
          <Tooltip
            content={conversation.name}
            disabled={!inlineNameTooltipEnabled}
            trigger='hover'
            popupVisible={inlineNameTooltipEnabled ? undefined : false}
            unmountOnExit
            popupHoverStay={false}
            position='top'
          >
            <div className='chat-history__item-name overflow-hidden text-ellipsis block w-full text-14px font-[500] lh-24px whitespace-nowrap min-w-0 text-t-primary'>
              <span className='block overflow-hidden text-ellipsis whitespace-nowrap'>{conversation.name}</span>
            </div>
          </Tooltip>
        </FlexFullContainer>

        {!batchMode && (
          <div
            className={classNames(
              'absolute right-8px top-1/2 -translate-y-1/2 items-center justify-end !collapsed-hidden',
              {
                flex: isMobile || menuVisible,
                'hidden group-hover:flex': !isMobile && !menuVisible,
              }
            )}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <Dropdown
              droplist={
                <Menu
                  onClickMenuItem={(key) => {
                    if (key === 'pin') {
                      onTogglePin(conversation);
                      return;
                    }
                    if (key === 'rename') {
                      onEditStart(conversation);
                      return;
                    }
                    if (key === 'createCronTask') {
                      onCreateCronTask(conversation);
                      return;
                    }
                    if (key === 'export') {
                      onExport?.(conversation);
                      return;
                    }
                    if (key === 'delete') {
                      onDelete(conversation.id);
                    }
                  }}
                >
                  <Menu.Item key='pin'>
                    <div className='flex items-center gap-8px'>
                      <Pushpin theme='outline' size='14' />
                      <span>{isPinned ? t('conversation.history.unpin') : t('conversation.history.pin')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='rename'>
                    <div className='flex items-center gap-8px'>
                      <EditOne theme='outline' size='14' />
                      <span>{t('conversation.history.rename')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='createCronTask'>
                    <div className='flex items-center gap-8px'>
                      <Timer theme='outline' size='14' />
                      <span>{t('conversation.history.createCronTask')}</span>
                    </div>
                  </Menu.Item>
                  {onExport && (
                    <Menu.Item key='export'>
                      <div className='flex items-center gap-8px'>
                        <Export theme='outline' size='14' />
                        <span>{t('conversation.history.export')}</span>
                      </div>
                    </Menu.Item>
                  )}
                  <Menu.Item key='delete'>
                    <div className='flex items-center gap-8px text-danger-6'>
                      <DeleteOne theme='outline' size='14' />
                      <span>{t('conversation.history.deleteTitle')}</span>
                    </div>
                  </Menu.Item>
                </Menu>
              }
              trigger='click'
              position='br'
              popupVisible={menuVisible}
              onVisibleChange={(visible) => onMenuVisibleChange(conversation.id, visible)}
              getPopupContainer={() => document.body}
              unmountOnExit={false}
            >
              <span
                data-testid={`conversation-row-menu-${conversation.id}`}
                className={classNames(
                  'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                  {
                    flex: isMobile || menuVisible,
                    'hidden group-hover:flex': !isMobile && !menuVisible,
                  }
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMenu(conversation);
                }}
              >
                <MoreOne theme='outline' size='14' fill='currentColor' className='block leading-none' />
              </span>
            </Dropdown>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

export default ConversationRow;
