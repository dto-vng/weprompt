/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTemplateLabels } from '@/renderer/components/chat/TemplateGallery/usePresentationTemplates';
import type {
  PresentationTemplateSource,
  PresentationTemplateSummary,
} from '@/common/types/office/presentationTemplate';

// Swappable so the same mocked t() can serve a hand-written fixture and, later,
// a flattened real locale file — letting the second suite drive the hook itself
// rather than re-deriving its key format.
let LOOKUP: Record<string, string> = {};

// Fixture: only `business-review` is localized, so it exercises both the hit and
// the missing-id fallback.
const FIXTURE: Record<string, string> = {
  'conversation.presentationTemplates.catalog.business-review.name': 'Quartalsreview',
  'conversation.presentationTemplates.catalog.business-review.description': 'Deck für Quartalsergebnisse',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => LOOKUP[key] ?? opts?.defaultValue ?? key,
  }),
}));

const summary = (id: string, source: PresentationTemplateSource): PresentationTemplateSummary =>
  ({
    manifest: {
      id,
      name: `manifest ${id}`,
      description: `manifest description for ${id}`,
      format: 'pptx',
      kind: 'deck',
      source,
      themeFile: 'THEME.md',
      referenceFile: 'reference.pptx',
      preview: 'preview.svg',
      version: 1,
      createdAt: 'now',
    },
    themePath: `/abs/${id}/THEME.md`,
    referencePath: `/abs/${id}/reference.pptx`,
    previewDataUrl: 'data:image/svg+xml;base64,x',
  }) as PresentationTemplateSummary;

describe('useTemplateLabels', () => {
  const labelsOf = () => renderHook(() => useTemplateLabels()).result.current;
  beforeEach(() => {
    LOOKUP = FIXTURE;
  });

  it('localizes a built-in template from the catalog', () => {
    expect(labelsOf()(summary('business-review', 'builtin'))).toEqual({
      name: 'Quartalsreview',
      description: 'Deck für Quartalsergebnisse',
    });
  });

  it('falls back to the manifest for a built-in missing from the catalog', () => {
    expect(labelsOf()(summary('brand-new-pack', 'builtin'))).toEqual({
      name: 'manifest brand-new-pack',
      description: 'manifest description for brand-new-pack',
    });
  });

  it('never localizes user-imported templates', () => {
    // A user template's name is the user's own content — translating it, or
    // worse colliding with a built-in id, would rewrite what they typed.
    expect(labelsOf()(summary('business-review', 'user'))).toEqual({
      name: 'manifest business-review',
      description: 'manifest description for business-review',
    });
  });
});

// The hook builds its key by string concatenation, so a typo in the path would
// make EVERY locale fall back to the manifest silently — and en-US would still
// look correct, because the en-US catalog is intentionally identical to the
// manifest English. These assertions read the shipped locale files so that
// failure mode cannot hide.
describe('built-in template catalog (real locale files)', () => {
  const LOCALES_DIR = path.resolve(__dirname, '../../../packages/desktop/src/renderer/services/i18n/locales');
  const MANIFEST = path.resolve(
    __dirname,
    '../../../packages/desktop/src/process/resources/presentation-templates/index.ts'
  );
  const manifestSrc = fs.readFileSync(MANIFEST, 'utf-8');
  const builtinIds = [...manifestSrc.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
  const locales = fs.readdirSync(LOCALES_DIR).filter((d) => /^[a-z]{2}-[A-Z]{2}$/.test(d));

  const catalogOf = (locale: string) =>
    JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'conversation.json'), 'utf-8')).presentationTemplates
      .catalog;

  it('covers every built-in id in all 12 locales', () => {
    expect(builtinIds).toHaveLength(12);
    expect(locales).toHaveLength(12);
    for (const locale of locales) {
      const catalog = catalogOf(locale);
      expect(Object.keys(catalog).toSorted(), locale).toEqual([...builtinIds].toSorted());
      for (const id of builtinIds) {
        expect(catalog[id].name?.length, `${locale}/${id}.name`).toBeGreaterThan(0);
        expect(catalog[id].description?.length, `${locale}/${id}.description`).toBeGreaterThan(0);
      }
    }
  });

  it('drives the hook against the real de-DE file, so a bad key path cannot hide', () => {
    // Flatten de-DE the way i18next would, then let the hook build its own key.
    // If the hook's path is wrong, every lookup misses and falls back to the
    // manifest English — which this asserts against.
    const catalog = catalogOf('de-DE');
    LOOKUP = Object.fromEntries(
      builtinIds.flatMap((id) => [
        [`conversation.presentationTemplates.catalog.${id}.name`, catalog[id].name],
        [`conversation.presentationTemplates.catalog.${id}.description`, catalog[id].description],
      ])
    );

    const resolve = renderHook(() => useTemplateLabels()).result.current;
    expect(resolve(summary('business-review', 'builtin'))).toEqual({
      name: 'Quartalsreview',
      description: catalog['business-review'].description,
    });
    for (const id of builtinIds) {
      const labels = resolve(summary(id, 'builtin'));
      expect(labels.name, `${id} fell back to the manifest`).not.toMatch(/^manifest /);
    }
  });

  it('ships genuinely translated copy, not English duplicated into every locale', () => {
    const english = catalogOf('en-US');
    for (const locale of locales.filter((l) => l !== 'en-US')) {
      const catalog = catalogOf(locale);
      const untranslated = builtinIds.filter((id) => catalog[id].description === english[id].description);
      expect(untranslated, `${locale} descriptions identical to en-US`).toEqual([]);
    }
  });
});
