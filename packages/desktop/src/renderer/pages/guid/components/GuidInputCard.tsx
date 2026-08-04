/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FilePreview from '@/renderer/components/media/FilePreview';
import UploadProgressBar from '@/renderer/components/media/UploadProgressBar';
import type { PresentationSourceDescriptor } from '@/common/types/office/presentationRun';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';
import { Button, Input } from '@arco-design/web-react';
import type { RefTextAreaType } from '@arco-design/web-react/es/Input';
import { CloseOne } from '@icon-park/react';
import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';
import GuidWorkspaceFootnote from './GuidWorkspaceFootnote';

type GuidInputCardProps = {
  focusRequestKey?: string;
  // Input state
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onPaste: React.ClipboardEventHandler;
  onFocus: () => void;
  onBlur: () => void;
  placeholder: string;

  // Styling
  isInputActive: boolean;
  isFileDragging: boolean;
  activeBorderColor: string;
  inactiveBorderColor: string;
  activeShadow: string;
  dragHandlers: React.HTMLAttributes<HTMLDivElement>;

  // Files
  files: string[];
  onRemoveFile: (path: string) => void;
  presentationSourceDescriptors?: readonly PresentationSourceDescriptor[];
  onRevokePresentationSource?: (grantId: string) => void;
  onManagedDrop?: (files: readonly File[]) => void | Promise<void>;

  // Action row
  actionRow: React.ReactNode;
  slashCommandMenu?: React.ReactNode;

  // Presentation templates
  templateChip?: React.ReactNode;
  presentationSourceNotice?: React.ReactNode;

  // Workspace
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace: () => void;
};

const GuidInputCard: React.FC<GuidInputCardProps> = ({
  focusRequestKey,
  input,
  onInputChange,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
  placeholder,
  isInputActive,
  isFileDragging,
  activeBorderColor,
  inactiveBorderColor,
  activeShadow,
  dragHandlers,
  files,
  onRemoveFile,
  presentationSourceDescriptors = [],
  onRevokePresentationSource,
  onManagedDrop,
  actionRow,
  slashCommandMenu,
  templateChip,
  presentationSourceNotice,
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
}) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { t } = useTranslation();
  const { compositionHandlers, isComposing } = useCompositionInput();
  const inputRef = useRef<RefTextAreaType | null>(null);
  const textareaAutoSize = isMobile ? { minRows: 2, maxRows: 8 } : { minRows: 2, maxRows: 20 };

  useEffect(() => {
    if (!focusRequestKey || isMobile) return;
    inputRef.current?.focus();
    inputRef.current?.dom.setSelectionRange(input.length, input.length);
  }, [focusRequestKey, input, isMobile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isComposing.current) return;
    onKeyDown(e);
  };

  const handleManagedDrop = useCallback<React.DragEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const droppedFiles = Array.from(event.dataTransfer.files ?? []);
      if (droppedFiles.length > 0) {
        void onManagedDrop?.(droppedFiles);
      }
    },
    [onManagedDrop]
  );
  const resolvedDragHandlers = onManagedDrop ? { ...dragHandlers, onDrop: handleManagedDrop } : dragHandlers;

  const borderColor = isFileDragging
    ? 'rgb(var(--primary-3))'
    : isInputActive
      ? activeBorderColor
      : inactiveBorderColor;

  return (
    <div
      className={`${styles.guidInputCardWrap} guid-input-card-shell relative rd-24px flex flex-col ${slashCommandMenu ? 'overflow-visible' : 'overflow-hidden'} transition-all duration-200 ${isFileDragging ? 'b b-solid border-dashed guid-input-card-shell--dragging' : ''}`}
      data-testid='guid-input-card'
      style={{
        zIndex: 1,
        transition: 'box-shadow 0.25s ease',
        width: isMobile ? 'calc(100% + 28px)' : undefined,
        marginLeft: isMobile ? -14 : undefined,
        marginRight: isMobile ? -14 : undefined,
        ...(isFileDragging
          ? {
              backgroundColor: 'var(--color-primary-light-1)',
              borderColor: 'rgb(var(--primary-3))',
              borderWidth: '1px',
            }
          : {
              boxShadow: isInputActive ? activeShadow : 'none',
            }),
      }}
      {...resolvedDragHandlers}
    >
      {/* inner white card — narrower than outer wrap */}
      <div
        className={`${styles.guidInputInner} relative p-12px flex flex-col bg-dialog-fill-0`}
        style={{
          transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
          borderColor: isFileDragging ? 'rgb(var(--primary-3))' : borderColor,
          boxShadow: isInputActive && !isFileDragging ? activeShadow : 'none',
        }}
      >
        <GuidWorkspaceFootnote
          workspaceDir={workspaceDir}
          onSelectWorkspace={onSelectWorkspace}
          onClearWorkspace={onClearWorkspace}
        />
        <Input.TextArea
          ref={inputRef}
          autoSize={textareaAutoSize}
          placeholder={placeholder}
          spellCheck={false}
          className={`text-14px focus:b-none rounded-xl !bg-transparent !b-none !resize-none !py-0 !pr-0 !pl-7px ${styles.lightPlaceholder}`}
          value={input}
          onChange={onInputChange}
          onPaste={onPaste}
          onFocus={onFocus}
          onBlur={onBlur}
          {...compositionHandlers}
          onKeyDown={handleKeyDown}
          data-testid='guid-input'
        />
        <div style={{ height: 12, flexShrink: 0 }} aria-hidden='true' />
        {templateChip}
        {presentationSourceNotice}
        {presentationSourceDescriptors.length > 0 && (
          <div className='flex flex-wrap items-center gap-8px mt-12px mb-12px' data-testid='presentation-source-list'>
            {presentationSourceDescriptors.map((descriptor) => (
              <div
                key={descriptor.grantId}
                className='flex items-center gap-4px rounded-6px bg-fill-2 px-8px py-4px text-12px text-t-primary'
              >
                <span>{descriptor.displayName}</span>
                {onRevokePresentationSource ? (
                  <Button
                    type='text'
                    size='mini'
                    className='!h-20px !w-20px !p-0'
                    aria-label={`${t('common.remove')} ${descriptor.displayName}`}
                    icon={<CloseOne theme='outline' size='12' />}
                    onClick={() => onRevokePresentationSource(descriptor.grantId)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className='flex flex-wrap items-center gap-8px mt-12px mb-12px'>
            {files.map((path) => (
              <FilePreview key={path} path={path} onRemove={() => onRemoveFile(path)} />
            ))}
          </div>
        )}
        <UploadProgressBar source='sendbox' />
        {actionRow}
        {slashCommandMenu && (
          <div className='absolute left-0 right-0 top-[calc(100%+4px)] z-70'>{slashCommandMenu}</div>
        )}
      </div>
    </div>
  );
};

export default GuidInputCard;
