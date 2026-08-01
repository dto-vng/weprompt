const { execSync } = require('child_process');

const INTERNAL_RELEASE_SIGNING_ENV_NAMES = [
  'BUILD_CERTIFICATE_BASE64',
  'P12_PASSWORD',
  'KEYCHAIN_PASSWORD',
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'CSC_NAME',
  'CSC_IDENTITY_AUTO_DISCOVERY',
  'APPLE_ID',
  'APPLE_ID_PASSWORD',
  'TEAM_ID',
  'IDENTITY',
  'appleId',
  'appleIdPassword',
  'teamId',
  'identity',
];

function populatedSigningVariables(env) {
  return [...new Set([...INTERNAL_RELEASE_SIGNING_ENV_NAMES, ...Object.keys(env)])].filter((name) => {
    const isSigningName =
      INTERNAL_RELEASE_SIGNING_ENV_NAMES.includes(name) || name.startsWith('CSC_') || name.startsWith('APPLE_');
    return isSigningName && typeof env[name] === 'string' && env[name].trim() !== '';
  });
}

async function afterSign(
  context,
  { env = process.env, execSync: runCommand = execSync, loadNotarize = () => import('@electron/notarize') } = {}
) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appBundleId = context.packager.appInfo.id;
  const appPath = `${appOutDir}/${appName}.app`;

  if (env.WEPROMPT_INTERNAL_RELEASE === '1') {
    const inheritedVariables = populatedSigningVariables(env);
    if (inheritedVariables.length > 0) {
      throw new Error(`Internal release rejects signing/notarization variables: ${inheritedVariables.join(', ')}`);
    }

    runCommand(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
    console.log(`Ad-hoc signature applied successfully to internal ${appName}`);
    return;
  }

  // Lazy-load notarize because @electron/notarize is ESM-only. The internal-release
  // branch returns before this import so an internal package cannot contact Apple.
  const { notarize } = await loadNotarize();

  // Check if app is actually signed before attempting notarization
  try {
    runCommand(`codesign --verify --verbose "${appPath}"`, { stdio: 'pipe' });
    console.log(`App ${appName} is properly code signed`);
  } catch (error) {
    console.log(`App ${appName} is not code signed, applying ad-hoc signature...`);
    try {
      runCommand(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
      console.log(`Ad-hoc signature applied successfully to ${appName}`);
    } catch (adHocError) {
      console.error('Ad-hoc signing failed:', adHocError.message);
    }
    return;
  }

  // Skip notarization if credentials are not provided
  if (!env.appleId || !env.appleIdPassword) {
    console.log('Skipping notarization - missing Apple ID credentials');
    return;
  }

  console.log(`Starting notarization for ${appName} (${appBundleId})...`);

  try {
    await notarize({
      tool: 'notarytool',
      appBundleId,
      appPath: appPath,
      appleId: env.appleId,
      appleIdPassword: env.appleIdPassword,
      teamId: env.teamId,
    });
    console.log('Notarization completed successfully');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
}

exports.afterSign = afterSign;
exports.default = afterSign;
