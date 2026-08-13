import path from 'node:path';
import { OUT_DIR, styleSheet } from './lib.mjs';

// ---------------------------------------------------------------------------
// Proposal / SOW — warm neutral with gold, serif display, client-facing.
// ---------------------------------------------------------------------------
const PS = {
  gold: '9A7B23',
  ink: '2B2622',
  muted: '7A7269',
  tint: 'F7F3EA',
  rule: 'single;6;9A7B23',
};

export default {
  name: 'proposal-sow',
  file: path.join(OUT_DIR, 'proposal-sow.docx'),
  page: {},
  styles: styleSheet({ display: 'Cambria', body: 'Calibri', ink: PS.ink, accent: PS.gold, titleSize: '30pt' }),
  // Has a cover page (see below) — suppress the page number there.
  footer: { suppressFirstPage: true },
  blocks: [
    // --- Cover ---------------------------------------------------------------
    {
      type: 'para',
      text: 'PROPOSAL AND STATEMENT OF WORK',
      size: '9pt',
      color: PS.muted,
      align: 'center',
      spaceAfter: '30pt',
    },
    { type: 'para', text: 'Customer Data Platform', style: 'Title', align: 'center', spaceAfter: '4pt' },
    {
      type: 'para',
      text: 'Discovery, build, and handover',
      size: '14pt',
      italic: true,
      color: PS.muted,
      align: 'center',
      spaceAfter: '30pt',
    },
    { type: 'para', text: 'Prepared for: Northwind Trading Company', size: '11pt', align: 'center', spaceAfter: '2pt' },
    { type: 'para', text: 'Prepared by: Delivery Practice', size: '11pt', align: 'center', spaceAfter: '2pt' },
    { type: 'para', text: 'Valid until: 30 June', size: '11pt', align: 'center' },
    { type: 'pagebreak' },

    // --- Understanding -------------------------------------------------------
    { type: 'para', text: 'Our understanding', style: 'Heading1', spaceBefore: '0pt' },
    {
      type: 'para',
      text: 'Northwind holds customer data in four systems that do not reconcile. Reporting is assembled by hand each month, which costs roughly six working days and produces numbers the commercial team does not fully trust. The objective is a single reconciled customer record that reporting and the commercial team can both rely on.',
    },
    {
      type: 'para',
      text: 'This proposal covers discovery, build, and handover. It does not cover ongoing operation of the platform, which we recommend Northwind runs in-house from the outset.',
    },

    // --- Scope ---------------------------------------------------------------
    { type: 'para', text: 'Scope of work', style: 'Heading1' },
    { type: 'para', text: 'Phase 1 — Discovery', style: 'Heading2' },
    {
      type: 'para',
      text: 'Map the four source systems, profile data quality, and agree the reconciliation rules with the commercial and finance teams. Produces a written data model and a signed-off rule set.',
    },
    { type: 'para', text: 'Phase 2 — Build', style: 'Heading2' },
    {
      type: 'para',
      text: 'Implement ingestion from all four systems, the reconciliation layer, and the reporting views. Includes automated data-quality checks that fail loudly rather than producing quietly wrong numbers.',
    },
    { type: 'para', text: 'Phase 3 — Handover', style: 'Heading2' },
    {
      type: 'para',
      text: 'Runbook, operational training for two Northwind engineers, and a four-week supported handover period.',
    },

    // --- Timeline ------------------------------------------------------------
    { type: 'para', text: 'Timeline', style: 'Heading1' },
    {
      type: 'table',
      colWidths: [2400, 1680, 5280],
      header: ['Phase', 'Duration', 'Key deliverable'],
      rows: [
        ['Discovery', '3 weeks', 'Data model and signed-off reconciliation rules'],
        ['Build', '8 weeks', 'Ingestion, reconciliation layer, reporting views'],
        ['Handover', '4 weeks', 'Runbook, training, supported operation'],
      ],
    },
    {
      type: 'para',
      text: 'Table 1 — Indicative timeline. Phases run consecutively; the handover period overlaps the final build week.',
      size: '9pt',
      italic: true,
      color: PS.muted,
      spaceBefore: '6pt',
      spaceAfter: '14pt',
    },

    // --- Commercials ---------------------------------------------------------
    // Forced break: without it, this heading orphans at the foot of the Scope/Timeline
    // page while the whole pricing table is pushed to the next page. `keepNext: true`
    // on this heading was tried and verified to land on the paragraph (officecli get
    // showed keepNext=true on it) but did not change the rendered page break — this
    // renderer does not honor keepNext against a following table. See THEME.md's
    // Structure catalog entry for the Commercials table for the re-evaluation note.
    { type: 'pagebreak' },
    { type: 'para', text: 'Commercials', style: 'Heading1', spaceBefore: '0pt' },
    {
      type: 'table',
      colWidths: [4560, 2400, 2400],
      header: ['Item', 'Basis', 'Amount'],
      rows: [
        ['Phase 1 — Discovery', 'Fixed', '48,000'],
        ['Phase 2 — Build', 'Fixed', '184,000'],
        ['Phase 3 — Handover', 'Fixed', '52,000'],
        ['Total', '', '284,000'],
      ],
      // Row 5 is the Total row (tr[1] is the header) — bold so it reads as a total,
      // not just another line item.
      boldRows: [5],
      // Amount is the only numeric column; right-align it so figures line up on the
      // ones digit rather than ragging left. Item/Basis stay at Word's default left.
      colAlign: [undefined, undefined, 'right'],
    },
    {
      type: 'para',
      text: 'Table 2 — Fees exclusive of tax and of any third-party licence cost.',
      size: '9pt',
      italic: true,
      color: PS.muted,
      spaceBefore: '6pt',
      spaceAfter: '14pt',
    },

    { type: 'para', text: 'Assumptions', style: 'Heading2' },
    {
      type: 'list',
      ordered: false,
      items: [
        'Northwind provides read access to all four source systems within one week of signature.',
        'A named business owner is available for a weekly decision forum.',
        'Reconciliation rules are agreed in Phase 1 and are not reopened during Phase 2.',
      ],
    },

    // --- Signature block -----------------------------------------------------
    { type: 'para', text: 'Acceptance', style: 'Heading1' },
    {
      type: 'para',
      text: 'Signature of this document constitutes acceptance of the scope, timeline, and fees set out above.',
      spaceAfter: '30pt',
    },
    {
      type: 'para',
      text: 'For Northwind Trading Company',
      size: '10pt',
      color: PS.muted,
      spaceAfter: '22pt',
      rule: PS.rule,
    },
    { type: 'para', text: 'Name and title', size: '9pt', color: PS.muted, spaceAfter: '26pt' },
    { type: 'para', text: 'For Delivery Practice', size: '10pt', color: PS.muted, spaceAfter: '22pt', rule: PS.rule },
    { type: 'para', text: 'Name and title', size: '9pt', color: PS.muted },
  ],
};
