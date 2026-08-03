const fs = require('fs');
const path = require('path');

const SUPPORTED_FORMATS = new Set(['html', 'pptx', 'docx']);
const ENTRY_KEYS = ['format', 'id', 'packagedReferenceFile'];
const TEMPLATE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACKAGED_REFERENCE_FILE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:pptx|docx)$/;
const WINDOWS_RESERVED_BASENAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

function describeEntry(index, id) {
  return `Presentation template inventory entry ${index}${id ? ` (${id})` : ''}`;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeBasename(fileName) {
  if (typeof fileName !== 'string' || fileName.length === 0 || fileName.includes('\0')) return false;
  if (fileName === '.' || fileName === '..') return false;
  if (path.posix.isAbsolute(fileName) || path.win32.isAbsolute(fileName)) return false;
  return path.posix.basename(fileName) === fileName && path.win32.basename(fileName) === fileName;
}

function validatePresentationTemplateInventory(value, sourceLabel = 'inventory') {
  if (!Array.isArray(value)) {
    throw new Error(`Presentation template ${sourceLabel} must be a JSON array`);
  }
  if (value.length === 0) {
    throw new Error(`Presentation template ${sourceLabel} must contain at least one entry`);
  }

  const ids = new Set();
  const packagedFiles = new Set();
  for (const candidate of value) {
    if (!isPlainObject(candidate)) continue;
    const { format, packagedReferenceFile } = candidate;
    if (format === 'html' || typeof packagedReferenceFile !== 'string') continue;

    const portableFileKey = packagedReferenceFile.toLowerCase();
    if (packagedFiles.has(portableFileKey)) {
      throw new Error(
        `Duplicate packaged reference file in presentation template ${sourceLabel}: ${packagedReferenceFile}`
      );
    }
    packagedFiles.add(portableFileKey);
  }

  const inventory = value.map((candidate, index) => {
    if (!isPlainObject(candidate)) {
      throw new Error(`${describeEntry(index)} must be an object`);
    }

    const keys = Object.keys(candidate).toSorted();
    if (keys.length !== ENTRY_KEYS.length || keys.some((key, keyIndex) => key !== ENTRY_KEYS[keyIndex])) {
      throw new Error(`${describeEntry(index)} must contain exactly id, format, and packagedReferenceFile`);
    }

    const { id, format, packagedReferenceFile } = candidate;
    if (typeof id !== 'string' || !TEMPLATE_ID_PATTERN.test(id)) {
      throw new Error(`${describeEntry(index)} id must be a non-empty lowercase kebab-case string`);
    }
    if (ids.has(id)) {
      throw new Error(`Duplicate template id in presentation template ${sourceLabel}: ${id}`);
    }
    ids.add(id);

    if (typeof format !== 'string' || !SUPPORTED_FORMATS.has(format)) {
      throw new Error(`${describeEntry(index, id)} has unsupported format: ${String(format)}`);
    }

    if (format === 'html') {
      if (packagedReferenceFile !== null) {
        throw new Error(`${describeEntry(index, id)} HTML packagedReferenceFile must be null`);
      }
    } else {
      if (!isSafeBasename(packagedReferenceFile)) {
        throw new Error(`${describeEntry(index, id)} packagedReferenceFile must be a safe basename`);
      }
      if (!PACKAGED_REFERENCE_FILE_PATTERN.test(packagedReferenceFile)) {
        throw new Error(
          `${describeEntry(index, id)} packagedReferenceFile must be a lowercase ASCII kebab-case basename`
        );
      }
      if (WINDOWS_RESERVED_BASENAME_PATTERN.test(path.parse(packagedReferenceFile).name)) {
        throw new Error(`${describeEntry(index, id)} packagedReferenceFile must not use a reserved Windows basename`);
      }
      if (path.extname(packagedReferenceFile) !== `.${format}`) {
        throw new Error(`${describeEntry(index, id)} packagedReferenceFile must use the .${format} extension`);
      }
    }

    return Object.freeze({ id, format, packagedReferenceFile });
  });

  return Object.freeze(inventory);
}

function readPresentationTemplateInventory(manifestPath) {
  if (typeof manifestPath !== 'string' || manifestPath.length === 0) {
    throw new Error('Presentation template manifest path must be a non-empty string');
  }

  let stats;
  try {
    stats = fs.lstatSync(manifestPath);
  } catch (error) {
    throw new Error(`Unable to read presentation template inventory at ${manifestPath}: ${error.message}`, {
      cause: error,
    });
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`Presentation template inventory must not be a symlink: ${manifestPath}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Presentation template inventory must be a regular file: ${manifestPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in presentation template inventory at ${manifestPath}: ${error.message}`, {
      cause: error,
    });
  }

  return validatePresentationTemplateInventory(parsed, `inventory at ${manifestPath}`);
}

function assertExactPresentationTemplateInventory({ inventory, requiredInventory } = {}) {
  const actual = validatePresentationTemplateInventory(inventory, 'packaged inventory');
  const required = validatePresentationTemplateInventory(requiredInventory, 'required inventory');
  const actualById = new Map(actual.map((entry) => [entry.id, entry]));
  const requiredIds = new Set(required.map((entry) => entry.id));
  const differences = [];

  for (const requiredEntry of required) {
    const actualEntry = actualById.get(requiredEntry.id);
    if (!actualEntry) {
      differences.push(`missing ${requiredEntry.id}`);
      continue;
    }
    if (
      actualEntry.format !== requiredEntry.format ||
      actualEntry.packagedReferenceFile !== requiredEntry.packagedReferenceFile
    ) {
      differences.push(`mismatched ${requiredEntry.id}`);
    }
  }

  for (const actualEntry of actual) {
    if (!requiredIds.has(actualEntry.id)) differences.push(`unexpected ${actualEntry.id}`);
  }

  if (actual.length !== required.length || differences.length > 0) {
    throw new Error(
      `Packaged presentation template manifest must match the exact required inventory (${differences.join(', ') || `expected ${required.length} entries, found ${actual.length}`})`
    );
  }

  return required;
}

function expectedPresentationTemplateFiles(inventory) {
  return validatePresentationTemplateInventory(inventory).flatMap((entry) =>
    entry.packagedReferenceFile === null ? [] : [entry.packagedReferenceFile]
  );
}

function assertPresentationTemplateResources({ inventory, resourcesDirectory } = {}) {
  if (typeof resourcesDirectory !== 'string' || resourcesDirectory.length === 0) {
    throw new Error('Presentation template resources directory must be a non-empty string');
  }

  let resourcesStats;
  try {
    resourcesStats = fs.lstatSync(resourcesDirectory);
  } catch (error) {
    throw new Error(`Presentation template resources directory is missing: ${resourcesDirectory} (${error.message})`, {
      cause: error,
    });
  }
  if (resourcesStats.isSymbolicLink()) {
    throw new Error(`Presentation template resources directory must not be a symlink: ${resourcesDirectory}`);
  }
  if (!resourcesStats.isDirectory()) {
    throw new Error(`Presentation template resources path must be a directory: ${resourcesDirectory}`);
  }

  const expectedFiles = expectedPresentationTemplateFiles(inventory);
  const requiredFiles = ['manifest.json', ...expectedFiles];
  const requiredFileSet = new Set(requiredFiles);
  const resolvedResourcesDirectory = path.resolve(resourcesDirectory);
  const missingFiles = [];
  const symlinkFiles = [];
  const invalidFiles = [];

  for (const fileName of requiredFiles) {
    if (!isSafeBasename(fileName)) {
      throw new Error(`Presentation template packaged reference must be a safe basename: ${fileName}`);
    }

    const candidate = path.resolve(resolvedResourcesDirectory, fileName);
    if (path.dirname(candidate) !== resolvedResourcesDirectory) {
      throw new Error(`Presentation template packaged reference escapes its resources directory: ${fileName}`);
    }

    let stats;
    try {
      stats = fs.lstatSync(candidate);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        missingFiles.push(fileName);
        continue;
      }
      throw error;
    }

    if (stats.isSymbolicLink()) {
      symlinkFiles.push(fileName);
    } else if (!stats.isFile()) {
      invalidFiles.push(fileName);
    }
  }

  const extraBinaryFiles = [];
  const unexpectedDirectories = [];
  const unexpectedSymlinks = [];
  const unexpectedFiles = [];
  for (const entry of fs.readdirSync(resourcesDirectory, { withFileTypes: true })) {
    if (requiredFileSet.has(entry.name)) continue;
    if (entry.isSymbolicLink()) {
      unexpectedSymlinks.push(entry.name);
    } else if (entry.isDirectory()) {
      unexpectedDirectories.push(entry.name);
    } else if (['.pptx', '.docx'].includes(path.extname(entry.name).toLowerCase())) {
      extraBinaryFiles.push(entry.name);
    } else {
      unexpectedFiles.push(entry.name);
    }
  }

  const problems = [];
  if (missingFiles.length > 0) problems.push(`missing files: ${missingFiles.join(', ')}`);
  if (extraBinaryFiles.length > 0) problems.push(`extra binary files: ${extraBinaryFiles.join(', ')}`);
  if (symlinkFiles.length > 0) problems.push(`symlinks are not allowed: ${symlinkFiles.join(', ')}`);
  if (invalidFiles.length > 0) problems.push(`required resources must be regular files: ${invalidFiles.join(', ')}`);
  if (unexpectedDirectories.length > 0) {
    problems.push(`unexpected directories: ${unexpectedDirectories.join(', ')}`);
  }
  if (unexpectedSymlinks.length > 0) problems.push(`unexpected symlinks: ${unexpectedSymlinks.join(', ')}`);
  if (unexpectedFiles.length > 0) problems.push(`unexpected files: ${unexpectedFiles.join(', ')}`);

  if (problems.length > 0) {
    throw new Error(`Presentation template resources failed inventory verification (${problems.join('; ')})`);
  }

  return expectedFiles;
}

module.exports = {
  readPresentationTemplateInventory,
  assertExactPresentationTemplateInventory,
  expectedPresentationTemplateFiles,
  assertPresentationTemplateResources,
};
