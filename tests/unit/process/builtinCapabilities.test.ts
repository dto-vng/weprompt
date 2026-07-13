import { describe, expect, it } from 'vitest';
import type { IMcpServerTransportStdio } from '@/common/config/storage';
import { BUILTIN_IDP_NAME, BUILTIN_VISION_NAME } from '@/common/config/storage';
import {
  BUILTIN_CAPABILITIES,
  BUILTIN_MEMORY_ID,
  BUILTIN_MEMORY_NAME,
  BUILTIN_TAVILY_NAME,
  BUILTIN_POSTGRES_NAME,
  BUILTIN_CHROME_DEVTOOLS_NAME,
  TIER2_CAPABILITIES,
  buildBuiltinCapabilityServer,
  applyCapabilityCredential,
  getCapabilityCredentialValue,
  hasCapabilityCredential,
  findCapabilityDescriptor,
  isCommodityBuiltinServer,
  isIdpBuiltinServer,
  isVisionBuiltinServer,
  mergeCommodityMcpServerIds,
} from '@/common/config/builtinCapabilities';

const stdio = (over: Partial<IMcpServerTransportStdio> = {}): IMcpServerTransportStdio => ({
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'pkg'],
  env: {},
  ...over,
});

describe('builtinCapabilities descriptors', () => {
  it('memory is tier1 and enabled by default', () => {
    const memory = BUILTIN_CAPABILITIES.find((c) => c.name === BUILTIN_MEMORY_NAME);
    expect(memory?.tier).toBe('tier1');
    expect(memory?.defaultEnabled).toBe(true);
    expect(memory?.credential).toBeUndefined();
  });

  it('tier2 set is exactly tavily, github, postgres and all disabled by default', () => {
    expect(TIER2_CAPABILITIES.map((c) => c.name).toSorted()).toEqual(
      [BUILTIN_TAVILY_NAME, 'aionui-github', BUILTIN_POSTGRES_NAME].toSorted()
    );
    expect(TIER2_CAPABILITIES.every((c) => c.defaultEnabled === false)).toBe(true);
    expect(TIER2_CAPABILITIES.every((c) => c.credential !== undefined)).toBe(true);
  });
});

describe('buildBuiltinCapabilityServer', () => {
  it('produces a builtin stdio seed with empty env and matching original_json', () => {
    const tavily = findCapabilityDescriptor(BUILTIN_TAVILY_NAME)!;
    const seed = buildBuiltinCapabilityServer(tavily);
    expect(seed.builtin).toBe(true);
    expect(seed.enabled).toBe(false);
    expect(seed.name).toBe(BUILTIN_TAVILY_NAME);
    expect(seed.transport.type).toBe('stdio');
    expect((seed.transport as IMcpServerTransportStdio).env).toEqual({});
    expect(seed.original_json).toContain(BUILTIN_TAVILY_NAME);
    expect(seed.original_json).not.toContain('env');
  });
});

describe('applyCapabilityCredential / getCapabilityCredentialValue (apiKey)', () => {
  it('writes and reads an env-based key and clears it when blank', () => {
    const tavily = findCapabilityDescriptor(BUILTIN_TAVILY_NAME)!;
    const withKey = applyCapabilityCredential(tavily, stdio(), 'tvly-123');
    expect(withKey.env).toEqual({ TAVILY_API_KEY: 'tvly-123' });
    expect(getCapabilityCredentialValue(tavily, withKey)).toBe('tvly-123');
    expect(hasCapabilityCredential(tavily, withKey)).toBe(true);

    const cleared = applyCapabilityCredential(tavily, withKey, '   ');
    expect(cleared.env).toEqual({});
    expect(hasCapabilityCredential(tavily, cleared)).toBe(false);
  });
});

describe('applyCapabilityCredential / getCapabilityCredentialValue (connectionString)', () => {
  it('appends the connection string as the trailing positional arg', () => {
    const pg = findCapabilityDescriptor(BUILTIN_POSTGRES_NAME)!;
    const conn = 'postgresql://u:p@localhost:5432/db';
    const withConn = applyCapabilityCredential(pg, stdio({ args: [...pg.baseArgs] }), conn);
    expect(withConn.args).toEqual([...pg.baseArgs, conn]);
    expect(getCapabilityCredentialValue(pg, withConn)).toBe(conn);

    const cleared = applyCapabilityCredential(pg, withConn, '');
    expect(cleared.args).toEqual([...pg.baseArgs]);
    expect(getCapabilityCredentialValue(pg, cleared)).toBe('');
  });
});

describe('mergeCommodityMcpServerIds', () => {
  const srv = (id: string, name: string, enabled: boolean, builtin: boolean) => ({ id, name, enabled, builtin });

  it('adds enabled commodity builtin servers to the assistant defaults, de-duped', () => {
    const servers = [
      srv(BUILTIN_MEMORY_ID, BUILTIN_MEMORY_NAME, true, true),
      srv('chrome', BUILTIN_CHROME_DEVTOOLS_NAME, true, true),
      srv('user-1', 'User MCP', true, false),
    ];
    const result = mergeCommodityMcpServerIds(['assistant-default'], servers);
    expect(result).toEqual(['assistant-default', BUILTIN_MEMORY_ID, 'chrome']);
  });

  it('does not add disabled commodity servers or non-builtin servers', () => {
    const servers = [
      srv(BUILTIN_MEMORY_ID, BUILTIN_MEMORY_NAME, false, true), // disabled
      srv('user-1', 'User MCP', true, false), // non-builtin
    ];
    expect(mergeCommodityMcpServerIds([], servers)).toEqual([]);
  });

  it('auto-attaches the enabled image-gen server, but not when it is disabled', () => {
    const enabled = [srv('image', 'aionui-image-generation', true, true)];
    expect(mergeCommodityMcpServerIds([], enabled)).toEqual(['image']);

    const disabled = [srv('image', 'aionui-image-generation', false, true)];
    expect(mergeCommodityMcpServerIds([], disabled)).toEqual([]);
  });

  it('does not duplicate an id already in the assistant defaults', () => {
    const servers = [srv(BUILTIN_MEMORY_ID, BUILTIN_MEMORY_NAME, true, true)];
    expect(mergeCommodityMcpServerIds([BUILTIN_MEMORY_ID], servers)).toEqual([BUILTIN_MEMORY_ID]);
  });

  it('isCommodityBuiltinServer excludes image-gen and user servers', () => {
    expect(isCommodityBuiltinServer({ name: BUILTIN_MEMORY_NAME, builtin: true })).toBe(true);
    expect(isCommodityBuiltinServer({ name: BUILTIN_CHROME_DEVTOOLS_NAME, builtin: true })).toBe(true);
    expect(isCommodityBuiltinServer({ name: 'aionui-image-generation', builtin: true })).toBe(false);
    expect(isCommodityBuiltinServer({ name: BUILTIN_MEMORY_NAME, builtin: false })).toBe(false);
  });

  it('isIdpBuiltinServer recognizes the IDP builtin server by name', () => {
    expect(isIdpBuiltinServer({ name: BUILTIN_IDP_NAME })).toBe(true);
    expect(isIdpBuiltinServer({ name: 'something-else' })).toBe(false);
  });

  it('auto-attaches an enabled IDP server to default conversation MCP ids, but not when disabled', () => {
    const enabled = [srv('idp-1', BUILTIN_IDP_NAME, true, true)];
    expect(mergeCommodityMcpServerIds([], enabled)).toEqual(['idp-1']);

    const disabled = [srv('idp-1', BUILTIN_IDP_NAME, false, true)];
    expect(mergeCommodityMcpServerIds([], disabled)).toEqual([]);
  });

  it('isVisionBuiltinServer recognizes the vision builtin server by name', () => {
    expect(isVisionBuiltinServer({ name: BUILTIN_VISION_NAME })).toBe(true);
    expect(isVisionBuiltinServer({ name: 'something-else' })).toBe(false);
  });

  it('auto-attaches an enabled vision server to default conversation MCP ids, but not when disabled', () => {
    const enabled = [srv('vision-1', BUILTIN_VISION_NAME, true, true)];
    expect(mergeCommodityMcpServerIds([], enabled)).toEqual(['vision-1']);

    const disabled = [srv('vision-1', BUILTIN_VISION_NAME, false, true)];
    expect(mergeCommodityMcpServerIds([], disabled)).toEqual([]);
  });
});
