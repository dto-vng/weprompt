/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from '@arco-design/web-react';
import { Copy, Down, Up } from '@icon-park/react';
import katex from 'katex';
import React, { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { copyText } from '@/renderer/utils/ui/clipboard';
import MermaidBlock from './MermaidBlock';
import { formatCode, getDiffLineStyle } from './markdownUtils';

const PREVIEW_LINES = 3;
// code span: font-size 13px, line-height 20px (per ShadowView injection)
const CODE_LINE_HEIGHT = 20;
// SyntaxHighlighter pre padding: 0.5em top + 0.5em bottom ≈ 13px each side
const CODE_PADDING_VERTICAL = 13;
const COLLAPSED_HEIGHT = PREVIEW_LINES * CODE_LINE_HEIGHT + CODE_PADDING_VERTICAL;

type CodeBlockProps = {
  children: string;
  className?: string;
  node?: unknown;
  hiddenCodeCopyButton?: boolean;
  codeStyle?: React.CSSProperties;
  [key: string]: unknown;
};

function CodeBlock(props: CodeBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const codeId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light'
  );

  React.useEffect(() => {
    const update = () => {
      setCurrentTheme((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light');
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const toggleExpanded = () => {
    const willCollapse = expanded;
    setExpanded((v) => !v);
    if (willCollapse && containerRef.current) {
      requestAnimationFrame(() => {
        containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      });
    }
  };

  const { children, className, node: _node, hiddenCodeCopyButton: _h, codeStyle: _c, ...rest } = props;
  const match = /language-(\w+)/.exec(className || '');
  const language = match?.[1] || 'text';

  // KaTeX math blocks
  if (language === 'latex' || language === 'math' || language === 'tex') {
    const latexSource = String(children).replace(/\n$/, '');
    const isFullDocument = /\\(documentclass|begin\{document\}|usepackage)\b/.test(latexSource);
    if (!isFullDocument) {
      try {
        const html = katex.renderToString(latexSource, { displayMode: true, throwOnError: false });
        return <div className='katex-display' dangerouslySetInnerHTML={{ __html: html }} />;
      } catch {
        // fall through
      }
    }
  }

  if (language === 'mermaid') {
    return <MermaidBlock code={formatCode(children)} style={props.codeStyle} />;
  }

  // Inline code (single line)
  if (!String(children).includes('\n')) {
    return (
      <code {...rest} className={className} style={{ fontWeight: 'bold' }}>
        {children}
      </code>
    );
  }

  const isDiff = language === 'diff';
  const formattedContent = formatCode(children);
  const totalLines = formattedContent.split('\n').length;
  const canCollapse = totalLines > PREVIEW_LINES;
  const codeTheme = currentTheme === 'dark' ? vs2015 : vs;
  const diffLines = isDiff ? formattedContent.split('\n') : [];
  const isDark = currentTheme === 'dark';

  const handleCopy = () => {
    void copyText(formattedContent)
      .then(() => {
        try {
          Message.success(t('common.copySuccess'));
        } catch {
          /* Shadow DOM portal may fail silently */
        }
      })
      .catch(() => {
        try {
          Message.error(t('common.copyFailed'));
        } catch {
          /* ignore */
        }
      });
  };

  // Native buttons rather than Arco, and inline styles rather than utility classes: this
  // subtree only ever renders inside MarkdownView's shadow root, where neither Arco's
  // stylesheet nor UnoCSS output reaches. The documented exception to the "no raw interactive
  // HTML in new UI" rule. `markdown-code-control` is defined in ShadowView's createInitStyle
  // and supplies the :focus-visible ring.
  const controlStyle: React.CSSProperties = {
    background: 'transparent',
    border: 0,
    padding: 0,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
  };

  const iconFill = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const footerTextColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const bgColor = isDark ? 'rgba(255,255,255,0.04)' : 'var(--bg-2)';

  return (
    <div ref={containerRef} style={{ width: '100%', minWidth: 0, maxWidth: '100%', ...props.codeStyle }}>
      <div style={{ backgroundColor: bgColor, borderRadius: '8px', overflow: 'hidden' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
          }}
        >
          {/* An unlabelled fence used to render the literal string "text" as its language chip.
              `language` still falls back to 'text' for SyntaxHighlighter below. */}
          <span style={{ color: footerTextColor, fontSize: '12px', lineHeight: '16px' }}>
            {match?.[1] ? language.toLocaleLowerCase() : null}
          </span>
          {/* The `group` / `md:opacity-0 md:group-hover:opacity-100` classes that used to live
              here were dead: UnoCSS output never crosses the shadow boundary, so these controls
              have always been permanently visible. Removed rather than left as misleading code. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {canCollapse && (
              <button
                type='button'
                className='markdown-code-control'
                aria-label={expanded ? t('common.collapse') : t('common.expand')}
                aria-expanded={expanded}
                aria-controls={codeId}
                style={controlStyle}
                onClick={toggleExpanded}
              >
                {expanded ? (
                  <Up theme='outline' size='14' style={{ display: 'block' }} fill={iconFill} />
                ) : (
                  <Down theme='outline' size='14' style={{ display: 'block' }} fill={iconFill} />
                )}
              </button>
            )}
            <button
              type='button'
              className='markdown-code-control'
              aria-label={t('common.copy')}
              style={controlStyle}
              onClick={handleCopy}
            >
              <Copy theme='outline' size='14' style={{ display: 'block' }} fill={iconFill} />
            </button>
          </div>
        </div>

        {/* Code content — always full content, clipped by maxHeight when collapsed */}
        <div
          id={codeId}
          style={{
            maxHeight: canCollapse && !expanded ? `${COLLAPSED_HEIGHT}px` : 'none',
            overflowY: 'hidden',
            overflowX: 'visible',
          }}
        >
          <SyntaxHighlighter
            children={formattedContent}
            language={language}
            style={codeTheme}
            PreTag='div'
            wrapLines={isDiff}
            lineProps={
              isDiff
                ? (lineNumber: number) => ({
                    style: {
                      display: 'block',
                      ...getDiffLineStyle(diffLines[lineNumber - 1] || '', isDark),
                    },
                  })
                : undefined
            }
            customStyle={{
              margin: 0,
              padding: '0 12px 8px',
              borderRadius: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              overflowX: 'auto',
              maxWidth: '100%',
            }}
            codeTagProps={{
              style: {
                color: 'var(--text-primary)',
                background: 'transparent',
              },
            }}
          />
        </div>

        {/* Footer */}
        {canCollapse && (
          <button
            type='button'
            className='markdown-code-control'
            aria-expanded={expanded}
            aria-controls={codeId}
            style={{
              ...controlStyle,
              width: '100%',
              justifyContent: 'center',
              padding: '6px 12px',
              gap: '4px',
              borderTop: `1px solid ${borderColor}`,
              borderRadius: 0,
            }}
            onClick={toggleExpanded}
          >
            <span style={{ color: footerTextColor, fontSize: '12px' }}>
              {expanded ? t('common.collapse') : t('common.viewMoreLines', { count: totalLines - PREVIEW_LINES })}
            </span>
            {expanded ? (
              <Up theme='outline' size='12' fill={footerTextColor} />
            ) : (
              <Down theme='outline' size='12' fill={footerTextColor} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default CodeBlock;
