/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Spin, Tag } from '@arco-design/web-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './SendBox/sendbox.css';

export interface ThoughtData {
  subject: string;
  description: string;
}

interface ThoughtDisplayProps {
  thought?: ThoughtData;
  style?: 'default' | 'compact';
  running?: boolean;
  onStop?: () => void;
}

const ThoughtDisplay: React.FC<ThoughtDisplayProps> = ({
  thought,
  style = 'default',
  running = false,
  onStop: _onStop,
}) => {
  const { t } = useTranslation();

  // Format elapsed time with localized units
  const formatElapsedTime = (seconds: number): string => {
    const sUnit = t('common.unit.second_short', { defaultValue: 's' });
    const mUnit = t('common.unit.minute_short', { defaultValue: 'm' });

    if (seconds < 60) {
      return `${seconds}${sUnit}`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}${mUnit} ${remainingSeconds}${sUnit}`;
  };

  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  // Timer for elapsed time
  useEffect(() => {
    if (!running && !thought?.subject) {
      setElapsedTime(0);
      return;
    }

    startTimeRef.current = Date.now();
    setElapsedTime(0);

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [running, thought?.subject]);

  const className = [
    'thought-display',
    running ? 'thought-display--running' : '',
    style === 'compact' ? 'thought-display--compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Hide when not running and no thought data
  if (!thought?.subject && !running) {
    return null;
  }

  // Loading-only mode: running without thought data (used by ACP when thinking is inline)
  if (running && !thought?.subject) {
    return (
      <div data-testid='thought-display' className={className}>
        <Spin size={14} />
        <span className='thought-display__label'>
          {t('conversation.chat.processing')}
          <span className='thought-display__elapsed'>({formatElapsedTime(elapsedTime)})</span>
        </span>
      </div>
    );
  }

  // Full thought display mode: used by non-ACP platforms that still pass thought data
  const showDescription = thought?.description && thought.description !== thought.subject;

  return (
    <div data-testid='thought-display' className={className}>
      <div className='thought-display__content'>
        {running && <Spin size={14} />}
        <Tag color='arcoblue' size='small'>
          {thought?.subject}
        </Tag>
        {showDescription && <span className='thought-display__description'>{thought?.description}</span>}
        {running && <span className='thought-display__elapsed'>({formatElapsedTime(elapsedTime)})</span>}
      </div>
    </div>
  );
};

export default ThoughtDisplay;
