import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  createRendererDocumentPolicy,
  isAuthorizedRendererSender,
  isTrustedRendererDocument,
} from '@/process/startup/rendererDocumentPolicy';

const rendererDirectory = path.join(
  path.sep,
  'Applications',
  'WePrompt.app',
  'Contents',
  'Resources',
  'app',
  'renderer'
);

describe('rendererDocumentPolicy', () => {
  it('allows only checked-in renderer documents in packaged mode and ignores an ambient dev URL', () => {
    const policy = createRendererDocumentPolicy({
      isPackaged: true,
      rendererDirectory,
      rendererUrl: 'http://127.0.0.1:5173',
    });
    const indexUrl = pathToFileURL(path.join(rendererDirectory, 'index.html')).href;
    const petUrl = pathToFileURL(path.join(rendererDirectory, 'pet', 'pet.html')).href;

    expect(policy.mainWindowDocuments).toEqual([indexUrl]);
    expect(policy.topLevelDocuments).toContain(indexUrl);
    expect(policy.topLevelDocuments).toContain(petUrl);
    expect(policy.topLevelDocuments).not.toContain('http://127.0.0.1:5173/');
    expect(isTrustedRendererDocument(`${indexUrl}#/settings`, policy.topLevelDocuments)).toBe(true);
    expect(isTrustedRendererDocument(pathToFileURL('/tmp/untrusted.html').href, policy.topLevelDocuments)).toBe(false);
    expect(isTrustedRendererDocument('http://127.0.0.1:5173/', policy.topLevelDocuments)).toBe(false);
  });

  it('allows the configured development documents and packaged fallback but no other loopback document', () => {
    const policy = createRendererDocumentPolicy({
      isPackaged: false,
      rendererDirectory,
      rendererUrl: 'http://localhost:5173/base',
    });
    const fallbackUrl = pathToFileURL(path.join(rendererDirectory, 'index.html')).href;

    expect(policy.mainWindowDocuments).toEqual(['http://localhost:5173/base', fallbackUrl]);
    expect(policy.topLevelDocuments).toContain('http://localhost:5173/base/pet/pet-confirm.html');
    expect(isTrustedRendererDocument('http://localhost:5173/base#/chat', policy.topLevelDocuments)).toBe(true);
    expect(isTrustedRendererDocument('http://localhost:5173/attacker.html', policy.topLevelDocuments)).toBe(false);
    expect(isTrustedRendererDocument('http://127.0.0.1:8792/', policy.topLevelDocuments)).toBe(false);
  });

  it('authorizes the exact bound main frame only for a trusted main-window document', () => {
    const mainFrame = { url: 'file:///app/renderer/index.html#/chat' };
    const webContents = { isDestroyed: vi.fn(() => false), mainFrame };
    const trustedDocuments = ['file:///app/renderer/index.html'];

    expect(
      isAuthorizedRendererSender({ sender: webContents, senderFrame: mainFrame }, webContents, trustedDocuments)
    ).toBe(true);
    expect(
      isAuthorizedRendererSender(
        { sender: webContents, senderFrame: { url: mainFrame.url } },
        webContents,
        trustedDocuments
      )
    ).toBe(false);
    expect(
      isAuthorizedRendererSender(
        { sender: webContents, senderFrame: { url: 'file:///tmp/untrusted.html' } },
        webContents,
        trustedDocuments
      )
    ).toBe(false);
    expect(
      isAuthorizedRendererSender({ sender: { ...webContents }, senderFrame: mainFrame }, webContents, trustedDocuments)
    ).toBe(false);
  });
});
