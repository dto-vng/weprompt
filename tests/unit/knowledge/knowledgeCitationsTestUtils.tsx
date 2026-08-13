/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  KnowledgeCitationsRawContext,
  type KnowledgeCitationsValue,
} from '@/renderer/pages/conversation/knowledge/KnowledgeCitationsContext';
import { buildSourceLinkifier } from '@renderer/utils/chat/linkifyKnownSources';

/** Provides a stub citations context without any IPC — for component dom tests. */
export const KnowledgeCitationsTestProvider: React.FC<{
  fileNames: string[];
  openCitation: KnowledgeCitationsValue['openCitation'];
  children: React.ReactNode;
}> = ({ fileNames, openCitation, children }) => (
  <KnowledgeCitationsRawContext.Provider value={{ fileNames, linkify: buildSourceLinkifier(fileNames), openCitation }}>
    {children}
  </KnowledgeCitationsRawContext.Provider>
);
