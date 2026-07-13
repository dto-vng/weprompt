import type { BadgeProps } from '@arco-design/web-react';
import { Badge } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import { Attention, CheckOne, LoadingOne, Right } from '@icon-park/react';
import { theme } from '@office-ai/platform';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { getAcpImageFileName } from '@/common/chat/acpToolCallOutput';
import { coalesceToolCalls } from '@/common/chat/toolActivity/coalesceToolCalls';
import type { CoalescedStep } from '@/common/chat/toolActivity/types';
import type { NormalizedToolCall, NormalizedToolStatus, ToolMessage } from '@/common/chat/normalizeToolCall';
import { normalizeToolMessages } from '@/common/chat/normalizeToolCall';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { iconColors } from '@/renderer/styles/colors';
import ToolActivityError from './toolActivity/ToolActivityError';
import { useToolActionText } from './toolActivity/useToolActionText';
import './MessageToolGroupSummary.css';

const statusToBadge = (status: NormalizedToolStatus): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'processing';
    case 'canceled':
      return 'default';
    case 'pending':
    default:
      return 'default';
  }
};

const ToolItemDetail: React.FC<{ item: NormalizedToolCall }> = ({ item }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [fullItem, setFullItem] = useState<NormalizedToolCall | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const displayItem = fullItem ?? item;
  // Image output is surfaced prominently at the turn level (see below), so it no
  // longer gates the detail toggle here.
  const hasDetail = displayItem.input || displayItem.output || item.truncated;

  const loadFullItem = async () => {
    if (!item.truncated || fullItem || loadingFull || !item.conversationId || !item.messageId) return;
    setLoadingFull(true);
    setLoadError(false);
    try {
      const message = await ipcBridge.database.getConversationMessage.invoke({
        conversation_id: item.conversationId,
        message_id: item.messageId,
      });
      const next = normalizeToolMessages([message as ToolMessage]).find((candidate) => candidate.key === item.key);
      if (next) setFullItem(next);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingFull(false);
    }
  };

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) void loadFullItem();
  };

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <Badge status={statusToBadge(item.status)} className={item.status === 'running' ? 'badge-breathing' : ''} />
        <span
          className={
            'flex-1 min-w-0' +
            (expanded ? ' break-all' : ' truncate') +
            (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')
          }
          onClick={hasDetail ? toggleExpanded : undefined}
        >
          <span className='font-medium text-13px'>{displayItem.name}</span>
          {displayItem.description && displayItem.description !== displayItem.name && (
            <span className='m-l-4px opacity-80 text-13px'>{displayItem.description}</span>
          )}
        </span>
        {hasDetail && (
          <span className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors' onClick={toggleExpanded}>
            {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div className='tool-detail-panel m-l-20px m-t-4px'>
          {loadingFull && <div className='tool-detail-label'>Loading...</div>}
          {loadError && <div className='tool-detail-label'>Failed to load full output</div>}
          {displayItem.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Input</div>
              <pre className='tool-detail-content'>{displayItem.input}</pre>
            </div>
          )}
          {displayItem.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Output</div>
              <pre className='tool-detail-content'>{displayItem.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Prominent inline preview for images produced by a tool (e.g. image generation),
// shown in the turn rather than hidden behind the Technical details toggle.
// LocalImageView provides click-to-enlarge and full-resolution download.
const ToolImagePreview: React.FC<{ path: string }> = ({ path }) => (
  <div className='m-t-8px overflow-hidden rounded border bg-1 p-2 w-fit max-w-full'>
    <LocalImageView
      src={path}
      alt={getAcpImageFileName(path)}
      className='max-w-full max-h-500px w-auto object-contain rounded'
    />
  </div>
);

const StepRow: React.FC<{ label: string; status: NormalizedToolStatus }> = ({ label, status }) => {
  const icon =
    status === 'canceled' ? (
      <Attention theme='filled' size='14' strokeLinejoin='bevel' fill={theme.Color.FunctionalColor.warn} />
    ) : (
      <CheckOne theme='filled' size='14' fill={theme.Color.FunctionalColor.success} />
    );
  return (
    <div className='flex flex-row items-center gap-8px color-#86909C'>
      <span className='flex-shrink-0 flex items-center'>{icon}</span>
      <span className='text-13px'>{label}</span>
    </div>
  );
};

const MessageToolGroupSummary: React.FC<{ messages: ToolMessage[] }> = ({ messages }) => {
  const { t } = useTranslation();
  const action = useToolActionText();
  const tools = useMemo(() => normalizeToolMessages(messages), [messages]);
  const steps = useMemo(() => coalesceToolCalls(tools), [tools]);
  const hasRunning = useMemo(() => steps.some((s) => s.status === 'running' || s.status === 'pending'), [steps]);
  const [showDetails, setShowDetails] = useState(false);

  if (steps.length === 0) return null;

  // While working: one evolving live line (the current running step).
  if (hasRunning) {
    const current =
      [...steps].toReversed().find((s) => s.status === 'running' || s.status === 'pending') ?? steps[steps.length - 1];
    return (
      <div className='tool-group-summary'>
        <div className='flex flex-row items-center gap-8px color-#86909C'>
          <LoadingOne theme='outline' size='14' fill={iconColors.primary} className='loading' />
          <span className='text-13px'>{action.label(current)}</span>
        </div>
      </div>
    );
  }

  // Settled: a compact step list + any generated images + one block-level toggle.
  const imageTools = tools.filter((item) => item.imagePath);
  return (
    <div className='tool-group-summary flex flex-col gap-6px'>
      {steps.map((step) =>
        step.status === 'error' ? (
          <ToolActivityError key={step.key} step={step} />
        ) : (
          <StepRow key={step.key} label={action.label(step)} status={step.status} />
        )
      )}
      {imageTools.map((item) => (
        <ToolImagePreview key={`image-${item.key}`} path={item.imagePath as string} />
      ))}
      <div className='tool-group-summary__header' onClick={() => setShowDetails(!showDetails)}>
        <span className='tool-group-summary__label'>{t('common.technical_details')}</span>
        <span className={`tool-group-summary__arrow${showDetails ? ' tool-group-summary__arrow--open' : ''}`}>
          <Right theme='outline' size='12' />
        </span>
      </div>
      {showDetails && (
        <div className='tool-group-summary__body'>
          {tools.map((item) => (
            <ToolItemDetail key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(MessageToolGroupSummary);
