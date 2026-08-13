/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  extractCommand,
  isDestructiveCommand,
  summarizePermission,
} from '@/renderer/pages/conversation/Messages/components/permissionIntent';

describe('extractCommand', () => {
  it('strips an "Execute:"-style label and trims', () => {
    expect(extractCommand('Execute: rm "a.html"')).toBe('rm "a.html"');
    expect(extractCommand('  run:  ls -la  ')).toBe('ls -la');
    expect(extractCommand('rm x')).toBe('rm x');
    expect(extractCommand(undefined)).toBe('');
  });
});

describe('isDestructiveCommand', () => {
  it('flags deletes and irreversible operations', () => {
    expect(isDestructiveCommand('rm "/Users/me/Downloads/Project Home Screen.html"')).toBe(true);
    expect(isDestructiveCommand('rm -rf build')).toBe(true);
    expect(isDestructiveCommand('sudo rm foo')).toBe(true);
    expect(isDestructiveCommand('git reset --hard HEAD~1')).toBe(true);
    expect(isDestructiveCommand('git clean -fd')).toBe(true);
  });

  it('does not flag ordinary commands', () => {
    expect(isDestructiveCommand('ls -la')).toBe(false);
    expect(isDestructiveCommand('cat package.json')).toBe(false);
    expect(isDestructiveCommand('')).toBe(false);
  });

  it('errs toward caution: a command that merely mentions rm still flags', () => {
    // Conservative by design — a false positive is a harmless extra caution,
    // and the exact command is always shown so the user can judge.
    expect(isDestructiveCommand('grep -r rm .')).toBe(true);
  });
});

describe('summarizePermission', () => {
  it('summarizes a destructive command and keeps the raw command', () => {
    const summary = summarizePermission({ action: 'exec', command: 'Execute: rm "a.html"' });
    expect(summary.destructive).toBe(true);
    expect(summary.intentKey).toBe('messages.permission.intent.destructive');
    expect(summary.command).toBe('rm "a.html"');
  });

  it('maps non-destructive actions to plain intents', () => {
    expect(summarizePermission({ action: 'edit' }).intentKey).toBe('messages.permission.intent.edit');
    expect(summarizePermission({ action: 'read' }).intentKey).toBe('messages.permission.intent.read');
    expect(summarizePermission({ action: 'fetch' }).intentKey).toBe('messages.permission.intent.fetch');
    expect(summarizePermission({ action: 'mcp' }).intentKey).toBe('messages.permission.intent.tool');
    expect(summarizePermission({ action: 'exec', command: 'ls -la' }).intentKey).toBe('messages.permission.intent.run');
  });

  it('falls back to a generic intent when nothing is known', () => {
    const summary = summarizePermission({});
    expect(summary.intentKey).toBe('messages.permission.intent.generic');
    expect(summary.destructive).toBe(false);
    expect(summary.command).toBe('');
  });
});
