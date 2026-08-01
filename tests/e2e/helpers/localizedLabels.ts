/**
 * Accessible names and visible strings that the app renders through i18next,
 * collected across every shipped locale.
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
 * untranslated ship the English text (zh-TW's `close`, uk-UA's feedback modules);
 * locales that omit it fall back to en-US at runtime (`mergeWithFallback`) —
 * either way the en-US entry keeps the selector working.
 *
 * Keep one import per entry in `supportedLanguages`
 * (packages/desktop/src/common/config/i18n-config.json), per bundle used here.
 */
import deDECommon from '@/renderer/services/i18n/locales/de-DE/common.json';
import enUSCommon from '@/renderer/services/i18n/locales/en-US/common.json';
import esESCommon from '@/renderer/services/i18n/locales/es-ES/common.json';
import faIRCommon from '@/renderer/services/i18n/locales/fa-IR/common.json';
import jaJPCommon from '@/renderer/services/i18n/locales/ja-JP/common.json';
import koKRCommon from '@/renderer/services/i18n/locales/ko-KR/common.json';
import ptBRCommon from '@/renderer/services/i18n/locales/pt-BR/common.json';
import ruRUCommon from '@/renderer/services/i18n/locales/ru-RU/common.json';
import trTRCommon from '@/renderer/services/i18n/locales/tr-TR/common.json';
import ukUACommon from '@/renderer/services/i18n/locales/uk-UA/common.json';
import zhCNCommon from '@/renderer/services/i18n/locales/zh-CN/common.json';
import zhTWCommon from '@/renderer/services/i18n/locales/zh-TW/common.json';

import deDESettings from '@/renderer/services/i18n/locales/de-DE/settings.json';
import enUSSettings from '@/renderer/services/i18n/locales/en-US/settings.json';
import esESSettings from '@/renderer/services/i18n/locales/es-ES/settings.json';
import faIRSettings from '@/renderer/services/i18n/locales/fa-IR/settings.json';
import jaJPSettings from '@/renderer/services/i18n/locales/ja-JP/settings.json';
import koKRSettings from '@/renderer/services/i18n/locales/ko-KR/settings.json';
import ptBRSettings from '@/renderer/services/i18n/locales/pt-BR/settings.json';
import ruRUSettings from '@/renderer/services/i18n/locales/ru-RU/settings.json';
import trTRSettings from '@/renderer/services/i18n/locales/tr-TR/settings.json';
import ukUASettings from '@/renderer/services/i18n/locales/uk-UA/settings.json';
import zhCNSettings from '@/renderer/services/i18n/locales/zh-CN/settings.json';
import zhTWSettings from '@/renderer/services/i18n/locales/zh-TW/settings.json';
import deDETeam from '@/renderer/services/i18n/locales/de-DE/team.json';
import enUSTeam from '@/renderer/services/i18n/locales/en-US/team.json';
import esESTeam from '@/renderer/services/i18n/locales/es-ES/team.json';
import faIRTeam from '@/renderer/services/i18n/locales/fa-IR/team.json';
import jaJPTeam from '@/renderer/services/i18n/locales/ja-JP/team.json';
import koKRTeam from '@/renderer/services/i18n/locales/ko-KR/team.json';
import ptBRTeam from '@/renderer/services/i18n/locales/pt-BR/team.json';
import ruRUTeam from '@/renderer/services/i18n/locales/ru-RU/team.json';
import trTRTeam from '@/renderer/services/i18n/locales/tr-TR/team.json';
import ukUATeam from '@/renderer/services/i18n/locales/uk-UA/team.json';
import zhCNTeam from '@/renderer/services/i18n/locales/zh-CN/team.json';
import zhTWTeam from '@/renderer/services/i18n/locales/zh-TW/team.json';

/**
 * The slices of each bundle these selectors read.
 *
 * Every field is optional on purpose. A locale may legitimately omit a key —
 * `mergeWithFallback` then serves the en-US string at runtime, and the en-US
 * entry in the set below already matches it. Requiring the keys here would
 * reject that supported case, and would buy nothing either way: `tsconfig.json`
 * does not include `tests/e2e`, so nothing in the gate typechecks this file.
 * The real drift — a key renamed or dropped in *all* locales, which leaves a
 * locator matching nothing — is caught at runtime by the collectors below.
 */
interface CommonLabelBundle {
  close?: string;
  chrome?: {
    collapseSidebar?: string;
    expandSidebar?: string;
  };
}

interface SettingsLabelBundle {
  oneClickFeedback?: string;
  testConnectionBtn?: string;
}

interface TeamLabelBundle {
  create?: {
    title?: string;
  };
}

/** Each bundle family, in `supportedLanguages` order. */
const COMMON_BUNDLES: readonly CommonLabelBundle[] = [
  zhCNCommon,
  enUSCommon,
  jaJPCommon,
  zhTWCommon,
  koKRCommon,
  trTRCommon,
  ruRUCommon,
  ukUACommon,
  ptBRCommon,
  deDECommon,
  esESCommon,
  faIRCommon,
];

const SETTINGS_BUNDLES: readonly SettingsLabelBundle[] = [
  zhCNSettings,
  enUSSettings,
  jaJPSettings,
  zhTWSettings,
  koKRSettings,
  trTRSettings,
  ruRUSettings,
  ukUASettings,
  ptBRSettings,
  deDESettings,
  esESSettings,
  faIRSettings,
];

const TEAM_BUNDLES: readonly TeamLabelBundle[] = [
  zhCNTeam,
  enUSTeam,
  jaJPTeam,
  zhTWTeam,
  koKRTeam,
  trTRTeam,
  ruRUTeam,
  ukUATeam,
  ptBRTeam,
  deDETeam,
  esESTeam,
  faIRTeam,
];

/**
 * Build a collector over one bundle family.
 *
 * The returned function throws when no locale supplies the label at all: that
 * means the key was renamed or removed, and returning `[]` would build the
 * empty selector `''` — a locator that matches nothing and reports it as a
 * plain timeout, pinning the blame on the UI instead of on this file.
 *
 * @param namespace Bundle name, for the error message only.
 * @param bundles Every locale's copy of that bundle.
 */
function labelCollector<T>(namespace: string, bundles: readonly T[]) {
  /**
   * @param key Dotted path below the namespace, for the error message only.
   * @param pick Reads the label out of a single locale's bundle.
   */
  return (key: string, pick: (bundle: T) => string | undefined): string[] => {
    const labels = Array.from(new Set(bundles.map(pick).filter((label): label is string => Boolean(label))));
    if (labels.length === 0) {
      throw new Error(
        `No locale defines ${namespace}.${key}; the key was renamed or removed. Update localizedLabels.ts.`
      );
    }
    return labels;
  };
}

const commonLabels = labelCollector('common', COMMON_BUNDLES);
const settingsLabels = labelCollector('settings', SETTINGS_BUNDLES);
const teamLabels = labelCollector('team', TEAM_BUNDLES);

/**
 * Turn a label set into a regex accepting any of its spellings, for the
 * text-matching assertions (`toContainText`) that cannot take a CSS selector.
 *
 * Every label is escaped: these are human translations, and several carry regex
 * metacharacters (de-DE's feedback button is literally "Feedback oder
 * Vorschläge?", whose trailing `?` would otherwise make the `e` optional and
 * quietly widen the match).
 */
export function labelPattern(labels: string[]): RegExp {
  return new RegExp(labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
}

/**
 * Every locale's `common.close` — the accessible name of AionModal's header
 * close button (`aria-label={t('common.close')}`).
 */
export const CLOSE_LABELS: string[] = commonLabels('close', (bundle) => bundle.close);

/**
 * Every locale's `common.chrome.collapseSidebar` — the sidebar toggle's name
 * while the sidebar is open (Titlebar/index.tsx, and Layout.tsx's mobile-only
 * twin, which share the key deliberately).
 */
export const COLLAPSE_SIDEBAR_LABELS: string[] = commonLabels(
  'chrome.collapseSidebar',
  (bundle) => bundle.chrome?.collapseSidebar
);

/** Every locale's `common.chrome.expandSidebar` — the same toggle once collapsed. */
export const EXPAND_SIDEBAR_LABELS: string[] = commonLabels(
  'chrome.expandSidebar',
  (bundle) => bundle.chrome?.expandSidebar
);

/**
 * Every locale's `settings.oneClickFeedback` — the visible text of the inline
 * feedback pill (base/FeedbackButton.tsx, which sets no aria-label).
 */
export const FEEDBACK_PILL_LABELS: string[] = settingsLabels('oneClickFeedback', (bundle) => bundle.oneClickFeedback);

/** Every locale's `settings.testConnectionBtn` — the agent editor's test button. */
export const TEST_CONNECTION_LABELS: string[] = settingsLabels(
  'testConnectionBtn',
  (bundle) => bundle.testConnectionBtn
);

/**
 * Every locale's `team.create.title` — the Create-Team modal's `h3`.
 *
 * Only three distinct spellings exist (nine locales ship the untranslated "New
 * Team"), and none of them is "Create Team", the string five specs filtered on
 * after commit 826eba76c renamed the key — so those selectors matched nothing in
 * any language, en-US included.
 */
export const TEAM_CREATE_TITLE_LABELS: string[] = teamLabels('create.title', (bundle) => bundle.create?.title);
