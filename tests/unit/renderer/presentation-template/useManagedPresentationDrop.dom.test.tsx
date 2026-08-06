import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDragUpload } from '@/renderer/hooks/file/useDragUpload';
import { FileService } from '@/renderer/services/FileService';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { error: vi.fn() },
}));

const makeDropEvent = (files: File[]) =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    nativeEvent: {
      dataTransfer: {
        files: Object.assign(files, {
          length: files.length,
          item: (index: number) => files[index] ?? null,
        }),
      },
    },
  }) as unknown as React.DragEvent;

describe('useDragUpload managed presentation drops', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves eligible raw Files for managed grants and bypasses legacy path processing', async () => {
    const onManagedDrop = vi.fn().mockResolvedValue(undefined);
    const onFilesAdded = vi.fn();
    const processDroppedFiles = vi.spyOn(FileService, 'processDroppedFiles').mockResolvedValue([]);
    const droppedFile = new File(['quarterly results'], 'quarterly-results.xlsx');
    const { result } = renderHook(() =>
      useDragUpload({
        supportedExts: ['xlsx'],
        onFilesAdded,
        onManagedDrop,
        conversation_id: 'conv-1',
      })
    );

    act(() => {
      result.current.dragHandlers.onDragEnter(makeDropEvent([droppedFile]));
    });
    expect(result.current.isFileDragging).toBe(true);

    await act(async () => {
      await result.current.dragHandlers.onDrop(makeDropEvent([droppedFile]));
    });

    expect(result.current.isFileDragging).toBe(false);
    expect(onManagedDrop).toHaveBeenCalledWith([droppedFile]);
    expect(processDroppedFiles).not.toHaveBeenCalled();
    expect(onFilesAdded).not.toHaveBeenCalled();
  });
});
