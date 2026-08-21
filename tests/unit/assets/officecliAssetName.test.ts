import { describe, expect, it } from 'vitest';

const { officecliAssetName } = require('../../../packages/shared-scripts/src/prepare-aioncore');

describe('officecliAssetName', () => {
  it('maps win32 to a win asset with the .exe extension', () => {
    expect(officecliAssetName('win32', 'x64')).toBe('officecli-win-x64.exe');
    expect(officecliAssetName('win32', 'arm64')).toBe('officecli-win-arm64.exe');
  });

  it('maps darwin to a mac asset with no extension', () => {
    expect(officecliAssetName('darwin', 'arm64')).toBe('officecli-mac-arm64');
    expect(officecliAssetName('darwin', 'x64')).toBe('officecli-mac-x64');
  });

  it('maps linux to a linux asset with no extension', () => {
    expect(officecliAssetName('linux', 'x64')).toBe('officecli-linux-x64');
    expect(officecliAssetName('linux', 'arm64')).toBe('officecli-linux-arm64');
  });
});
