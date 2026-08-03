/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The folder picker used to be mouse-only and silent about empty directories. These tests pin
 * the keyboard path and the empty state. They cannot assert anything about the row separators
 * or the focus ring — jsdom computes no colour and no layout — so those stay a visual check.
 *
 * This component browses over HTTP rather than IPC, so global.fetch is stubbed.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    t: (key: string, params?: Record<string, unknown> | string) => (typeof params === 'string' ? params : key),
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  getBaseUrl: () => 'http://localhost:0',
  withLocalTokenHeaders: () => ({}),
}));

import DirectorySelectionModal from '@/renderer/components/settings/DirectorySelectionModal';

const browse = vi.fn();

/** Matches the backend's { success, data } envelope. */
const respondWith = (items: unknown[], canGoUp = true, parentPath = '/parent') =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { items, canGoUp, parentPath } }),
  });

const renderPicker = (isFileMode = false) =>
  render(<DirectorySelectionModal visible isFileMode={isFileMode} onConfirm={vi.fn()} onCancel={vi.fn()} />);

describe('DirectorySelectionModal', () => {
  beforeEach(() => {
    browse.mockReset();
    browse.mockImplementation(() => respondWith([]));
    global.fetch = browse as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('explains an empty directory instead of showing a blank box', async () => {
    renderPicker();

    await waitFor(() => {
      expect(screen.getByText('fileSelection.emptyFolder')).toBeInTheDocument();
    });
    // The way back out must survive the empty case.
    expect(screen.getByLabelText('fileSelection.goToParent')).toBeInTheDocument();
  });

  it('does not show the empty copy while still loading or after an error', async () => {
    let resolveBrowse: (value: unknown) => void = () => {};
    browse.mockImplementation(() => new Promise((resolve) => (resolveBrowse = resolve)));
    renderPicker();

    // In flight: no items yet, but "empty" would be a lie.
    expect(screen.queryByText('fileSelection.emptyFolder')).toBeNull();

    resolveBrowse({ ok: false, json: () => Promise.resolve({ error: 'EACCES' }) });
    await waitFor(() => {
      expect(screen.getByText('EACCES')).toBeInTheDocument();
    });
    expect(screen.queryByText('fileSelection.emptyFolder')).toBeNull();
  });

  it('navigates into a directory from the keyboard with Enter and with Space', async () => {
    browse.mockImplementation(() => respondWith([{ name: 'docs', path: '/docs', isDirectory: true }]));
    renderPicker();

    const row = await waitFor(() => {
      const found = screen.getByText('docs').closest('[role="button"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(row).toHaveAttribute('tabIndex', '0');

    const callsBefore = browse.mock.calls.length;
    fireEvent.keyDown(row, { key: 'Enter' });
    await waitFor(() => {
      expect(browse.mock.calls.length).toBe(callsBefore + 1);
    });
    expect(browse.mock.calls.at(-1)?.[0]).toContain('path=%2Fdocs');

    fireEvent.keyDown(row, { key: ' ' });
    await waitFor(() => {
      expect(browse.mock.calls.length).toBe(callsBefore + 2);
    });
  });

  it('goes up from the keyboard', async () => {
    renderPicker();

    const goUp = await waitFor(() => screen.getByLabelText('fileSelection.goToParent'));
    const callsBefore = browse.mock.calls.length;
    fireEvent.keyDown(goUp, { key: 'Enter' });

    await waitFor(() => {
      expect(browse.mock.calls.length).toBe(callsBefore + 1);
    });
    expect(browse.mock.calls.at(-1)?.[0]).toContain('path=%2Fparent');
  });

  it('does not announce a file row as a button, since activating it does nothing', async () => {
    browse.mockImplementation(() =>
      respondWith([{ name: 'notes.txt', path: '/notes.txt', isDirectory: false, isFile: true }])
    );
    renderPicker(true);

    const label = await waitFor(() => screen.getByText('notes.txt'));
    expect(label.closest('[role="button"]')).toBeNull();
    // Files stay reachable through the row's own Select button.
    expect(screen.getByText('common.select')).toBeInTheDocument();
  });

  it('keeps the emoji out of the translated title', async () => {
    renderPicker();
    await waitFor(() => {
      expect(screen.getByText('fileSelection.selectDirectory')).toBeInTheDocument();
    });
    expect(document.body.textContent).not.toContain('📁');
    expect(document.body.textContent).not.toContain('📄');
  });
});
