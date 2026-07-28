import path from 'node:path';
import { OUT_DIR, styleSheet } from './lib.mjs';

// ---------------------------------------------------------------------------
// Decision Memo — black on white, one accent rule, no cover, 1-3 pages.
// ---------------------------------------------------------------------------
const DM = {
  ink: '111111',
  accent: 'B22222',
  muted: '666666',
  tint: 'F4F4F4',
  rule: 'single;8;B22222',
};

export default {
  name: 'decision-memo',
  file: path.join(OUT_DIR, 'decision-memo.docx'),
  page: {},
  styles: styleSheet({ display: 'Calibri', body: 'Calibri', ink: DM.ink, accent: DM.ink, titleSize: '22pt' }),
  // No cover page — the page number shows from page one.
  footer: { suppressFirstPage: false },
  blocks: [
    // --- Masthead -----------------------------------------------------------
    { type: 'para', text: 'MEMORANDUM', size: '10pt', bold: true, color: DM.accent, spaceAfter: '2pt', rule: DM.rule },
    {
      type: 'para',
      text: 'Pricing change for the mid-market tier',
      style: 'Title',
      spaceBefore: '14pt',
      spaceAfter: '14pt',
    },

    // --- Addressing block -----------------------------------------------------
    // An explicit left tab stop keeps TO/FROM/DATE/RE values aligned regardless of
    // label width — without it, `\t` falls back to Word's default stops and "FROM:"
    // (wider than TO/DATE/RE) jumps to the next increment, breaking the column.
    {
      type: 'para',
      text: 'TO:\tExecutive Committee',
      size: '11pt',
      spaceAfter: '2pt',
      tabs: [{ pos: '1in', val: 'left' }],
    },
    {
      type: 'para',
      text: 'FROM:\tPricing and Commercial Strategy',
      size: '11pt',
      spaceAfter: '2pt',
      tabs: [{ pos: '1in', val: 'left' }],
    },
    {
      type: 'para',
      text: 'DATE:\t14 March',
      size: '11pt',
      spaceAfter: '2pt',
      tabs: [{ pos: '1in', val: 'left' }],
    },
    {
      type: 'para',
      text: 'RE:\tProposed 6% list-price increase, effective next quarter',
      size: '11pt',
      spaceAfter: '16pt',
      tabs: [{ pos: '1in', val: 'left' }],
    },

    // --- Recommendation up front -------------------------------------------
    { type: 'para', text: 'Recommendation', style: 'Heading2', spaceBefore: '0pt' },
    {
      type: 'para',
      text: 'Approve the 6% list-price increase for the mid-market tier, with existing contracts held at current pricing until renewal. We recommend a decision by 28 March so the change lands before the competitive set finishes repricing.',
      bold: true,
      fill: DM.tint,
      indent: 120,
      spaceAfter: '14pt',
    },

    // --- Rationale ----------------------------------------------------------
    { type: 'para', text: 'Why now', style: 'Heading2' },
    {
      type: 'para',
      text: 'Mid-market list pricing has not moved in seven quarters while input costs rose 11% over the same period. Gross margin in the tier has compressed from 31% to 26%, and the trend has not flattened. Two of the four principal competitors repriced upward this quarter, which narrows the risk that an increase makes us an outlier.',
    },
    {
      type: 'para',
      text: 'Holding existing contracts at current pricing until renewal limits churn exposure to new business and to the renewal cohort, roughly a third of the base in any given quarter.',
    },

    { type: 'para', text: 'Options considered', style: 'Heading2' },
    {
      type: 'table',
      colWidths: [2160, 3600, 3600],
      header: ['Option', 'Effect on margin', 'Principal risk'],
      rows: [
        ['Hold pricing', 'Continued compression', 'Margin falls below plan by year end'],
        ['Increase 6%', 'Recovers ~4 points', 'Churn in the renewal cohort'],
        ['Increase 12%', 'Recovers ~8 points', 'Prices above the competitive set'],
      ],
    },
    {
      type: 'para',
      text: 'A 12% increase recovers margin faster but prices the tier above every competitor, which the win-rate data does not support.',
      size: '10pt',
      italic: true,
      color: DM.muted,
      spaceBefore: '6pt',
      spaceAfter: '14pt',
    },

    { type: 'para', text: 'What we need', style: 'Heading2' },
    {
      type: 'list',
      ordered: true,
      items: [
        'A decision on the 6% increase by 28 March.',
        'Confirmation that existing contracts are held until renewal.',
        'Sign-off from Legal on the renewal notice wording.',
      ],
    },
  ],
};
