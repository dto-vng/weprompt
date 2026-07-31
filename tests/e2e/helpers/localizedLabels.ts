/**
 * Accessible names that the app renders through i18next, collected across every
 * shipped locale.
 *
 * Matching UI chrome on a literal English string only works on an English
 * machine. The first paint uses `getInitialLanguage()`
 * (packages/desktop/src/renderer/services/i18n/index.ts), which reads only a
 * stored preference — the `i18nextLng` localStorage hint, or the main process's
 * saved config via `window.__initialLanguage` (`ProcessConfig.getSync('language')`;
 * `navigator.language` gets a look in only when the backend failed to start) — so
 * a fresh profile starts on en-US. `initLanguage()` then runs once
 * `configService.whenReady()` resolves and switches to
 * `savedLanguage || normalizeLanguageCode(navigator.language)`, so on a
 * non-English system every `aria-label={t(...)}` turns into the translated string
 * a tick after mount and an English-only selector stops matching. Accepting all
 * the spellings at once also covers the brief window before that switch lands.
 *
 * The strings are imported from the locale bundles instead of being copied here
 * so they cannot drift when a translation is corrected. Locales that leave a key
 * untranslated ship the English text (zh-TW's `close` today); locales that omit
 * it fall back to en-US at runtime (`mergeWithFallback`) — either way the en-US
 * entry keeps the selector working.
 *
 * Keep one import per entry in `supportedLanguages`
 * (packages/desktop/src/common/config/i18n-config.json).
 */
import deDE from '@/renderer/services/i18n/locales/de-DE/common.json';
import enUS from '@/renderer/services/i18n/locales/en-US/common.json';
import esES from '@/renderer/services/i18n/locales/es-ES/common.json';
import faIR from '@/renderer/services/i18n/locales/fa-IR/common.json';
import jaJP from '@/renderer/services/i18n/locales/ja-JP/common.json';
import koKR from '@/renderer/services/i18n/locales/ko-KR/common.json';
import ptBR from '@/renderer/services/i18n/locales/pt-BR/common.json';
import ruRU from '@/renderer/services/i18n/locales/ru-RU/common.json';
import trTR from '@/renderer/services/i18n/locales/tr-TR/common.json';
import ukUA from '@/renderer/services/i18n/locales/uk-UA/common.json';
import zhCN from '@/renderer/services/i18n/locales/zh-CN/common.json';
import zhTW from '@/renderer/services/i18n/locales/zh-TW/common.json';

/**
 * The slice of a `common` bundle these selectors read.
 *
 * Every field is optional on purpose. A locale may legitimately omit a key —
 * `mergeWithFallback` then serves the en-US string at runtime, and the en-US
 * entry in the set below already matches it. Requiring the keys here would
 * reject that supported case, and would buy nothing either way: `tsconfig.json`
 * does not include `tests/e2e`, so nothing in the gate typechecks this file.
 * The real drift — a key renamed or dropped in *all* locales, which leaves a
 * locator matching nothing — is caught at runtime by `labelsAcrossLocales`.
 */
interface CommonLabelBundle {
  close?: string;
  chrome?: {
    collapseSidebar?: string;
    expandSidebar?: string;
  };
}

/** All `common` bundles, in `supportedLanguages` order. */
const COMMON_BUNDLES: readonly CommonLabelBundle[] = [
  zhCN,
  enUS,
  jaJP,
  zhTW,
  koKR,
  trTR,
  ruRU,
  ukUA,
  ptBR,
  deDE,
  esES,
  faIR,
];

/**
 * Collect one accessible name across every locale, deduplicated.
 *
 * Throws when no locale supplies the label at all: that means the key was
 * renamed or removed, and returning `[]` would build the empty selector `''` —
 * a locator that matches nothing and reports it as a plain timeout, pinning the
 * blame on the UI instead of on this file.
 *
 * @param key Dotted path, for the error message only.
 * @param pick Reads the label out of a single locale's `common` bundle.
 */
function labelsAcrossLocales(key: string, pick: (bundle: CommonLabelBundle) => string | undefined): string[] {
  const labels = Array.from(new Set(COMMON_BUNDLES.map(pick).filter((label): label is string => Boolean(label))));
  if (labels.length === 0) {
    throw new Error(`No locale defines common.${key}; the key was renamed or removed. Update localizedLabels.ts.`);
  }
  return labels;
}

/**
 * Every locale's `common.close` — the accessible name of AionModal's header
 * close button (`aria-label={t('common.close')}`).
 */
export const CLOSE_LABELS: string[] = labelsAcrossLocales('close', (bundle) => bundle.close);

/**
 * Every locale's `common.chrome.collapseSidebar` — the sidebar toggle's name
 * while the sidebar is open (Titlebar/index.tsx, and Layout.tsx's mobile-only
 * twin, which share the key deliberately).
 */
export const COLLAPSE_SIDEBAR_LABELS: string[] = labelsAcrossLocales(
  'chrome.collapseSidebar',
  (bundle) => bundle.chrome?.collapseSidebar
);

/** Every locale's `common.chrome.expandSidebar` — the same toggle once collapsed. */
export const EXPAND_SIDEBAR_LABELS: string[] = labelsAcrossLocales(
  'chrome.expandSidebar',
  (bundle) => bundle.chrome?.expandSidebar
);
