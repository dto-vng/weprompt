/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { KNOWLEDGE_FOLDER_NAME } from '@/common/knowledge/constants';
import type { IKnowledgeSourceDto } from '@/common/types/project/knowledgeTypes';
import KnowledgeSourcePreview from '@/renderer/pages/project/components/KnowledgeSourcePreview';
import { buildSourceLinkifier } from '@renderer/utils/chat/linkifyKnownSources';
import { Message } from '@arco-design/web-react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type KnowledgeCitationsValue = {
  /** Known source fileNames — the only strings citation recognition may match. */
  fileNames: readonly string[];
  /** Pure, memoized markdown transform wrapping known names as weprompt-kb links. */
  linkify: (markdown: string) => string;
  /** Resolve a fileName to its source and open the preview drawer (toast when gone). */
  openCitation: (fileName: string, anchor?: string) => void;
};

/** Exported for tests that need to provide a stub citations value directly. */
export const KnowledgeCitationsRawContext = createContext<KnowledgeCitationsValue | null>(null);

/** Null outside a project conversation — callers then skip all citation work. */
export const useKnowledgeCitationsSafe = (): KnowledgeCitationsValue | null => useContext(KnowledgeCitationsRawContext);

type PreviewState = {
  fileName: string | null;
  text: string;
  truncated: boolean;
  loading: boolean;
  failed: boolean;
  anchor?: string;
};

const EMPTY_PREVIEW: PreviewState = { fileName: null, text: '', truncated: false, loading: false, failed: false };

/**
 * Conversation-level controller for KB citation click-through. For project
 * conversations it caches the source list (refreshed on the main process's
 * `projectKnowledge.updated` push) and owns the preview drawer; for everything
 * else it renders children untouched and provides no context.
 */
export const KnowledgeCitationsProvider: React.FC<{
  conversation?: TChatConversation;
  children: React.ReactNode;
}> = ({ conversation, children }) => {
  const { t } = useTranslation();
  const extra = conversation?.extra as { project_id?: string; workspace?: string } | undefined;
  const projectId = extra?.project_id;
  const workspace = extra?.workspace;

  const [sources, setSources] = useState<IKnowledgeSourceDto[]>([]);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW);
  const openSeqRef = useRef(0);

  useEffect(() => {
    if (!projectId) return;
    let disposed = false;
    const refetch = async () => {
      try {
        const result = await ipcBridge.projectKnowledge.listSources.invoke({ projectId });
        if (!disposed) setSources(result.sources);
      } catch (error) {
        console.error('Failed to load knowledge sources for citations:', error);
      }
    };
    void refetch();
    const unsubscribe = ipcBridge.projectKnowledge.updated.on((payload) => {
      if (payload.projectId === projectId) void refetch();
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [projectId]);

  const fileNames = useMemo(() => sources.map((source) => source.fileName), [sources]);
  const linkify = useMemo(() => buildSourceLinkifier(fileNames), [fileNames]);

  const openCitation = useCallback(
    (fileName: string, anchor?: string) => {
      if (!projectId) return;
      const seq = ++openSeqRef.current;
      void (async () => {
        let source = sourcesRef.current.find((candidate) => candidate.fileName === fileName);
        if (!source) {
          // The cached list can trail reality (deletion in another surface) —
          // one fresh look before declaring the file gone.
          try {
            const result = await ipcBridge.projectKnowledge.listSources.invoke({ projectId });
            setSources(result.sources);
            source = result.sources.find((candidate) => candidate.fileName === fileName);
          } catch (error) {
            console.error('Failed to refresh knowledge sources for citation:', error);
          }
        }
        if (seq !== openSeqRef.current) return;
        if (!source) {
          Message.warning(t('conversation.projectHome.knowledgeCitationMissing'));
          return;
        }
        setPreview({ fileName, text: '', truncated: false, loading: true, failed: false, anchor });
        try {
          const { text, truncated } = await ipcBridge.projectKnowledge.getSourceText.invoke({
            projectId,
            sourceId: source.id,
          });
          if (seq !== openSeqRef.current) return;
          setPreview({ fileName, text, truncated, loading: false, failed: false, anchor });
        } catch (error) {
          console.error('Failed to load indexed text for citation:', error);
          if (seq !== openSeqRef.current) return;
          setPreview({ fileName, text: '', truncated: false, loading: false, failed: true, anchor });
        }
      })();
    },
    [projectId, t]
  );

  const value = useMemo<KnowledgeCitationsValue>(
    () => ({ fileNames, linkify, openCitation }),
    [fileNames, linkify, openCitation]
  );

  return (
    <KnowledgeCitationsRawContext.Provider value={projectId ? value : null}>
      {children}
      {projectId && (
        <KnowledgeSourcePreview
          fileName={preview.fileName}
          text={preview.text}
          truncated={preview.truncated}
          loading={preview.loading}
          failed={preview.failed}
          anchor={preview.anchor}
          onClose={() => setPreview(EMPTY_PREVIEW)}
          onOpenOriginal={() => {
            if (preview.fileName && workspace) {
              void ipcBridge.shell.openFile.invoke(`${workspace}/${KNOWLEDGE_FOLDER_NAME}/${preview.fileName}`);
            }
          }}
        />
      )}
    </KnowledgeCitationsRawContext.Provider>
  );
};
