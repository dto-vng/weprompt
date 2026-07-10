import type { OfficeArtifactInspection } from '@/common/types/office/artifactEditor';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => translations[key] ?? key }),
}));

import { OfficeArtifactToolbar } from '@/renderer/pages/conversation/Preview/components/ArtifactEditor/OfficeArtifactToolbar';

const translations: Record<string, string> = {
  'preview.office.editor.editSelection': 'Edit selection',
  'preview.office.editor.formulaBar': 'Formula bar',
  'preview.office.editor.apply': 'Apply',
  'preview.office.editor.cancel': 'Cancel',
  'preview.office.editor.bold': 'Bold',
  'preview.office.editor.italic': 'Italic',
  'preview.office.editor.underline': 'Underline',
  'preview.office.editor.undo': 'Undo',
  'preview.office.editor.askForge': 'Ask Forge',
  'preview.office.editor.openDesktop': 'Open in desktop app',
  'preview.office.editor.openedDesktop': 'Opened in desktop app',
  'preview.office.editor.more': 'More',
  'preview.office.editor.reveal': 'Reveal in folder',
  'preview.office.editor.refresh': 'Refresh preview',
  'preview.office.editor.saving': 'Saving',
  'preview.office.editor.saved': 'Saved to workspace',
  'preview.office.editor.saveFailed': 'Save failed',
  'preview.office.editor.fileChanged': 'File changed elsewhere',
  'preview.office.editor.unsupported': 'This selection needs the desktop app',
  'common.download': 'Download',
};

const excelInspection: OfficeArtifactInspection = {
  kind: 'excel',
  range: 'Forecast!B4',
  cells: [{ path: '/Forecast/B4', displayText: '6', input: '=SUM(A1:A3)' }],
  canEdit: true,
};

const wordInspection: OfficeArtifactInspection = {
  kind: 'word',
  path: '/body/p[1]',
  selectedText: 'Revenue',
  start: 0,
  end: 7,
  canReplace: true,
  canFormat: true,
  formatting: { bold: false, italic: true, underline: false },
};

const createProps = (overrides: Partial<React.ComponentProps<typeof OfficeArtifactToolbar>> = {}) => ({
  inspection: excelInspection,
  status: 'ready' as const,
  undoDepth: 1,
  apply: vi.fn(),
  undo: vi.fn(),
  askForge: vi.fn(),
  openInDesktopApp: vi.fn(),
  download: vi.fn(),
  revealInFolder: vi.fn(),
  refresh: vi.fn(),
  moveSelection: vi.fn(),
  ...overrides,
});

describe('OfficeArtifactToolbar', () => {
  afterEach(() => document.body.replaceChildren());

  it('commits an Excel formula with Enter and cancels with Escape', async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<OfficeArtifactToolbar {...props} />);
    const input = screen.getByRole('textbox', { name: 'Formula bar' });

    await user.clear(input);
    await user.type(input, '=A1*2{Enter}');
    expect(props.apply).toHaveBeenCalledWith({ kind: 'setCell', input: '=A1*2' });
    await user.type(input, 'discard{Escape}');
    expect(input).toHaveValue('=SUM(A1:A3)');
  });

  it('moves the spreadsheet selection with Tab, Shift+Tab, and arrow keys', () => {
    const props = createProps();
    render(<OfficeArtifactToolbar {...props} />);
    const input = screen.getByRole('textbox', { name: 'Formula bar' });

    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(props.moveSelection).toHaveBeenNthCalledWith(1, 'right');
    expect(props.moveSelection).toHaveBeenNthCalledWith(2, 'left');
    expect(props.moveSelection).toHaveBeenNthCalledWith(3, 'down');
  });

  it('applies supported Word formatting directly from accessible controls', async () => {
    const user = userEvent.setup();
    const props = createProps({ inspection: wordInspection });
    render(<OfficeArtifactToolbar {...props} />);

    await user.click(screen.getByRole('button', { name: 'Bold' }));
    await user.click(screen.getByRole('button', { name: 'Italic' }));

    expect(props.apply).toHaveBeenNthCalledWith(1, { kind: 'formatText', property: 'bold', enabled: true });
    expect(props.apply).toHaveBeenNthCalledWith(2, { kind: 'formatText', property: 'italic', enabled: false });
  });

  it('replaces a Word selection and resets a cancelled draft', async () => {
    const user = userEvent.setup();
    const props = createProps({ inspection: wordInspection });
    render(<OfficeArtifactToolbar {...props} />);
    await user.click(screen.getByRole('button', { name: 'Edit selection' }));
    let input = await screen.findByRole('textbox', { name: 'Edit selection' });

    fireEvent.change(input, { target: { value: 'Gross profit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Edit selection' }));
    input = await screen.findByRole('textbox', { name: 'Edit selection' });
    expect(input).toHaveValue('Revenue');

    fireEvent.change(input, { target: { value: 'Net revenue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(props.apply).toHaveBeenCalledWith({ kind: 'replaceText', value: 'Net revenue' });
  });

  it('exposes secondary file actions from More', async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<OfficeArtifactToolbar {...props} />);

    await user.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(await screen.findByText('Refresh preview'));

    expect(props.refresh).toHaveBeenCalledOnce();
  });

  it('announces successful saves only when the status is saved', () => {
    const props = createProps({ status: 'saving' });
    const view = render(<OfficeArtifactToolbar {...props} />);
    expect(screen.getByText('Saving')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText('Saved to workspace')).not.toBeInTheDocument();

    view.rerender(<OfficeArtifactToolbar {...props} status='saved' />);

    expect(screen.getByText('Saved to workspace')).toHaveAttribute('aria-live', 'polite');
  });

  it('disables destructive editing for a multi-cell selection while keeping Ask Forge available', () => {
    const inspection: OfficeArtifactInspection = {
      kind: 'excel',
      range: 'Forecast!B4:C4',
      cells: [
        { path: '/Forecast/B4', displayText: '6', input: '6' },
        { path: '/Forecast/C4', displayText: '12', input: '12' },
      ],
      canEdit: false,
    };
    render(<OfficeArtifactToolbar {...createProps({ inspection })} />);

    expect(screen.queryByRole('textbox', { name: 'Formula bar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask Forge' })).toBeEnabled();
    expect(screen.getByText('This selection needs the desktop app')).toHaveAttribute('role', 'alert');
  });
});
