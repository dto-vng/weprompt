/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// GreenNode IDP is asynchronous: POST /v1/ocr/ingest returns a request_id, then
// GET <ingestUrl>/<request_id> is polled until progress completes. We return the
// extracted `documents` JSON as text so the chat model interprets the semantics;
// the response schema is intentionally not modelled beyond `progress`/`documents`.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type IdpConfig = { ingestUrl: string; apiKey: string };
export type IdpFileType = 'IMAGE' | 'PDF';
export type IdpRequest = {
  filePath: string;
  docType?: string;
  fileType?: IdpFileType;
  workspaceDir?: string;
};
export type IdpResult = { success: boolean; text: string };

type IdpDeps = {
  readFile?: (p: string) => Promise<Uint8Array>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxPolls?: number;
  pollDelayMs?: number;
};

const DEFAULT_DOC_TYPE = 'ID';
const DEFAULT_FILE_TYPE: IdpFileType = 'IMAGE';
const DEFAULT_MAX_POLLS = 30;
const DEFAULT_POLL_DELAY_MS = 2000;

const getFileName = (p: string): string => p.split(/[/\\]/).pop() || 'file';

export const buildIdpFormData = (fileBytes: Uint8Array, fileName: string, req: IdpRequest): FormData => {
  const fd = new FormData();
  fd.set('model', 'idp');
  fd.set('flow', 'single');
  fd.set('doc_type', req.docType || DEFAULT_DOC_TYPE);
  fd.set('file_type', req.fileType || DEFAULT_FILE_TYPE);
  // Copy into a fresh ArrayBuffer: satisfies BlobPart typing regardless of the
  // input Uint8Array's underlying buffer type (ArrayBuffer | SharedArrayBuffer).
  const ownedBuffer = new Uint8Array(fileBytes).buffer as ArrayBuffer;
  fd.set('file', new Blob([ownedBuffer]), fileName);
  return fd;
};

const resolvePath = (filePath: string, workspaceDir?: string): string => {
  const cleaned = filePath.startsWith('@') ? filePath.slice(1) : filePath;
  if (path.isAbsolute(cleaned) || !workspaceDir) return cleaned;
  return path.join(workspaceDir, cleaned);
};

const isComplete = (progress: { total_doc?: number; ignored?: number; finished?: number } | undefined): boolean =>
  progress != null && (progress.total_doc ?? 0) > 0 && (progress.finished ?? 0) + (progress.ignored ?? 0) >= (progress.total_doc ?? 0);

export const executeIdp = async (req: IdpRequest, config: IdpConfig, deps?: IdpDeps): Promise<IdpResult> => {
  if (!config.ingestUrl || !config.apiKey) {
    return { success: false, text: 'Error: GreenNode IDP is not configured (missing base URL or API key).' };
  }
  const readFile = deps?.readFile ?? (async (p: string) => new Uint8Array(await fs.readFile(p)));
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const sleep = deps?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxPolls = deps?.maxPolls ?? DEFAULT_MAX_POLLS;
  const pollDelayMs = deps?.pollDelayMs ?? DEFAULT_POLL_DELAY_MS;
  const auth = { Authorization: `Bearer ${config.apiKey}` };

  const absolute = resolvePath(req.filePath, req.workspaceDir);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(absolute);
  } catch {
    return { success: false, text: `Error: could not read file at ${absolute}` };
  }

  // 1) ingest
  let requestId: string;
  try {
    const resp = await fetchImpl(config.ingestUrl, { method: 'POST', headers: auth, body: buildIdpFormData(bytes, getFileName(absolute), req) });
    const body = await resp.text();
    if (!resp.ok) return { success: false, text: `GreenNode IDP ingest failed (HTTP ${resp.status}): ${body}` };
    const parsed = JSON.parse(body) as { data?: { request_id?: string } };
    if (!parsed.data?.request_id) return { success: false, text: `GreenNode IDP ingest returned no request_id: ${body}` };
    requestId = parsed.data.request_id;
  } catch (error) {
    return { success: false, text: `GreenNode IDP ingest error: ${error instanceof Error ? error.message : String(error)}` };
  }

  // 2) poll
  const resultUrl = `${config.ingestUrl}/${requestId}`;
  let lastBody = '';
  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollDelayMs);
    try {
      const resp = await fetchImpl(resultUrl, { method: 'GET', headers: auth });
      lastBody = await resp.text();
      if (!resp.ok) return { success: false, text: `GreenNode IDP result failed (HTTP ${resp.status}): ${lastBody}` };
      const parsed = JSON.parse(lastBody) as { data?: { progress?: { total_doc?: number; ignored?: number; finished?: number }; documents?: unknown } };
      if (isComplete(parsed.data?.progress)) {
        return { success: true, text: JSON.stringify(parsed.data?.documents ?? parsed.data ?? {}) };
      }
    } catch (error) {
      return { success: false, text: `GreenNode IDP result error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  return { success: false, text: `GreenNode IDP timed out waiting for extraction after ${maxPolls} polls. Last: ${lastBody}` };
};
