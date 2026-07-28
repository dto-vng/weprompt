import path from 'node:path';
import { OUT_DIR, styleSheet } from './lib.mjs';

// ---------------------------------------------------------------------------
// Operations Guide — compact teal SOP: numbered steps, note boxes, checklists.
// ---------------------------------------------------------------------------
const OG = {
  teal: '0E7C7B',
  deep: '0A4F4E',
  ink: '1F2933',
  muted: '7B8794',
  tint: 'E8F3F2',
  warn: 'FDF3E3',
  rule: 'single;6;0E7C7B',
};

export default {
  name: 'operations-guide',
  file: path.join(OUT_DIR, 'operations-guide.docx'),
  page: {},
  styles: styleSheet({ display: 'Calibri', body: 'Calibri', ink: OG.ink, accent: OG.deep, titleSize: '24pt' }),
  blocks: [
    // --- Compact title block (no cover page) --------------------------------
    { type: 'para', text: 'STANDARD OPERATING PROCEDURE', size: '9pt', bold: true, color: OG.teal, spaceAfter: '2pt' },
    { type: 'para', text: 'Production Release Procedure', style: 'Title', spaceAfter: '4pt' },
    {
      type: 'para',
      text: 'Owner: Platform Operations · Review cycle: quarterly · Version 1.0',
      size: '9pt',
      color: OG.muted,
      spaceAfter: '4pt',
      rule: OG.rule,
    },

    // --- Scope / prerequisites as a definition list -------------------------
    { type: 'para', text: 'Scope', style: 'Heading2', spaceBefore: '16pt' },
    {
      type: 'para',
      text: 'Applies to: all production deployments of the customer-facing platform.',
      size: '11pt',
      spaceAfter: '2pt',
    },
    {
      type: 'para',
      text: 'Does not apply to: internal tooling, staging, and documentation-only changes.',
      size: '11pt',
      spaceAfter: '2pt',
    },
    {
      type: 'para',
      text: 'Prerequisites: release branch cut, change record raised, on-call engineer identified.',
      size: '11pt',
    },

    // --- Procedure ----------------------------------------------------------
    { type: 'para', text: 'Procedure', style: 'Heading2' },
    {
      type: 'para',
      text: 'Complete every step in order. Do not skip a step because it appears to have been done already — confirm it.',
      size: '11pt',
      spaceAfter: '8pt',
    },
    {
      type: 'list',
      ordered: true,
      items: [
        'Confirm the change record is approved and the deployment window is open.',
        'Verify the release branch builds green and the artifact digest matches the build record.',
        'Announce the start of the deployment in the operations channel.',
        'Deploy to the canary fleet and hold for the full soak period.',
        'Check error rate, latency, and saturation against the pre-deployment baseline.',
        'Promote to the remaining fleet in two waves, confirming health between waves.',
        'Announce completion and record the deployment in the change log.',
      ],
    },

    {
      type: 'para',
      text: 'Do not promote past the canary while any health signal is degraded, even if the degradation predates the deployment. Stop, investigate, and record the finding before continuing.',
      size: '10pt',
      bold: true,
      fill: OG.warn,
      indent: 120,
      spaceBefore: '10pt',
      spaceAfter: '14pt',
    },

    // --- Rollback -----------------------------------------------------------
    { type: 'para', text: 'Rollback', style: 'Heading2' },
    {
      type: 'para',
      text: 'Roll back immediately — without waiting for a root cause — if any threshold in the table below is breached.',
      size: '11pt',
      spaceAfter: '8pt',
    },
    {
      type: 'table',
      colWidths: [3360, 2000, 4000],
      header: ['Signal', 'Threshold', 'Action'],
      rows: [
        ['Error rate', '> 2× baseline', 'Roll back the current wave'],
        ['p99 latency', '> 1.5× baseline', 'Hold; investigate before promoting'],
        ['Saturation', '> 85%', 'Hold; scale out before promoting'],
        ['Failed health check', 'any', 'Roll back the current wave'],
      ],
    },
    {
      type: 'para',
      text: 'Table 1 — Rollback thresholds, measured against the pre-deployment baseline.',
      size: '9pt',
      italic: true,
      color: OG.muted,
      spaceBefore: '6pt',
      spaceAfter: '14pt',
    },

    // --- Completion checklist -----------------------------------------------
    { type: 'para', text: 'Completion checklist', style: 'Heading2' },
    {
      type: 'list',
      ordered: false,
      items: [
        'Change record closed with the actual deployment window recorded.',
        'Health signals confirmed stable for one full hour post-promotion.',
        'Deployment recorded in the change log with the artifact digest.',
        'Any deviation from this procedure written up and sent to the process owner.',
      ],
    },
  ],
};
