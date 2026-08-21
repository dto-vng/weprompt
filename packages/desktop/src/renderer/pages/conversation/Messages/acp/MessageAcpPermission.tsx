/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpPermission } from '@/common/chat/chatLib';
import { conversation } from '@/common/adapter/ipcBridge';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Card, Message, Typography } from '@arco-design/web-react';
import { PERMISSION_DENY_BORDER } from '../permissionButtonStyles';
import { Bookmark, CheckOne, Earth, Edit, Lightning, Lock } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface MessageAcpPermissionProps {
  message: IMessageAcpPermission;
}

const ICON_SIZE = '18';

const MessageAcpPermission: React.FC<MessageAcpPermissionProps> = React.memo(({ message }) => {
  const { options = [], tool_call } = message.content || {};
  const { t } = useTranslation();

  // 基于实际数据生成显示信息
  const getToolInfo = () => {
    if (!tool_call) {
      return {
        title: t('messages.permissionRequest'),
        description: t('messages.agentRequestingPermission'),
        icon: (
          <Lock
            theme='outline'
            size={ICON_SIZE}
            fill={iconColors.secondary}
            data-testid='acp-permission-icon-generic'
          />
        ),
      };
    }

    const displayTitle = tool_call.title || tool_call.raw_input?.description || t('messages.permissionRequest');

    // 简单的图标映射
    const kindIcons: Record<string, React.ReactNode> = {
      edit: (
        <Edit theme='outline' size={ICON_SIZE} fill={iconColors.secondary} data-testid='acp-permission-icon-edit' />
      ),
      read: (
        <Bookmark theme='outline' size={ICON_SIZE} fill={iconColors.secondary} data-testid='acp-permission-icon-read' />
      ),
      fetch: (
        <Earth theme='outline' size={ICON_SIZE} fill={iconColors.secondary} data-testid='acp-permission-icon-fetch' />
      ),
      execute: (
        <Lightning
          theme='outline'
          size={ICON_SIZE}
          fill={iconColors.secondary}
          data-testid='acp-permission-icon-execute'
        />
      ),
    };

    return {
      title: displayTitle,
      icon: kindIcons[tool_call.kind || 'execute'] || kindIcons.execute,
    };
  };
  const { title, icon } = getToolInfo();
  // Which option is in flight, rather than a bare boolean: the pressed button gets Arco's
  // spinner while its siblings only grey out, so a slow confirm shows WHICH answer is pending.
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [hasResponded, setHasResponded] = useState(false);

  const handleConfirm = async (selected: string) => {
    if (hasResponded || pendingOptionId !== null) return;

    setPendingOptionId(selected);
    try {
      const invokeData = {
        confirm_key: selected,
        msg_id: message.id,
        conversation_id: message.conversation_id,
        call_id: tool_call?.tool_call_id || message.id,
      };

      await conversation.confirmMessage.invoke(invokeData);
      setHasResponded(true);
    } catch (error) {
      // Without a toast the card silently snapped back to un-answered while the agent stayed
      // blocked forever, so surface it and leave the options clickable for a retry.
      Message.error(t('messages.permissionResponseFailed'));
      console.error('Error confirming permission:', error);
    } finally {
      setPendingOptionId(null);
    }
  };

  if (!tool_call) {
    return null;
  }

  return (
    <Card
      className='mb-4'
      bordered={false}
      style={{ background: 'var(--bg-1)' }}
      data-testid='message-acp-permission-card'
    >
      <div className='space-y-4'>
        {/* Header with icon and title */}
        <div className='flex items-center space-x-2'>
          <span className='flex-shrink-0 flex items-center'>{icon}</span>
          <Text className='block'>{title}</Text>
        </div>
        {!hasResponded && (
          <>
            <div className='mt-10px'>{t('messages.chooseAction')}</div>
            {options && options.length > 0 ? (
              <div className='flex flex-wrap gap-8px'>
                {options.map((option, index) => {
                  const optionName = option?.name || `${t('messages.option')} ${index + 1}`;
                  const option_id = option?.option_id || `option_${index}`;
                  const isDeny = /deny|reject|cancel|no/i.test(option_id);
                  return (
                    <Button
                      key={option_id}
                      type={isDeny ? 'secondary' : 'primary'}
                      className={isDeny ? PERMISSION_DENY_BORDER : undefined}
                      size='small'
                      disabled={pendingOptionId !== null && pendingOptionId !== option_id}
                      loading={pendingOptionId === option_id}
                      onClick={() => void handleConfirm(option_id)}
                      data-testid={`message-acp-permission-option-${option_id}`}
                    >
                      {optionName}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <Text type='secondary'>{t('messages.noOptionsAvailable')}</Text>
            )}
          </>
        )}

        {hasResponded && (
          <div
            className='mt-10px p-2 rounded-md border'
            style={{ backgroundColor: 'var(--color-success-light-1)', borderColor: 'rgb(var(--success-3))' }}
          >
            <Text className='text-sm inline-flex items-center gap-6px' style={{ color: 'rgb(var(--success-6))' }}>
              <CheckOne
                theme='filled'
                size='14'
                fill={iconColors.success}
                data-testid='acp-permission-icon-responded'
              />
              {t('messages.responseSentSuccessfully')}
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
});

export default MessageAcpPermission;
