/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input } from '@arco-design/web-react';
import { PreviewClose, PreviewOpen } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** 每行遮蔽成固定长度的圆点，泄露行数但不泄露长度 / Fixed-width dots per line: leaks the key
 * count (which the user needs to see) but not key length. */
const MASK = '••••••••••••••••';

interface MaskedApiKeyTextAreaProps {
  /** 由 Arco Form.Item 注入 / Injected by Arco Form.Item */
  value?: string;
  /** 由 Arco Form.Item 注入 / Injected by Arco Form.Item */
  onChange?: (value: string) => void;
  /**
   * 同样由 Arco Form.Item 注入（如 `api_key_input`），必须透传到真正的 textarea 上，
   * 否则 label 的 htmlFor 指向一个不存在的元素，点击标题无法聚焦、读屏也丢失关联。
   * Also injected by Arco Form.Item (e.g. `api_key_input`). It must reach the real textarea,
   * or the label's htmlFor points at nothing — clicking the label stops focusing the field and
   * screen readers lose the association.
   */
  id?: string;
  placeholder?: string;
  rows?: number;
}

/**
 * 遮蔽的多行 API Key 输入框 / Masked multi-line API key input.
 *
 * 为什么不用 `Input.Password`：这个字段支持一行一个 key 的自动轮换
 * （见 `settings.multiApiKeyEditTip`），而 `Input.Password` 是单行的，换成它会静默破坏轮换。
 * 所以保留 `Input.TextArea`，默认用只读的圆点占位遮住已保存的 key，由用户显式点开。
 *
 * Why not `Input.Password`: this field supports newline-separated keys with auto-rotation
 * (see `settings.multiApiKeyEditTip`), and `Input.Password` is single-line — swapping it in
 * would silently break rotation. So the textarea stays and the saved keys sit behind a
 * read-only dot placeholder until the user asks to see them.
 *
 * 遮蔽期间绝不触碰表单值：`onChange` 只在显示状态下才可能被触发，
 * 因此“打开弹窗直接保存”一定原样带回原来的多行 key。
 * While masked the form value is never touched — `onChange` can only fire once revealed — so
 * opening the dialog and saving without editing returns the stored multi-line value verbatim.
 */
const MaskedApiKeyTextArea: React.FC<MaskedApiKeyTextAreaProps> = ({ value, onChange, id, placeholder, rows = 4 }) => {
  // 一次显示，整个弹窗会话内保持显示：编辑 3 个 key 的轮换时反复点眼睛没有意义。
  // Sticky for the modal session: someone editing a 3-key rotation should not have to
  // re-reveal after every keystroke.
  const [revealed, setRevealed] = useState(false);
  const { t } = useTranslation();

  const maskedValue = value
    ? value
        .split('\n')
        .map((line) => (line.trim() ? MASK : ''))
        .join('\n')
    : '';

  return (
    <div className='flex flex-col gap-4px'>
      {revealed ? (
        <Input.TextArea id={id} rows={rows} placeholder={placeholder} value={value} onChange={onChange} />
      ) : (
        <Input.TextArea
          id={id}
          rows={rows}
          placeholder={placeholder}
          value={maskedValue}
          readOnly
          // 只读遮蔽态不是可编辑控件，别让读屏软件把圆点念出来
          // The masked state is not an editable control; don't let a screen reader read dots out
          aria-label={t('settings.apiKeyMasked')}
        />
      )}
      <div className='flex justify-end'>
        <Button
          type='text'
          size='mini'
          icon={revealed ? <PreviewClose size={14} /> : <PreviewOpen size={14} />}
          onClick={() => setRevealed((prev) => !prev)}
        >
          {revealed ? t('settings.apiKeyHide') : t('settings.apiKeyReveal')}
        </Button>
      </div>
    </div>
  );
};

export default MaskedApiKeyTextArea;
