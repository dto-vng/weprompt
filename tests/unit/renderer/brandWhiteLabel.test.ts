import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type I18nConfig = {
  supportedLanguages: string[];
};

const repoRoot = process.cwd();
const readJson = <T>(relativePath: string): T =>
  JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;

const i18nConfig = readJson<I18nConfig>('packages/desktop/src/common/config/i18n-config.json');

describe('WePrompt white-label branding', () => {
  it('uses the WePrompt wordmark in the primary brand lockup', () => {
    const lockup = readFileSync(
      path.join(repoRoot, 'packages/desktop/src/renderer/assets/logos/brand/forge-lockup-horizontal.svg'),
      'utf8'
    );

    expect(lockup).toContain('WePrompt');
    expect(lockup).not.toContain('>Forge<');
  });

  it('uses WePrompt in primary chrome locale keys for every supported language', () => {
    for (const language of i18nConfig.supportedLanguages) {
      const localeRoot = `packages/desktop/src/renderer/services/i18n/locales/${language}`;
      const login = readJson<Record<string, string>>(`${localeRoot}/login.json`);
      const common = readJson<Record<string, string>>(`${localeRoot}/common.json`);
      const agent = readJson<{ brand: Record<string, string> }>(`${localeRoot}/agent.json`);

      expect(login.brand).toBe('WePrompt');
      expect(login.pageTitle).toContain('WePrompt');
      expect(common['tray.showWindow']).toContain('WePrompt');
      expect(common['tray.about']).toContain('WePrompt');
      expect(agent.brand.forgeChat).toBe('WePrompt Chat');
      expect(agent.brand.forgeCode).toBe('WePrompt Code');
      expect(agent.brand.forgeAssistant).toBe('WePrompt Assistant');
    }
  });
});
