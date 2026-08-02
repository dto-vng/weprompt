import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitFeedbackReport } from '@/renderer/services/feedback/submitFeedbackReport';

describe('submitFeedbackReport', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { electronAPI: undefined });
  });

  it('sends only a bounded local-export request and leaves log collection in main', async () => {
    const exportLocalFeedbackDiagnostics = vi.fn().mockResolvedValue({
      status: 'saved',
      path: '/tmp/weprompt-diagnostics.json.gz',
    });
    vi.stubGlobal('window', { electronAPI: { exportLocalFeedbackDiagnostics } });

    const result = await submitFeedbackReport({
      attachments: [
        {
          filename: 'screenshot.png',
          data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          contentType: 'image/png',
        },
      ],
      collectLogs: true,
      description: '  Conversation stuck  ',
      module: 'conversation-session',
      moduleLabel: 'Conversation & Sessions',
      tags: {
        agent_error_code: 'USER_AGENT_ACP_INIT_FAILED',
      },
    });

    expect(result).toEqual({ status: 'saved', path: '/tmp/weprompt-diagnostics.json.gz' });
    expect(exportLocalFeedbackDiagnostics).toHaveBeenCalledWith({
      collectLogs: true,
      description: 'Conversation stuck',
      module: 'conversation-session',
      moduleLabel: 'Conversation & Sessions',
      screenshots: [
        {
          contentType: 'image/png',
          data: [0x89, 0x50, 0x4e, 0x47],
          filename: 'screenshot.png',
        },
      ],
      tags: { agent_error_code: 'USER_AGENT_ACP_INIT_FAILED' },
    });
  });

  it('returns failed without exposing feedback export in browser/WebUI mode', async () => {
    await expect(
      submitFeedbackReport({
        description: 'Browser mode',
        module: 'system-settings',
        moduleLabel: 'System Settings',
      })
    ).resolves.toEqual({ status: 'failed' });
  });

  it.each([
    [{ status: 'cancelled' }, { status: 'cancelled' }],
    [{ status: 'failed' }, { status: 'failed' }],
  ] as const)('returns the local save outcome %#', async (bridgeResult, expected) => {
    const exportLocalFeedbackDiagnostics = vi.fn().mockResolvedValue(bridgeResult);
    vi.stubGlobal('window', { electronAPI: { exportLocalFeedbackDiagnostics } });

    await expect(
      submitFeedbackReport({
        description: 'Save outcome',
        module: 'system-settings',
        moduleLabel: 'System Settings',
      })
    ).resolves.toEqual(expected);
  });

  it('preserves user-authored issue wording for the truthful unredacted archive field', async () => {
    const exportLocalFeedbackDiagnostics = vi.fn().mockResolvedValue({ status: 'saved', path: '/tmp/report.gz' });
    vi.stubGlobal('window', { electronAPI: { exportLocalFeedbackDiagnostics } });

    await submitFeedbackReport({
      description: 'Prompt editor crashes while opening a conversation',
      module: 'conversation-session',
      moduleLabel: 'Conversation & Sessions',
    });

    expect(exportLocalFeedbackDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Prompt editor crashes while opening a conversation' })
    );
  });

  it('does not expose raw-log or renderer-log IPC and does not import Sentry', () => {
    const preload = readFileSync('packages/desktop/src/preload/main.ts', 'utf8');
    const source = readFileSync('packages/desktop/src/renderer/services/feedback/submitFeedbackReport.ts', 'utf8');

    expect(preload).not.toContain('feedback:collect-logs');
    expect(preload).not.toContain('feedback:renderer-log');
    expect(preload).not.toContain('collectFeedbackLogs');
    expect(preload).not.toContain('logFeedbackEvent');
    expect(source).not.toContain('@sentry/electron/renderer');
    expect(source).not.toContain('captureEvent');
  });
});
