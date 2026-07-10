import type { PreviewContentType } from '@/common/types/office/preview';

export const isOfficePreviewContentType = (contentType: PreviewContentType): boolean =>
  contentType === 'word' || contentType === 'excel';

export const nextOfficePreviewRevision = (revision: number | undefined): number => (revision ?? 0) + 1;
