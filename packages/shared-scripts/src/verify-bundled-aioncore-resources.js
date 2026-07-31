const fs = require('fs');
const path = require('path');

const REQUIRED_SCHEMA_2_CLI_NAMES = ['claude', 'codex'];

function backendBinaryName(platform) {
  return platform === 'win32' ? 'aioncore.exe' : 'aioncore';
}

function nodeBinaryName(platform) {
  return platform === 'win32' ? 'node.exe' : 'node';
}

function nodeExecutableParts(platform) {
  return platform === 'win32' ? [nodeBinaryName(platform)] : ['bin', nodeBinaryName(platform)];
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function bundledPath(runtimeKey, ...parts) {
  return normalize(path.join('bundled-aioncore', runtimeKey, ...parts));
}

function requireRelativePath(baseDir, runtimeKey, parts, checked, missing) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  if (!isFile(path.join(baseDir, ...parts))) {
    missing.push(relativePath);
  }
}

function requireRelativeDirectory(baseDir, runtimeKey, parts, checked, missing) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  const fullPath = path.join(baseDir, ...parts);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    missing.push(relativePath);
  }
}

function readDirectories(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function requireFile(baseDir, runtimeKey, parts, checked, missing) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  if (!isFile(path.join(baseDir, ...parts))) {
    missing.push(relativePath);
  }
}

function requireDirectory(baseDir, runtimeKey, parts, checked, missing) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  const fullPath = path.join(baseDir, ...parts);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    missing.push(relativePath);
  }
}

function verifyBundleManifest(baseDir, runtimeKey, electronPlatformName, targetArch, checked, missing) {
  const parts = ['manifest.json'];
  const relativePath = bundledPath(runtimeKey, ...parts);
  const manifestPath = path.join(baseDir, ...parts);
  checked.push(relativePath);

  if (!isFile(manifestPath)) {
    missing.push(relativePath);
    return;
  }

  const manifest = readManifest(manifestPath);
  if (!manifest) {
    missing.push(`${relativePath}<invalid-json>`);
    return;
  }

  if (manifest.platform !== electronPlatformName) {
    missing.push(`${relativePath}<platform:${electronPlatformName}>`);
  }

  if (manifest.arch !== targetArch) {
    missing.push(`${relativePath}<arch:${targetArch}>`);
  }
}

function requireManagedNode(baseDir, runtimeKey, platform, checked, missing) {
  const nodeRoot = path.join(baseDir, 'managed-resources', 'node');
  const versions = readDirectories(nodeRoot);
  const executableParts = nodeExecutableParts(platform);

  if (versions.length === 0) {
    const relativePath = bundledPath(runtimeKey, 'managed-resources', 'node', '*', ...executableParts);
    checked.push(relativePath);
    missing.push(relativePath);
    return;
  }

  for (const version of versions) {
    requireFile(baseDir, runtimeKey, ['managed-resources', 'node', version, ...executableParts], checked, missing);
  }
}

function acpToolPlatformExecutableParts(platform, runtimeKey, toolId) {
  if (platform !== 'win32') return null;

  if (toolId === 'codex-acp') {
    return ['node_modules', '@zed-industries', `codex-acp-${runtimeKey}`, 'bin', 'codex-acp.exe'];
  }

  if (toolId === 'claude-agent-acp') {
    return ['node_modules', '@anthropic-ai', `claude-agent-sdk-${runtimeKey}`, 'claude.exe'];
  }

  return null;
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeManifestRelativePath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    value.includes('\0') ||
    path.posix.isAbsolute(value) ||
    /^[a-zA-Z]:/.test(value)
  ) {
    return false;
  }

  return value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function schema2ManifestProblem(runtimeKey, problem) {
  return `${bundledPath(runtimeKey, 'managed-resources', 'manifest.json')}<${problem}>`;
}

function readManifestPathParts(runtimeKey, value, field, missing) {
  if (!isSafeManifestRelativePath(value)) {
    missing.push(schema2ManifestProblem(runtimeKey, `invalid-path:${field}`));
    return null;
  }

  return value.split('/');
}

function verifySchema2Node(baseDir, runtimeKey, node, checked, missing) {
  if (!isObject(node)) {
    missing.push(schema2ManifestProblem(runtimeKey, 'node'));
    return;
  }

  const rootParts = readManifestPathParts(runtimeKey, node.root, 'node.root', missing);
  const executableParts = readManifestPathParts(runtimeKey, node.executable, 'node.executable', missing);

  if (rootParts) {
    requireDirectory(baseDir, runtimeKey, ['managed-resources', ...rootParts], checked, missing);
  }
  if (rootParts && executableParts) {
    requireFile(baseDir, runtimeKey, ['managed-resources', ...rootParts, ...executableParts], checked, missing);
  }
}

function verifySchema2Cli(baseDir, runtimeKey, cli, index, checked, missing) {
  if (!isObject(cli) || typeof cli.name !== 'string' || cli.name.length === 0) {
    missing.push(schema2ManifestProblem(runtimeKey, `clis[${index}].name`));
    return null;
  }

  const label = `clis[${cli.name}]`;
  if (cli.platformDirectory !== runtimeKey) {
    missing.push(schema2ManifestProblem(runtimeKey, `${label}.platformDirectory:${runtimeKey}`));
  }

  const rootParts = readManifestPathParts(runtimeKey, cli.root, `${label}.root`, missing);
  const executableParts = readManifestPathParts(runtimeKey, cli.executable, `${label}.executable`, missing);

  if (rootParts) {
    requireDirectory(baseDir, runtimeKey, ['managed-resources', ...rootParts], checked, missing);
  }
  if (rootParts && executableParts) {
    requireFile(baseDir, runtimeKey, ['managed-resources', ...rootParts, ...executableParts], checked, missing);
  }

  verifySchema2CliPaths(baseDir, runtimeKey, cli, label, 'requiredFiles', rootParts, checked, missing);
  verifySchema2CliPaths(baseDir, runtimeKey, cli, label, 'requiredDirectories', rootParts, checked, missing);

  return cli.name;
}

function verifySchema2CliPaths(baseDir, runtimeKey, cli, label, field, rootParts, checked, missing) {
  const values = cli[field];
  if (values === undefined) return;
  if (!Array.isArray(values)) {
    missing.push(schema2ManifestProblem(runtimeKey, `${label}.${field}`));
    return;
  }

  for (const [index, value] of values.entries()) {
    const parts = readManifestPathParts(runtimeKey, value, `${label}.${field}[${index}]`, missing);
    if (!rootParts || !parts) continue;

    if (field === 'requiredFiles') {
      requireFile(baseDir, runtimeKey, ['managed-resources', ...rootParts, ...parts], checked, missing);
    } else {
      requireDirectory(baseDir, runtimeKey, ['managed-resources', ...rootParts, ...parts], checked, missing);
    }
  }
}

function verifySchema2ManagedResources(baseDir, runtimeKey, checked, missing) {
  const manifestParts = ['managed-resources', 'manifest.json'];
  const manifestPath = path.join(baseDir, ...manifestParts);

  if (!isFile(manifestPath)) return false;

  const manifest = readManifest(manifestPath);
  if (!manifest) {
    checked.push(bundledPath(runtimeKey, ...manifestParts));
    missing.push(schema2ManifestProblem(runtimeKey, 'invalid-json'));
    return true;
  }
  if (manifest.schemaVersion !== 2) return false;

  checked.push(bundledPath(runtimeKey, ...manifestParts));
  if (manifest.runtimeKey !== runtimeKey) {
    missing.push(schema2ManifestProblem(runtimeKey, `runtimeKey:${runtimeKey}`));
  }

  verifySchema2Node(baseDir, runtimeKey, manifest.node, checked, missing);

  if (!Array.isArray(manifest.clis)) {
    missing.push(schema2ManifestProblem(runtimeKey, 'clis'));
    return true;
  }

  const cliNames = new Set();
  for (const [index, cli] of manifest.clis.entries()) {
    const name = verifySchema2Cli(baseDir, runtimeKey, cli, index, checked, missing);
    if (name) cliNames.add(name);
  }
  for (const requiredName of REQUIRED_SCHEMA_2_CLI_NAMES) {
    if (!cliNames.has(requiredName)) {
      missing.push(schema2ManifestProblem(runtimeKey, `clis[${requiredName}]`));
    }
  }

  return true;
}

function requireManagedAcpTool(baseDir, runtimeKey, platform, toolId, checked, missing) {
  const toolRoot = path.join(baseDir, 'managed-resources', 'acp', toolId);
  const versions = readDirectories(toolRoot);

  if (versions.length === 0) {
    const relativePath = bundledPath(runtimeKey, 'managed-resources', 'acp', toolId, '*', runtimeKey, 'manifest.json');
    checked.push(relativePath);
    missing.push(relativePath);
    return;
  }

  for (const version of versions) {
    const platformRoot = path.join(toolRoot, version, runtimeKey);
    const manifestRelativePath = bundledPath(
      runtimeKey,
      'managed-resources',
      'acp',
      toolId,
      version,
      runtimeKey,
      'manifest.json'
    );
    checked.push(manifestRelativePath);

    const manifestPath = path.join(platformRoot, 'manifest.json');
    if (!isFile(manifestPath)) {
      missing.push(manifestRelativePath);
      continue;
    }

    const manifest = readManifest(manifestPath);
    const entrypoint = typeof manifest?.entrypoint === 'string' ? manifest.entrypoint : null;
    if (!entrypoint) {
      missing.push(bundledPath(runtimeKey, 'managed-resources', 'acp', toolId, version, runtimeKey, '<entrypoint>'));
      continue;
    }

    const entrypointRelativePath = bundledPath(
      runtimeKey,
      'managed-resources',
      'acp',
      toolId,
      version,
      runtimeKey,
      entrypoint
    );
    checked.push(entrypointRelativePath);

    if (!isFile(path.join(platformRoot, entrypoint))) {
      missing.push(entrypointRelativePath);
    }

    requireFile(
      baseDir,
      runtimeKey,
      ['managed-resources', 'acp', toolId, version, runtimeKey, 'package.json'],
      checked,
      missing
    );
    requireFile(
      baseDir,
      runtimeKey,
      ['managed-resources', 'acp', toolId, version, runtimeKey, 'package-lock.json'],
      checked,
      missing
    );
    requireDirectory(
      baseDir,
      runtimeKey,
      ['managed-resources', 'acp', toolId, version, runtimeKey, 'node_modules'],
      checked,
      missing
    );

    const platformExecutableParts = acpToolPlatformExecutableParts(platform, runtimeKey, toolId);
    if (platformExecutableParts) {
      requireFile(
        baseDir,
        runtimeKey,
        ['managed-resources', 'acp', toolId, version, runtimeKey, ...platformExecutableParts],
        checked,
        missing
      );
    }
  }
}

function verifyBundledAioncoreResources({ resourcesDir, electronPlatformName, targetArch }) {
  const runtimeKey = `${electronPlatformName}-${targetArch}`;
  const baseDir = path.join(resourcesDir, 'bundled-aioncore', runtimeKey);
  const checked = [];
  const missing = [];

  requireRelativePath(baseDir, runtimeKey, [backendBinaryName(electronPlatformName)], checked, missing);
  verifyBundleManifest(baseDir, runtimeKey, electronPlatformName, targetArch, checked, missing);
  requireRelativeDirectory(baseDir, runtimeKey, ['managed-resources'], checked, missing);
  const verifiedSchema2 = verifySchema2ManagedResources(baseDir, runtimeKey, checked, missing);
  if (!verifiedSchema2) {
    requireManagedNode(baseDir, runtimeKey, electronPlatformName, checked, missing);
    requireManagedAcpTool(baseDir, runtimeKey, electronPlatformName, 'codex-acp', checked, missing);
    requireManagedAcpTool(baseDir, runtimeKey, electronPlatformName, 'claude-agent-acp', checked, missing);
  }

  return { runtimeKey, checked, missing };
}

module.exports = {
  verifyBundledAioncoreResources,
};
