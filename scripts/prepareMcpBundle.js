/**
 * prepareMcpBundle.js
 *
 * Vendors the `mcp-remote` stdio bridge into resources/mcp-bundled/ so the
 * packaged app can launch it from inside the install folder — no `npx`
 * dependency-tree re-resolution, no PATH lookup, no Homebrew path.
 *
 * Called during the build pipeline before electron-builder runs.
 *
 * Environment variables:
 *   AIONUI_MCP_BUNDLE_SKIP - Set to '1' to skip vendoring.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BUNDLE_DIR = path.join(PROJECT_ROOT, 'resources', 'mcp-bundled');

const MCP_REMOTE_PACKAGE = 'mcp-remote';
const MCP_REMOTE_VERSION = '0.1.38';
const MCP_BUNDLE_MANIFEST_NAME = 'manifest.json';

/**
 * Resolve the executable entry a package declares in its "bin" field.
 * Accepts the string form and the object form, preferring the key matching
 * the package name and falling back to a sole entry under another key.
 */
function resolvePackageBinEntry(packageJson, packageName) {
  const bin = packageJson && packageJson.bin;
  if (typeof bin === 'string' && bin.trim()) {
    return bin.trim();
  }
  if (bin && typeof bin === 'object') {
    const named = bin[packageName];
    if (typeof named === 'string' && named.trim()) {
      return named.trim();
    }
    const values = Object.values(bin).filter((value) => typeof value === 'string' && value.trim());
    if (values.length === 1) {
      return values[0].trim();
    }
  }
  throw new Error(
    `Package "${packageName}" declares no "bin" entry that can be resolved; cannot vendor it for the packaged app.`
  );
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function prepareMcpBundle() {
  if ((process.env.AIONUI_MCP_BUNDLE_SKIP || '').trim() === '1') {
    console.log('[mcp-bundle] AIONUI_MCP_BUNDLE_SKIP=1 — skipping');
    return { prepared: false };
  }

  fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
  ensureDir(BUNDLE_DIR);

  const spec = `${MCP_REMOTE_PACKAGE}@${MCP_REMOTE_VERSION}`;
  console.log(`[mcp-bundle] Installing ${spec} into ${path.relative(PROJECT_ROOT, BUNDLE_DIR)}`);
  execFileSync(
    'npm',
    ['install', spec, '--prefix', BUNDLE_DIR, '--no-audit', '--no-fund', '--omit=dev', '--loglevel=error'],
    { stdio: 'inherit', shell: process.platform === 'win32' }
  );

  const packageDir = path.join(BUNDLE_DIR, 'node_modules', MCP_REMOTE_PACKAGE);
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`[mcp-bundle] ${spec} did not install: ${packageJsonPath} is missing`);
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const binEntry = resolvePackageBinEntry(packageJson, MCP_REMOTE_PACKAGE);

  const absoluteEntry = path.join(packageDir, binEntry);
  if (!fs.existsSync(absoluteEntry)) {
    throw new Error(`[mcp-bundle] resolved entry does not exist on disk: ${absoluteEntry}`);
  }

  const entry = path.relative(BUNDLE_DIR, absoluteEntry).split(path.sep).join('/');
  const manifest = { mcpRemote: { version: packageJson.version || MCP_REMOTE_VERSION, entry } };
  fs.writeFileSync(path.join(BUNDLE_DIR, MCP_BUNDLE_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[mcp-bundle] Vendored mcp-remote ${manifest.mcpRemote.version} — entry ${entry}`);

  return { prepared: true, manifest };
}

module.exports = { MCP_REMOTE_VERSION, MCP_BUNDLE_MANIFEST_NAME, resolvePackageBinEntry, prepareMcpBundle };

if (require.main === module) {
  try {
    prepareMcpBundle();
  } catch (error) {
    console.error(`[mcp-bundle] failed: ${error.message}`);
    process.exit(1);
  }
}
