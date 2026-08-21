/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chat/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useKnowledgeCitationsSafe } from '@/renderer/pages/conversation/knowledge/KnowledgeCitationsContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useLocalFilePreview } from '@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview';
import { iconColors } from '@/renderer/styles/colors';
import { Alert, Button, Message, Tooltip } from '@arco-design/web-react';
import { Copy, Brain, Right } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyText } from '@/renderer/utils/ui/clipboard';
import CollapsibleContent from '@renderer/components/chat/CollapsibleContent';
import FilePreview from '@renderer/components/media/FilePreview';
import HorizontalFileList from '@renderer/components/media/HorizontalFileList';
import MarkdownView from '@renderer/components/Markdown';
import { splitThinkContent, hasThinkTags } from '@renderer/utils/chat/thinkTagFilter';
import { stripSkillSuggest, hasSkillSuggest } from '@renderer/utils/chat/skillSuggestParser';
import {
  parseAssistantDirectiveSend,
  parseTemplateReviewAnnouncement,
  parseTemplatedSend,
} from '@/renderer/utils/chat/templatedSendParser';
import { TemplateMessageCard, TemplateReviewCard } from '@/renderer/components/chat/TemplateGallery';

/**
 * Format a timestamp for message display.
 * Today: "HH:mm", older: "MM-DD HH:mm".
 */
export const formatMessageTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  if (
    date.getFullYear() !== now.getFullYear() ||
    date.getMonth() !== now.getMonth() ||
    date.getDate() !== now.getDate()
  ) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${month}-${day} ${time}`;
  }
  return time;
};
import MessageCronBadge from './MessageCronBadge';
import { resolveAgentLogo, useAgentLogos } from '@/renderer/utils/model/agentLogo';
import TeammateMessageAvatar from './TeammateMessageAvatar';
import { useTeammateColor } from '@/renderer/pages/team/identity/TeamIdentityContext';
import { nextRevealLength } from './progressiveText';

const CODE_STYLE = { marginTop: 4, marginBlock: 4 };
const REASONING_COLLAPSED_HEIGHT = 160;
const REASONING_MASK = 'linear-gradient(#000 0%, #000 60%, rgba(0,0,0,0.4) 90%, rgba(0,0,0,0) 100%)';
const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const useProgressiveText = (text: string, isStreaming: boolean) => {
  const [displayedText, setDisplayedText] = useState(() => (isStreaming && !prefersReducedMotion() ? '' : text));
  const displayedTextRef = React.useRef(displayedText);
  const targetTextRef = React.useRef(text);
  const rafRef = React.useRef<number | null>(null);
  const wasStreamingRef = React.useRef(isStreaming);

  useEffect(() => {
    targetTextRef.current = text;
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    const currentText = displayedTextRef.current;

    const canReveal =
      !prefersReducedMotion() &&
      (isStreaming || wasStreaming) &&
      text.startsWith(currentText) &&
      currentText.length < text.length;

    if (!canReveal) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (currentText !== text) {
        displayedTextRef.current = text;
        setDisplayedText(text);
      }
      return;
    }

    // One persistent rAF loop eases the shown text toward the latest target. New
    // chunks only raise the target (above); the loop is never torn down mid-reveal,
    // so text flows continuously instead of restarting a typewriter each chunk.
    if (rafRef.current !== null) return;

    const tick = () => {
      const target = targetTextRef.current;
      const revealedLength = displayedTextRef.current.length;
      const nextLength = nextRevealLength(revealedLength, target.length);
      if (nextLength <= revealedLength) {
        rafRef.current = null;
        return;
      }
      const nextText = target.slice(0, nextLength);
      displayedTextRef.current = nextText;
      setDisplayedText(nextText);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [isStreaming, text]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return { displayedText, isRevealing: displayedText !== text };
};

type ParsedFileMarker = {
  text: string;
  files: string[];
};

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const MARKDOWN_ATTACHMENT_LINE_PATTERN = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~|\|)/;

const parseFileMarker = (content: string, canParseFileMarker: boolean): ParsedFileMarker => {
  if (!canParseFileMarker) {
    return { text: content, files: [] };
  }

  const lines = content.split(/\r?\n/);
  let markerLineIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim() === AIONUI_FILES_MARKER) {
      markerLineIndex = index;
      break;
    }
  }

  if (markerLineIndex === -1) {
    return { text: content, files: [] };
  }

  const files = lines
    .slice(markerLineIndex + 1)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!files.length || files.some((file_path) => !isLocalMessageFilePath(file_path))) {
    return { text: content, files: [] };
  }

  return {
    text: lines.slice(0, markerLineIndex).join('\n').trimEnd(),
    files,
  };
};

const isAbsoluteMessageFilePath = (file_path: string): boolean =>
  file_path.startsWith('/') || file_path.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(file_path);

const isWorkspaceRelativeMessageFilePath = (file_path: string): boolean => {
  const normalizedFilePath = file_path.replace(/\\/g, '/');
  return (
    normalizedFilePath.startsWith('./') ||
    normalizedFilePath.startsWith('../') ||
    normalizedFilePath.includes('/') ||
    /(?:^|\/)[^/]+\.[^./\s][^/]*$/.test(normalizedFilePath)
  );
};

const isLocalMessageFilePath = (file_path: string): boolean => {
  const trimmedFilePath = file_path.trim();
  if (
    !trimmedFilePath ||
    URL_SCHEME_PATTERN.test(trimmedFilePath) ||
    MARKDOWN_ATTACHMENT_LINE_PATTERN.test(trimmedFilePath)
  ) {
    return false;
  }

  return isAbsoluteMessageFilePath(trimmedFilePath) || isWorkspaceRelativeMessageFilePath(trimmedFilePath);
};

export const resolveMessageFilePath = (file_path: string, workspace?: string): string => {
  if (!file_path || isAbsoluteMessageFilePath(file_path) || !workspace) {
    return file_path;
  }

  const normalizedWorkspace = workspace.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const normalizedFilePath = file_path.replace(/^\.?[\\/]+/, '').replace(/\\/g, '/');
  return `${normalizedWorkspace}/${normalizedFilePath}`.replace(/\/+/g, '/');
};

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      const isJson = typeof json === 'object';
      return {
        json: isJson,
        data: isJson ? json : content,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

const MessageText: React.FC<{ message: IMessageText; showCopyRow?: boolean; isStreaming?: boolean }> = ({
  message,
  showCopyRow = true,
  isStreaming = false,
}) => {
  const logos = useAgentLogos();
  // Split the model's reasoning from its visible answer so we can show the
  // reasoning as distinct grey text instead of erasing it once the reply lands.
  // 将模型的思考过程与正式回答分离，用灰色文字展示思考而非在回答出现后抹除
  const { reasoning, contentToRender } = useMemo(() => {
    const raw = message.content.content;
    if (typeof raw !== 'string') {
      return { reasoning: '', contentToRender: raw };
    }
    const { reasoning: split, answer } = hasThinkTags(raw) ? splitThinkContent(raw) : { reasoning: '', answer: raw };
    // Strip any inline [SKILL_SUGGEST] blocks (now handled via separate skill_suggest message type)
    return { reasoning: split, contentToRender: hasSkillSuggest(answer) ? stripSkillSuggest(answer) : answer };
  }, [message.content.content]);

  const { t } = useTranslation();
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const reasoningBodyId = useId();
  const isUserMessage = message.position === 'right';
  const isTeammateMessage = message.position === 'left' && message.content.teammateMessage === true;
  const { text, files } = useMemo(
    () => parseFileMarker(contentToRender, isUserMessage),
    [contentToRender, isUserMessage]
  );
  // Templated presentation sends: fold the machine directive, show the
  // template card + the user's own words. parseTemplatedSend is null unless
  // BOTH detection signals match — unclassified content is never hidden.
  const templatedSend = useMemo(
    () => (isUserMessage ? parseTemplatedSend(text, files) : null),
    [isUserMessage, text, files]
  );
  const assistantDirectiveSend = useMemo(
    () => (isUserMessage && templatedSend === null ? parseAssistantDirectiveSend(text) : null),
    [isUserMessage, templatedSend, text]
  );
  const templateReview = useMemo(
    () => (!isUserMessage ? parseTemplateReviewAnnouncement(text) : null),
    [isUserMessage, text]
  );
  const visibleText = templatedSend
    ? templatedSend.userText
    : assistantDirectiveSend
      ? assistantDirectiveSend.userText
      : templateReview
        ? templateReview.visibleText
        : text;
  const visibleFiles = templatedSend ? templatedSend.userFiles : files;
  const { data, json } = useFormatContent(visibleText);
  const shouldRevealStream = isStreaming && !isUserMessage && !json;
  const { displayedText, isRevealing } = useProgressiveText(visibleText, shouldRevealStream);
  const shouldRenderPlainText = isUserMessage;
  const conversationContext = useConversationContextSafe();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const handleLocalFileLink = useLocalFilePreview(conversationContext?.workspace);
  const resolvedFiles = useMemo(
    () => visibleFiles.map((file_path) => resolveMessageFilePath(file_path, conversationContext?.workspace)),
    [conversationContext?.workspace, visibleFiles]
  );
  const citations = useKnowledgeCitationsSafe();
  // Citation linkify runs on the exact string MarkdownView receives (post
  // progressive-reveal): pure and memoized; partially revealed names simply
  // don't match until the stream completes them.
  const markdownSource = shouldRevealStream || isRevealing ? displayedText : data;
  const linkifiedMarkdown = useMemo(() => {
    if (!citations || isUserMessage || json || typeof markdownSource !== 'string') return markdownSource;
    return citations.linkify(markdownSource);
  }, [citations, isUserMessage, json, markdownSource]);

  // 过滤空内容，避免渲染空DOM
  if (!message.content.content || (typeof message.content.content === 'string' && !message.content.content.trim())) {
    return null;
  }

  const handleCopy = () => {
    const baseText = shouldRenderPlainText ? visibleText : json ? JSON.stringify(data, null, 2) : visibleText;
    const fileList = visibleFiles.length ? `Files:\n${visibleFiles.map((path) => `- ${path}`).join('\n')}\n\n` : '';
    const textToCopy = fileList + baseText;
    copyText(textToCopy)
      .then(() => {
        setShowCopyAlert(true);
        setTimeout(() => setShowCopyAlert(false), 2000);
      })
      .catch(() => {
        Message.error(t('common.copyFailed'));
      });
  };

  // A real focusable Button, so `focus-visible:opacity-100` can actually fire. The div this
  // replaces carried `focus-within:` variants that could never match — it had no focusable
  // descendant and was not focusable itself — plus `pointer-events-none`, which would have
  // blocked activation even once focused. Both are gone.
  const copyLabel = t('common.copy', { defaultValue: 'Copy' });
  const copyButton = (
    <Tooltip content={copyLabel}>
      <Button
        type='text'
        size='mini'
        shape='circle'
        aria-label={copyLabel}
        className='!p-4px !h-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity'
        onClick={handleCopy}
        icon={<Copy theme='outline' size='16' fill={iconColors.secondary} />}
      />
    </Tooltip>
  );

  const cronMeta = message.content.cronMeta;
  const senderName = message.content.senderName;
  const senderAgentType = message.content.senderAgentType;
  const senderConversationId = message.content.senderConversationId;
  const fallbackBackendLogo = senderAgentType ? resolveAgentLogo(logos, { backend: senderAgentType }) : null;
  // 团队 teammate 消息：按发送者会话取身份色，做气泡左色条 + 彩色发送者名；非团队场景为 undefined。
  const teammateColor = useTeammateColor(isTeammateMessage ? senderConversationId : undefined);

  return (
    <>
      <div
        className={classNames(
          'flex flex-col group',
          // User column sizes to content up to 85% (no min-w-0, which would let the
          // flex item collapse to min-content and wrap short text prematurely).
          isUserMessage ? 'items-end max-w-[85%] ml-auto' : 'min-w-0 items-start'
        )}
      >
        {cronMeta && <MessageCronBadge meta={cronMeta} />}
        {isTeammateMessage && senderName && (
          <div className='flex items-center gap-6px mb-4px'>
            <TeammateMessageAvatar
              senderName={senderName}
              senderConversationId={senderConversationId}
              backendLogo={fallbackBackendLogo}
            />
            <span
              className='text-12px'
              style={teammateColor ? { color: teammateColor } : { color: 'var(--text-secondary)' }}
            >
              {senderName}
            </span>
          </div>
        )}
        {visibleFiles.length > 0 && (
          <div className={classNames('mt-6px min-w-0 max-w-full', { 'self-end': isUserMessage })}>
            {resolvedFiles.length === 1 ? (
              <div className='flex items-center'>
                <FilePreview path={resolvedFiles[0]} onRemove={() => undefined} readonly />
              </div>
            ) : (
              <HorizontalFileList>
                {resolvedFiles.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => undefined} readonly />
                ))}
              </HorizontalFileList>
            )}
          </div>
        )}
        {templatedSend && <TemplateMessageCard templateId={templatedSend.templateId} />}
        {templateReview && conversationContext?.conversation_id && (
          <TemplateReviewCard conversationId={conversationContext.conversation_id} filePath={templateReview.filePath} />
        )}
        {/* The model's reasoning, kept and shown in grey above the answer (never erased). */}
        {!isUserMessage && !json && reasoning.trim() && (
          <div className='w-full mb-8px' data-testid='message-reasoning'>
            {/* Collapsed by default and clamped: an unbounded chain-of-thought pushed the actual
                answer arbitrarily far down the scroller. Mirrors MessageThinking, the sibling
                surface for the same content class, rather than using CollapsibleContent —
                measured in the running app, that component leaves this content clipped behind a
                fade with NO expand control, because its ResizeObserver watches an element whose
                box is already pinned to maxHeight. */}
            <Button
              type='text'
              size='mini'
              // `.arco-btn` brings its own display and paddings, which would reflow this row.
              className='!flex items-center gap-4px !h-auto !p-0 mb-4px !text-12px !text-t-tertiary hover:!text-t-secondary'
              aria-expanded={reasoningExpanded}
              aria-controls={reasoningBodyId}
              onClick={() => setReasoningExpanded((value) => !value)}
            >
              <Brain theme='outline' size='13' fill='var(--bg-6)' />
              <span>{t('messages.reasoning')}</span>
              <Right
                theme='outline'
                size='12'
                className='transition-transform'
                style={reasoningExpanded ? { transform: 'rotate(90deg)' } : undefined}
              />
            </Button>
            <div
              id={reasoningBodyId}
              className='pl-12px text-13px text-t-secondary whitespace-pre-wrap [word-break:break-word]'
              style={{
                borderLeft: '2px solid var(--color-border-2)',
                lineHeight: 1.6,
                ...(reasoningExpanded
                  ? undefined
                  : {
                      maxHeight: REASONING_COLLAPSED_HEIGHT,
                      overflow: 'hidden',
                      maskImage: REASONING_MASK,
                      WebkitMaskImage: REASONING_MASK,
                    }),
              }}
            >
              {reasoning}
            </div>
          </div>
        )}
        <div
          className={classNames('min-w-0 [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px', {
            // User messages get a subtle warm bubble; cron/teammate keep their box.
            'bg-message-user p-8px md:px-12px md:py-8px': isUserMessage && !cronMeta,
            'bg-aou-2 p-6px md:p-8px': cronMeta,
            'bg-3 p-6px md:p-8px': isTeammateMessage,
            'w-full': !(isUserMessage || cronMeta || isTeammateMessage),
          })}
          style={{
            ...(cronMeta
              ? { borderRadius: '8px 0 8px 8px', color: 'var(--text-primary)' }
              : isTeammateMessage
                ? {
                    borderRadius: '0 8px 8px 8px',
                    ...(teammateColor ? { borderLeft: `3px solid ${teammateColor}` } : {}),
                  }
                : undefined),
            ...(isUserMessage && !cronMeta
              ? { borderRadius: '12px 2px 12px 12px', color: 'var(--text-primary)' }
              : undefined),
          }}
        >
          {/* JSON 内容使用折叠组件 Use CollapsibleContent for JSON content */}
          {shouldRenderPlainText ? (
            <div className='whitespace-pre-wrap break-words' data-testid='message-text-content'>
              {visibleText}
            </div>
          ) : json ? (
            <CollapsibleContent maxHeight={200} defaultCollapsed={true}>
              <div data-testid='message-text-content'>
                <MarkdownView
                  codeStyle={CODE_STYLE}
                  onLocalFileLink={handleLocalFileLink}
                >{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
              </div>
            </CollapsibleContent>
          ) : (
            <div data-testid='message-text-content'>
              <MarkdownView
                codeStyle={CODE_STYLE}
                onLocalFileLink={handleLocalFileLink}
                onKbCitationClick={citations?.openCitation}
              >
                {linkifiedMarkdown}
              </MarkdownView>
            </div>
          )}
        </div>
        {/* Hover-revealed copy + timestamp row. Mobile has no hover affordance,
            so we drop the row entirely — system-level long-press still copies.
            For AI replies split across several text messages, only the last text
            of the turn shows this row (showCopyRow); user messages always do. */}
        {!isMobile && showCopyRow && (
          <div
            className={classNames('h-32px flex items-center mt-4px gap-8px', {
              'flex-row-reverse': isUserMessage,
            })}
          >
            {copyButton}
            {message.created_at && (
              <span className='text-12px text-t-secondary opacity-0 group-hover:opacity-100 transition-opacity select-none'>
                {formatMessageTime(message.created_at)}
              </span>
            )}
          </div>
        )}
      </div>
      {showCopyAlert && (
        <Alert
          type='success'
          content={t('messages.copySuccess')}
          showIcon
          className='fixed top-20px left-50% transform -translate-x-50% z-9999 w-max max-w-[80%]'
          style={{ boxShadow: '0px 2px 12px rgba(0,0,0,0.12)' }}
          closable={false}
        />
      )}
    </>
  );
};

export default MessageText;
