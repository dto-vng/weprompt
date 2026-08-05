/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import styles from './StudioLibrary.module.css';

export type StudioShape = {
  shotCount: number;
  totalSeconds: number;
};

const SHAPES: StudioShape[] = [
  { shotCount: 3, totalSeconds: 15 },
  { shotCount: 5, totalSeconds: 30 },
  { shotCount: 8, totalSeconds: 45 },
];

export type ShapeTemplatesProps = {
  disabled: boolean;
  onCreate: (shape: StudioShape) => Promise<void>;
};

export const ShapeTemplates: React.FC<ShapeTemplatesProps> = ({ disabled, onCreate }) => {
  const { t } = useTranslation();
  return (
    <section aria-labelledby='studio-shapes-title' className={styles.shapes}>
      <h2 id='studio-shapes-title' className={styles.sectionTitle}>
        {t('conversation.creativeStudio.library.shape.title')}
      </h2>
      <div className={styles.shapeChips}>
        {SHAPES.map((shape) => (
          <Button
            key={`${shape.shotCount}-${shape.totalSeconds}`}
            className={styles.shapeChip}
            size='small'
            disabled={disabled}
            onClick={() => void onCreate(shape)}
          >
            {t('conversation.creativeStudio.library.shape.label', {
              count: shape.shotCount,
              seconds: shape.totalSeconds,
            })}
          </Button>
        ))}
      </div>
    </section>
  );
};
