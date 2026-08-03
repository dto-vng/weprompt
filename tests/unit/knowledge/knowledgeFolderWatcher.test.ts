/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The watcher's only job is to schedule syncs: it must coalesce bursts (a
// 30-file paste is one sync, not 30) and degrade quietly when the folder is
// not watchable, because the manual/mount sync points still cover the project.

import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWLEDGE_FOLDER_NAME } from '@/common/knowledge/constants';
import { createKnowledgeFolderWatcher } from '@/process/services/projectKnowledge/knowledgeFolderWatcher';

type FakeWatcher = {
  close: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  fire: () => void;
  emitError: () => void;
  watchedPath: string;
};

describe('createKnowledgeFolderWatcher', () => {
  let created: FakeWatcher[];
  let onSync: ReturnType<typeof vi.fn>;
  let watchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    created = [];
    onSync = vi.fn();
    watchImpl = vi.fn((watchedPath: string, _options: unknown, listener: () => void) => {
      const handlers: Record<string, () => void> = {};
      const watcher: FakeWatcher = {
        close: vi.fn(),
        on: vi.fn((event: string, handler: () => void) => {
          handlers[event] = handler;
        }),
        fire: () => listener(),
        emitError: () => handlers.error?.(),
        watchedPath,
      };
      created.push(watcher);
      return watcher;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const makeWatcher = (debounceMs = 1000) =>
    createKnowledgeFolderWatcher({ onSync, watchImpl: watchImpl as never, debounceMs });

  it('watches the Knowledge Base folder inside the workspace', () => {
    makeWatcher().watch('p1', '/ws/alpha');
    expect(created).toHaveLength(1);
    expect(created[0].watchedPath).toBe(path.join('/ws/alpha', KNOWLEDGE_FOLDER_NAME));
    expect(watchImpl.mock.calls[0][1]).toMatchObject({ recursive: true });
  });

  it('coalesces a burst of events into a single sync', () => {
    makeWatcher().watch('p1', '/ws/alpha');
    for (let i = 0; i < 30; i += 1) created[0].fire();
    expect(onSync).not.toHaveBeenCalled(); // nothing fires before the debounce elapses

    vi.advanceTimersByTime(1000);
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onSync).toHaveBeenCalledWith('p1', '/ws/alpha');
  });

  it('restarts the debounce window while events keep arriving', () => {
    makeWatcher().watch('p1', '/ws/alpha');
    created[0].fire();
    vi.advanceTimersByTime(900);
    created[0].fire();
    vi.advanceTimersByTime(900);
    expect(onSync).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('debounces each project independently', () => {
    const watcher = makeWatcher();
    watcher.watch('p1', '/ws/alpha');
    watcher.watch('p2', '/ws/beta');
    created[0].fire();
    created[1].fire();
    vi.advanceTimersByTime(1000);

    expect(onSync).toHaveBeenCalledTimes(2);
    expect(onSync).toHaveBeenCalledWith('p1', '/ws/alpha');
    expect(onSync).toHaveBeenCalledWith('p2', '/ws/beta');
  });

  it('is idempotent for an unchanged workspace', () => {
    const watcher = makeWatcher();
    watcher.watch('p1', '/ws/alpha');
    watcher.watch('p1', '/ws/alpha');
    expect(created).toHaveLength(1);
    expect(created[0].close).not.toHaveBeenCalled();
  });

  it('swaps the watcher when the project workspace changes', () => {
    const watcher = makeWatcher();
    watcher.watch('p1', '/ws/alpha');
    watcher.watch('p1', '/ws/moved');

    expect(created).toHaveLength(2);
    expect(created[0].close).toHaveBeenCalledTimes(1);
    expect(created[1].watchedPath).toBe(path.join('/ws/moved', KNOWLEDGE_FOLDER_NAME));
  });

  it('degrades without throwing when the folder cannot be watched', () => {
    watchImpl.mockImplementationOnce(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const watcher = makeWatcher();
    expect(() => watcher.watch('p1', '/ws/alpha')).not.toThrow();
    expect(onSync).not.toHaveBeenCalled();
  });

  it('retries a degraded project on the next watch call', () => {
    watchImpl.mockImplementationOnce(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const watcher = makeWatcher();
    watcher.watch('p1', '/ws/alpha'); // folder absent — degraded
    watcher.watch('p1', '/ws/alpha'); // folder now exists — must try again

    expect(created).toHaveLength(1);
    created[0].fire();
    vi.advanceTimersByTime(1000);
    expect(onSync).toHaveBeenCalledWith('p1', '/ws/alpha');
  });

  it('drops a watcher that errors, without crashing, and rewatches later', () => {
    const watcher = makeWatcher();
    watcher.watch('p1', '/ws/alpha');
    expect(() => created[0].emitError()).not.toThrow();
    expect(created[0].close).toHaveBeenCalledTimes(1);

    watcher.watch('p1', '/ws/alpha');
    expect(created).toHaveLength(2);
  });

  it('cancels a pending sync when the project is unwatched', () => {
    const watcher = makeWatcher();
    watcher.watch('p1', '/ws/alpha');
    created[0].fire();
    watcher.unwatch('p1');
    vi.advanceTimersByTime(5000);

    expect(created[0].close).toHaveBeenCalledTimes(1);
    expect(onSync).not.toHaveBeenCalled();
  });

  it('closes every watcher on dispose', () => {
    const watcher = makeWatcher();
    watcher.watch('p1', '/ws/alpha');
    watcher.watch('p2', '/ws/beta');
    watcher.dispose();

    expect(created.every((c) => c.close.mock.calls.length === 1)).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(onSync).not.toHaveBeenCalled();
  });
});
