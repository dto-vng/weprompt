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
  nameKey:
    | 'conversation.creativeStudio.library.shape.productStory.name'
    | 'conversation.creativeStudio.library.shape.featureTeaser.name'
    | 'conversation.creativeStudio.library.shape.recapReel.name';
  starterKey:
    | 'conversation.creativeStudio.library.shape.productStory.starter'
    | 'conversation.creativeStudio.library.shape.featureTeaser.starter'
    | 'conversation.creativeStudio.library.shape.recapReel.starter';
  shotCount: number;
  totalSeconds: number;
};

const SHAPES: StudioShape[] = [
  {
    nameKey: 'conversation.creativeStudio.library.shape.productStory.name',
    starterKey: 'conversation.creativeStudio.library.shape.productStory.starter',
    shotCount: 4,
    totalSeconds: 15,
  },
  {
    nameKey: 'conversation.creativeStudio.library.shape.featureTeaser.name',
    starterKey: 'conversation.creativeStudio.library.shape.featureTeaser.starter',
    shotCount: 3,
    totalSeconds: 10,
  },
  {
    nameKey: 'conversation.creativeStudio.library.shape.recapReel.name',
    starterKey: 'conversation.creativeStudio.library.shape.recapReel.starter',
    shotCount: 6,
    totalSeconds: 30,
  },
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
              name: t(shape.nameKey),
              count: shape.shotCount,
              seconds: shape.totalSeconds,
            })}
          </Button>
        ))}
      </div>
    </section>
  );
};
