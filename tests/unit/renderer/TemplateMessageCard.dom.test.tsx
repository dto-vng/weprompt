/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { TemplateMessageCard } from '@/renderer/components/chat/TemplateGallery';

// Mock the ipcBridge list call the SWR fetcher uses.
vi.mock('@/common', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    ipcBridge: {
      ...(mod.ipcBridge as Record<string, unknown>),
      presentationTemplates: {
        list: {
          invoke: vi.fn().mockResolvedValue([
            {
              manifest: {
                id: 'business-review',
                name: 'business-review',
                description: 'd',
                format: 'pptx',
                kind: 'deck',
                source: 'builtin',
                themeFile: 'THEME.md',
                referenceFile: 'reference.pptx',
                preview: 'preview.svg',
                version: 1,
                createdAt: 'now',
              },
              themePath: '/abs/business-review/THEME.md',
              referencePath: '/abs/business-review/reference.pptx',
              previewDataUrl: 'data:image/svg+xml;base64,x',
            },
          ]),
        },
      },
    },
  };
});

vi.mock('@arco-design/web-react', () => ({
  Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

describe('TemplateMessageCard', () => {
  it('renders the resolved template thumbnail + name', async () => {
    render(<TemplateMessageCard templateId='business-review' />);
    expect(await screen.findByTestId('template-message-card')).toBeTruthy();
    expect(await screen.findByText('business-review')).toBeTruthy();
  });

  it('falls back to an id-derived name when the template is gone', async () => {
    render(<TemplateMessageCard templateId='deleted-theme' />);
    expect(await screen.findByText('Deleted Theme')).toBeTruthy();
  });
});
