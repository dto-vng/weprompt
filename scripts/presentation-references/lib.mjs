/**
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

export const OUT_DIR = path.resolve('packages/desktop/resources/presentation-templates');
mkdirSync(OUT_DIR, { recursive: true });

export const run = (args) => execFileSync('officecli', args, { stdio: 'inherit' });

/** Slide canvas: 33.87cm x 19.05cm (16:9). Grid: 1.5cm margins, 0.76cm gaps. */
export const SLIDE_W = 33.87;

const stringifyProps = (props) => Object.fromEntries(Object.entries(props).map(([key, value]) => [key, String(value)]));

export const buildDeck = (file, slides) => {
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
export const text = (props) => ({ geometry: 'rect', fill: 'none', line: 'none', valign: 'top', ...props });

export const gridX = (cols, margin = 1.5, gap = 0.76) => {
  const usable = SLIDE_W - 2 * margin - (cols - 1) * gap;
  const width = Math.round((usable / cols) * 100) / 100;
  return { width, xs: Array.from({ length: cols }, (_, i) => Math.round((margin + i * (width + gap)) * 100) / 100) };
};
