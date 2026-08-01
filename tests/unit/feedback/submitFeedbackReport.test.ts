import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitFeedbackReport } from '@/renderer/services/feedback/submitFeedbackReport';

describe('submitFeedbackReport', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { electronAPI: undefined });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('exports a local diagnostic package with redacted metadata, logs, and attachments', async () => {
    const collectFeedbackLogs = vi.fn().mockResolvedValue({
      filename: 'weprompt-logs.gz',
      data: [1, 2, 3],
    });
    const exportLocalFeedbackDiagnostics = vi.fn().mockResolvedValue({
      status: 'saved',
      path: '/tmp/weprompt-diagnostics.json.gz',
    });
    vi.stubGlobal('window', {
      electronAPI: {
        collectFeedbackLogs,
        emit: vi.fn(),
        exportLocalFeedbackDiagnostics,
        logFeedbackEvent: vi.fn(),
        on: vi.fn(),
      },
    });

    const result = await submitFeedbackReport({
      attachments: [
        {
          filename: 'screenshot.png',
          data: new Uint8Array([4, 5, 6]),
          contentType: 'image/png',
        },
      ],
      collectLogs: true,
      description: '  AionCore   cannot start  ',
      extra: {
        installation_integrity: { source: 'backend_startup_failure' },
        provider_token: 'not-exported',
        provider_error: { message: 'not-exported' },
      },
      module: 'installation-integrity',
      moduleLabel: 'WePrompt installation is incomplete',
      tags: {
        'aionui.installation_integrity.report_source': 'backend_startup_failure',
      },
    });

    expect(result).toEqual({ status: 'saved', path: '/tmp/weprompt-diagnostics.json.gz' });
    expect(collectFeedbackLogs).toHaveBeenCalledOnce();
    expect(exportLocalFeedbackDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'AionCore cannot start',
        module: 'installation-integrity',
        moduleLabel: 'WePrompt installation is incomplete',
        tags: {
          'aionui.installation_integrity.report_source': 'backend_startup_failure',
        },
        attachments: [
          expect.objectContaining({ filename: 'weprompt-logs.gz', contentType: 'application/gzip' }),
          expect.objectContaining({ filename: 'screenshot.png', contentType: 'image/png' }),
        ],
      })
    );
    expect(JSON.stringify(exportLocalFeedbackDiagnostics.mock.calls[0][0])).not.toContain('not-exported');
  });

  it('returns cancelled without treating a dismissed save dialog as success', async () => {
    const exportLocalFeedbackDiagnostics = vi.fn().mockResolvedValue({ status: 'cancelled' });
    vi.stubGlobal('window', { electronAPI: { exportLocalFeedbackDiagnostics, on: vi.fn() } });

    await expect(
      submitFeedbackReport({
        description: 'Cancelled save',
        module: 'installation-integrity',
        moduleLabel: 'WePrompt installation is incomplete',
      })
    ).resolves.toEqual({ status: 'cancelled' });
  });

  it('returns a local write failure instead of reporting a remote submission', async () => {
    const exportLocalFeedbackDiagnostics = vi.fn().mockResolvedValue({ status: 'failed' });
    vi.stubGlobal('window', { electronAPI: { exportLocalFeedbackDiagnostics, on: vi.fn() } });

    await expect(
      submitFeedbackReport({
        description: 'Write failed',
        module: 'installation-integrity',
        moduleLabel: 'WePrompt installation is incomplete',
      })
    ).resolves.toEqual({ status: 'failed' });
  });

  it('redacts sensitive free-text descriptions before they cross the preload bridge', async () => {
    const blockedValue = ['local', 'test', 'credential'].join('-');
    const exportLocalFeedbackDiagnostics = vi.fn().mockResolvedValue({ status: 'saved', path: '/tmp/report.gz' });
    vi.stubGlobal('window', { electronAPI: { exportLocalFeedbackDiagnostics, on: vi.fn() } });

    await submitFeedbackReport({
      description: `Authorization: ${blockedValue}`,
      module: 'installation-integrity',
      moduleLabel: 'WePrompt installation is incomplete',
    });

    expect(exportLocalFeedbackDiagnostics).toHaveBeenCalledWith(expect.objectContaining({ description: '[redacted]' }));
  });

  it('preserves a benign conversation issue description but redacts explicit conversation content', async () => {
    const exportLocalFeedbackDiagnostics = vi.fn().mockResolvedValue({ status: 'saved', path: '/tmp/report.gz' });
    vi.stubGlobal('window', { electronAPI: { exportLocalFeedbackDiagnostics, on: vi.fn() } });

    await submitFeedbackReport({
      description: 'Conversation stuck',
      module: 'conversation-session',
      moduleLabel: 'Conversation & Sessions',
    });
    await submitFeedbackReport({
      description: 'conversation body: private diagnostic text',
      module: 'conversation-session',
      moduleLabel: 'Conversation & Sessions',
    });

    expect(exportLocalFeedbackDiagnostics).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ description: 'Conversation stuck' })
    );
    expect(exportLocalFeedbackDiagnostics).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ description: '[redacted]' })
    );
  });

  it('includes optional database diagnostics when collection succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            schema_version: 'feedback-diagnostics/v1',
            profiles: [{ name: 'conversation-session', mode: 'detail', data: { conversation: { id: 'conv-1' } } }],
            privacy: { raw_content_included: false, api_keys_included: false },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const exportLocalFeedbackDiagnostics = vi.fn().mockResolvedValue({ status: 'saved', path: '/tmp/report.gz' });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      electronAPI: { emit: vi.fn(), exportLocalFeedbackDiagnostics, on: vi.fn() },
    });

    await submitFeedbackReport({
      collectDbDiagnostics: {
        routeAtOpen: '#/conversation/conv-1',
        routeAtSubmit: '#/conversation/conv-1',
        selectedModule: 'conversation-session',
        explicitContext: { conversationId: 'conv-1' },
      },
      collectLogs: false,
      description: 'Conversation stuck',
      module: 'conversation-session',
      moduleLabel: 'Conversation & Sessions',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [requestPath] = fetchMock.mock.calls[0] as [string];
    expect(requestPath).toContain('/api/system/diagnostics/feedback-report?');
    expect(requestPath).toContain('conversation_id=conv-1');
    expect(exportLocalFeedbackDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ filename: expect.stringMatching(/^db-diagnostics\.json(?:\.gz)?$/) })],
        module: 'conversation-session',
        moduleLabel: 'Conversation & Sessions',
      })
    );
  });

  it('does not import the renderer Sentry client', () => {
    const source = readFileSync('packages/desktop/src/renderer/services/feedback/submitFeedbackReport.ts', 'utf8');

    expect(source).not.toContain('@sentry/electron/renderer');
    expect(source).not.toContain('captureEvent');
  });
});
