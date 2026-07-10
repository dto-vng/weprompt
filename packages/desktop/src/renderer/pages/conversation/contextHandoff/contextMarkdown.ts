import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation, TContextHandoffItem } from '@/common/config/storage';
import { readMessageContent } from '@/renderer/utils/chat/conversationExport';
import { CONTEXT_MARKDOWN_SECTIONS, type ContextMarkdownSection } from './types';

export type BuildContextMarkdownInput = {
  conversation: TChatConversation;
  messages: TMessage[];
  maxRecentMessages?: number;
};

const EXCERPT_LIMIT = 900;
const FILE_PATH_RE =
  /(?:^|\s)([~./\w-][^\s"'`<>]*\.(?:md|txt|json|csv|xlsx?|docx?|pptx?|pdf|png|jpe?g|gif|svg|html|css|tsx?|jsx?))/gi;
const INVALID_CONTEXT_FILE_CHARS_RE = /[<>:"/\\|?*]+/g;

const toOneLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

const excerpt = (value: string, limit = EXCERPT_LIMIT): string => {
  const compact = toOneLine(value);
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 1).trimEnd()}…`;
};

const bullet = (value: string): string => `- ${value}`;

const getExtraRecord = (conversation: TChatConversation): Record<string, unknown> => {
  return conversation.extra && typeof conversation.extra === 'object'
    ? (conversation.extra as Record<string, unknown>)
    : {};
};

const getStringList = (extra: Record<string, unknown>, key: string): string[] => {
  const value = extra[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
};

const getPinnedContext = (conversation: TChatConversation): TContextHandoffItem[] => {
  const extra = getExtraRecord(conversation);
  const contextHandoff = extra.context_handoff;
  if (!contextHandoff || typeof contextHandoff !== 'object') return [];
  const pinned = (contextHandoff as { pinned_context?: unknown }).pinned_context;
  return Array.isArray(pinned)
    ? pinned.filter((item): item is TContextHandoffItem => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as Partial<TContextHandoffItem>;
        return typeof candidate.id === 'string' && typeof candidate.content === 'string';
      })
    : [];
};

const messageRole = (message: TMessage): 'User' | 'Assistant' | 'System' => {
  if (message.position === 'right') return 'User';
  if (message.position === 'left') return 'Assistant';
  return 'System';
};

const firstUserMessage = (messages: TMessage[]): TMessage | undefined => {
  return messages.find((message) => message.position === 'right' && message.type === 'text');
};

const latestAssistantMessage = (messages: TMessage[]): TMessage | undefined => {
  return [...messages].toReversed().find((message) => message.position === 'left' && message.type === 'text');
};

const recentMessages = (messages: TMessage[], maxRecentMessages: number): string[] => {
  return messages
    .slice(-maxRecentMessages)
    .map((message) => `${messageRole(message)}: ${excerpt(readMessageContent(message))}`)
    .filter((line) => line.trim() !== '');
};

const extractFileReferences = (conversation: TChatConversation, messages: TMessage[]): string[] => {
  const extra = getExtraRecord(conversation);
  const workspace = typeof extra.workspace === 'string' ? extra.workspace.trim() : '';
  const refs = new Set<string>();
  if (workspace) refs.add(`Workspace: ${workspace}`);

  messages.forEach((message) => {
    const content = readMessageContent(message);
    for (const match of content.matchAll(FILE_PATH_RE)) {
      const filePath = match[1]?.trim();
      if (filePath) refs.add(filePath);
    }
  });

  return Array.from(refs);
};

const assistantSetup = (conversation: TChatConversation): string[] => {
  const extra = getExtraRecord(conversation);
  const skills = getStringList(extra, 'skills');
  const mcpServers = getStringList(extra, 'mcp_servers');
  const model = 'model' in conversation ? conversation.model?.use_model || conversation.model?.name || '' : '';
  const rows = [`Conversation type: ${conversation.type}`];
  if (model) rows.push(`Model: ${model}`);
  if (skills.length > 0) rows.push(`Skills: ${skills.join(', ')}`);
  if (mcpServers.length > 0) rows.push(`MCP servers: ${mcpServers.join(', ')}`);
  return rows;
};

const emptyPrompt = (section: ContextMarkdownSection): string => {
  switch (section) {
    case 'Important Decisions':
      return 'Add decisions that must carry into the next chat.';
    case 'User Preferences':
      return 'Add user preferences that affect future work.';
    case 'Open Questions':
      return 'Add unresolved questions.';
    case 'Next Step':
      return 'Add the next action.';
    case 'Do Not Forget':
      return 'Add easy-to-miss constraints.';
    default:
      return 'Add context.';
  }
};

const sectionLines = (section: ContextMarkdownSection, input: BuildContextMarkdownInput): string[] => {
  const { conversation, messages } = input;
  switch (section) {
    case 'Goal': {
      const first = input.maxRecentMessages === undefined ? firstUserMessage(messages) : undefined;
      return [conversation.name || 'Conversation', first ? excerpt(readMessageContent(first)) : 'Add the goal.'].map(
        bullet
      );
    }
    case 'Current State': {
      const latest = latestAssistantMessage(messages);
      const lines = latest
        ? [excerpt(readMessageContent(latest))]
        : recentMessages(messages, input.maxRecentMessages ?? 6);
      return (lines.length > 0 ? lines : [emptyPrompt(section)]).map(bullet);
    }
    case 'Files / Artifacts': {
      const refs = extractFileReferences(conversation, messages);
      return (refs.length > 0 ? refs : [emptyPrompt(section)]).map(bullet);
    }
    case 'Assistant Setup':
      return assistantSetup(conversation).map(bullet);
    case 'Pinned Context': {
      const pinned = getPinnedContext(conversation).map((item) =>
        item.title.trim() ? `${item.title.trim()}: ${excerpt(item.content)}` : excerpt(item.content)
      );
      return (pinned.length > 0 ? pinned : [emptyPrompt(section)]).map(bullet);
    }
    default:
      return [emptyPrompt(section)].map(bullet);
  }
};

export const buildContextMarkdown = (input: BuildContextMarkdownInput): string => {
  const lines: string[] = [
    '# Conversation Context',
    '',
    bullet(`Conversation: ${input.conversation.name || input.conversation.id}`),
    bullet(`Conversation ID: ${input.conversation.id}`),
    bullet(`Exported At: ${new Date().toISOString()}`),
    '',
  ];

  CONTEXT_MARKDOWN_SECTIONS.forEach((section) => {
    lines.push(`## ${section}`);
    lines.push('');
    lines.push(...sectionLines(section, input));
    lines.push('');
  });

  return lines.join('\n').trimEnd();
};

export const getContextFileName = (conversationName: string): string => {
  const safeBase = conversationName
    .replace(INVALID_CONTEXT_FILE_CHARS_RE, ' - ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:-|\s)+|(?:-|\s)+$/g, '')
    .trim()
    .slice(0, 80);
  return `${safeBase || 'Conversation'} Context.md`;
};
