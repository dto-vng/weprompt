#!/usr/bin/env node
/**
 * Generates the two original built-in PPTX reference decks via officecli.
 * Run from repo root: node scripts/generate-presentation-references.mjs
 * Re-run only when deck design changes; output files are committed.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('packages/desktop/resources/presentation-templates');
mkdirSync(OUT_DIR, { recursive: true });

const run = (args, input) =>
  execFileSync('officecli', args, { input, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit' });

// Original "Business Review" visual system: navy/white, amber accent, Calibri.
const BUSINESS = {
  file: path.join(OUT_DIR, 'business-review.pptx'),
  bg: '0B1F3A', // deep navy
  ink: 'FFFFFF',
  accent: 'F2A33C', // amber
  muted: '9DB0C9',
  slides: [
    { title: 'Quarterly Business Review', subtitle: 'Company · Quarter · Presenter', kicker: 'CONFIDENTIAL' },
    { title: 'Executive Summary', body: 'Three sentences on performance, drivers and outlook.' },
    { title: 'KPI Scorecard', body: 'Revenue · Margin · NRR · Headcount (replace with a 4-stat row).' },
    { title: 'Segment Results', body: 'One segment per block: result, driver, action.' },
    { title: 'Priorities & Decisions', body: 'Max three priorities. Each with an owner and a date.' },
  ],
};

// Original "Project Kickoff" visual system: white/graphite, teal accent.
const KICKOFF = {
  file: path.join(OUT_DIR, 'project-kickoff.pptx'),
  bg: 'FFFFFF',
  ink: '1F2933',
  accent: '0E7C7B', // teal
  muted: '7B8794',
  slides: [
    { title: 'Project Kickoff', subtitle: 'Project · Date · Sponsor', kicker: 'KICKOFF' },
    { title: 'Why This Project', body: 'The problem, the cost of doing nothing, the opportunity.' },
    { title: 'Scope & Deliverables', body: 'In scope / out of scope. Deliverables with acceptance criteria.' },
    { title: 'Team & Responsibilities', body: 'Roles, owners, decision rights (RACI-style).' },
    { title: 'Timeline & Milestones', body: 'Phases with dates. One milestone per phase.' },
  ],
};

for (const deck of [BUSINESS, KICKOFF]) {
  rmSync(deck.file, { force: true });
  run(['create', deck.file]);
  const commands = [];
  deck.slides.forEach((slide, index) => {
    // `officecli create` yields a deck with 0 slides (not 1), so every slide
    // — including the first — needs an explicit add.
    commands.push({ command: 'add', parent: '/', type: 'slide' });
    const slidePath = `/slide[${index + 1}]`;
    commands.push({
      command: 'add',
      parent: slidePath,
      type: 'shape',
      props: { geometry: 'rect', x: '0cm', y: '0cm', width: '33.87cm', height: '19.05cm', fill: deck.bg, line: 'none' },
    });
    commands.push({
      command: 'add',
      parent: slidePath,
      type: 'shape',
      props: {
        geometry: 'rect',
        x: '2cm',
        y: index === 0 ? '5.2cm' : '2.2cm',
        width: '8cm',
        height: '0.18cm',
        fill: deck.accent,
        line: 'none',
      },
    });
    if (slide.kicker) {
      commands.push({
        command: 'add',
        parent: slidePath,
        type: 'shape',
        props: {
          text: slide.kicker,
          x: '2cm',
          y: '4.2cm',
          width: '12cm',
          height: '1cm',
          size: '12pt',
          color: deck.accent,
          font: 'Consolas',
          line: 'none',
        },
      });
    }
    commands.push({
      command: 'add',
      parent: slidePath,
      type: 'shape',
      props: {
        text: slide.title,
        x: '2cm',
        y: index === 0 ? '5.6cm' : '2.6cm',
        width: '28cm',
        height: '3cm',
        size: index === 0 ? '44pt' : '32pt',
        bold: 'true',
        color: deck.ink,
        font: 'Calibri',
        line: 'none',
      },
    });
    const secondary = slide.subtitle ?? slide.body;
    if (secondary) {
      commands.push({
        command: 'add',
        parent: slidePath,
        type: 'shape',
        props: {
          text: secondary,
          x: '2cm',
          y: index === 0 ? '9cm' : '6cm',
          width: '26cm',
          height: '6cm',
          size: '16pt',
          color: deck.muted,
          font: 'Calibri',
          line: 'none',
        },
      });
    }
    commands.push({
      command: 'add',
      parent: slidePath,
      type: 'shape',
      props: {
        text: `${String(index + 1).padStart(2, '0')}`,
        x: '31cm',
        y: '17.6cm',
        width: '2cm',
        height: '1cm',
        size: '10pt',
        color: deck.muted,
        font: 'Consolas',
        line: 'none',
      },
    });
  });
  run(['batch', deck.file, '--commands', JSON.stringify(commands)]);
  run(['close', deck.file]);
  run(['validate', deck.file]);
  console.log(`generated ${deck.file}`);
}
