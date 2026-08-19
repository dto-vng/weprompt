import { AgentLogoIcon } from '@/renderer/components/agent/AgentBadge';
import type { PresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import ChatTitleEditor from '@/renderer/pages/conversation/components/ChatTitleEditor';
import MobileWorkspaceOverlay from './MobileWorkspaceOverlay';
import WorkspacePanelHeader, { DesktopWorkspaceToggle } from './WorkspacePanelHeader';
import { useContainerWidth } from '@/renderer/pages/conversation/hooks/useContainerWidth';
import { useLayoutConstraints } from '@/renderer/pages/conversation/hooks/useLayoutConstraints';
import { useTitleRename } from '@/renderer/pages/conversation/hooks/useTitleRename';
import { useWorkspaceCollapse } from '@/renderer/pages/conversation/hooks/useWorkspaceCollapse';
import { PreviewPanel } from '@/renderer/pages/conversation/Preview';
import { WORKSPACE_EXPAND_EVENT, dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';
import classNames from 'classnames';
import { isMacEnvironment, isWindowsEnvironment } from '@/renderer/pages/conversation/utils/detectPlatform';
import { calcLayoutMetrics } from '@/renderer/pages/conversation/utils/layoutCalc';
import { Button, Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  WorkspaceFilesPaneProvider,
  type WorkspacePaneView,
} from '@/renderer/pages/conversation/Workspace/filesPaneContext';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import WorkspaceOpenButton from './WorkspaceOpenButton';
import './chat-layout.css';

const PANE_TAB_LABEL_KEYS = {
  files: 'conversation.workspace.changes.filesTab',
  changes: 'conversation.workspace.changes.tab',
  context: 'conversation.contextHandoff.sectionTitle',
  preview: 'conversation.workspace.changes.previewTab',
  browser: 'conversation.workspace.changes.browserTab',
} as const;

/**
 * Where the in-pane browser starts. Deliberately blank: picking a homepage or a search provider
 * is a product decision (and a privacy one), not something to default silently. The URL bar is
 * live from the first paint, so a blank start costs the user one keystroke and nothing else.
 */
const BROWSER_START_URL = 'about:blank';

/**
 * Context sits with the other workspace-state views, ahead of the content views. It is filtered
 * out for backends other than aionrs, matching the panel's own `showContextSection` gate — a tab
 * that can only ever be empty is worse than no tab.
 */
const PANE_TAB_ORDER = ['files', 'changes', 'context', 'preview', 'browser'] as const;

// headerExtra allows injecting custom actions (e.g., model picker) into the header's right area
const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
  siderTitle?: React.ReactNode;
  backend?: string;
  /** Preset assistant info — when provided, badge shows assistant identity instead of backend */
  presetAssistant?: PresetAssistantInfo & { id?: string };
  /** Fallback agent name (used when no presetAssistant, e.g. from conversation.extra.agent_name) */
  agent_name?: string;
  headerExtra?: React.ReactNode;
  workspaceEnabled?: boolean;
  workspacePresentation?: 'panel' | 'project-menu';
  /** Conversation ID for mode switching */
  conversation_id?: string;
  /** Custom tabs slot; when provided, replaces the default ConversationTabs */
  tabsSlot?: React.ReactNode;
  /** Workspace path for opening in external tools */
  workspacePath?: string;
  /** Authoritative temp-workspace flag from `conversation.extra.is_temporary_workspace`. */
  isTemporaryWorkspace?: boolean;
  /**
   * Stable key for persisting the workspace collapse preference. Defaults to
   * `conversation_id` for single chats; team mode passes `team_id` so the
   * preference survives agent-tab switches.
   */
  workspacePreferenceKey?: string;
  /** Custom rename handler; when provided, replaces the default conversation.update rename flow */
  onRenameTitle?: (new_name: string) => Promise<boolean>;
  /** Optional override for the leading icon shown before the title (e.g. team Peoples icon) */
  headerLeading?: React.ReactNode;
}> = (props) => {
  const { t } = useTranslation();
  const { conversation_id, workspacePath, isTemporaryWorkspace } = props;
  const {
    backend,
    presetAssistant,
    agent_name,
    workspaceEnabled = true,
    workspacePreferenceKey,
    workspacePresentation = 'panel',
  } = props;
  // `panel` (team) keeps its workspace file tree in the pane; `project-menu`
  // (single chat) renders the always-open artifact preview instead.
  const isWorkspacePanePresentation = workspacePresentation === 'panel';
  const layout = useLayoutContext();
  const isMacRuntime = isMacEnvironment();
  const isWindowsRuntime = isWindowsEnvironment();
  const isDesktop = !layout?.isMobile;
  const isMobile = Boolean(layout?.isMobile);

  // --- Hook A: artifact-pane collapse (formerly the right workspace sider) ---
  const { rightSiderCollapsed: artifactCollapsed, setRightSiderCollapsed: setArtifactCollapsed } = useWorkspaceCollapse(
    {
      workspaceEnabled,
      isMobile,
      conversation_id,
      preferenceKey: workspacePreferenceKey ?? conversation_id,
      isTemporaryWorkspace,
      autoExpandOnWorkspaceFiles: isWorkspacePanePresentation,
    }
  );
  const collapseArtifactPane = useCallback(() => setArtifactCollapsed(true), [setArtifactCollapsed]);
  // PreviewPanel requests a collapse when it has nothing to show. That was right when this
  // pane WAS the preview; now it also hosts Files and Changes, so honouring it unconditionally
  // made the pane impossible to open — the toggle expanded it and an empty PreviewPanel shut it
  // again in the same tick. Only honour the request while the preview is the visible tab.
  const collapseArtifactPaneFromPreview = useCallback(() => {
    if (artifactPaneViewRef.current !== 'preview') return;
    setArtifactCollapsed(true);
  }, [setArtifactCollapsed]);

  // --- Hook B: container width ---
  const { containerRef, containerWidth } = useContainerWidth();

  // --- Hook C: title rename ---
  const { editingTitle, setEditingTitle, titleDraft, setTitleDraft, renameLoading, canRenameTitle, submitTitleRename } =
    useTitleRename({
      title: props.title,
      conversation_id,
      onRename: props.onRenameTitle,
    });

  const capitalizedBackend = backend ? backend.charAt(0).toUpperCase() + backend.slice(1) : backend;

  // Compute display name with fallback chain
  const display_name = presetAssistant?.name || agent_name || capitalizedBackend;

  // Pre-hook metrics: compute dynamic min/max for the chat<->artifact split hook
  const { dynamicChatMinRatio, dynamicChatMaxRatio } = calcLayoutMetrics({
    containerWidth,
    chatSplitRatio: 50, // placeholder; only dynamicChatMinRatio/dynamicChatMaxRatio are used here
    workspaceEnabled,
    isDesktop,
    artifactCollapsed,
  });

  // Single ratio split between chat and the always-open artifact pane.
  const { splitRatio: chatSplitRatio, createDragHandle: createArtifactDragHandle } = useResizableSplit({
    unit: 'ratio',
    // Team keeps the workspace as a narrower sidebar (chat gets more room);
    // single chat splits evenly with the artifact preview.
    defaultWidth: isWorkspacePanePresentation ? 70 : 50,
    minWidth: dynamicChatMinRatio,
    maxWidth: dynamicChatMaxRatio,
    storageKey: isWorkspacePanePresentation ? 'chat-workspace-split-ratio' : 'chat-artifact-split-ratio',
  });

  // Clamp only the RENDERED ratio into the container-driven bounds. The stored
  // preference (`chatSplitRatio`) is left untouched so a transient narrow width
  // never overwrites it — only explicit drag/reset mutate the stored value.
  const effectiveChatSplitRatio = Math.max(dynamicChatMinRatio, Math.min(dynamicChatMaxRatio, chatSplitRatio));

  // Full metrics with the effective (clamped) chatSplitRatio
  const { artifactVisible, chatFlex, mobileWorkspaceWidthPx, titleAreaMaxWidth, mobileWorkspaceHandleRight } =
    calcLayoutMetrics({
      containerWidth,
      chatSplitRatio: effectiveChatSplitRatio,
      workspaceEnabled,
      isDesktop,
      artifactCollapsed,
    });

  // --- Hook E: layout constraints ---
  useLayoutConstraints({
    containerWidth,
    workspaceEnabled,
    isDesktop,
    artifactCollapsed,
    setArtifactCollapsed,
  });

  // C-01: the right pane shows either the workspace file tree or the artifact preview.
  // Both stay mounted and are toggled by visibility, so switching tabs never discards
  // preview state or re-fetches the tree.
  const [artifactPaneView, setArtifactPaneView] = useState<WorkspacePaneView>('files');
  const [filesPaneEl, setFilesPaneEl] = useState<HTMLElement | null>(null);
  const [changesPaneEl, setChangesPaneEl] = useState<HTMLElement | null>(null);
  const [contextPaneEl, setContextPaneEl] = useState<HTMLElement | null>(null);
  const browserOpenedRef = React.useRef(false);
  // Don't pay for a webview until the user actually asks for the browser.
  const browserEverOpened = artifactPaneView === 'browser' || browserOpenedRef.current;
  if (artifactPaneView === 'browser') browserOpenedRef.current = true;
  const artifactPaneViewRef = React.useRef(artifactPaneView);
  artifactPaneViewRef.current = artifactPaneView;
  const panePortalTargets = React.useMemo(
    () => ({ files: filesPaneEl, changes: changesPaneEl, context: contextPaneEl }),
    [filesPaneEl, changesPaneEl, contextPaneEl]
  );

  // Opening a preview must also REVEAL the preview. PreviewContext dispatches this event on
  // every openPreview as an explicit "show me this" action — it is already what force-expands
  // a collapsed pane. Without this, clicking a file in the Files tab opens it into the hidden
  // Preview tab and the click looks like it did nothing, which is exactly how it was reported.
  useEffect(() => {
    const revealPreview = () => setArtifactPaneView('preview');
    window.addEventListener(WORKSPACE_EXPAND_EVENT, revealPreview);
    return () => window.removeEventListener(WORKSPACE_EXPAND_EVENT, revealPreview);
  }, []);
  const [mobileActionsSlot, setMobileActionsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!layout?.isMobile) {
      setMobileActionsSlot(null);
      return;
    }
    const findSlot = () => document.getElementById('app-titlebar-actions-slot');
    setMobileActionsSlot(findSlot());
    const observer = new MutationObserver(() => {
      const next = findSlot();
      setMobileActionsSlot((prev) => (prev === next ? prev : next));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [layout?.isMobile]);

  const desktopHeader = (
    <ArcoLayout.Header
      className={classNames(
        'min-h-44px flex items-center justify-between px-16px pt-8px pb-10px gap-16px !bg-1 chat-layout-header chat-layout-header--glass overflow-hidden'
      )}
    >
      <FlexFullContainer className='h-full min-w-0' containerClassName='flex items-center'>
        <ChatTitleEditor
          editingTitle={editingTitle}
          titleDraft={titleDraft}
          setTitleDraft={setTitleDraft}
          setEditingTitle={setEditingTitle}
          renameLoading={renameLoading}
          canRenameTitle={canRenameTitle}
          submitTitleRename={submitTitleRename}
          titleAreaMaxWidth={titleAreaMaxWidth}
          title={props.title}
          conversation_id={conversation_id}
          leading={
            props.headerLeading ??
            ((backend || presetAssistant) && (
              <AgentLogoIcon
                backend={backend}
                agent_name={display_name}
                agentLogo={presetAssistant?.logo}
                agentLogoIsEmoji={presetAssistant?.isEmoji}
                agentLogoIsFallback={presetAssistant?.isFallback}
              />
            ))
          }
        />
      </FlexFullContainer>
      <div className='flex items-center gap-12px shrink-0'>
        {props.headerExtra}
        {/*
          Renders on Windows AND macOS. DesktopWorkspaceToggle covers the remaining case
          (`!isMac && !isWindows`, i.e. Linux), so between the two every platform has exactly
          one control. macOS previously fell through BOTH gates and had no way to open the
          pane at all except by opening a file, which force-expands it as a side effect.
        */}
        {(isWindowsRuntime || isMacRuntime) && workspaceEnabled && (
          <button
            type='button'
            className='workspace-header__toggle'
            aria-label={t('common.chrome.toggleProjectPanel')}
            onClick={() => dispatchWorkspaceToggleEvent()}
          >
            {artifactCollapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
          </button>
        )}
      </div>
    </ArcoLayout.Header>
  );

  const headerBlock = (
    <>
      {layout?.isMobile
        ? mobileActionsSlot && props.headerExtra && createPortal(props.headerExtra, mobileActionsSlot)
        : desktopHeader}
      {props.tabsSlot}
    </>
  );

  return (
    <ArcoLayout
      className='size-full color-black '
      style={{
        // fontFamily: `cursive,"anthropicSans","anthropicSans Fallback",system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif`,
      }}
    >
      <WorkspaceFilesPaneProvider activeView={artifactPaneView} containers={panePortalTargets}>
      <div ref={containerRef} className='flex flex-1 relative w-full overflow-hidden'>
        {workspaceEnabled && workspacePresentation === 'project-menu' && (
          <div className='workspace-project-controller'>{props.sider}</div>
        )}
        {/* Chat region — header + content. Never unmounts when the artifact pane toggles. */}
        <div
          data-testid='chat-layout-chat-pane'
          className='flex flex-col relative min-w-0'
          style={{
            flexGrow: artifactVisible ? 0 : 1,
            flexShrink: artifactVisible ? 0 : 1,
            flexBasis: artifactVisible ? `${chatFlex}%` : 0,
          }}
          onClick={() => {
            if (window.innerWidth < 768 && !artifactCollapsed) setArtifactCollapsed(true);
          }}
        >
          <div className='shrink-0 !bg-1'>{headerBlock}</div>
          <ArcoLayout.Content
            className='flex flex-col flex-1 overflow-hidden'
            style={{ background: 'var(--bg-chat-surface)' }}
          >
            {props.children}
          </ArcoLayout.Content>
        </div>
        {/*
          Artifact pane — the single region right of chat. Its content and mount
          behavior are presentation dependent:
          - `panel` (team) keeps the workspace file tree behind the
            WorkspacePanelHeader chrome, and — like the pre-refactor right sider —
            stays mounted at 0 width while collapsed so its WORKSPACE_HAS_FILES
            events keep firing and can auto-expand the pane.
          - `project-menu` (single chat) mounts the always-open PreviewPanel as a
            single-bar artifact surface whose tab-bar close button collapses the
            pane. It is removed from the DOM while collapsed (its file events come
            from the always-mounted project-menu controller above, not the pane).
        */}
        {isWorkspacePanePresentation && workspaceEnabled && !isMobile && (
          <div
            data-testid='artifact-pane'
            className='relative flex flex-col min-w-0 layout-sider'
            style={{
              background: 'var(--bg-artifact-surface)',
              flexGrow: artifactCollapsed ? 0 : 1,
              flexShrink: 0,
              flexBasis: artifactCollapsed ? '0px' : 0,
              width: artifactCollapsed ? '0px' : undefined,
              overflow: 'hidden',
              borderLeft: artifactCollapsed ? 'none' : '1px solid var(--bg-3)',
            }}
          >
            {!artifactCollapsed &&
              createArtifactDragHandle({ className: 'absolute left-0 top-0 bottom-0 z-30', linePlacement: 'start' })}
            <WorkspacePanelHeader
              showToggle={!isMacRuntime && !isWindowsRuntime}
              collapsed={artifactCollapsed}
              onToggle={() => dispatchWorkspaceToggleEvent()}
              togglePlacement='right'
              workspacePath={workspacePath}
              isTemporaryWorkspace={isTemporaryWorkspace}
            >
              {props.siderTitle}
            </WorkspacePanelHeader>
            <div className='flex-1 min-h-0 overflow-hidden'>{props.sider}</div>
          </div>
        )}
        {!isWorkspacePanePresentation && artifactVisible && (
          <div
            data-testid='artifact-pane'
            className='relative flex flex-col min-w-0 layout-sider'
            style={{
              background: 'var(--bg-artifact-surface)',
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
              overflow: 'hidden',
              borderLeft: '1px solid var(--bg-3)',
            }}
          >
            {createArtifactDragHandle({ className: 'absolute left-0 top-0 bottom-0 z-30', linePlacement: 'start' })}
            {/*
              C-01: the pane carries both the workspace file tree and the artifact preview.
              Both stay mounted and are toggled with `hidden`, so switching tabs neither
              discards preview state nor remounts the tree. The tree itself is portalled in
              by the single Workspace instance (see filesPaneContext) rather than built here,
              which is why this is an empty container.
            */}
            <div className='shrink-0 flex items-center justify-between gap-8px px-10px pt-8px'>
              <div className='flex items-center gap-2px' role='tablist'>
              {PANE_TAB_ORDER.filter((view) => view !== 'context' || backend === 'aionrs').map((view) => (
                <Button
                  key={view}
                  type='text'
                  size='small'
                  role='tab'
                  aria-selected={artifactPaneView === view}
                  data-testid={`artifact-pane-tab-${view}`}
                  // Active state is the primary orange, with NO fill. A cream pill here added a
                  // fourth shade to a stack that already had too many; colour alone carries it,
                  // matching how the file tab below signals active with an orange rule.
                  className={classNames(
                    '!rounded-6px !bg-transparent',
                    artifactPaneView === view ? '!text-primary !font-medium' : '!text-t-secondary'
                  )}
                  onClick={() => setArtifactPaneView(view)}
                >
                  {PANE_TAB_LABEL_KEYS[view] ? t(PANE_TAB_LABEL_KEYS[view]) : view}
                </Button>
              ))}
              </div>
              {/*
                Same VS Code / Terminal / File Explorer control the `panel` presentation gets via
                WorkspacePanelHeader. It was missing here only because this pane has no header —
                the component already existed.
              */}
              <div className='flex items-center gap-4px'>
                {workspacePath && <WorkspaceOpenButton workspacePath={workspacePath} isTemporary={isTemporaryWorkspace} />}
                {/*
                  A close affordance on the panel itself. The header toggle can also close it, but
                  it lives out in the chat header — far from the thing it acts on, and easy to miss.
                  Uses the unguarded collapse: this is an explicit user action, unlike
                  PreviewPanel's request, which is only honoured while Preview is visible.
                */}
                <Button
                  type='text'
                  size='small'
                  aria-label={t('common.chrome.collapseProjectPanel')}
                  data-testid='artifact-pane-collapse'
                  className='!rounded-6px !text-t-secondary hover:!text-t-primary'
                  icon={<ExpandRight size={15} />}
                  onClick={collapseArtifactPane}
                />
              </div>
            </div>
            <div
              className='flex-1 min-h-0 overflow-hidden'
              data-testid='artifact-pane-files'
              hidden={artifactPaneView !== 'files'}
            >
              <div ref={setFilesPaneEl} className='workspace-pane-section h-full overflow-hidden' />
            </div>
            <div
              className='flex-1 min-h-0 overflow-hidden'
              data-testid='artifact-pane-changes'
              hidden={artifactPaneView !== 'changes'}
            >
              <div ref={setChangesPaneEl} className='workspace-pane-section h-full overflow-hidden' />
            </div>
            <div
              className='flex-1 min-h-0 overflow-hidden'
              data-testid='artifact-pane-context'
              hidden={artifactPaneView !== 'context'}
            >
              <div ref={setContextPaneEl} className='workspace-pane-section h-full overflow-hidden' />
            </div>
            <div className='flex-1 min-h-0 overflow-hidden' hidden={artifactPaneView !== 'preview'}>
              <PreviewPanel fullBleed onRequestCollapse={collapseArtifactPaneFromPreview} />
            </div>
            {/*
              Mounted only once the user first opens it, then kept alive so navigation history and
              any session survive tab switches. A persistent partition keeps logins across restarts
              and separate from the extension webviews.
            */}
            {browserEverOpened && (
              <div
                className='flex-1 min-h-0 overflow-hidden'
                data-testid='artifact-pane-browser'
                hidden={artifactPaneView !== 'browser'}
              >
                <WebviewHost
                  url={BROWSER_START_URL}
                  id='workspace-pane-browser'
                  showNavBar
                  partition='persist:workspace-pane-browser'
                  className='h-full'
                />
              </div>
            )}
          </div>
        )}

        {/* Mobile artifact overlay: backdrop + fixed drawer + floating collapse handle */}
        {workspaceEnabled && layout?.isMobile && (
          <MobileWorkspaceOverlay
            rightSiderCollapsed={artifactCollapsed}
            setRightSiderCollapsed={setArtifactCollapsed}
            workspaceWidthPx={mobileWorkspaceWidthPx}
            mobileWorkspaceHandleRight={mobileWorkspaceHandleRight}
            siderTitle={props.siderTitle}
            sider={
              isWorkspacePanePresentation ? (
                props.sider
              ) : (
                <PreviewPanel fullBleed onRequestCollapse={collapseArtifactPane} />
              )
            }
            workspacePath={workspacePath}
            isTemporaryWorkspace={isTemporaryWorkspace}
          />
        )}

        {/* Desktop expand button when the artifact pane is collapsed */}
        {!isMacRuntime && !isWindowsRuntime && workspaceEnabled && artifactCollapsed && !layout?.isMobile && (
          <DesktopWorkspaceToggle />
        )}
      </div>
      </WorkspaceFilesPaneProvider>
    </ArcoLayout>
  );
};

export default ChatLayout;
