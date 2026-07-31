/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import McpServerToolsList from '@/renderer/pages/settings/ToolsSettings/McpServerToolsList';

const server = (tools?: unknown) => ({ id: 's', name: 'srv', tools }) as never;

describe('McpServerToolsList', () => {
  it('explains a server that exposes no tools instead of rendering nothing', () => {
    const { container } = render(<McpServerToolsList server={server([])} />);

    expect(screen.getByText('settings.mcpNoTools')).toBeInTheDocument();
    // The parent Collapse.Item is force-padded, so an empty render is a bare gap.
    expect(container).not.toBeEmptyDOMElement();
  });

  it('explains an absent tool list the same way', () => {
    render(<McpServerToolsList server={server(undefined)} />);

    expect(screen.getByText('settings.mcpNoTools')).toBeInTheDocument();
  });

  it('still lists tools when the server has them', () => {
    render(<McpServerToolsList server={server([{ name: 'read_file', description: 'Reads a file' }])} />);

    expect(screen.getByText('read_file')).toBeInTheDocument();
    expect(screen.queryByText('settings.mcpNoTools')).toBeNull();
  });
});
