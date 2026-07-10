/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OfficeArtifactEdit, OfficeArtifactInspection } from '@/common/types/office/artifactEditor';
import { Button, Input, Popover, Tooltip, Typography } from '@arco-design/web-react';
import { EditTwo, TextBold, TextItalic, TextUnderline } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OfficeArtifactEditorStatus, OfficeSelectionDirection } from './useOfficeArtifactEditor';
import styles from './OfficeArtifactToolbar.module.css';

export type OfficeSelectionEditorProps = {
  inspection: OfficeArtifactInspection | null;
  status: OfficeArtifactEditorStatus;
  apply: (edit: OfficeArtifactEdit) => Promise<boolean> | boolean | void;
  moveSelection: (direction: OfficeSelectionDirection) => void;
};

const ICON_SIZE = 16;

export const OfficeSelectionEditor: React.FC<OfficeSelectionEditorProps> = ({
  inspection,
  status,
  apply,
  moveSelection,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [wordEditorOpen, setWordEditorOpen] = useState(false);
  const saving = status === 'saving';

  useEffect(() => {
    setDraft(inspection?.kind === 'word' ? inspection.selectedText : (inspection?.cells[0]?.input ?? ''));
    setWordEditorOpen(false);
  }, [inspection]);

  if (!inspection) return null;

  if (inspection.kind === 'word') {
    const unchanged = draft === inspection.selectedText;
    const applyReplacement = async (): Promise<void> => {
      const applied = await apply({ kind: 'replaceText', value: draft });
      if (applied !== false) setWordEditorOpen(false);
    };
    const resetReplacement = (): void => {
      setDraft(inspection.selectedText);
      setWordEditorOpen(false);
    };
    const editor = (
      <div className={styles.wordEditor}>
        <Input.TextArea
          aria-label={t('preview.office.editor.editSelection')}
          value={draft}
          rows={4}
          onChange={setDraft}
        />
        <div className={styles.wordEditorActions}>
          <Button size='small' disabled={saving} onClick={resetReplacement}>
            {t('preview.office.editor.cancel')}
          </Button>
          <Button
            type='primary'
            size='small'
            loading={saving}
            disabled={saving || !inspection.canReplace || unchanged}
            onClick={() => void applyReplacement()}
          >
            {t('preview.office.editor.apply')}
          </Button>
        </div>
      </div>
    );

    return (
      <div className={styles.selectionEditor}>
        <Popover
          trigger='click'
          position='bl'
          popupVisible={wordEditorOpen}
          onVisibleChange={setWordEditorOpen}
          content={editor}
          unmountOnExit
        >
          <Button
            size='small'
            icon={<EditTwo size={ICON_SIZE} />}
            disabled={!inspection.canReplace || saving}
            className={styles.actionButton}
          >
            <span className={styles.actionLabel}>{t('preview.office.editor.editSelection')}</span>
          </Button>
        </Popover>
        {inspection.canFormat && (
          <div className={styles.formattingActions}>
            <Tooltip content={t('preview.office.editor.bold')}>
              <Button
                type={inspection.formatting.bold ? 'secondary' : 'text'}
                size='small'
                aria-label={t('preview.office.editor.bold')}
                icon={<TextBold size={ICON_SIZE} />}
                disabled={saving}
                onClick={() =>
                  void apply({ kind: 'formatText', property: 'bold', enabled: !inspection.formatting.bold })
                }
              />
            </Tooltip>
            <Tooltip content={t('preview.office.editor.italic')}>
              <Button
                type={inspection.formatting.italic ? 'secondary' : 'text'}
                size='small'
                aria-label={t('preview.office.editor.italic')}
                icon={<TextItalic size={ICON_SIZE} />}
                disabled={saving}
                onClick={() =>
                  void apply({ kind: 'formatText', property: 'italic', enabled: !inspection.formatting.italic })
                }
              />
            </Tooltip>
            <Tooltip content={t('preview.office.editor.underline')}>
              <Button
                type={inspection.formatting.underline ? 'secondary' : 'text'}
                size='small'
                aria-label={t('preview.office.editor.underline')}
                icon={<TextUnderline size={ICON_SIZE} />}
                disabled={saving}
                onClick={() =>
                  void apply({
                    kind: 'formatText',
                    property: 'underline',
                    enabled: !inspection.formatting.underline,
                  })
                }
              />
            </Tooltip>
          </div>
        )}
      </div>
    );
  }

  if (inspection.cells.length !== 1) {
    return (
      <Typography.Text className={styles.rangeLabel} ellipsis>
        {inspection.range}
      </Typography.Text>
    );
  }

  const originalInput = inspection.cells[0].input;
  const commitFormula = (): void => {
    if (!inspection.canEdit || saving || draft === originalInput) return;
    void apply({ kind: 'setCell', input: draft });
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitFormula();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(originalInput);
      return;
    }

    const direction: OfficeSelectionDirection | undefined =
      event.key === 'Tab'
        ? event.shiftKey
          ? 'left'
          : 'right'
        : event.key === 'ArrowUp'
          ? 'up'
          : event.key === 'ArrowDown'
            ? 'down'
            : event.key === 'ArrowLeft'
              ? 'left'
              : event.key === 'ArrowRight'
                ? 'right'
                : undefined;
    if (!direction) return;
    event.preventDefault();
    moveSelection(direction);
  };

  return (
    <div className={styles.formulaEditor}>
      <Typography.Text className={styles.cellLabel}>{inspection.range}</Typography.Text>
      <Input
        aria-label={t('preview.office.editor.formulaBar')}
        value={draft}
        disabled={!inspection.canEdit || saving}
        className={styles.formulaInput}
        onChange={setDraft}
        onKeyDown={handleKeyDown}
      />
      <Button
        type='primary'
        size='small'
        loading={saving}
        disabled={saving || !inspection.canEdit || draft === originalInput}
        className={styles.formulaApply}
        onClick={commitFormula}
      >
        <span className={styles.actionLabel}>{t('preview.office.editor.apply')}</span>
      </Button>
    </div>
  );
};
