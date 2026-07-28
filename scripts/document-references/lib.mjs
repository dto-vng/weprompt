/**
 * Shared harness for the built-in DOCX reference documents.
 *
 * Design contract (mirrors each template's THEME.md): a reference exercises the
 * full structural catalog a generated document should clone — real Word styles,
 * real numbering definitions, explicit table geometry, and page furniture. Sample
 * content is generic and is replaced wholesale by generation.
 *
 * Verified officecli behaviour this harness depends on:
 *  - a fresh file has no styles part, so styles must be defined before use;
 *  - heading styles need Word's lowercase built-in display name ("heading 1")
 *    to register in `view outline`;
 *  - numbering ids are deterministic: decimal defined first -> numId 1,
 *    bullet second -> numId 2;
 *  - a pagebreak occupies a /body/p index (it is an empty paragraph).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

export const OUT_DIR = path.resolve('packages/desktop/resources/presentation-templates');
mkdirSync(OUT_DIR, { recursive: true });

export const run = (args) => execFileSync('officecli', args, { stdio: 'inherit' });

/** Numbering ids on a fresh file, in the order defineNumbering creates them. */
export const NUM_DECIMAL = 1;
export const NUM_BULLET = 2;

/** US Letter portrait, 1in margins, in twips. */
export const LETTER_PORTRAIT = {
  pageWidth: 12240,
  pageHeight: 15840,
  marginTop: 1440,
  marginBottom: 1440,
  marginLeft: 1440,
  marginRight: 1440,
};

/** Usable text width for US Letter with 1in margins, in twips. Table colWidths must sum to this. */
export const USABLE_TWIPS = 9360;

const propArgs = (props) =>
  Object.entries(props).flatMap(([key, value]) => (value === undefined ? [] : ['--prop', `${key}=${value}`]));

const defineNumbering = (file) => {
  run(['add', file, '/numbering', '--type', 'abstractnum', '--prop', 'format=decimal']);
  run(['add', file, '/numbering', '--type', 'num', '--prop', 'abstractNumId=0']);
  run(['add', file, '/numbering', '--type', 'abstractnum', '--prop', 'format=bullet']);
  run(['add', file, '/numbering', '--type', 'num', '--prop', 'abstractNumId=1']);
};

const defineStyles = (file, styles) => {
  for (const style of styles) {
    // Every style defaults to basing itself on Normal unless it overrides `basedOn`,
    // except Normal itself — Normal must not carry a self-referential w:basedOn.
    const basedOn = style.id === 'Normal' ? {} : { basedOn: 'Normal' };
    run(['add', file, '/styles', '--type', 'style', ...propArgs({ type: 'paragraph', ...basedOn, ...style })]);
  }
};

/**
 * Emits one block and returns how many /body/p indices it consumed, so the
 * caller can address the paragraphs it just created (tabs, borders).
 */
const emitBlock = (file, block, pIndex, state) => {
  switch (block.type) {
    case 'para': {
      const { type: _type, rule, tabs, ...props } = block;
      run(['add', file, '/body', '--type', 'paragraph', ...propArgs(props)]);
      if (rule) run(['set', file, `/body/p[${pIndex}]`, '--prop', `pbdr.bottom=${rule}`]);
      // Explicit tab stops (e.g. an addressing block's LABEL:\tvalue columns) — without
      // one, `\t` falls back to Word's default stops, which land inconsistently once a
      // label is wide enough to cross the next default increment.
      if (tabs) for (const tab of tabs) run(['add', file, `/body/p[${pIndex}]`, '--type', 'tab', ...propArgs(tab)]);
      return 1;
    }
    case 'pagebreak': {
      run(['add', file, '/body', '--type', 'pagebreak']);
      return 1;
    }
    case 'tocline': {
      run([
        'add',
        file,
        '/body',
        '--type',
        'paragraph',
        ...propArgs({ text: `${block.label}\t${block.page}`, size: '11pt', spaceAfter: '4pt' }),
      ]);
      run([
        'add',
        file,
        `/body/p[${pIndex}]`,
        '--type',
        'tab',
        '--prop',
        'pos=6in',
        '--prop',
        'val=right',
        '--prop',
        'leader=dot',
      ]);
      return 1;
    }
    case 'list': {
      const numId = block.ordered ? NUM_DECIMAL : NUM_BULLET;
      for (const item of block.items) {
        run([
          'add',
          file,
          '/body',
          '--type',
          'paragraph',
          ...propArgs({ text: item, numId, ilvl: 0, size: '11pt', spaceAfter: '4pt' }),
        ]);
      }
      return block.items.length;
    }
    case 'table': {
      const rowCount = block.rows.length + 1;
      const colCount = block.header.length;
      run([
        'add',
        file,
        '/body',
        '--type',
        'table',
        ...propArgs({
          rows: rowCount,
          cols: colCount,
          colWidths: block.colWidths.join(','),
          layout: 'fixed',
          padding: 100,
        }),
      ]);
      state.tableIndex += 1;
      const tbl = `/body/tbl[${state.tableIndex}]`;
      const cells = (values) => Object.fromEntries(values.map((value, i) => [`c${i + 1}`, value]));
      run(['set', file, `${tbl}/tr[1]`, '--prop', 'header=true', ...propArgs(cells(block.header))]);
      block.rows.forEach((row, i) => {
        run(['set', file, `${tbl}/tr[${i + 2}]`, ...propArgs(cells(row))]);
      });
      // Tables do not occupy /body/p indices.
      return 0;
    }
    default:
      throw new Error(`unknown block type: ${block.type}`);
  }
};

/** Builds one reference document end to end and validates it. */
export const buildDocument = ({ file, page, styles, blocks }) => {
  rmSync(file, { force: true });
  run(['create', file]);
  run(['open', file]);
  try {
    run(['set', file, '/', ...propArgs({ ...LETTER_PORTRAIT, ...page })]);
    defineNumbering(file);
    defineStyles(file, styles);
    const state = { tableIndex: 0 };
    let pIndex = 1;
    for (const block of blocks) pIndex += emitBlock(file, block, pIndex, state);
  } finally {
    run(['close', file]);
  }
  run(['validate', file]);
  console.log(`generated ${file}`);
};

/**
 * Shared style sheet. Heading display names MUST stay lowercase ("heading 1") —
 * that is Word's built-in name and what makes `view outline` treat them as headings.
 */
export const styleSheet = ({ display, body, ink, accent, titleSize = '32pt' }) => [
  { id: 'Normal', name: 'Normal', font: body, size: '11pt', color: ink, spaceAfter: '8pt' },
  {
    id: 'Title',
    name: 'Title',
    font: display,
    size: titleSize,
    bold: true,
    color: accent,
    spaceAfter: '8pt',
    qFormat: true,
  },
  {
    id: 'Heading1',
    name: 'heading 1',
    next: 'Normal',
    font: display,
    size: '16pt',
    bold: true,
    color: accent,
    spaceBefore: '18pt',
    spaceAfter: '8pt',
    qFormat: true,
  },
  {
    id: 'Heading2',
    name: 'heading 2',
    next: 'Normal',
    font: display,
    size: '13pt',
    bold: true,
    color: ink,
    spaceBefore: '14pt',
    spaceAfter: '6pt',
    qFormat: true,
  },
  {
    id: 'Heading3',
    name: 'heading 3',
    next: 'Normal',
    font: body,
    size: '11pt',
    bold: true,
    color: ink,
    spaceBefore: '10pt',
    spaceAfter: '4pt',
    qFormat: true,
  },
];
