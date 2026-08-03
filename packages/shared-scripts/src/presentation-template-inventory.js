const fs = require('fs');
const path = require('path');

const SUPPORTED_FORMATS = new Set(['html', 'pptx', 'docx']);
const ENTRY_KEYS = ['format', 'id', 'packagedReferenceFile'];
const TEMPLATE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
      if (path.extname(packagedReferenceFile) !== `.${format}`) {
        throw new Error(`${describeEntry(index, id)} packagedReferenceFile must use the .${format} extension`);
      }
      if (packagedFiles.has(packagedReferenceFile)) {
        throw new Error(
          `Duplicate packaged reference file in presentation template ${sourceLabel}: ${packagedReferenceFile}`
        );
      }
      packagedFiles.add(packagedReferenceFile);
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
  const expectedFileSet = new Set(expectedFiles);
  const resolvedResourcesDirectory = path.resolve(resourcesDirectory);
  const missingFiles = [];
  const symlinkFiles = [];
  const invalidFiles = [];

  for (const fileName of expectedFiles) {
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

  const extraBinaryFiles = fs
    .readdirSync(resourcesDirectory, { withFileTypes: true })
    .map((entry) => entry.name)
    .filter((fileName) => ['.pptx', '.docx'].includes(path.extname(fileName).toLowerCase()))
    .filter((fileName) => !expectedFileSet.has(fileName));

  const problems = [];
  if (missingFiles.length > 0) problems.push(`missing files: ${missingFiles.join(', ')}`);
  if (extraBinaryFiles.length > 0) problems.push(`extra binary files: ${extraBinaryFiles.join(', ')}`);
  if (symlinkFiles.length > 0) problems.push(`symlinks are not allowed: ${symlinkFiles.join(', ')}`);
  if (invalidFiles.length > 0) problems.push(`references must be regular files: ${invalidFiles.join(', ')}`);

  if (problems.length > 0) {
    throw new Error(`Presentation template resources failed inventory verification (${problems.join('; ')})`);
  }

  return expectedFiles;
}

module.exports = {
  readPresentationTemplateInventory,
  expectedPresentationTemplateFiles,
  assertPresentationTemplateResources,
};
