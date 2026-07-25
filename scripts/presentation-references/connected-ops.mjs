import path from 'node:path';
import { text, gridX, OUT_DIR } from './lib.mjs';

// ---------------------------------------------------------------------------
// Connected Ops — light industrial operations system. Calibri bold ink
// display titles, Consolas kickers, sparse outlined hexagon accents, green
// primary with orange hero numerals, KPI pill grid, placeholder media
// frames, deep-green closing. White background on all content slides.
// ---------------------------------------------------------------------------
const CO = {
  green: '00A650',
  deep: '0E4D30',
  orange: 'F59A23',
  ink: '1F2933',
  muted: '5B6B82',
  pill: 'EEF2F5',
  hexline: 'E3E8EC',
  panel: 'F7F9FA',
  white: 'FFFFFF',
};

/** Sparse chrome accent: outlined hexagon, corners only, behind content. */
const coHex = (x, y, size, filled = false) => ({
  geometry: 'hexagon',
  x: `${x}cm`,
  y: `${y}cm`,
  width: `${size}cm`,
  height: `${size}cm`,
  fill: filled ? CO.panel : 'none',
  line: CO.hexline,
  lineWidth: '1pt',
});

/** Small solid hexagon used as a bullet / icon chip, optionally numbered. */
const coHexChip = (x, y, size, fill, label = '') => ({
  geometry: 'hexagon',
  x: `${x}cm`,
  y: `${y}cm`,
  width: `${size}cm`,
  height: `${size}cm`,
  fill,
  line: 'none',
  ...(label
    ? {
        text: label,
        font: 'Calibri',
        size: 13,
        bold: true,
        color: CO.white,
        align: 'center',
        valign: 'middle',
        margin: 0,
      }
    : {}),
});

const coKicker = (str, x = 1.5, y = 1.0) =>
  text({
    x: `${x}cm`,
    y: `${y}cm`,
    width: '16cm',
    height: '0.8cm',
    text: str,
    font: 'Consolas',
    size: 13,
    bold: true,
    color: CO.green,
  });

const coTitle = (title) =>
  text({
    name: 'Title',
    x: '1.5cm',
    y: '1.1cm',
    width: '30.87cm',
    height: '1.9cm',
    text: title,
    font: 'Calibri',
    size: 36,
    bold: true,
    color: CO.ink,
  });

/** Media slot — placeholder frame only, never a photo or a logo. */
const coMediaFrame = (x, y, width, height) => ({
  geometry: 'roundRect',
  name: 'MediaPlaceholder',
  x: `${x}cm`,
  y: `${y}cm`,
  width: `${width}cm`,
  height: `${height}cm`,
  fill: CO.panel,
  line: CO.hexline,
  lineWidth: '1pt',
  text: '[ MEDIA — replace or delete ]',
  font: 'Calibri',
  size: 14,
  color: CO.muted,
  align: 'center',
  valign: 'middle',
});

const coAgendaRow = (index, y, item, description) => [
  coHexChip(1.5, y + 0.05, 1.0, CO.green, String(index)),
  text({
    x: '3.2cm',
    y: `${y}cm`,
    width: '27cm',
    height: '1.1cm',
    text: item,
    font: 'Calibri',
    size: 20,
    bold: true,
    color: CO.ink,
  }),
  text({
    x: '3.2cm',
    y: `${y + 1.15}cm`,
    width: '27cm',
    height: '1.1cm',
    text: description,
    font: 'Calibri',
    size: 18,
    color: CO.muted,
  }),
];

const coPills = gridX(3);
const coPill = (col, y, number, label) => [
  {
    geometry: 'roundRect',
    name: `Pill_${label.replaceAll(' ', '')}`,
    x: `${coPills.xs[col]}cm`,
    y: `${y}cm`,
    width: `${coPills.width}cm`,
    height: '4.6cm',
    fill: CO.pill,
    line: 'none',
  },
  {
    geometry: 'rect',
    x: `${coPills.xs[col]}cm`,
    y: `${y + 0.55}cm`,
    width: '0.15cm',
    height: '3.5cm',
    fill: CO.green,
    line: 'none',
  },
  text({
    x: `${coPills.xs[col] + 0.75}cm`,
    y: `${y + 0.65}cm`,
    width: `${coPills.width - 1.5}cm`,
    height: '1.55cm',
    text: number,
    font: 'Calibri',
    size: 28,
    bold: true,
    color: CO.ink,
  }),
  text({
    x: `${coPills.xs[col] + 0.75}cm`,
    y: `${y + 2.25}cm`,
    width: `${coPills.width - 1.5}cm`,
    height: '1.9cm',
    text: label,
    font: 'Calibri',
    size: 14,
    color: CO.muted,
  }),
];

const coUseCaseCard = (col, title, body, metric) => [
  {
    geometry: 'roundRect',
    name: `Card${col + 1}`,
    x: `${coPills.xs[col]}cm`,
    y: '4.4cm',
    width: `${coPills.width}cm`,
    height: '11.8cm',
    fill: CO.white,
    line: CO.hexline,
    lineWidth: '1pt',
  },
  coHexChip(coPills.xs[col] + 0.9, 5.4, 1.2, CO.green),
  text({
    x: `${coPills.xs[col] + 0.9}cm`,
    y: '7.2cm',
    width: `${coPills.width - 1.8}cm`,
    height: '1.0cm',
    text: title,
    font: 'Calibri',
    size: 18,
    bold: true,
    color: CO.ink,
  }),
  text({
    x: `${coPills.xs[col] + 0.9}cm`,
    y: '8.5cm',
    width: `${coPills.width - 1.8}cm`,
    height: '3.4cm',
    text: body,
    font: 'Calibri',
    size: 14,
    color: CO.muted,
  }),
  text({
    x: `${coPills.xs[col] + 0.9}cm`,
    y: '14.4cm',
    width: `${coPills.width - 1.8}cm`,
    height: '1.0cm',
    text: metric,
    font: 'Calibri',
    size: 14,
    bold: true,
    color: CO.orange,
  }),
];

const coRegions = gridX(4);
const coRegionBlock = (col, region, chipLabel, chipFill, chipTextColor, sites) => [
  text({
    x: `${coRegions.xs[col]}cm`,
    y: '6.0cm',
    width: `${coRegions.width}cm`,
    height: '1.0cm',
    text: region,
    font: 'Calibri',
    size: 18,
    bold: true,
    color: CO.ink,
  }),
  {
    geometry: 'roundRect',
    x: `${coRegions.xs[col]}cm`,
    y: '7.3cm',
    width: '2.6cm',
    height: '0.9cm',
    fill: chipFill,
    line: 'none',
    text: chipLabel,
    font: 'Calibri',
    size: 12,
    bold: true,
    color: chipTextColor,
    align: 'center',
    valign: 'middle',
  },
  text({
    x: `${coRegions.xs[col]}cm`,
    y: '8.6cm',
    width: `${coRegions.width}cm`,
    height: '0.9cm',
    text: sites,
    font: 'Calibri',
    size: 14,
    color: CO.muted,
  }),
];

const coClosingRow = (y, statement) => [
  coHexChip(1.5, y + 0.15, 0.8, CO.orange),
  text({
    x: '2.9cm',
    y: `${y}cm`,
    width: '29cm',
    height: '1.3cm',
    text: statement,
    font: 'Calibri',
    size: 20,
    bold: true,
    color: CO.white,
  }),
];

const connectedOps = {
  file: path.join(OUT_DIR, 'connected-ops.pptx'),
  slides: [
    {
      background: CO.white,
      shapes: [
        coHex(-1.8, -1.6, 5.6),
        coHex(2.9, -1.0, 3.2, true),
        coHex(0.6, 2.6, 2.1),
        coKicker('NORTHWIND OPERATIONS · [DATE]', 1.5, 5.5),
        text({
          name: 'Title',
          x: '1.5cm',
          y: '6.4cm',
          width: '16cm',
          height: '4.6cm',
          text: 'Connected Operations Review',
          font: 'Calibri',
          size: 42,
          bold: true,
          color: CO.ink,
        }),
        text({
          x: '1.5cm',
          y: '11.3cm',
          width: '16cm',
          height: '1.2cm',
          text: 'The future is running',
          font: 'Calibri',
          size: 20,
          bold: true,
          color: CO.green,
        }),
        coMediaFrame(18.4, 4.5, 13.9, 10),
      ],
      notes:
        'Cover. Replace the operations name, date and media placeholder; keep the outlined hexagon cluster — it is the deck signature.',
    },
    {
      background: CO.white,
      shapes: [
        coTitle('Agenda'),
        ...coAgendaRow(1, 4.7, 'Network status', 'Where the connected network stands after this quarter.'),
        ...coAgendaRow(2, 7.9, 'Use cases in production', 'Three use cases now running at scale on live lines.'),
        ...coAgendaRow(3, 11.1, 'Rollout plan', 'Wave sequencing for the remaining regions this year.'),
        ...coAgendaRow(4, 14.3, 'Asks', 'What we need from this group to hold the plan.'),
      ],
      notes: 'Agenda. Four items maximum; the numbered green hexagons echo the section dividers.',
    },
    {
      background: CO.white,
      shapes: [
        text({
          name: 'Title',
          x: '1.5cm',
          y: '1.8cm',
          width: '7.2cm',
          height: '2.0cm',
          text: 'We reached',
          font: 'Calibri',
          size: 32,
          bold: true,
          color: CO.ink,
          valign: 'bottom',
          margin: 0,
        }),
        text({
          x: '8.2cm',
          y: '1.6cm',
          width: '2.4cm',
          height: '2.2cm',
          text: '47',
          font: 'Calibri',
          size: 40,
          bold: true,
          color: CO.orange,
          valign: 'bottom',
          margin: 0,
        }),
        text({
          x: '10.1cm',
          y: '1.8cm',
          width: '13cm',
          height: '2.0cm',
          text: 'connected sites',
          font: 'Calibri',
          size: 32,
          bold: true,
          color: CO.ink,
          valign: 'bottom',
          margin: 0,
        }),
        ...coPill(0, 5.6, '31', 'Active use cases'),
        ...coPill(1, 5.6, '5,400+', 'Connected workers'),
        ...coPill(2, 5.6, '1,180', 'Connected machines'),
        ...coPill(0, 11.0, '52', 'Sites in rollout'),
        ...coPill(1, 11.0, '90k', 'Data tags'),
        ...coPill(2, 11.0, '14', '3D printers deployed'),
      ],
      notes:
        'KPI pill grid. The orange numeral in the headline is the hero number — update it with the grid. Keep number first inside each pill.',
    },
    {
      background: CO.white,
      shapes: [
        coTitle('On the ground'),
        coMediaFrame(1.5, 4.6, 15, 10.5),
        text({
          x: '17.8cm',
          y: '4.6cm',
          width: '14.5cm',
          height: '2.2cm',
          text: 'Operators see the line the way the network sees it.',
          font: 'Calibri',
          size: 20,
          bold: true,
          color: CO.ink,
        }),
        text({
          x: '17.8cm',
          y: '7.1cm',
          width: '14.5cm',
          height: '2.7cm',
          text: 'Every connected site streams machine, quality, and energy data into one shared operations view.',
          font: 'Calibri',
          size: 18,
          color: CO.muted,
        }),
        text({
          x: '17.8cm',
          y: '10.0cm',
          width: '14.5cm',
          height: '2.7cm',
          text: 'Teams act on live signals instead of end-of-shift reports, and fixes travel between sites in days.',
          font: 'Calibri',
          size: 18,
          color: CO.muted,
        }),
        text({
          x: '17.8cm',
          y: '13.0cm',
          width: '14.5cm',
          height: '2.0cm',
          text: 'Downtime on connected lines is down 18% year over year.',
          font: 'Calibri',
          size: 18,
          bold: true,
          color: CO.green,
        }),
      ],
      notes:
        'Media and narrative split. Swap the placeholder for site footage; keep the green stat line as the single proof point.',
    },
    {
      background: CO.white,
      shapes: [
        coTitle('Use cases in production'),
        ...coUseCaseCard(
          0,
          'Predictive quality',
          'Inline sensors flag drift before defects appear, holding first-pass yield on every shift.',
          '-32% quality escapes'
        ),
        ...coUseCaseCard(
          1,
          'Line monitoring',
          'Live dashboards track speed, stops, and losses on every packaging line in the network.',
          '+9% line utilization'
        ),
        ...coUseCaseCard(
          2,
          'Guided maintenance',
          'Technicians follow digital work instructions with parts and machine history attached.',
          '-27% mean time to repair'
        ),
      ],
      notes: 'Use-case cards. One use case per card; the orange metric line is the only number on the card.',
    },
    {
      background: CO.panel,
      shapes: [
        coHex(26.2, 1.9, 5.8),
        coHex(4.9, 13.6, 3.4),
        text({
          x: '2.5cm',
          y: '4.4cm',
          width: '11cm',
          height: '5.6cm',
          text: '02',
          font: 'Calibri',
          size: 120,
          bold: true,
          color: CO.orange,
        }),
        text({
          name: 'Title',
          x: '2.6cm',
          y: '10.6cm',
          width: '24cm',
          height: '1.8cm',
          text: 'Rollout plan',
          font: 'Calibri',
          size: 32,
          bold: true,
          color: CO.ink,
        }),
      ],
      notes: 'Section divider. Whitespace is intentional — the giant orange numeral matches the agenda order.',
    },
    {
      background: CO.white,
      shapes: [
        coTitle('Rollout by region'),
        ...coRegionBlock(0, 'Northern Europe', 'Live', CO.green, CO.white, '24 sites connected'),
        ...coRegionBlock(1, 'Americas', 'Live', CO.green, CO.white, '18 sites connected'),
        ...coRegionBlock(2, 'Asia Pacific', 'Q3', CO.orange, CO.white, '14 sites in wave'),
        ...coRegionBlock(3, 'Middle East', 'Q4', CO.pill, CO.orange, '12 sites in wave'),
        {
          geometry: 'rect',
          name: 'ProgressTrack',
          x: '1.5cm',
          y: '13.2cm',
          width: '30.87cm',
          height: '0.8cm',
          fill: CO.pill,
          line: 'none',
        },
        {
          geometry: 'rect',
          name: 'ProgressFill',
          x: '1.5cm',
          y: '13.2cm',
          width: '14.58cm',
          height: '0.8cm',
          fill: CO.green,
          line: 'none',
        },
        text({
          x: '1.5cm',
          y: '14.3cm',
          width: '30.87cm',
          height: '0.8cm',
          text: '[N] OF [M] SITES CONNECTED',
          font: 'Consolas',
          size: 12,
          bold: true,
          color: CO.muted,
        }),
      ],
      notes:
        'Rollout status row. Green chips are live regions, orange chips are planned waves; size the green bar to the connected share.',
    },
    {
      background: CO.deep,
      shapes: [
        text({
          name: 'Title',
          x: '1.5cm',
          y: '2.6cm',
          width: '28cm',
          height: '2.1cm',
          text: 'Next steps',
          font: 'Calibri',
          size: 36,
          bold: true,
          color: CO.white,
        }),
        ...coClosingRow(6.4, 'Confirm the wave-three site list by the end of this month.'),
        ...coClosingRow(9.2, 'Fund the connectivity upgrade for the remaining legacy lines.'),
        ...coClosingRow(12.0, 'Nominate a site champion for every location in the next wave.'),
        text({
          x: '1.5cm',
          y: '16.6cm',
          width: '28cm',
          height: '1cm',
          text: 'Northwind Operations · Connected Operations Program',
          font: 'Calibri',
          size: 14,
          color: CO.pill,
        }),
      ],
      notes:
        'Closing. Deep-green full-bleed; keep to three asks with orange hexagon bullets and end on the program footer.',
    },
  ],
};

export default { name: 'connected-ops', file: connectedOps.file, slides: connectedOps.slides };
