/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessagePlan } from '@/common/chat/chatLib';
import { Badge, Button } from '@arco-design/web-react';
import { IconCheckCircle, IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

const MessagePlan: React.FC<{ message: IMessagePlan }> = ({ message }) => {
  const { t } = useTranslation();
  const [showMore, setShowMore] = useState(true);
  const panelId = useId();
  const title = t('messages.plan.title');

  return (
    <div>
      <Button
        type='text'
        size='mini'
        // `.arco-btn` brings its own display and paddings, which would reflow this row. The
        // badge's own `.arco-badge-status-text` rule beats the wrapper colour, so it is
        // overridden too — with a token this time, not the hex it used to carry.
        className='!flex items-center gap-10px !h-auto !p-0 !text-t-secondary hover:!text-t-primary ![&_.arco-badge-status-text]:text-t-secondary'
        aria-expanded={showMore}
        aria-controls={panelId}
        onClick={() => setShowMore(!showMore)}
      >
        <Badge status='default' text={title} />
        {showMore ? <IconDown /> : <IconRight />}
      </Button>
      {showMore && (
        <div id={panelId} className='p-l-20px flex flex-col gap-8px pt-8px'>
          {message.content.entries.map((item, index) => {
            return (
              // Index-qualified: two plan entries can legitimately carry the same text, and a
              // bare content key would collide between them.
              <div key={`${index}-${item.content}`} className='flex flex-row items-center text-t-secondary gap-8px'>
                {item.status === 'completed' ? (
                  <IconCheckCircle fontSize={22} strokeWidth={4} className='flex text-success' />
                ) : (
                  <div className='size-22px flex items-center justify-center'>
                    <div className='size-14px rd-10px b-2px b-solid border-4'></div>
                  </div>
                )}
                <span>{item.content} </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MessagePlan;
