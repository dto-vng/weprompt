/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The provider and model rows are asserted in a DOM suite whose `t` echoes its
 * arguments, which proves the call sites pass what they mean to pass — but not
 * that the locale on the other side declares the same placeholders. A template
 * that says `{{model}}` where the call site sends `models` renders a literal
 * `{{model}}` to the user, in one language only, and no other gate sees it:
 * `check-i18n.js` compares key sets, never the interpolation inside a value.
 */

const localeRoot = (): URL =>
  new URL('../../../../packages/desktop/src/renderer/services/i18n/locales/', import.meta.url);

const languages = (): string[] =>
  readdirSync(localeRoot(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const settingsLocale = (language: string): Record<string, Record<string, string>> =>
  JSON.parse(readFileSync(new URL(`${language}/settings.json`, localeRoot()), 'utf-8'));

/** The exact argument names each row passes at its call site. */
const REQUIRED_PLACEHOLDERS: Record<string, Record<string, string[]>> = {
  providerRow: {
    counts: ['models', 'keys'],
    modelCount: ['count'],
    apiKeyCount: ['count'],
    healthChecked: ['checked', 'total'],
    healthFailing: ['count'],
    deleteConfirmBody: ['provider', 'counts'],
    clearHealthConfirmBody: ['provider'],
    healthCleared: ['provider'],
    actionLabel: ['action', 'provider'],
  },
  modelRow: {
    latency: ['latency'],
    actionLabel: ['action', 'model'],
  },
};

/** Keys carrying no placeholder at all — a stray one there is just as broken. */
const REQUIRED_LITERAL: Record<string, string[]> = {
  providerRow: [
    'healthNotChecked',
    'deleteConfirmTitle',
    'deleteConfirmDetail',
    'clearHealth',
    'clearHealthConfirmTitle',
    'deleteAppOperationsWarning',
  ],
  modelRow: ['neverChecked', 'removeModel', 'deleteAppOperationsWarning'],
};

const placeholdersIn = (template: string): string[] =>
  Array.from(template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g), (match) => match[1]).sort();

/**
 * A plural key resolves through its suffixed siblings, so every one of them has
 * to carry the placeholder too — CLDR decides which suffixes a language has, so
 * they are discovered rather than listed.
 */
const variantsOf = (section: Record<string, string>, key: string): [string, string][] =>
  Object.entries(section).filter(([name]) => name === key || name.startsWith(`${key}_`));

describe('provider and model row locale templates', () => {
  const allLanguages = languages();

  it('covers every shipped language', () => {
    expect(allLanguages.length).toBeGreaterThanOrEqual(12);
    expect(allLanguages).toContain('en-US');
  });

  it.each(allLanguages)('%s declares exactly the placeholders the rows pass', (language) => {
    const locale = settingsLocale(language);

    for (const [sectionName, keys] of Object.entries(REQUIRED_PLACEHOLDERS)) {
      const section = locale[sectionName];
      expect(section, `${language} is missing settings.${sectionName}`).toBeDefined();

      for (const [key, expected] of Object.entries(keys)) {
        const variants = variantsOf(section, key);
        expect(variants.length, `${language} has no settings.${sectionName}.${key}`).toBeGreaterThan(0);

        for (const [variantName, template] of variants) {
          // Order is the translator's to choose; the SET of names is the contract.
          expect(placeholdersIn(template), `settings.${sectionName}.${variantName} in ${language}`).toEqual(
            [...expected].sort()
          );
        }
      }
    }
  });

  it.each(allLanguages)('%s leaves the placeholder-free row strings free of them', (language) => {
    const locale = settingsLocale(language);

    for (const [sectionName, keys] of Object.entries(REQUIRED_LITERAL)) {
      for (const key of keys) {
        const template = locale[sectionName]?.[key];
        expect(template, `${language} is missing settings.${sectionName}.${key}`).toBeTypeOf('string');
        expect(placeholdersIn(template), `settings.${sectionName}.${key} in ${language}`).toEqual([]);
      }
    }
  });
});
