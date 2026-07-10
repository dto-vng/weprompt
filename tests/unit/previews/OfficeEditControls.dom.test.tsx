import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'preview.office.externalEdit.editInDefaultApp': 'Edit in default app',
        'preview.office.externalEdit.editInDefaultAppTooltip': 'Open this workspace file in its default application',
        'preview.office.externalEdit.refreshPreview': 'Refresh preview',
        'preview.office.externalEdit.refreshPreviewTooltip': 'Reload this Forge preview from the workspace file',
        'preview.office.externalEdit.revealInFolder': 'Show in folder',
        'preview.office.externalEdit.revealInFolderTooltip': 'Show this workspace file in its folder',
        'preview.office.externalEdit.status.ready': 'Ready to edit in your default app',
        'preview.office.externalEdit.status.opening': 'Opening default app...',
        'preview.office.externalEdit.status.editingExternally': 'Editing externally',
        'preview.office.externalEdit.status.refreshing': 'Refreshing preview...',
        'preview.office.externalEdit.status.refreshed': 'Preview refreshed',
        'preview.office.externalEdit.status.openFailed': 'Could not open the default app',
        'preview.office.externalEdit.status.refreshFailed':
          'Preview could not refresh. The file may be newer than this view.',
      };
      return translations[key] ?? key;
    },
  }),
}));

import OfficeEditControls from '@/renderer/pages/conversation/Preview/components/PreviewPanel/OfficeEditControls';

describe('OfficeEditControls', () => {
  it('starts external editing when the user activates the primary action', () => {
    const onEditInDefaultApp = vi.fn();
    render(
      <OfficeEditControls
        state='ready'
        onEditInDefaultApp={onEditInDefaultApp}
        onRefreshPreview={vi.fn()}
        onRevealInFolder={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit in default app' }));

    expect(onEditInDefaultApp).toHaveBeenCalledOnce();
  });

  it('disables manual refresh while a refresh is in progress', () => {
    render(
      <OfficeEditControls
        state='refreshing'
        onEditInDefaultApp={vi.fn()}
        onRefreshPreview={vi.fn()}
        onRevealInFolder={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Refresh preview' })).toBeDisabled();
  });

  it('reveals the workspace file when the user requests the recovery route', () => {
    const onRevealInFolder = vi.fn();
    render(
      <OfficeEditControls
        state='refreshFailed'
        onEditInDefaultApp={vi.fn()}
        onRefreshPreview={vi.fn()}
        onRevealInFolder={onRevealInFolder}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show in folder' }));

    expect(onRevealInFolder).toHaveBeenCalledOnce();
  });

  it('states that a failed refresh can leave the preview older than the file', () => {
    render(
      <OfficeEditControls
        state='refreshFailed'
        onEditInDefaultApp={vi.fn()}
        onRefreshPreview={vi.fn()}
        onRevealInFolder={vi.fn()}
      />
    );

    expect(screen.getByText('Preview could not refresh. The file may be newer than this view.')).toBeInTheDocument();
  });
});
