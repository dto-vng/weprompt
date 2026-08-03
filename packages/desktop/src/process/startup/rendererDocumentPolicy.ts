import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RENDERER_DOCUMENT_PATHS = [
  'index.html',
  path.join('pet', 'pet.html'),
  path.join('pet', 'pet-hit.html'),
  path.join('pet', 'pet-confirm.html'),
] as const;

type RendererDocumentPolicyOptions = {
  isPackaged: boolean;
  rendererDirectory: string;
  rendererUrl?: string;
};

export type RendererDocumentPolicy = {
  developmentRendererUrl: string | null;
  mainWindowDocuments: readonly string[];
  topLevelDocuments: readonly string[];
};

type RendererSenderEvent = {
  sender: unknown;
  senderFrame: { url: string } | null;
};

type BoundRendererWebContents = {
  isDestroyed(): boolean;
  mainFrame: unknown;
};

export function normalizeRendererDocumentUrl(documentUrl: string): string | null {
  try {
    const normalizedUrl = new URL(documentUrl);
    normalizedUrl.hash = '';
    return normalizedUrl.href;
  } catch {
    return null;
  }
}

function resolveDevelopmentRendererDocuments(rendererUrl?: string): {
  mainDocument: string;
  topLevelDocuments: string[];
} | null {
  if (!rendererUrl) return null;

  try {
    const parsedUrl = new URL(rendererUrl);
    if (parsedUrl.protocol !== 'http:' || (parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1')) {
      return null;
    }

    parsedUrl.hash = '';
    const mainDocument = parsedUrl.href;
    const baseUrl = new URL(mainDocument);
    baseUrl.search = '';
    if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';

    return {
      mainDocument,
      topLevelDocuments: [
        mainDocument,
        new URL('pet/pet.html', baseUrl).href,
        new URL('pet/pet-hit.html', baseUrl).href,
        new URL('pet/pet-confirm.html', baseUrl).href,
      ],
    };
  } catch {
    return null;
  }
}

export function createRendererDocumentPolicy({
  isPackaged,
  rendererDirectory,
  rendererUrl,
}: RendererDocumentPolicyOptions): RendererDocumentPolicy {
  const builtDocuments = RENDERER_DOCUMENT_PATHS.map(
    (relativePath) => pathToFileURL(path.join(rendererDirectory, relativePath)).href
  );
  const developmentDocuments = isPackaged ? null : resolveDevelopmentRendererDocuments(rendererUrl);

  return {
    developmentRendererUrl: developmentDocuments?.mainDocument ?? null,
    mainWindowDocuments: [...(developmentDocuments ? [developmentDocuments.mainDocument] : []), builtDocuments[0]],
    topLevelDocuments: [...(developmentDocuments?.topLevelDocuments ?? []), ...builtDocuments],
  };
}

export function isTrustedRendererDocument(targetUrl: string, trustedDocuments: Iterable<string>): boolean {
  const normalizedTarget = normalizeRendererDocumentUrl(targetUrl);
  if (!normalizedTarget) return false;

  return [...trustedDocuments].some(
    (trustedDocument) => normalizeRendererDocumentUrl(trustedDocument) === normalizedTarget
  );
}

export function isAuthorizedRendererSender(
  event: RendererSenderEvent,
  boundWebContents: BoundRendererWebContents | null,
  trustedDocuments: Iterable<string>
): boolean {
  if (!boundWebContents || boundWebContents.isDestroyed()) return false;
  if (event.sender !== boundWebContents || event.senderFrame !== boundWebContents.mainFrame || !event.senderFrame) {
    return false;
  }

  return isTrustedRendererDocument(event.senderFrame.url, trustedDocuments);
}
