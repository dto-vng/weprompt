export type RemoteAccessPolicy = {
  allowRemote: false;
  requestedBy: string[];
};

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const REMOTE_HOSTS = new Set(['0.0.0.0', '::', '::0']);

const requestsRemote = (value: string | true | undefined): boolean => {
  if (value === true) return true;
  return typeof value === 'string' && TRUE_VALUES.has(value.trim().toLowerCase());
};

export function resolveRemoteAccessPolicy(
  flags: ReadonlyMap<string, string | true>,
  env: NodeJS.ProcessEnv = process.env
): RemoteAccessPolicy {
  const requestedBy: string[] = [];
  if (requestsRemote(flags.get('remote'))) requestedBy.push('--remote');
  if (requestsRemote(env.AIONUI_ALLOW_REMOTE)) requestedBy.push('AIONUI_ALLOW_REMOTE');
  if (requestsRemote(env.AIONUI_REMOTE)) requestedBy.push('AIONUI_REMOTE');
  if (env.AIONUI_HOST && REMOTE_HOSTS.has(env.AIONUI_HOST.trim())) requestedBy.push('AIONUI_HOST');
  return { allowRemote: false, requestedBy };
}

export function warnUnsupportedRemoteAccess(
  policy: RemoteAccessPolicy,
  warn: (message: string) => void = console.warn
): void {
  if (policy.requestedBy.length === 0) return;
  warn(
    `[aionui-web] Remote access requested by ${policy.requestedBy.join(', ')}, but Forge WebUI is local-only; binding to 127.0.0.1.`
  );
}
