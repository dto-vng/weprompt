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
    const value = env[name];
    const isSigningName =
      INTERNAL_RELEASE_SIGNING_ENV_NAMES.includes(name) || name.startsWith('CSC_') || name.startsWith('APPLE_');
    if (name === 'CSC_IDENTITY_AUTO_DISCOVERY' && value === 'false') {
      return false;
    }
    return isSigningName && typeof value === 'string' && value.trim() !== '';
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
    if (env.CSC_IDENTITY_AUTO_DISCOVERY !== 'false') {
      throw new Error('Internal release requires CSC_IDENTITY_AUTO_DISCOVERY=false before signing');
    }
    const inheritedVariables = populatedSigningVariables(env);
    if (inheritedVariables.length > 0) {
      throw new Error(`Internal release rejects signing/notarization variables: ${inheritedVariables.join(', ')}`);
    }

    runCommand(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
    runCommand(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' });
    const signatureDetails = String(
      runCommand(`codesign -dv --verbose=4 "${appPath}" 2>&1`, { encoding: 'utf8', stdio: 'pipe' })
    );
    const teamIdentifier = signatureDetails.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
    const hasProductionIdentity =
      !/^Signature=adhoc$/m.test(signatureDetails) ||
      /^Authority=/m.test(signatureDetails) ||
      (teamIdentifier != null && teamIdentifier.toLowerCase() !== 'not set');
    if (hasProductionIdentity) {
      throw new Error(`Internal release retained a production signing identity: ${appName}`);
    }
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
