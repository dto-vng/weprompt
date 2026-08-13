/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `t` identity is swappable so a test can simulate a language switch, which is
// one of the ways the viewer's effect used to re-run on an already-mounted webview.
const i18n = vi.hoisted(() => ({ t: (key: string) => key }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: i18n.t }) }));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: { useMessage: () => [{ success: vi.fn(), error: vi.fn() }, null] },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: { shell: { openFile: { invoke: vi.fn() } } },
}));

import PDFPreview from '@/renderer/pages/conversation/Preview/components/viewers/PDFViewer';

const LOADING = 'preview.loading';

/** The Electron <webview> is an unknown element under jsdom, so query it by tag. */
const getWebview = (container: HTMLElement) => container.querySelector('webview');

const emit = (element: Element, type: 'did-finish-load' | 'did-fail-load') => {
  act(() => {
    element.dispatchEvent(new Event(type));
  });
};

describe('PDFPreview webview lifecycle', () => {
  beforeEach(() => {
    i18n.t = (key: string) => key;
  });

  it('keeps the webview mounted while loading so listeners attach to the live element', () => {
    const { container } = render(<PDFPreview file_path='/docs/a.pdf' />);

    // Regression: the loading state used to early-return above the <webview>,
    // so the ref was null and no listener was ever attached.
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(getWebview(container)).toBeInTheDocument();
  });

  it('clears the loading state when the webview reports did-finish-load', () => {
    const { container } = render(<PDFPreview file_path='/docs/a.pdf' />);
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    emit(getWebview(container)!, 'did-finish-load');

    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
    expect(getWebview(container)).toBeInTheDocument();
  });

  it('surfaces the error state when the webview reports did-fail-load', () => {
    const { container } = render(<PDFPreview file_path='/docs/a.pdf' />);

    emit(getWebview(container)!, 'did-fail-load');

    expect(screen.getByText(/preview\.pdf\.loadFailed/)).toBeInTheDocument();
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
  });

  it('renders the missing-path error when neither file_path nor content is given', () => {
    const { container } = render(<PDFPreview />);

    expect(screen.getByText(/preview\.pdf\.pathMissing/)).toBeInTheDocument();
    expect(getWebview(container)).not.toBeInTheDocument();
  });

  it('recovers when the file path changes while a webview is already mounted', () => {
    const { container, rerender } = render(<PDFPreview file_path='/docs/a.pdf' />);
    emit(getWebview(container)!, 'did-finish-load');

    // Switching preview tabs re-runs the effect against a mounted webview. The
    // viewer used to unmount that webview on the next render, stranding the
    // listeners on a detached node so loading never cleared.
    rerender(<PDFPreview file_path='/docs/b.pdf' />);

    const nextWebview = getWebview(container);
    expect(nextWebview).toBeInTheDocument();

    emit(nextWebview!, 'did-finish-load');
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
  });

  it('does not re-enter loading when only the translator identity changes', () => {
    const { container, rerender } = render(<PDFPreview file_path='/docs/a.pdf' />);
    emit(getWebview(container)!, 'did-finish-load');

    // A language switch hands down a fresh `t`. The document itself did not
    // change, so an already-loaded webview will never fire did-finish-load
    // again — re-entering the loading state here would hang forever.
    i18n.t = (key: string) => key;
    rerender(<PDFPreview file_path='/docs/a.pdf' />);

    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
    expect(getWebview(container)).toBeInTheDocument();
  });
});
