/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseCitationHeader } from '@/common/knowledge/citationFormat';
import { useKnowledgeCitationsSafe } from '@/renderer/pages/conversation/knowledge/KnowledgeCitationsContext';
import { activateOnEnterOrSpace } from '@/renderer/utils/ui/rowActivation';
import React from 'react';

// The knowledge search tool's result renders as plain <pre> text inside the
// work journal. Its citation headers (`[n] fileName — headingPath`) are OUR
// format (see citationFormat.ts), so recognition here is format-driven rather
// than known-name-driven — a header stays clickable after its source is
// deleted, and clicking it surfaces the "no longer in the knowledge base"
// toast instead of going silently dead.

const KNOWLEDGE_SEARCH_TOOL = 'search_project_knowledge';

export const toolUsesKnowledgeSearch = (name: string | undefined): boolean =>
  Boolean(name && name.includes(KNOWLEDGE_SEARCH_TOOL));

/** Citation headers cite real files — require a sane dot-extension. */
const FILE_EXTENSION_PATTERN = /\.[A-Za-z0-9]{1,8}$/;

const ToolOutputCitations: React.FC<{ output: string }> = ({ output }) => {
  const citations = useKnowledgeCitationsSafe();
  if (!citations) return <>{output}</>;
  const lines = output.split('\n');
  return (
    <>
      {lines.map((line, index) => {
        const suffix = index < lines.length - 1 ? '\n' : '';
        // Real headers are always preceded by a blank line (formatHitsAsText
        // joins blocks with \n\n) — passage text that merely looks like a
        // header stays plain.
        const parsed =
          index > 0 && lines[index - 1].trim() === '' ? parseCitationHeader(line, citations.fileNames) : null;
        if (!parsed || !FILE_EXTENSION_PATTERN.test(parsed.fileName)) {
          return <React.Fragment key={index}>{line + suffix}</React.Fragment>;
        }
        const headingSuffix = parsed.headingPath ? ` — ${parsed.headingPath}` : '';
        return (
          <React.Fragment key={index}>
            {`[${parsed.ordinal}] `}
            <a
              className='kb-citation-link'
              role='button'
              tabIndex={0}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                citations.openCitation(parsed.fileName, parsed.headingPath);
              }}
              // An anchor with no href gets no implicit keyboard activation, so role+tabIndex
              // alone left Enter doing nothing here.
              onKeyDown={activateOnEnterOrSpace(() => citations.openCitation(parsed.fileName, parsed.headingPath))}
            >
              {parsed.fileName}
            </a>
            {headingSuffix + suffix}
          </React.Fragment>
        );
      })}
    </>
  );
};

export default ToolOutputCitations;
