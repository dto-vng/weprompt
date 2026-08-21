import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import GuidInputCard from '@/renderer/pages/guid/components/GuidInputCard';
import type { PresentationSourceDescriptor } from '@/common/types/office/presentationRun';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/chat/useCompositionInput', () => ({
  useCompositionInput: () => ({
    createCompositionValueSync: () => vi.fn(),
    compositionHandlers: {},
    isComposing: { current: false },
  }),
}));

vi.mock('@/renderer/components/media/FilePreview', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/media/UploadProgressBar', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/guid/components/GuidWorkspaceFootnote', () => ({
  default: () => <div data-testid='composer-context'>Project context</div>,
}));

describe('GuidInputCard', () => {
  const renderInputCard = (overrides: Partial<React.ComponentProps<typeof GuidInputCard>> = {}) =>
    render(
      <GuidInputCard
        input=''
        onInputChange={vi.fn()}
        onKeyDown={vi.fn()}
        onPaste={vi.fn()}
        onFocus={vi.fn()}
        onBlur={vi.fn()}
        placeholder='Message'
        isInputActive={false}
        isFileDragging={false}
        activeBorderColor='#000'
        inactiveBorderColor='#ccc'
        activeShadow='none'
        dragHandlers={{}}
        files={[]}
        onRemoveFile={vi.fn()}
        actionRow={<div>Actions</div>}
        workspaceDir='/Users/me/Finance Close'
        onSelectWorkspace={vi.fn()}
        onClearWorkspace={vi.fn()}
        {...overrides}
      />
    );

  it('places project context above the message field inside the composer', () => {
    renderInputCard();

    const context = screen.getByTestId('composer-context');
    const messageField = screen.getByPlaceholderText('Message');

    expect(context.compareDocumentPosition(messageField)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(context.parentElement).toContainElement(messageField);
  });

  it('renders path-free managed descriptors and revokes the selected grant', () => {
    const onRevokePresentationSource = vi.fn();
    const descriptor: PresentationSourceDescriptor = {
      grantId: 'grant-1',
      displayName: 'Quarterly Revenue.xlsx',
      format: 'xlsx',
      sourceKind: 'native-picker',
      byteLength: 2048,
      sha256: 'secret-source-hash',
      expiresAt: '2026-08-04T12:00:00.000Z',
    };

    renderInputCard({ presentationSourceDescriptors: [descriptor], onRevokePresentationSource });

    expect(screen.getByText('Quarterly Revenue.xlsx')).toBeInTheDocument();
    expect(screen.queryByText('secret-source-hash')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.remove Quarterly Revenue.xlsx' }));
    expect(onRevokePresentationSource).toHaveBeenCalledWith('grant-1');
  });

  it('forwards actual dropped File objects to the managed handler without invoking legacy drop', () => {
    const onManagedDrop = vi.fn();
    const legacyDrop = vi.fn();
    const source = new File(['revenue'], 'revenue.csv', { type: 'text/csv' });
    renderInputCard({ onManagedDrop, dragHandlers: { onDrop: legacyDrop } });

    fireEvent.drop(screen.getByTestId('guid-input-card'), { dataTransfer: { files: [source] } });

    expect(onManagedDrop).toHaveBeenCalledWith([source]);
    expect(legacyDrop).not.toHaveBeenCalled();
  });

  it('does not invoke either drop handler when an eligible drop contains no files', () => {
    const onManagedDrop = vi.fn();
    const legacyDrop = vi.fn();
    renderInputCard({ onManagedDrop, dragHandlers: { onDrop: legacyDrop } });

    fireEvent.drop(screen.getByTestId('guid-input-card'), { dataTransfer: { files: [] } });

    expect(onManagedDrop).not.toHaveBeenCalled();
    expect(legacyDrop).not.toHaveBeenCalled();
  });

  it('keeps managed descriptors visible but immutable while a Guid handoff is pending', () => {
    const onManagedDrop = vi.fn();
    const onRevokePresentationSource = vi.fn();
    const descriptor: PresentationSourceDescriptor = {
      grantId: 'grant-1',
      displayName: 'Quarterly Revenue.xlsx',
      format: 'xlsx',
      sourceKind: 'native-picker',
      byteLength: 2048,
      sha256: 'a'.repeat(64),
      expiresAt: '2026-08-05T12:00:00.000Z',
    };
    const source = new File(['revenue'], 'revenue.csv', { type: 'text/csv' });
    renderInputCard({
      managedPresentationPending: true,
      onManagedDrop,
      onRevokePresentationSource,
      presentationSourceDescriptors: [descriptor],
    });

    fireEvent.drop(screen.getByTestId('guid-input-card'), { dataTransfer: { files: [source] } });
    fireEvent.click(screen.getByRole('button', { name: 'common.remove Quarterly Revenue.xlsx' }));

    expect(screen.getByText('Quarterly Revenue.xlsx')).toBeInTheDocument();
    expect(onManagedDrop).not.toHaveBeenCalled();
    expect(onRevokePresentationSource).not.toHaveBeenCalled();
  });
});
