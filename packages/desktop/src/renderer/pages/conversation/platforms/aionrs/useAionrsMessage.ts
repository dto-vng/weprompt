/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { extractDiagnosticTokenEstimate, isErrorTipMessage, transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { ProviderTokenUsageData, TChatConversation, TokenUsageData } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useMergeLiveMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { logStreamTerminalObserved } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { isConversationProcessing } from '@/renderer/pages/conversation/utils/conversationRuntime';
import { emitter } from '@/renderer/utils/emitter';
import { recordLocalTokenUsage } from '@/renderer/pages/conversation/utils/localTokenUsage';
import { isThinkOnlyContent } from '@/renderer/utils/chat/thinkTagFilter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { processLocalCronResponse } from './localCronCommands';

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

const usageWriteTails = new Map<string, Promise<void>>();

const enqueueUsageWrite = (conversationId: string, extra: TChatConversation['extra'], onSuccess?: () => void): void => {
  const previous = usageWriteTails.get(conversationId) ?? Promise.resolve();
  const write = previous
    .catch(() => {})
    .then(async () => {
      const ok = await ipcBridge.conversation.update.invoke({
        id: conversationId,
        updates: { extra },
        merge_extra: true,
      });
      if (ok) onSuccess?.();
    })
    .catch(() => {});
  usageWriteTails.set(conversationId, write);
  void write.finally(() => {
    if (usageWriteTails.get(conversationId) === write) usageWriteTails.delete(conversationId);
  });
};

const isValidTokenCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const getTipContent = (message: IResponseMessage): unknown => {
  if (message.type !== 'tips') return null;
  if (typeof message.data === 'string') return message.data;
  if (typeof message.data !== 'object' || message.data === null || Array.isArray(message.data)) return null;
  return (message.data as { content?: unknown }).content;
};

export const useAionrsMessage = (
  conversation_id: string,
  options?: {
    onError?: (message: IResponseMessage) => void;
    onConfigChanged?: (capabilities: Record<string, unknown>) => void;
    onTerminal?: (event: { turnId?: string; outcome: 'completed' | 'failed' }) => void;
  }
) => {
  const onError = options?.onError;
  const onConfigChanged = options?.onConfigChanged;
  const onConfigChangedRef = useRef(onConfigChanged);
  const onTerminalRef = useRef(options?.onTerminal);
  const { t } = useTranslation();
  const tRef = useRef(t);
  const mergeLiveMessage = useMergeLiveMessage();
  const [streamRunning, setStreamRunning] = useState(false);
  const [hasActiveTools, setHasActiveTools] = useState(false);
  const [waitingResponse, setWaitingResponse] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const tokenUsageRef = useRef<TokenUsageData | null>(null);
  const processedProviderUsageIdsRef = useRef(new Set<string>());
  // Current active message ID to filter out events from old requests (prevents aborted request events from interfering with new ones)
  const activeMsgIdRef = useRef<string | null>(null);
  const messageBufferRef = useRef(new Map<string, string>());
  const processedCronMsgIdsRef = useRef(new Set<string>());
  // Some models (e.g. MiniMax M2.5) can end a turn right after their <think>
  // block, so the visible reply strips to nothing. Track tool activity since
  // the last finish and which msg_ids were already flagged, so we can surface
  // that failure once instead of silently showing an empty message.
  const turnHadToolActivityRef = useRef(false);
  const emptyReplyNoticeMsgIdsRef = useRef(new Set<string>());

  // Use refs to avoid useEffect re-subscription when these states change
  const hasActiveToolsRef = useRef(hasActiveTools);
  const streamRunningRef = useRef(streamRunning);
  const waitingResponseRef = useRef(waitingResponse);

  // Track whether current turn has content output
  // Only reset waitingResponse when finish arrives after content (not after tool calls)
  const hasContentInTurnRef = useRef(false);

  useEffect(() => {
    onConfigChangedRef.current = onConfigChanged;
  }, [onConfigChanged]);
  useEffect(() => {
    onTerminalRef.current = options?.onTerminal;
  }, [options?.onTerminal]);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  useEffect(() => {
    hasActiveToolsRef.current = hasActiveTools;
  }, [hasActiveTools]);
  useEffect(() => {
    streamRunningRef.current = streamRunning;
  }, [streamRunning]);

  // Throttle thought updates to reduce render frequency
  const thoughtThrottleRef = useRef<{
    lastUpdate: number;
    pending: ThoughtData | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastUpdate: 0, pending: null, timer: null });

  const throttledSetThought = useMemo(() => {
    const THROTTLE_MS = 50; // 50ms throttle interval
    return (data: ThoughtData) => {
      const now = Date.now();
      const ref = thoughtThrottleRef.current;

      if (now - ref.lastUpdate >= THROTTLE_MS) {
        ref.lastUpdate = now;
        ref.pending = null;
        if (ref.timer) {
          clearTimeout(ref.timer);
          ref.timer = null;
        }
        setThought(data);
      } else {
        ref.pending = data;
        if (!ref.timer) {
          ref.timer = setTimeout(
            () => {
              ref.lastUpdate = Date.now();
              ref.timer = null;
              if (ref.pending) {
                setThought(ref.pending);
                ref.pending = null;
              }
            },
            THROTTLE_MS - (now - ref.lastUpdate)
          );
        }
      }
    };
  }, []);

  // Cleanup throttle timer
  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
    };
  }, []);

  // Combined running state: waiting for response OR stream is running OR tools are active
  const running = waitingResponse || streamRunning || hasActiveTools;

  // Set current active message ID
  const setActiveMsgId = useCallback((msgId: string | null) => {
    activeMsgIdRef.current = msgId;
  }, []);

  const persistContextOccupancy = useCallback(
    (newTokenUsage: TokenUsageData) => {
      const nextTokenUsage: TokenUsageData = {
        total_tokens: newTokenUsage.total_tokens,
      };
      tokenUsageRef.current = nextTokenUsage;
      setTokenUsage(nextTokenUsage);
      enqueueUsageWrite(conversation_id, { last_token_usage: nextTokenUsage } as TChatConversation['extra'], () =>
        emitter.emit('aionrs.context-usage.refresh', conversation_id)
      );
    },
    [conversation_id]
  );

  const persistProviderUsage = useCallback(
    (message: IResponseMessage, usage: { input_tokens: number; output_tokens: number }) => {
      const turnIdentity = message.turn_id || message.msg_id;
      if (!turnIdentity) return;
      const usageEventId = `${conversation_id}:${turnIdentity}`;
      if (processedProviderUsageIdsRef.current.has(usageEventId)) return;
      processedProviderUsageIdsRef.current.add(usageEventId);

      const occurredAt =
        typeof message.created_at === 'number' && Number.isSafeInteger(message.created_at) && message.created_at >= 0
          ? message.created_at
          : Date.now();
      const persistedUsage: ProviderTokenUsageData = {
        usage_event_id: usageEventId,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        occurred_at: occurredAt,
      };
      recordLocalTokenUsage({
        id: usageEventId,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        occurredAt,
      });
      enqueueUsageWrite(conversation_id, { last_provider_usage: persistedUsage } as TChatConversation['extra']);
    },
    [conversation_id]
  );

  const processCompletedAssistantMessage = useCallback(
    async (msgId: string) => {
      if (!msgId || processedCronMsgIdsRef.current.has(msgId)) {
        return;
      }

      const rawContent = messageBufferRef.current.get(msgId) ?? '';
      if (!rawContent.trim()) {
        return;
      }

      processedCronMsgIdsRef.current.add(msgId);

      try {
        const result = await processLocalCronResponse(conversation_id, rawContent);
        if (result.displayContent !== undefined && result.displayContent !== rawContent) {
          mergeLiveMessage({
            id: uuid(),
            msg_id: msgId,
            type: 'text',
            position: 'left',
            conversation_id,
            created_at: Date.now(),
            content: {
              content: result.displayContent,
              replace: true,
            },
          });
        }

        for (const response of result.systemResponses) {
          mergeLiveMessage(
            {
              id: uuid(),
              msg_id: `cron-local-${uuid()}`,
              type: 'tips',
              position: 'center',
              conversation_id,
              created_at: Date.now(),
              content: {
                content: response,
                type: response.startsWith('❌') ? 'error' : 'success',
              },
            },
            true
          );
        }
      } catch {
        processedCronMsgIdsRef.current.delete(msgId);
      }
    },
    [mergeLiveMessage, conversation_id]
  );

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      const tokenEstimate = extractDiagnosticTokenEstimate(getTipContent(message));
      if (tokenEstimate !== null) {
        persistContextOccupancy({ total_tokens: tokenEstimate });
      }

      if (isErrorTipMessage(message)) {
        onTerminalRef.current?.({ turnId: message.turn_id, outcome: 'failed' });
        emitter.emit('artifact.scratch.terminal', {
          conversationId: conversation_id,
          turnId: message.turn_id,
          outcome: 'failed',
        });
        setStreamRunning(false);
        streamRunningRef.current = false;
        setWaitingResponse(false);
        waitingResponseRef.current = false;
        setHasActiveTools(false);
        hasActiveToolsRef.current = false;
        setThought({ subject: '', description: '' });
        hasContentInTurnRef.current = false;
        const transformedMessage = transformMessage(message);
        if (transformedMessage) {
          mergeLiveMessage(transformedMessage);
        }
        return;
      }

      // Filter out events not belonging to current active request (prevents aborted events from interfering)
      // Note: only filter out thought and start messages, other messages must be rendered
      if (activeMsgIdRef.current && message.msg_id && message.msg_id !== activeMsgIdRef.current) {
        if (message.type === 'thought') {
          return;
        }
      }

      if ((message.type === 'content' || message.type === 'text') && message.msg_id) {
        const payload = message.data;
        const chunk =
          typeof payload === 'string'
            ? payload
            : typeof payload === 'object' &&
                payload !== null &&
                'content' in payload &&
                typeof (payload as { content?: unknown }).content === 'string'
              ? ((payload as { content: string }).content ?? '')
              : '';

        if (message.replace === true || chunk) {
          const previous = messageBufferRef.current.get(message.msg_id) ?? '';
          messageBufferRef.current.set(message.msg_id, message.replace === true ? chunk : previous + chunk);
        }
      }

      switch (message.type) {
        case 'thought':
          // Auto-recover streamRunning if thought arrives after finish
          if (!streamRunningRef.current) {
            setStreamRunning(true);
            streamRunningRef.current = true;
          }
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'start':
          setStreamRunning(true);
          streamRunningRef.current = true;
          // Don't reset waitingResponse here - let tool completion flow handle it
          break;
        case 'finish':
          {
            onTerminalRef.current?.({ turnId: message.turn_id, outcome: 'completed' });
            emitter.emit('artifact.scratch.terminal', {
              conversationId: conversation_id,
              turnId: message.turn_id,
              outcome: 'completed',
            });
            logStreamTerminalObserved(conversation_id, message.turn_id, 'aionrs', message.type);
            // aionrs stream_end carries usage in data field
            const usageData = message.provider_usage ?? (message.data as TokenUsage | undefined);
            const hasValidInputTokens = isValidTokenCount(usageData?.input_tokens);
            const hasValidOutputTokens = isValidTokenCount(usageData?.output_tokens);
            if (hasValidInputTokens && hasValidOutputTokens) {
              persistProviderUsage(message, {
                input_tokens: usageData.input_tokens,
                output_tokens: usageData.output_tokens,
              });
            }
            setStreamRunning(false);
            streamRunningRef.current = false;
            setWaitingResponse(false);
            waitingResponseRef.current = false;
            setHasActiveTools(false);
            hasActiveToolsRef.current = false;
            setThought({ subject: '', description: '' });
            hasContentInTurnRef.current = false;
            // Surface reasoning-only turns instead of ending on an empty
            // message. Guarded to the active request so a manual stop
            // (resetState nulls activeMsgIdRef) never triggers it.
            if (
              message.msg_id &&
              activeMsgIdRef.current === message.msg_id &&
              !turnHadToolActivityRef.current &&
              !emptyReplyNoticeMsgIdsRef.current.has(message.msg_id) &&
              isThinkOnlyContent(messageBufferRef.current.get(message.msg_id) ?? '')
            ) {
              emptyReplyNoticeMsgIdsRef.current.add(message.msg_id);
              mergeLiveMessage(
                {
                  id: uuid(),
                  msg_id: `empty-reply-${message.msg_id}`,
                  type: 'tips',
                  position: 'center',
                  conversation_id,
                  created_at: Date.now(),
                  content: {
                    content: tRef.current('conversation.emptyModelReply'),
                    type: 'error',
                  },
                },
                true
              );
            }
            turnHadToolActivityRef.current = false;
            if (message.msg_id) {
              void processCompletedAssistantMessage(message.msg_id);
            }
          }
          break;
        case 'tool_group':
          {
            // Mark that current turn has content output
            hasContentInTurnRef.current = true;
            turnHadToolActivityRef.current = true;

            // Auto-recover streamRunning if tool_group arrives after finish
            if (!streamRunningRef.current) {
              setStreamRunning(true);
              streamRunningRef.current = true;
            }

            // Check if any tools are executing or awaiting confirmation
            const tools = message.data as Array<{ status: string; name?: string }>;
            const activeStatuses = new Set(['Executing', 'Confirming', 'Pending']);
            const hasActive = tools.some((tool) => activeStatuses.has(tool.status));
            const wasActive = hasActiveToolsRef.current;

            setHasActiveTools(hasActive);
            hasActiveToolsRef.current = hasActive; // Sync update ref immediately

            // When tools transition from active to inactive, set waitingResponse=true
            // because backend needs to continue sending requests to model
            if (wasActive && !hasActive && tools.length > 0) {
              setWaitingResponse(true);
              waitingResponseRef.current = true;
            }

            // If tools are awaiting confirmation, update thought hint
            const confirmingTool = tools.find((tool) => tool.status === 'Confirming');
            if (confirmingTool) {
              setThought({
                subject: 'Awaiting Confirmation',
                description: confirmingTool.name || 'Tool execution',
              });
            } else if (hasActive) {
              const executingTool = tools.find((tool) => tool.status === 'Executing');
              if (executingTool) {
                setThought({
                  subject: 'Executing',
                  description: executingTool.name || 'Tool',
                });
              }
            } else if (!streamRunningRef.current) {
              // All tools completed and stream stopped, clear thought
              setThought({ subject: '', description: '' });
            }

            // Continue passing message to message list update
            mergeLiveMessage(transformMessage(message));
          }
          break;
        case 'permission':
        case 'acp_permission':
          if (!streamRunningRef.current) {
            setStreamRunning(true);
            streamRunningRef.current = true;
          }
          // Backend aionrs emits wire type 'acp_permission' but the payload is
          // Confirmation-shaped (legacy), which matches MessagePermission, not
          // MessageAcpPermission. Re-tag so transformMessage routes it correctly.
          mergeLiveMessage(transformMessage({ ...message, type: 'permission' }));
          break;
        case 'config_changed':
          onConfigChangedRef.current?.(message.data as Record<string, unknown>);
          break;
        default: {
          if (message.type === 'error') {
            onTerminalRef.current?.({ turnId: message.turn_id, outcome: 'failed' });
            emitter.emit('artifact.scratch.terminal', {
              conversationId: conversation_id,
              turnId: message.turn_id,
              outcome: 'failed',
            });
            logStreamTerminalObserved(conversation_id, message.turn_id, 'aionrs', message.type);
            setStreamRunning(false);
            streamRunningRef.current = false;
            setWaitingResponse(false);
            waitingResponseRef.current = false;
            setThought({ subject: '', description: '' });
            onError?.(message as IResponseMessage);
          } else {
            // Mark that current turn has content output (exclude error type)
            hasContentInTurnRef.current = true;
            // Reset waitingResponse when actual content arrives
            if (message.type === 'content') {
              setWaitingResponse(false);
              waitingResponseRef.current = false;
            }
            // Auto-recover streamRunning if content arrives after finish, except
            // for a final replacement snapshot that reconciles an already-ended turn.
            const isFinalReplacementSnapshot =
              (message.type === 'content' || message.type === 'text') && message.replace === true;
            if (!streamRunningRef.current && !isFinalReplacementSnapshot) {
              setStreamRunning(true);
              streamRunningRef.current = true;
            }
          }
          // Backend handles persistence, Frontend only updates UI
          mergeLiveMessage(transformMessage(message));
          break;
        }
      }
    });
    // Note: hasActiveTools and streamRunning are accessed via refs to avoid re-subscription
  }, [
    conversation_id,
    mergeLiveMessage,
    onError,
    persistContextOccupancy,
    persistProviderUsage,
    processCompletedAssistantMessage,
  ]);

  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    tokenUsageRef.current = null;
    processedProviderUsageIdsRef.current.clear();
    hasContentInTurnRef.current = false;
    turnHadToolActivityRef.current = false;
    setHasHydratedRunningState(false);

    // Check actual conversation status from backend before resetting all running states
    // to avoid flicker when switching to a running conversation
    void getConversationOrNull(conversation_id).then((res) => {
      if (cancelled) {
        return;
      }

      if (!res) {
        setStreamRunning(false);
        streamRunningRef.current = false;
        setHasActiveTools(false);
        hasActiveToolsRef.current = false;
        setWaitingResponse(false);
        waitingResponseRef.current = false;
        setHasHydratedRunningState(true);
        return;
      }
      const isRunning = isConversationProcessing(res);
      setStreamRunning(isRunning);
      streamRunningRef.current = isRunning;
      // Reset tool states - they will be restored by incoming messages if still active
      setHasActiveTools(false);
      hasActiveToolsRef.current = false;
      setWaitingResponse(isRunning);
      waitingResponseRef.current = isRunning;
      // Load persisted token usage stats
      if (res.type === 'aionrs' && res.extra?.last_token_usage) {
        const { last_token_usage } = res.extra;
        if (last_token_usage.total_tokens > 0) {
          setTokenUsage(last_token_usage);
          tokenUsageRef.current = last_token_usage;
        }
      }
      setHasHydratedRunningState(true);
    });

    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  const resetState = useCallback(() => {
    setWaitingResponse(false);
    waitingResponseRef.current = false;
    setStreamRunning(false);
    streamRunningRef.current = false;
    setHasActiveTools(false);
    hasActiveToolsRef.current = false;
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;
    turnHadToolActivityRef.current = false;
    // Clear active message ID to prevent filtering events from new messages after stop
    activeMsgIdRef.current = null;
  }, []);

  return {
    thought,
    setThought,
    running,
    hasHydratedRunningState,
    tokenUsage,
    setActiveMsgId,
    setWaitingResponse,
    resetState,
  };
};
