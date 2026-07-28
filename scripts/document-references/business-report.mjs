import path from 'node:path';
import { OUT_DIR, styleSheet } from './lib.mjs';

// ---------------------------------------------------------------------------
// Business Report — navy/slate, Cambria display, long-form with a static TOC.
// ---------------------------------------------------------------------------
const BR = {
  navy: '1F3864',
  ink: '2A2E35',
  muted: '6B7280',
  tint: 'EDF1F8',
  rule: 'single;6;1F3864',
};

export default {
  name: 'business-report',
  file: path.join(OUT_DIR, 'business-report.docx'),
  page: {},
  styles: styleSheet({ display: 'Cambria', body: 'Calibri', ink: BR.ink, accent: BR.navy }),
  blocks: [
    // --- Cover -------------------------------------------------------------
    {
      type: 'para',
      text: 'CONFIDENTIAL — INTERNAL DISTRIBUTION',
      size: '9pt',
      color: BR.muted,
      align: 'center',
      spaceAfter: '28pt',
    },
    { type: 'para', text: 'Annual Performance Review', style: 'Title', align: 'center', spaceAfter: '6pt' },
    {
      type: 'para',
      text: 'Operating results, market position, and outlook',
      size: '14pt',
      italic: true,
      color: BR.muted,
      align: 'center',
      spaceAfter: '32pt',
    },
    { type: 'para', text: 'Prepared for: Executive Committee', size: '11pt', align: 'center', spaceAfter: '2pt' },
    { type: 'para', text: 'Reporting period: January — December', size: '11pt', align: 'center', spaceAfter: '2pt' },
    { type: 'para', text: 'Author: Strategy and Planning', size: '11pt', align: 'center' },
    { type: 'pagebreak' },

    // --- Contents (static dot-leader; see THEME.md) -------------------------
    { type: 'para', text: 'Contents', style: 'Heading1', spaceBefore: '0pt' },
    { type: 'tocline', label: '1. Executive Summary', page: 3 },
    { type: 'tocline', label: '2. Operating Performance', page: 4 },
    { type: 'tocline', label: '3. Market Position', page: 5 },
    { type: 'tocline', label: '4. Outlook and Priorities', page: 6 },
    { type: 'pagebreak' },

    // --- Executive summary --------------------------------------------------
    { type: 'para', text: '1. Executive Summary', style: 'Heading1', spaceBefore: '0pt' },
    {
      type: 'para',
      text: 'Recommendation — sustain the current investment plan and reallocate discretionary spend toward the two fastest-compounding segments.',
      bold: true,
      size: '11pt',
      fill: BR.tint,
      spaceBefore: '6pt',
      spaceAfter: '12pt',
      indent: 120,
    },
    {
      type: 'para',
      text: 'Performance for the period was ahead of plan on revenue and in line on margin. Growth was concentrated in the enterprise segment, where renewal rates improved and average contract value rose. The cost base grew more slowly than revenue for the third consecutive period, which is the clearest signal that the operating model is scaling as intended.',
    },
    {
      type: 'para',
      text: 'Three factors explain most of the variance against plan, and each is addressed in the sections that follow.',
    },
    {
      type: 'list',
      ordered: false,
      items: [
        'Enterprise renewals closed earlier in the cycle than forecast, pulling revenue forward.',
        'Regional expansion costs landed below plan because two market entries were deferred.',
        'Input costs rose faster than the planning assumption, compressing gross margin.',
      ],
    },

    // --- Operating performance ---------------------------------------------
    { type: 'para', text: '2. Operating Performance', style: 'Heading1' },
    { type: 'para', text: 'Results by segment', style: 'Heading2' },
    { type: 'para', text: 'The table below summarises reported performance by segment against the approved plan.' },
    {
      type: 'table',
      colWidths: [3120, 2080, 2080, 2080],
      header: ['Segment', 'Revenue', 'Growth', 'Margin'],
      rows: [
        ['Enterprise', '412.0', '+18%', '34%'],
        ['Mid-market', '188.5', '+9%', '29%'],
        ['Small business', '96.2', '+4%', '22%'],
        ['Total', '696.7', '+12%', '31%'],
      ],
    },
    {
      type: 'para',
      text: 'Table 1 — Reported performance by segment, in millions.',
      size: '9pt',
      italic: true,
      color: BR.muted,
      spaceBefore: '6pt',
      spaceAfter: '14pt',
    },
    { type: 'para', text: 'Cost structure', style: 'Heading2' },
    {
      type: 'para',
      text: 'Operating expense grew 7% against 12% revenue growth. Headcount was the largest single driver, followed by cloud infrastructure, which is now the fastest-growing line in the cost base and warrants a dedicated review next period.',
    },

    // --- Market position ----------------------------------------------------
    { type: 'para', text: '3. Market Position', style: 'Heading1' },
    {
      type: 'para',
      text: 'Share held or improved in every served market. The competitive set has consolidated: two of the four principal competitors merged during the period, which raises the probability of aggressive pricing in the mid-market segment.',
    },
    { type: 'para', text: 'Competitive dynamics', style: 'Heading3' },
    {
      type: 'para',
      text: 'Win rates against the merged entity have not yet moved materially, but the sample is small and the integration is early. This is the single most important thing to monitor over the coming two quarters.',
    },

    // --- Outlook ------------------------------------------------------------
    { type: 'para', text: '4. Outlook and Priorities', style: 'Heading1' },
    {
      type: 'para',
      text: 'The plan for the coming period holds revenue growth broadly flat and targets margin recovery through cost discipline rather than price increases. Four priorities follow from the analysis above.',
    },
    {
      type: 'list',
      ordered: true,
      items: [
        'Protect enterprise renewal rates; treat any decline as a leading indicator, not a lagging one.',
        'Complete the two deferred market entries before the competitive set stabilises.',
        'Bring cloud infrastructure spend under a dedicated cost owner.',
        'Re-test the mid-market pricing assumption against post-merger competitor behaviour.',
      ],
    },
    {
      type: 'para',
      text: 'Progress against each priority is reported monthly to the Executive Committee.',
      spaceBefore: '10pt',
      rule: BR.rule,
    },
  ],
};
