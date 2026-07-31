/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Two properties of destructive confirms in settings:
 *
 * 1. A delete confirm names the thing it is about to destroy — asserted by rendering both
 *    copy-pasted MCP confirms, since fixing only one leaves the settings-modal Tools tab unnamed.
 * 2. Every locale's string actually interpolates that name. `scripts/check-i18n.js` compares key
 *    presence only, so a locale left un-reworded keeps the old un-interpolated sentence and still
 *    passes the gate. That check does not exist anywhere else, so it lives here.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const LOCALES = [
  'de-DE',
  'en-US',
  'es-ES',
  'fa-IR',
  'ja-JP',
  'ko-KR',
  'pt-BR',
  'ru-RU',
  'tr-TR',
  'uk-UA',
  'zh-CN',
  'zh-TW',
] as const;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown> | string) => {
      if (typeof params === 'string') return params;
      // Mirror i18next interpolation, so a dropped {{name}} argument surfaces as a failure.
      if (params && typeof params.name === 'string') return `${key}:${params.name}`;
      return key;
    },
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

// ToolsModalContent loads a stored image-generation model on mount; without this the IPC-backed
// read rejects and floods the run with unhandled-rejection noise.
vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: vi.fn().mockResolvedValue(undefined),
  setClientBusinessSetting: vi.fn().mockResolvedValue(undefined),
  removeClientBusinessSetting: vi.fn().mockResolvedValue(undefined),
}));

const SERVER_NAME = 'my-mcp-server';

// One barrel covers every hook both parents pull in.
vi.mock('@/renderer/hooks/mcp', () => ({
  useMcpServers: () => ({
    mcpServers: [],
    isMcpServersLoading: false,
    allMcpServers: [],
    extensionMcpServers: [],
    setMcpServers: vi.fn(),
    saveMcpServers: vi.fn(),
  }),
  useMountedMessage: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    normal: vi.fn(),
  }),
  useMcpOAuth: () => ({
    oauthStatus: {},
    loggingIn: {},
    checkOAuthStatus: vi.fn(),
    markLoginRequired: vi.fn(),
    clearLoginRequired: vi.fn(),
    login: vi.fn(),
  }),
  useMcpConnection: () => ({
    testingServers: {},
    handleTestMcpConnection: vi.fn(),
    handleTestMcpConnections: vi.fn(),
  }),
  useMcpModal: () => ({
    showMcpModal: false,
    editingMcpServer: undefined,
    // The confirm is open, with a server staged for deletion — the state this test is about.
    deleteConfirmVisible: true,
    serverToDelete: SERVER_NAME,
    mcpCollapseKey: [],
    showAddMcpModal: vi.fn(),
    showEditMcpModal: vi.fn(),
    hideMcpModal: vi.fn(),
    showDeleteConfirm: vi.fn(),
    hideDeleteConfirm: vi.fn(),
    toggleServerCollapse: vi.fn(),
  }),
  useMcpServerCRUD: () => ({
    handleAddMcpServer: vi.fn(),
    handleBatchImportMcpServers: vi.fn(),
    handleEditMcpServer: vi.fn(),
    handleDeleteMcpServer: vi.fn(),
  }),
}));

const message = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  normal: vi.fn(),
} as never;

describe('destructive confirms in settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the server in the Tools page delete confirm', async () => {
    const { default: McpManagement } = await import('@/renderer/pages/settings/ToolsSettings/McpManagement');
    render(<McpManagement message={message} />);

    await waitFor(() => {
      expect(screen.getByText(`settings.mcpDeleteConfirm:${SERVER_NAME}`)).toBeInTheDocument();
    });
  });

  it('names the server in the settings-modal Tools tab delete confirm too', async () => {
    // The two confirms are copy-pasted, so fixing only one leaves this surface unnamed.
    const mod = await import('@/renderer/components/settings/SettingsModal/contents/ToolsModalContent');
    const ToolsModalContent = mod.default;
    render(<ToolsModalContent message={message} />);

    await waitFor(() => {
      expect(screen.getByText(`settings.mcpDeleteConfirm:${SERVER_NAME}`)).toBeInTheDocument();
    });
  });

  it.each(LOCALES)('interpolates the server name in %s', (locale) => {
    const settings = JSON.parse(
      readFileSync(`packages/desktop/src/renderer/services/i18n/locales/${locale}/settings.json`, 'utf8')
    );
    expect(settings.mcpDeleteConfirm).toContain('{{name}}');
  });

  it('styles the batch skill delete as danger, like the single delete it generalises', () => {
    // Mounting the skills hub would pull in the registry, IPC and a virtualised grid for what is
    // a one-token property, so this reads the confirm config from the source instead. Orange is
    // reserved for consequential-but-non-destructive actions; a batch delete destroys more than
    // the single delete, so it must not be styled milder.
    const source = readFileSync(
      'packages/desktop/src/renderer/pages/settings/SkillsSettings/SkillsHubSettings.tsx',
      'utf8'
    );
    const start = source.indexOf('const handleBatchDelete');
    expect(start).toBeGreaterThan(-1);
    const batchConfirm = source.slice(start, source.indexOf('onOk', start));

    expect(batchConfirm).toContain("status: 'danger'");
    expect(source).not.toMatch(/okButtonProps:\s*\{\s*status:\s*'warning'\s*\}/);
  });
});
