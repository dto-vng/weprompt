/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider API keys are secrets and must not render in the clear. These tests pin both
 * halves of that:
 *
 * - `AddPlatformModal` types one fresh key, so it uses a plain masked `Input.Password`.
 * - `EditModeModal` displays keys that are ALREADY SAVED, and its control is deliberately
 *   multi-line: `settings.multiApiKeyEditTip` promises "multiple API Keys, one per line,
 *   system will auto-rotate". `Input.Password` is single-line and would silently destroy
 *   that rotation, so the textarea stays and is hidden behind a reveal instead.
 *
 * The newline round-trip test is the load-bearing one — it is what proves the masking work
 * did not break multi-key rotation.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchModelListInvoke = vi.fn();
const mutate = vi.fn();

// jsdom does not implement matchMedia; arco-design's responsive Grid needs it.
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
    t: (key: string, params?: Record<string, unknown> | string) => {
      if (typeof params === 'string') return params;
      return key;
    },
  }),
}));

// AionModal reads ThemeContext for font scaling; a full ThemeProvider would pull in
// IPC-backed theme loading.
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      fetchModelList: { invoke: (...args: unknown[]) => fetchModelListInvoke(...args) },
    },
  },
}));

vi.mock('@renderer/hooks/agent/useModeModeList', () => ({
  default: () => ({ data: { models: [] }, mutate, isLoading: false }),
}));

vi.mock('@/renderer/utils/model/modelPlatforms', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/utils/model/modelPlatforms')>(
    '@/renderer/utils/model/modelPlatforms'
  );
  // Real platform catalogue; only the logo lookup is stubbed so no asset is fetched.
  return { ...actual, getProviderLogo: () => null };
});

vi.mock('@renderer/hooks/system/useProtocolDetection', () => ({
  default: () => ({ isDetecting: false, result: null, detect: vi.fn(), reset: vi.fn() }),
}));

import AddPlatformModal from '@/renderer/pages/settings/components/AddPlatformModal';
import EditModeModal from '@/renderer/pages/settings/components/EditModeModal';

const PROVIDER = {
  id: 'p1',
  platform: 'openai',
  name: 'Test Provider',
  base_url: 'https://example.test/v1',
  api_key: 'key-one\nkey-two',
  models: ['gpt-4o'],
};

const renderEditModal = (onChange: (data: unknown) => void) =>
  render(
    <EditModeModal
      modalProps={{ visible: true }}
      modalCtrl={{ close: vi.fn() }}
      data={PROVIDER as never}
      onChange={onChange as never}
    />
  );

/**
 * The api_key control. Arco's Form.Item derives `<field>_input` as the control id, which also
 * pins that the id reaches the real element — the label's htmlFor depends on it.
 */
const apiKeyField = () => document.querySelector('#api_key_input');

describe('provider API key masking', () => {
  beforeEach(() => {
    fetchModelListInvoke.mockReset();
    fetchModelListInvoke.mockResolvedValue({ models: [] });
    mutate.mockReset();
  });

  it('round-trips a newline-separated multi-key value through submit intact', async () => {
    const onChange = vi.fn();
    renderEditModal(onChange);

    await waitFor(() => {
      expect(screen.getByText('common.save')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });
    // Both keys survive, separated by the newline the auto-rotation contract depends on.
    expect(onChange.mock.calls[0][0].api_key).toBe('key-one\nkey-two');
  });

  it('keeps an edited three-line value multi-line through submit', async () => {
    const onChange = vi.fn();
    renderEditModal(onChange);

    await waitFor(() => {
      expect(apiKeyField()).not.toBeNull();
    });

    // Editing requires revealing first — the masked control is read-only on purpose, so that
    // typing against dots can never overwrite the stored keys with the mask.
    expect((apiKeyField() as HTMLTextAreaElement).readOnly).toBe(true);
    fireEvent.click(screen.getByText('settings.apiKeyReveal'));

    fireEvent.change(apiKeyField()!, { target: { value: 'alpha\nbeta\ngamma' } });
    fireEvent.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });
    expect(onChange.mock.calls[0][0].api_key).toBe('alpha\nbeta\ngamma');
  });

  it('does not put the stored keys on screen until the user reveals them', async () => {
    renderEditModal(vi.fn());

    await waitFor(() => {
      expect(apiKeyField()).not.toBeNull();
    });

    // Hidden by default: the saved keys are not readable anywhere in the dialog.
    expect(document.body.textContent).not.toContain('key-one');
    const hidden = apiKeyField() as HTMLTextAreaElement;
    expect(hidden.value).not.toContain('key-one');

    fireEvent.click(screen.getByText('settings.apiKeyReveal'));

    await waitFor(() => {
      expect((apiKeyField() as HTMLTextAreaElement).value).toBe('key-one\nkey-two');
    });
  });

  it('masks the API key on the add-provider form, with a working visibility toggle', async () => {
    render(<AddPlatformModal modalProps={{ visible: true }} modalCtrl={{ close: vi.fn() }} onChange={vi.fn()} />);

    // At add time the field holds a single key, so a plain single-line Password is correct.
    // Anchored by id, because the Bedrock credential fields in this same form are Password
    // controls too and a bare input[type=password] query would not distinguish them.
    const field = await waitFor(() => {
      const input = apiKeyField();
      expect(input).not.toBeNull();
      return input as HTMLInputElement;
    });
    expect(field).toHaveAttribute('type', 'password');

    const toggle = field.closest('.arco-input-group')?.querySelector('.arco-input-password-visibility-icon');
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);

    await waitFor(() => {
      expect(apiKeyField()).toHaveAttribute('type', 'text');
    });
  });
});
