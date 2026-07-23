#!/usr/bin/env node
/**
 * Generates the two built-in PPTX reference decks via officecli.
 * Run from repo root: node scripts/generate-presentation-references.mjs
 * Re-run only when deck design changes; output files are committed.
 *
 * Design contract (mirrors each template's THEME.md): every deck exercises
 * the full layout catalog a generated deck should clone — cover, numbered
 * rows, KPI card grid, native chart + insight card, two-column content,
 * section divider, process/status patterns, and a closing slide. Slides
 * carry sample content that generation replaces wholesale. Hard rules:
 * no accent stripes or title underlines, no text-only content slides,
 * body >= 18pt, titles >= 36pt, >= 1.27cm margins, speaker notes everywhere.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('packages/desktop/resources/presentation-templates');
mkdirSync(OUT_DIR, { recursive: true });

const run = (args) => execFileSync('officecli', args, { stdio: 'inherit' });

/** Slide canvas: 33.87cm x 19.05cm (16:9). Grid: 1.5cm margins, 0.76cm gaps. */
const SLIDE_W = 33.87;

const stringifyProps = (props) => Object.fromEntries(Object.entries(props).map(([key, value]) => [key, String(value)]));

const buildDeck = (file, slides) => {
  rmSync(file, { force: true });
  run(['create', file]);
  run(['open', file]);
  try {
    slides.forEach((slide, index) => {
      run(['add', file, '/', '--type', 'slide', '--prop', `background=${slide.background}`]);
      const slidePath = `/slide[${index + 1}]`;
      const commands = slide.shapes.map((props) => ({
        command: 'add',
        parent: slidePath,
        type: 'shape',
        props: stringifyProps(props),
      }));
      run(['batch', file, '--commands', JSON.stringify(commands)]);
      for (const chart of slide.charts ?? []) {
        const args = ['add', file, slidePath, '--type', 'chart'];
        for (const [key, value] of Object.entries(chart)) args.push('--prop', `${key}=${value}`);
        run(args);
      }
      for (const connector of slide.connectors ?? []) {
        const args = ['add', file, slidePath, '--type', 'connector'];
        for (const [key, value] of Object.entries(connector)) {
          args.push('--prop', `${key}=${String(value).replaceAll('SLIDE', slidePath)}`);
        }
        run(args);
      }
      if (slide.notes) {
        run(['add', file, slidePath, '--type', 'notes', '--prop', `text=${slide.notes}`]);
      }
    });
  } finally {
    run(['close', file]);
  }
  run(['validate', file]);
  console.log(`generated ${file}`);
};

/** Text shape defaults — every text shape sets font/size/color explicitly. */
const text = (props) => ({ geometry: 'rect', fill: 'none', line: 'none', valign: 'top', ...props });

const gridX = (cols, margin = 1.5, gap = 0.76) => {
  const usable = SLIDE_W - 2 * margin - (cols - 1) * gap;
  const width = Math.round((usable / cols) * 100) / 100;
  return { width, xs: Array.from({ length: cols }, (_, i) => Math.round((margin + i * (width + gap)) * 100) / 100) };
};

// ---------------------------------------------------------------------------
// Business Review — navy/amber, Cambria + Calibri, Consolas labels.
// Sandwich structure: dark cover/divider/closing, white content slides.
// ---------------------------------------------------------------------------
const BR = {
  navy: '0B1F3A',
  card: '14294D',
  white: 'FFFFFF',
  amber: 'F2A33C',
  mutedDark: '9DB0C9', // muted on navy
  ink: '1F2933',
  muted: '5B6B82', // muted on white
  panel: 'F5F7FA',
};

const brMarker = (x, y) => ({
  geometry: 'rect',
  x: `${x}cm`,
  y: `${y}cm`,
  width: '0.42cm',
  height: '0.42cm',
  fill: BR.amber,
  line: 'none',
});

const brNumberedRow = (index, y, lead, body, bodyWidth = 17) => [
  {
    geometry: 'ellipse',
    name: `RowNum${index}`,
    x: '1.5cm',
    y: `${y - 0.15}cm`,
    width: '1.7cm',
    height: '1.7cm',
    fill: BR.amber,
    line: 'none',
    text: String(index),
    font: 'Cambria',
    size: 16,
    bold: true,
    color: BR.navy,
    align: 'center',
    valign: 'middle',
  },
  text({
    x: '3.7cm',
    y: `${y - 0.1}cm`,
    width: `${bodyWidth}cm`,
    height: '1.2cm',
    text: lead,
    font: 'Calibri',
    size: 20,
    bold: true,
    color: BR.ink,
  }),
  text({
    x: '3.7cm',
    y: `${y + 1.15}cm`,
    width: `${bodyWidth}cm`,
    height: '1.9cm',
    text: body,
    font: 'Calibri',
    size: 18,
    color: BR.ink,
  }),
];

const brKpi = gridX(4);
const brKpiCard = (i, value, label, delta) => [
  {
    geometry: 'roundRect',
    name: `Kpi${i + 1}`,
    x: `${brKpi.xs[i]}cm`,
    y: '4.2cm',
    width: `${brKpi.width}cm`,
    height: '9cm',
    fill: BR.card,
    line: 'none',
  },
  text({
    x: `${brKpi.xs[i]}cm`,
    y: '5.6cm',
    width: `${brKpi.width}cm`,
    height: '2.6cm',
    text: value,
    font: 'Cambria',
    size: 54,
    bold: true,
    color: BR.white,
    align: 'center',
  }),
  text({
    x: `${brKpi.xs[i]}cm`,
    y: '8.6cm',
    width: `${brKpi.width}cm`,
    height: '1.4cm',
    text: label,
    font: 'Calibri',
    size: 14,
    color: BR.mutedDark,
    align: 'center',
  }),
  text({
    x: `${brKpi.xs[i]}cm`,
    y: '10.4cm',
    width: `${brKpi.width}cm`,
    height: '1cm',
    text: delta,
    font: 'Calibri',
    size: 14,
    bold: true,
    color: BR.amber,
    align: 'center',
  }),
];

const brTitle = (title) =>
  text({
    name: 'Title',
    x: '1.5cm',
    y: '1.1cm',
    width: '30.87cm',
    height: '1.9cm',
    text: title,
    font: 'Cambria',
    size: 36,
    bold: true,
    color: BR.navy,
  });

const businessReview = {
  file: path.join(OUT_DIR, 'business-review.pptx'),
  slides: [
    {
      background: BR.navy,
      shapes: [
        text({
          x: '20cm',
          y: '4.6cm',
          width: '13cm',
          height: '9cm',
          text: 'Q3',
          font: 'Cambria',
          size: 220,
          bold: true,
          color: BR.card,
          align: 'center',
        }),
        text({
          x: '2.5cm',
          y: '6.1cm',
          width: '20cm',
          height: '0.9cm',
          text: 'QUARTERLY BUSINESS REVIEW',
          font: 'Consolas',
          size: 14,
          bold: true,
          color: BR.amber,
        }),
        text({
          name: 'Title',
          x: '2.5cm',
          y: '7.2cm',
          width: '24cm',
          height: '2.6cm',
          text: 'Q3 FY26 Business Review',
          font: 'Cambria',
          size: 44,
          bold: true,
          color: BR.white,
        }),
        text({
          x: '2.5cm',
          y: '10.1cm',
          width: '24cm',
          height: '1.1cm',
          text: 'Acme Corp — Jordan Lee, CFO — 14 October FY26',
          font: 'Calibri',
          size: 18,
          color: BR.mutedDark,
        }),
        brMarker(2.5, 16.9),
        text({
          x: '3.3cm',
          y: '16.62cm',
          width: '20cm',
          height: '1cm',
          text: 'Confidential — prepared for the board',
          font: 'Calibri',
          size: 14,
          color: BR.mutedDark,
        }),
      ],
      notes:
        'Cover. Replace company, quarter, presenter and date. Keep the giant quarter numeral — it is the deck motif.',
    },
    {
      background: BR.white,
      shapes: [
        brTitle('Executive Summary'),
        ...brNumberedRow(
          1,
          4.1,
          'Revenue beat plan by 18%',
          'Enterprise renewals and the EMEA launch drove the beat; NRR held at 118%.'
        ),
        ...brNumberedRow(
          2,
          8.0,
          'Margin expanded 1.9pp',
          'Support automation and infra renegotiation offset the FX headwind.'
        ),
        ...brNumberedRow(
          3,
          11.9,
          'Two decisions requested today',
          'Approve the EMEA headcount plan and the FY27 pricing change (slide 7).'
        ),
        {
          geometry: 'roundRect',
          name: 'HeroCard',
          x: '23cm',
          y: '3.8cm',
          width: '9.37cm',
          height: '12.7cm',
          fill: BR.card,
          line: 'none',
        },
        text({
          x: '23.6cm',
          y: '4.7cm',
          width: '8.2cm',
          height: '0.8cm',
          text: 'QUARTER IN ONE NUMBER',
          font: 'Consolas',
          size: 12,
          bold: true,
          color: BR.amber,
        }),
        text({
          x: '23cm',
          y: '6.6cm',
          width: '9.37cm',
          height: '3cm',
          text: '+18%',
          font: 'Cambria',
          size: 66,
          bold: true,
          color: BR.white,
          align: 'center',
        }),
        text({
          x: '23cm',
          y: '10cm',
          width: '9.37cm',
          height: '0.9cm',
          text: 'Revenue vs plan',
          font: 'Calibri',
          size: 14,
          color: BR.mutedDark,
          align: 'center',
        }),
        text({
          x: '23.6cm',
          y: '11.8cm',
          width: '8.2cm',
          height: '3.6cm',
          text: 'Third consecutive quarter above plan; guidance raised for Q4.',
          font: 'Calibri',
          size: 15,
          color: BR.white,
        }),
      ],
      notes:
        'Lead with the beat, then margin, then the asks. Keep to three points — move detail to the section slides.',
    },
    {
      background: BR.white,
      shapes: [
        brTitle('KPI Scorecard'),
        ...brKpiCard(0, '$84.2', 'Revenue, $M', '+18% vs plan'),
        ...brKpiCard(1, '62.4%', 'Gross margin', '+1.9pp QoQ'),
        ...brKpiCard(2, '118%', 'Net revenue retention', '+3pp YoY'),
        ...brKpiCard(3, '4.2', 'CAC payback, years', '-0.3 vs Q2'),
        brMarker(1.5, 14.6),
        text({
          x: '2.3cm',
          y: '14.3cm',
          width: '29cm',
          height: '2.1cm',
          text: 'Every metric carries a period-over-period delta — replace all four cards with this quarter’s headline numbers.',
          font: 'Calibri',
          size: 18,
          color: BR.ink,
        }),
      ],
      notes: 'Read the cards left to right; flag the watch item verbally rather than adding a fifth card.',
    },
    {
      background: BR.white,
      shapes: [
        brTitle('Revenue vs Plan'),
        {
          geometry: 'roundRect',
          name: 'InsightCard',
          x: '23cm',
          y: '3.6cm',
          width: '9.37cm',
          height: '13.4cm',
          fill: BR.panel,
          line: 'none',
        },
        brMarker(23.6, 4.5),
        text({
          x: '23.6cm',
          y: '5.2cm',
          width: '8.2cm',
          height: '1.1cm',
          text: 'Key insight',
          font: 'Cambria',
          size: 20,
          bold: true,
          color: BR.navy,
        }),
        text({
          x: '23.6cm',
          y: '6.5cm',
          width: '8.2cm',
          height: '9.6cm',
          text: 'EMEA contributed 12pp of the 18pp beat. The gap to plan widened every month of the quarter.',
          font: 'Calibri',
          size: 18,
          color: BR.ink,
        }),
      ],
      charts: [
        {
          chartType: 'column',
          name: 'RevenueChart',
          'series1.name': 'Actual',
          'series1.values': '74,78,81,84.2',
          'series1.color': BR.navy,
          'series2.name': 'Plan',
          'series2.values': '71,74,78,80',
          'series2.color': BR.mutedDark,
          categories: 'Q4,Q1,Q2,Q3',
          title: 'Revenue by quarter, $M',
          x: '1.5cm',
          y: '3.6cm',
          width: '20.5cm',
          height: '13.4cm',
        },
      ],
      notes: 'The chart carries the trend; the card carries the so-what. Replace both with the current quarter’s data.',
    },
    {
      background: BR.white,
      shapes: [
        brTitle('Segment Results'),
        brMarker(1.5, 4.3),
        text({
          x: '2.3cm',
          y: '4.0cm',
          width: '15.7cm',
          height: '1.1cm',
          text: 'Enterprise — $38M, +24%',
          font: 'Calibri',
          size: 20,
          bold: true,
          color: BR.ink,
        }),
        text({
          x: '2.3cm',
          y: '5.2cm',
          width: '15.7cm',
          height: '1.8cm',
          text: 'Driver: multi-year renewals. Action: extend the renewal playbook to mid-market.',
          font: 'Calibri',
          size: 18,
          color: BR.ink,
        }),
        brMarker(1.5, 8.3),
        text({
          x: '2.3cm',
          y: '8.0cm',
          width: '15.7cm',
          height: '1.1cm',
          text: 'Mid-market — $29M, +11%',
          font: 'Calibri',
          size: 20,
          bold: true,
          color: BR.ink,
        }),
        text({
          x: '2.3cm',
          y: '9.2cm',
          width: '15.7cm',
          height: '1.8cm',
          text: 'Driver: pricing change. Action: hold discounting at the 8% ceiling.',
          font: 'Calibri',
          size: 18,
          color: BR.ink,
        }),
        brMarker(1.5, 12.3),
        text({
          x: '2.3cm',
          y: '12.0cm',
          width: '15.7cm',
          height: '1.1cm',
          text: 'SMB — $17M, +4%',
          font: 'Calibri',
          size: 20,
          bold: true,
          color: BR.ink,
        }),
        text({
          x: '2.3cm',
          y: '13.2cm',
          width: '15.7cm',
          height: '1.8cm',
          text: 'Driver: self-serve funnel. Action: decision on paid acquisition in Q4.',
          font: 'Calibri',
          size: 18,
          color: BR.ink,
        }),
      ],
      charts: [
        {
          chartType: 'bar',
          name: 'SegmentChart',
          'series1.name': 'Revenue $M',
          'series1.values': '38,29,17',
          'series1.color': BR.navy,
          categories: 'Enterprise,Mid-market,SMB',
          title: 'Revenue by segment, $M',
          x: '19.4cm',
          y: '3.8cm',
          width: '12.97cm',
          height: '12.8cm',
        },
      ],
      notes:
        'One block per segment: result, driver, action. Duplicate this slide if there are more than three segments.',
    },
    {
      background: BR.navy,
      shapes: [
        text({
          x: '20cm',
          y: '4.6cm',
          width: '13cm',
          height: '9cm',
          text: '02',
          font: 'Cambria',
          size: 220,
          bold: true,
          color: BR.card,
          align: 'center',
        }),
        text({
          x: '2.5cm',
          y: '7.4cm',
          width: '18cm',
          height: '0.9cm',
          text: 'SECTION 02',
          font: 'Consolas',
          size: 14,
          bold: true,
          color: BR.amber,
        }),
        text({
          name: 'Title',
          x: '2.5cm',
          y: '8.5cm',
          width: '20cm',
          height: '2.4cm',
          text: 'Priorities & Outlook',
          font: 'Cambria',
          size: 40,
          bold: true,
          color: BR.white,
        }),
      ],
      notes: 'Divider. One per section; the giant number matches the agenda order.',
    },
    {
      background: BR.white,
      shapes: [
        brTitle('Priorities & Decisions'),
        ...brNumberedRow(
          1,
          4.1,
          'Approve EMEA headcount plan',
          '12 quota-carrying hires in H1; payback modeled at 14 months.',
          21
        ),
        text({
          x: '25.5cm',
          y: '4.0cm',
          width: '6.87cm',
          height: '1.1cm',
          text: 'J. LEE · 30 NOV',
          font: 'Consolas',
          size: 13,
          bold: true,
          color: BR.muted,
          align: 'right',
        }),
        ...brNumberedRow(
          2,
          8.0,
          'FY27 pricing change',
          'Move the SMB tier to usage-based pricing; grandfather current contracts.',
          21
        ),
        text({
          x: '25.5cm',
          y: '7.9cm',
          width: '6.87cm',
          height: '1.1cm',
          text: 'A. KIM · 15 DEC',
          font: 'Consolas',
          size: 13,
          bold: true,
          color: BR.muted,
          align: 'right',
        }),
        ...brNumberedRow(
          3,
          11.9,
          'Support automation phase 2',
          'Extends the margin gain by an estimated 0.8pp in FY27.',
          21
        ),
        text({
          x: '25.5cm',
          y: '11.8cm',
          width: '6.87cm',
          height: '1.1cm',
          text: 'R. SHAH · 31 JAN',
          font: 'Consolas',
          size: 13,
          bold: true,
          color: BR.muted,
          align: 'right',
        }),
      ],
      notes:
        'Max three priorities; each carries an owner and a date. These are the asks — pause here for the decision.',
    },
    {
      background: BR.navy,
      shapes: [
        text({
          name: 'Title',
          x: '2.5cm',
          y: '2.6cm',
          width: '26cm',
          height: '2.3cm',
          text: 'Outlook & Next Steps',
          font: 'Cambria',
          size: 40,
          bold: true,
          color: BR.white,
        }),
        brMarker(2.5, 6.4),
        text({
          x: '3.4cm',
          y: '6.05cm',
          width: '26cm',
          height: '1.5cm',
          text: 'Q4 guidance raised to $88-90M on EMEA momentum.',
          font: 'Calibri',
          size: 20,
          color: BR.white,
        }),
        brMarker(2.5, 8.9),
        text({
          x: '3.4cm',
          y: '8.55cm',
          width: '26cm',
          height: '2.1cm',
          text: 'Watch item: CAC payback trend in SMB — review at the January board.',
          font: 'Calibri',
          size: 20,
          color: BR.white,
        }),
        brMarker(2.5, 11.4),
        text({
          x: '3.4cm',
          y: '11.05cm',
          width: '26cm',
          height: '2.1cm',
          text: 'Decisions logged today circulate within 48 hours with owners and dates.',
          font: 'Calibri',
          size: 20,
          color: BR.white,
        }),
        text({
          x: '2.5cm',
          y: '16.6cm',
          width: '26cm',
          height: '1cm',
          text: 'Prepared by Finance — data as of 30 September',
          font: 'Calibri',
          size: 14,
          color: BR.mutedDark,
        }),
      ],
      notes: 'Close on guidance and the watch item. Confirm the decision log before ending the meeting.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Project Kickoff — white/graphite with teal, deep-teal cover/divider/closing.
// ---------------------------------------------------------------------------
const PK = {
  deep: '0A4F4E',
  teal: '0E7C7B',
  tint: 'EAF4F3',
  panel: 'F4F6F6',
  ink: '1F2933',
  muted: '7B8794',
  onDeep: 'B9D6D4', // muted on deep teal
  white: 'FFFFFF',
};

const pkTitle = (title) =>
  text({
    name: 'Title',
    x: '1.5cm',
    y: '1.1cm',
    width: '30.87cm',
    height: '1.9cm',
    text: title,
    font: 'Cambria',
    size: 36,
    bold: true,
    color: PK.deep,
  });

const pkCircleRow = (label, y, lead, body, bodyWidth = 17.5) => [
  {
    geometry: 'ellipse',
    x: '1.5cm',
    y: `${y - 0.15}cm`,
    width: '1.7cm',
    height: '1.7cm',
    fill: PK.teal,
    line: 'none',
    text: label,
    font: 'Calibri',
    size: 13,
    bold: true,
    color: PK.white,
    align: 'center',
    valign: 'middle',
  },
  text({
    x: '3.7cm',
    y: `${y - 0.1}cm`,
    width: `${bodyWidth}cm`,
    height: '1.2cm',
    text: lead,
    font: 'Calibri',
    size: 20,
    bold: true,
    color: PK.ink,
  }),
  text({
    x: '3.7cm',
    y: `${y + 1.15}cm`,
    width: `${bodyWidth}cm`,
    height: '1.9cm',
    text: body,
    font: 'Calibri',
    size: 18,
    color: PK.ink,
  }),
];

const pkCols = gridX(2);
const pkPhases = gridX(4);
const pkPhaseBox = (i, name, dates) => [
  {
    geometry: 'roundRect',
    name: `Phase${i + 1}`,
    x: `${pkPhases.xs[i]}cm`,
    y: '6.6cm',
    width: `${pkPhases.width}cm`,
    height: '3.2cm',
    fill: i % 2 === 0 ? PK.teal : PK.tint,
    line: 'none',
    text: name,
    font: 'Calibri',
    size: 20,
    bold: true,
    color: i % 2 === 0 ? PK.white : PK.deep,
    align: 'center',
    valign: 'middle',
  },
  text({
    x: `${pkPhases.xs[i]}cm`,
    y: '10.1cm',
    width: `${pkPhases.width}cm`,
    height: '0.9cm',
    text: dates,
    font: 'Consolas',
    size: 13,
    color: PK.muted,
    align: 'center',
  }),
];

const pkRiskCard = (col, row, risk, mitigation, severity) => {
  const y = row === 0 ? 3.8 : 9.9;
  const x = pkCols.xs[col];
  return [
    {
      geometry: 'roundRect',
      x: `${x}cm`,
      y: `${y}cm`,
      width: `${pkCols.width}cm`,
      height: '5.5cm',
      fill: PK.panel,
      line: 'none',
    },
    text({
      x: `${x + 0.7}cm`,
      y: `${y + 0.6}cm`,
      width: `${pkCols.width - 4.2}cm`,
      height: '1.1cm',
      text: risk,
      font: 'Calibri',
      size: 20,
      bold: true,
      color: PK.deep,
    }),
    text({
      x: `${x + pkCols.width - 3.4}cm`,
      y: `${y + 0.7}cm`,
      width: '2.7cm',
      height: '0.8cm',
      text: severity,
      font: 'Consolas',
      size: 12,
      bold: true,
      color: PK.teal,
      align: 'right',
    }),
    text({
      x: `${x + 0.7}cm`,
      y: `${y + 2}cm`,
      width: `${pkCols.width - 1.4}cm`,
      height: '3.1cm',
      text: mitigation,
      font: 'Calibri',
      size: 18,
      color: PK.ink,
    }),
  ];
};

const projectKickoff = {
  file: path.join(OUT_DIR, 'project-kickoff.pptx'),
  slides: [
    {
      background: PK.deep,
      shapes: [
        {
          geometry: 'ellipse',
          x: '23cm',
          y: '-4cm',
          width: '16cm',
          height: '16cm',
          fill: PK.teal,
          opacity: 0.35,
          line: 'none',
        },
        text({
          x: '2.5cm',
          y: '6.1cm',
          width: '20cm',
          height: '0.9cm',
          text: 'PROJECT KICKOFF',
          font: 'Consolas',
          size: 14,
          bold: true,
          color: PK.onDeep,
        }),
        text({
          name: 'Title',
          x: '2.5cm',
          y: '7.2cm',
          width: '25cm',
          height: '2.6cm',
          text: 'Project Atlas — Kickoff',
          font: 'Cambria',
          size: 44,
          bold: true,
          color: PK.white,
        }),
        text({
          x: '2.5cm',
          y: '10.1cm',
          width: '25cm',
          height: '1.1cm',
          text: 'Sponsor: D. Osei — PM: M. Tran — 3 November FY26',
          font: 'Calibri',
          size: 18,
          color: PK.onDeep,
        }),
        text({
          x: '2.5cm',
          y: '16.62cm',
          width: '22cm',
          height: '1cm',
          text: 'Working session — decisions logged in the project charter',
          font: 'Calibri',
          size: 14,
          color: PK.onDeep,
        }),
      ],
      notes: 'Cover. Replace project, sponsor, PM and date. The bleeding circle is the deck motif — keep it.',
    },
    {
      background: PK.white,
      shapes: [
        pkTitle('Why This Project'),
        ...pkCircleRow(
          '1',
          4.1,
          'The problem',
          'Order handling is manual past 500 units/day; error rate doubled in two quarters.'
        ),
        ...pkCircleRow(
          '2',
          8.0,
          'Cost of waiting',
          'Each quarter of delay adds rework cost and blocks the Q2 retail integration.'
        ),
        ...pkCircleRow(
          '3',
          11.9,
          'The opportunity',
          'Automated flow lifts capacity 4x and unblocks two committed customer launches.'
        ),
      ],
      charts: [
        {
          chartType: 'column',
          name: 'CostChart',
          'series1.name': 'Rework cost $K',
          'series1.values': '120,180,260',
          'series1.color': PK.teal,
          categories: 'Now,+1 qtr,+2 qtrs',
          title: 'Cost of waiting, $K per quarter',
          x: '22.5cm',
          y: '3.8cm',
          width: '9.87cm',
          height: '12.6cm',
        },
      ],
      notes: 'Three beats: problem, cost of doing nothing, opportunity. The chart makes the delay cost concrete.',
    },
    {
      background: PK.white,
      shapes: [
        pkTitle('Scope & Deliverables'),
        {
          geometry: 'roundRect',
          x: `${pkCols.xs[0]}cm`,
          y: '3.8cm',
          width: `${pkCols.width}cm`,
          height: '9.4cm',
          fill: PK.tint,
          line: 'none',
        },
        text({
          x: '2.2cm',
          y: '4.4cm',
          width: '13cm',
          height: '1.1cm',
          text: 'In scope',
          font: 'Cambria',
          size: 20,
          bold: true,
          color: PK.deep,
        }),
        text({
          x: '2.2cm',
          y: '5.7cm',
          width: `${pkCols.width - 1.4}cm`,
          height: '7cm',
          text: 'Order intake automation\nWarehouse hand-off API\nOperator dashboard and alerting\nMigration of the current queue',
          font: 'Calibri',
          size: 18,
          color: PK.ink,
        }),
        {
          geometry: 'roundRect',
          x: `${pkCols.xs[1]}cm`,
          y: '3.8cm',
          width: `${pkCols.width}cm`,
          height: '9.4cm',
          fill: PK.panel,
          line: 'none',
        },
        text({
          x: `${pkCols.xs[1] + 0.7}cm`,
          y: '4.4cm',
          width: '13cm',
          height: '1.1cm',
          text: 'Out of scope',
          font: 'Cambria',
          size: 20,
          bold: true,
          color: PK.muted,
        }),
        text({
          x: `${pkCols.xs[1] + 0.7}cm`,
          y: '5.7cm',
          width: `${pkCols.width - 1.4}cm`,
          height: '7cm',
          text: 'Retail partner integration (Q2 project)\nHardware refresh in the warehouse\nBilling system changes',
          font: 'Calibri',
          size: 18,
          color: PK.ink,
        }),
        text({
          x: '1.5cm',
          y: '14cm',
          width: '30.87cm',
          height: '1.8cm',
          text: 'Every deliverable ships with an acceptance criterion agreed by the sponsor before build starts.',
          font: 'Calibri',
          size: 18,
          color: PK.ink,
        }),
      ],
      notes: 'Read out-of-scope out loud — it prevents the most common kickoff misunderstanding.',
    },
    {
      background: PK.white,
      shapes: [
        pkTitle('Team & Responsibilities'),
        ...pkCircleRow(
          'PM',
          3.9,
          'M. Tran — Project manager',
          'Plan, risks, weekly status. Tie-break on schedule questions.',
          16.5
        ),
        ...pkCircleRow(
          'EN',
          7.2,
          'K. Ibarra — Engineering lead',
          'Architecture and delivery. Tie-break on technical questions.',
          16.5
        ),
        ...pkCircleRow(
          'OP',
          10.5,
          'S. Novak — Operations lead',
          'Process design, operator training, cut-over runbook.',
          16.5
        ),
        ...pkCircleRow(
          'QA',
          13.8,
          'L. Devi — Quality lead',
          'Acceptance tests against the agreed criteria; go/no-go input.',
          16.5
        ),
        {
          geometry: 'roundRect',
          name: 'DecisionCard',
          x: '22.5cm',
          y: '3.8cm',
          width: '9.87cm',
          height: '12.6cm',
          fill: PK.tint,
          line: 'none',
        },
        text({
          x: '23.2cm',
          y: '4.5cm',
          width: '8.5cm',
          height: '1.1cm',
          text: 'Decision rights',
          font: 'Cambria',
          size: 20,
          bold: true,
          color: PK.deep,
        }),
        text({
          x: '23.2cm',
          y: '5.9cm',
          width: '8.5cm',
          height: '9.6cm',
          text: 'Scope changes: sponsor\nSchedule inside the quarter: PM\nTechnical approach: engineering lead\nGo/no-go at cut-over: sponsor + QA',
          font: 'Calibri',
          size: 18,
          color: PK.ink,
        }),
      ],
      notes: 'Names and tie-break rights up front; ambiguity here is where projects slip.',
    },
    {
      background: PK.white,
      shapes: [
        pkTitle('Timeline & Milestones'),
        ...pkPhaseBox(0, 'Discover', 'NOV 3 - NOV 14'),
        ...pkPhaseBox(1, 'Build', 'NOV 17 - JAN 9'),
        ...pkPhaseBox(2, 'Pilot', 'JAN 12 - JAN 30'),
        ...pkPhaseBox(3, 'Roll out', 'FEB 2 - FEB 20'),
        text({
          x: '1.5cm',
          y: '12.6cm',
          width: '30.87cm',
          height: '1.2cm',
          text: 'One milestone per phase — each is a demo, not a document:',
          font: 'Calibri',
          size: 18,
          bold: true,
          color: PK.ink,
        }),
        text({
          x: '1.5cm',
          y: '13.9cm',
          width: '30.87cm',
          height: '3.4cm',
          text: 'Signed process map (Nov 14) · First automated order end-to-end (Jan 9) · Pilot at 20% volume (Jan 30) · Full cut-over (Feb 20)',
          font: 'Calibri',
          size: 18,
          color: PK.ink,
        }),
      ],
      connectors: [
        {
          from: 'SLIDE/shape[@name=Phase1]',
          to: 'SLIDE/shape[@name=Phase2]',
          shape: 'elbow',
          color: PK.muted,
          tailEnd: 'triangle',
        },
        {
          from: 'SLIDE/shape[@name=Phase2]',
          to: 'SLIDE/shape[@name=Phase3]',
          shape: 'elbow',
          color: PK.muted,
          tailEnd: 'triangle',
        },
        {
          from: 'SLIDE/shape[@name=Phase3]',
          to: 'SLIDE/shape[@name=Phase4]',
          shape: 'elbow',
          color: PK.muted,
          tailEnd: 'triangle',
        },
      ],
      notes: 'Phases with dates, milestones as demos. Duplicate a phase box if the project has five phases.',
    },
    {
      background: PK.deep,
      shapes: [
        text({
          x: '20cm',
          y: '4.6cm',
          width: '13cm',
          height: '9cm',
          text: '02',
          font: 'Cambria',
          size: 220,
          bold: true,
          color: PK.teal,
          align: 'center',
        }),
        text({
          x: '2.5cm',
          y: '7.4cm',
          width: '18cm',
          height: '0.9cm',
          text: 'SECTION 02',
          font: 'Consolas',
          size: 14,
          bold: true,
          color: PK.onDeep,
        }),
        text({
          name: 'Title',
          x: '2.5cm',
          y: '8.5cm',
          width: '22cm',
          height: '2.4cm',
          text: 'Execution & Governance',
          font: 'Cambria',
          size: 40,
          bold: true,
          color: PK.white,
        }),
      ],
      notes: 'Divider before the execution details. The giant number matches the agenda order.',
    },
    {
      background: PK.white,
      shapes: [
        pkTitle('Risks & Mitigations'),
        ...pkRiskCard(
          0,
          0,
          'Legacy queue data quality',
          'Sample 1,000 records in week one; budget a cleanup sprint before migration.',
          'HIGH'
        ),
        ...pkRiskCard(
          1,
          0,
          'Operator adoption',
          'Two operators embedded in the pilot; training runbook owned by Operations.',
          'MED'
        ),
        ...pkRiskCard(
          0,
          1,
          'Warehouse API stability',
          'Contract test suite against the staging API from week two.',
          'MED'
        ),
        ...pkRiskCard(
          1,
          1,
          'Holiday freeze overlap',
          'Build phase spans the freeze — pilot start is the buffer, not the deadline.',
          'LOW'
        ),
      ],
      notes: 'Each risk pairs with a mitigation and an owner. Review this grid at every steering meeting.',
    },
    {
      background: PK.deep,
      shapes: [
        text({
          name: 'Title',
          x: '2.5cm',
          y: '2.6cm',
          width: '26cm',
          height: '2.3cm',
          text: 'Next Steps',
          font: 'Cambria',
          size: 40,
          bold: true,
          color: PK.white,
        }),
        text({
          x: '2.5cm',
          y: '6.05cm',
          width: '22cm',
          height: '1.5cm',
          text: 'Confirm the charter and decision rights in writing.',
          font: 'Calibri',
          size: 20,
          color: PK.white,
        }),
        text({
          x: '25cm',
          y: '6.15cm',
          width: '6.87cm',
          height: '1.1cm',
          text: 'SPONSOR · NOV 5',
          font: 'Consolas',
          size: 13,
          bold: true,
          color: PK.onDeep,
          align: 'right',
        }),
        text({
          x: '2.5cm',
          y: '8.55cm',
          width: '22cm',
          height: '1.5cm',
          text: 'Discovery interviews with all four operator shifts.',
          font: 'Calibri',
          size: 20,
          color: PK.white,
        }),
        text({
          x: '25cm',
          y: '8.65cm',
          width: '6.87cm',
          height: '1.1cm',
          text: 'PM · NOV 14',
          font: 'Consolas',
          size: 13,
          bold: true,
          color: PK.onDeep,
          align: 'right',
        }),
        text({
          x: '2.5cm',
          y: '11.05cm',
          width: '22cm',
          height: '1.5cm',
          text: 'Staging access to the warehouse API.',
          font: 'Calibri',
          size: 20,
          color: PK.white,
        }),
        text({
          x: '25cm',
          y: '11.15cm',
          width: '6.87cm',
          height: '1.1cm',
          text: 'ENG · NOV 7',
          font: 'Consolas',
          size: 13,
          bold: true,
          color: PK.onDeep,
          align: 'right',
        }),
        text({
          x: '2.5cm',
          y: '16.6cm',
          width: '26cm',
          height: '1cm',
          text: 'Weekly status every Friday — first steering review 21 November',
          font: 'Calibri',
          size: 14,
          color: PK.onDeep,
        }),
      ],
      notes: 'Every commitment has an owner and a date. Close by confirming the first steering review.',
    },
  ],
};

for (const deck of [businessReview, projectKickoff]) buildDeck(deck.file, deck.slides);
console.log('Reference decks regenerated.');
