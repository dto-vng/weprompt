import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../../packages/desktop/src/renderer');
const CHAT_LAYOUT = readFileSync(resolve(SRC, 'pages/conversation/components/ChatLayout/index.tsx'), 'utf8');
const CONTEXT = readFileSync(resolve(SRC, 'pages/conversation/Workspace/filesPaneContext.tsx'), 'utf8');

// C-24 — a general in-pane browser with a URL bar, matching the upstream pane's Browser entry.
// Nothing new was written for the browser itself: WebviewHost already provides the URL input,
// back/forward, reload and Escape-to-reset, and is the same component the extension settings
// pages use. This is a mount plus a tab.
//
// Verified live: four tabs render, and opening Browser mounts a <webview> with a URL input
// reading about:blank. NOT verified: typing a URL and navigating — a synthetic Enter did not
// drive the component's submit path, which is a harness limit rather than evidence of a defect.
describe('artifact pane browser tab', () => {
  it('adds browser to the pane view union', () => {
    expect(CONTEXT).toMatch(/'files' \| 'changes' \| 'context' \| 'preview' \| 'browser'/);
  });

  it('renders a fourth tab with a translated label', () => {
    expect(CHAT_LAYOUT).toMatch(/PANE_TAB_ORDER = \['files', 'changes', 'context', 'preview', 'browser'\] as const/);
    expect(CHAT_LAYOUT).toMatch(/browser: 'conversation\.workspace\.changes\.browserTab'/);
  });

  it('shows the navigation bar, which is the point of a general browser', () => {
    expect(CHAT_LAYOUT).toMatch(/<WebviewHost[\s\S]{0,220}showNavBar/);
  });

  it('isolates and persists its session', () => {
    expect(CHAT_LAYOUT).toMatch(/partition='persist:workspace-pane-browser'/);
  });

  it('does not pay for a webview until the browser is first opened', () => {
    expect(CHAT_LAYOUT).toMatch(/\{browserEverOpened && \(/);
  });

  it('starts blank rather than defaulting a homepage or search provider', () => {
    // Picking one is a product and privacy decision; the URL bar is live from first paint.
    expect(CHAT_LAYOUT).toMatch(/const BROWSER_START_URL = 'about:blank'/);
  });
});
