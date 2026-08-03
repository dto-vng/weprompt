/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolCall } from '@/common/chat/chatLib';
import { isDiagnosticTelemetryText, normalizeToolCall } from '@/common/chat/normalizeToolCall';
import type { NormalizedToolStatus } from '@/common/chat/normalizeToolCall';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { Badge, Button } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import { createTwoFilesPatch } from 'diff';
import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BadgeProps } from '@arco-design/web-react';
import './MessageToolGroupSummary.css';

const statusToBadge = (status: NormalizedToolStatus): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'processing';
    default:
      return 'default';
  }
};

const ReplacePreview: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const file_path = message.content.args?.file_path || message.content.input?.file_path || '';
  const old_string = message.content.args?.old_string ?? message.content.input?.old_string ?? '';
  const new_string = message.content.args?.new_string ?? message.content.input?.new_string ?? '';

  const diffText = useMemo(() => {
    return createTwoFilesPatch(file_path, file_path, old_string, new_string, '', '', { context: 3 });
  }, [file_path, old_string, new_string]);

  const fileInfo = useMemo(() => parseDiff(diffText, file_path), [diffText, file_path]);
  const display_name = file_path.split(/[/\\]/).pop() || file_path;
  const { handleFileClick, handleDiffClick } = useDiffPreviewHandlers({ diffText, display_name, file_path });

  return (
    <FileChangesPanel
      title={fileInfo.file_name}
      files={[fileInfo]}
      onFileClick={handleFileClick}
      onDiffClick={handleDiffClick}
      defaultExpanded={true}
    />
  );
};

const MessageToolCall: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const { t } = useTranslation();
  const { name } = message.content;
  const [expanded, setExpanded] = useState(false);
  const detailPanelId = useId();

  if (name === 'replace' || name === 'Edit') {
    return <ReplacePreview message={message} />;
  }

  const normalized = normalizeToolCall(message);
  if (!normalized) {
    if (isDiagnosticTelemetryText(name) || isDiagnosticTelemetryText(message.content.description)) {
      return null;
    }
    return <div className='text-t-primary'>{name}</div>;
  }

  const hasDetail = normalized.input || normalized.output;

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row text-t-secondary gap-12px items-center'>
        <Badge
          status={statusToBadge(normalized.status)}
          className={normalized.status === 'running' ? 'badge-breathing' : ''}
        />
        {hasDetail ? (
          // One toggle instead of the two click-only spans this used to carry, so the row is
          // Tab-reachable and announces its state. `.arco-btn` brings its own display and
          // paddings, hence the `!` overrides.
          <Button
            type='text'
            size='mini'
            className='!flex flex-1 items-center justify-between gap-12px !min-w-0 !w-auto !h-auto !p-0 !text-left !text-t-secondary !whitespace-normal hover:!text-t-primary'
            aria-expanded={expanded}
            aria-controls={detailPanelId}
            onClick={() => setExpanded(!expanded)}
          >
            <span className={'min-w-0' + (expanded ? ' break-all' : ' truncate')}>
              <span className='font-medium text-13px'>{normalized.name}</span>
              {normalized.description && <span className='m-l-4px opacity-80 text-13px'>{normalized.description}</span>}
            </span>
            <span className='inline-flex items-center shrink-0'>
              {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
            </span>
          </Button>
        ) : (
          <span className='flex-1 min-w-0 truncate'>
            <span className='font-medium text-13px'>{normalized.name}</span>
            {normalized.description && <span className='m-l-4px opacity-80 text-13px'>{normalized.description}</span>}
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div id={detailPanelId} className='tool-detail-panel m-l-20px m-t-4px'>
          {normalized.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>{t('tools.labels.arguments')}</div>
              <pre className='tool-detail-content'>{normalized.input}</pre>
            </div>
          )}
          {normalized.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>{t('tools.labels.result')}</div>
              <pre className='tool-detail-content'>{normalized.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageToolCall;
