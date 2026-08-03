/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Link, Space, Typography } from '@arco-design/web-react';
import { IconExclamationCircle } from '@arco-design/web-react/icon';
import React from 'react';
import { useTranslation } from 'react-i18next';

const { Paragraph, Text } = Typography;

type ChannelConflictWarningProps = {
  platform: 'lark' | 'telegram';
  openclawConfigPath: string;
  onDisableOpenClaw?: () => void;
  onIgnore?: () => void;
};

const getPlatformName = (platform: ChannelConflictWarningProps['platform']): string =>
  platform === 'lark' ? 'Lark/Feishu' : 'Telegram';

/** Warning component when OpenClaw channel conflicts with the current app channels. */
export const ChannelConflictWarning: React.FC<ChannelConflictWarningProps> = ({
  platform,
  openclawConfigPath,
  onDisableOpenClaw,
  onIgnore,
}) => {
  const { t } = useTranslation();
  const platformName = getPlatformName(platform);
  const channelKey = platform === 'lark' ? 'feishu' : 'telegram';

  return (
    <Alert
      type='warning'
      icon={<IconExclamationCircle />}
      title={t('settings.channelConflict.title', { platform: platformName })}
      content={
        <Space direction='vertical' size='medium' style={{ width: '100%' }}>
          <Paragraph>
            <Text>{t('settings.channelConflict.summary', { platform: platformName })}</Text>
          </Paragraph>

          <Paragraph>
            <Text bold>{t('settings.channelConflict.howToUse')}</Text>
          </Paragraph>

          <Paragraph>
            <Text type='secondary'>{t('settings.channelConflict.optionDisable', { platform: platformName })}</Text>
            <br />
            <Text code>{openclawConfigPath}</Text>
            <br />
            <Text code>{`channels.${channelKey}.enabled = false`}</Text>
            <br />
            {t('settings.channelConflict.restart')}
          </Paragraph>

          <Paragraph>
            <Text type='secondary'>{t('settings.channelConflict.optionDifferentBot')}</Text>
            <br />
          </Paragraph>

          <Paragraph>
            <Text type='secondary'>{t('settings.channelConflict.optionKeepOpenClaw')}</Text>
            <br />
          </Paragraph>

          <Space>
            {onDisableOpenClaw ? (
              <Button type='primary' onClick={onDisableOpenClaw}>
                {t('settings.channelConflict.helpDisable', { platform: platformName })}
              </Button>
            ) : null}
            {onIgnore ? (
              <Button type='text' onClick={onIgnore}>
                {t('settings.channelConflict.ignore')}
              </Button>
            ) : null}
          </Space>
        </Space>
      }
      closable={false}
      style={{ marginBottom: 16 }}
    />
  );
};

/** Compact warning banner for the settings page. */
export const ChannelConflictBanner: React.FC<{ platform: 'lark' | 'telegram'; onLearnMore: () => void }> = ({
  platform,
  onLearnMore,
}) => {
  const { t } = useTranslation();
  const platformName = getPlatformName(platform);

  return (
    <Alert
      type='warning'
      content={
        <Space>
          <Text>{t('settings.channelConflict.banner', { platform: platformName })}</Text>
          <Link onClick={onLearnMore}>{t('settings.channelConflict.learnMore')}</Link>
        </Space>
      }
      closable
      style={{ marginBottom: 12 }}
    />
  );
};
