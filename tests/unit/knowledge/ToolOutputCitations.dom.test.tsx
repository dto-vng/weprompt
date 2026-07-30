/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ToolOutputCitations, {
  toolUsesKnowledgeSearch,
} from '@/renderer/pages/conversation/Messages/components/ToolOutputCitations';
import { KnowledgeCitationsTestProvider } from './knowledgeCitationsTestUtils';

const OUTPUT =
  'Found 2 passage(s) in the project knowledge base for "hop dong":' +
  '\n\n[1] hop-dong-ctv-scan.pdf — Pages 1–3\ndieu khoan' +
  '\n\n[2] deleted.pdf\nold text';

describe('toolUsesKnowledgeSearch', () => {
  it('matches titles containing the tool name and rejects others', () => {
    expect(toolUsesKnowledgeSearch('search_project_knowledge')).toBe(true);
    expect(toolUsesKnowledgeSearch('project-knowledge:search_project_knowledge (MCP)')).toBe(true);
    expect(toolUsesKnowledgeSearch('Read')).toBe(false);
    expect(toolUsesKnowledgeSearch(undefined)).toBe(false);
  });
});

describe('ToolOutputCitations', () => {
  it('links citation header fileNames and passes the heading anchor on click', () => {
    const openCitation = vi.fn();
    const { container } = render(
      <KnowledgeCitationsTestProvider fileNames={['hop-dong-ctv-scan.pdf']} openCitation={openCitation}>
        <pre>
          <ToolOutputCitations output={OUTPUT} />
        </pre>
      </KnowledgeCitationsTestProvider>
    );
    const links = container.querySelectorAll('a.kb-citation-link');
    expect(links.length).toBe(2); // format-recognized even when no longer listed
    fireEvent.click(links[0]);
    expect(openCitation).toHaveBeenCalledWith('hop-dong-ctv-scan.pdf', 'Pages 1–3');
    fireEvent.click(links[1]);
    expect(openCitation).toHaveBeenCalledWith('deleted.pdf', undefined);
    expect(container.textContent).toBe(OUTPUT); // wording untouched
  });

  it('does not link body lines that merely look like citations mid-paragraph', () => {
    const openCitation = vi.fn();
    const tricky =
      'Found 1 passage(s) in the project knowledge base for "x":' +
      '\n\n[1] a.md — H\nbody line\n[2] fake.md — H';
    const { container } = render(
      <KnowledgeCitationsTestProvider fileNames={['a.md']} openCitation={openCitation}>
        <ToolOutputCitations output={tricky} />
      </KnowledgeCitationsTestProvider>
    );
    // Only the blank-line-preceded header is linked.
    expect(container.querySelectorAll('a.kb-citation-link').length).toBe(1);
    expect(container.textContent).toBe(tricky);
  });

  it('does not link headers whose fileName has no extension', () => {
    const openCitation = vi.fn();
    const output = 'Intro:\n\n[1] not a file — Heading\nbody';
    const { container } = render(
      <KnowledgeCitationsTestProvider fileNames={[]} openCitation={openCitation}>
        <ToolOutputCitations output={output} />
      </KnowledgeCitationsTestProvider>
    );
    expect(container.querySelectorAll('a').length).toBe(0);
  });

  it('renders plain text without a citations context', () => {
    const { container } = render(<ToolOutputCitations output={OUTPUT} />);
    expect(container.querySelectorAll('a').length).toBe(0);
    expect(container.textContent).toBe(OUTPUT);
  });
});
