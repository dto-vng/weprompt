import { MIN_ARTIFACT_PANEL_PX, MIN_CHAT_PANEL_PX } from '@/renderer/pages/conversation/utils/layoutCalc';
import { useEffect } from 'react';

type UseLayoutConstraintsParams = {
  containerWidth: number;
  workspaceEnabled: boolean;
  isDesktop: boolean;
  artifactCollapsed: boolean;
  setArtifactCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  chatSplitRatio: number;
  setChatSplitRatio: (ratio: number) => void;
  dynamicChatMinRatio: number;
  dynamicChatMaxRatio: number;
};

/**
 * Constrains the two-region (chat | artifact) layout: auto-collapses the
 * artifact pane when the container is too narrow to fit both panes above their
 * minimum pixel widths, and clamps the chat<->artifact split ratio into its
 * dynamic bounds.
 */
export function useLayoutConstraints({
  containerWidth,
  workspaceEnabled,
  isDesktop,
  artifactCollapsed,
  setArtifactCollapsed,
  chatSplitRatio,
  setChatSplitRatio,
  dynamicChatMinRatio,
  dynamicChatMaxRatio,
}: UseLayoutConstraintsParams): void {
  // Auto-collapse the artifact pane when the container is too narrow to fit
  // both the chat and artifact panes side by side.
  useEffect(() => {
    if (!workspaceEnabled || !isDesktop || artifactCollapsed) {
      return;
    }
    const safeContainerWidth = Math.max(containerWidth || 0, 1);
    if (safeContainerWidth < MIN_CHAT_PANEL_PX + MIN_ARTIFACT_PANEL_PX) {
      setArtifactCollapsed(true);
    }
  }, [artifactCollapsed, containerWidth, isDesktop, setArtifactCollapsed, workspaceEnabled]);

  // Clamp the chat split ratio within the dynamic bounds while the artifact
  // pane is visible.
  useEffect(() => {
    if (!workspaceEnabled || !isDesktop || artifactCollapsed) {
      return;
    }
    const clampedChat = Math.max(dynamicChatMinRatio, Math.min(dynamicChatMaxRatio, chatSplitRatio));
    if (clampedChat !== chatSplitRatio) {
      setChatSplitRatio(clampedChat);
    }
  }, [
    artifactCollapsed,
    chatSplitRatio,
    dynamicChatMaxRatio,
    dynamicChatMinRatio,
    isDesktop,
    setChatSplitRatio,
    workspaceEnabled,
  ]);
}
