/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { TextDecoder } from 'node:util';
import { DOMParser } from '@xmldom/xmldom';
import * as yauzl from 'yauzl';
import { PRESENTATION_RUN_LIMITS } from '@/common/config/constants';

const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const CHART_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const REQUIRED_ENTRIES = [
  '[Content_Types].xml',
  '_rels/.rels',
  'ppt/presentation.xml',
  'ppt/_rels/presentation.xml.rels',
] as const;
const MAX_ZIP_ENTRY_NAME_BYTES = 4_096;
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
const DRAWABLE_SHAPE_NAMES = new Set(['sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp']);
const NON_SPEAKER_NOTE_PLACEHOLDERS = new Set(['sldImg', 'sldNum', 'hdr', 'ftr', 'dt']);
const VISUAL_ANCHOR_ORDER = ['picture', 'chart', 'table', 'connector'] as const;

export type PptxVisualAnchorKind = (typeof VISUAL_ANCHOR_ORDER)[number];

export type PptxOoxmlSlideInspection = {
  slideNumber: number;
  shapeCount: number;
  textCharCount: number;
  textOnlyShapeCount: number;
  notesTextCharCount: number;
  text: string;
  visualAnchorKinds: readonly PptxVisualAnchorKind[];
};

export type PptxOoxmlInspection = {
  zipEntryCount: number;
  expandedByteLength: number;
  xmlByteLength: number;
  slideCount: number;
  totalTextChars: number;
  slides: readonly PptxOoxmlSlideInspection[];
};

export type PptxOoxmlInspectionErrorCode =
  | 'INVALID_PACKAGE'
  | 'UNSAFE_PACKAGE'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'INVALID_XML'
  | 'RELATIONSHIP_INVALID';

export class PptxOoxmlInspectionError extends Error {
  constructor(
    readonly code: PptxOoxmlInspectionErrorCode,
    options?: ErrorOptions
  ) {
    super(code, options);
    this.name = 'PptxOoxmlInspectionError';
  }
}

export type PptxOoxmlInspectionLimits = {
  maxZipEntries: number;
  maxZipEntryBytes: number;
  maxZipExpandedBytes: number;
  maxXmlBytes: number;
  maxXmlNestingDepth: number;
  maxSlides: number;
  maxShapesPerSlide: number;
  maxTextCharsPerSlide: number;
  maxTextCharsTotal: number;
};

export type PptxOoxmlInspectionOptions = {
  limits?: Partial<PptxOoxmlInspectionLimits>;
};

const DEFAULT_LIMITS: PptxOoxmlInspectionLimits = {
  maxZipEntries: PRESENTATION_RUN_LIMITS.MAX_ZIP_ENTRIES,
  maxZipEntryBytes: PRESENTATION_RUN_LIMITS.MAX_ZIP_ENTRY_BYTES,
  maxZipExpandedBytes: PRESENTATION_RUN_LIMITS.MAX_ZIP_EXPANDED_BYTES,
  maxXmlBytes: PRESENTATION_RUN_LIMITS.MAX_XML_BYTES,
  maxXmlNestingDepth: PRESENTATION_RUN_LIMITS.MAX_XML_NESTING_DEPTH,
  maxSlides: PRESENTATION_RUN_LIMITS.MAX_SLIDES,
  maxShapesPerSlide: PRESENTATION_RUN_LIMITS.MAX_SHAPES_PER_SLIDE,
  maxTextCharsPerSlide: PRESENTATION_RUN_LIMITS.MAX_TEXT_CHARS_PER_SLIDE,
  maxTextCharsTotal: PRESENTATION_RUN_LIMITS.MAX_TEXT_CHARS_TOTAL,
};

type InternalRelationship = {
  id: string;
  type: string;
  target: string;
  external: boolean;
};

type SlidePartInspection = Omit<PptxOoxmlSlideInspection, 'slideNumber' | 'notesTextCharCount'> & {
  anchorReferences: readonly {
    kind: 'picture' | 'chart';
    relationshipId: string;
    expectedType: string;
  }[];
};

type InspectionAccumulator = {
  entryNames: Set<string>;
  foldedEntryNames: Set<string>;
  relationshipsBySource: Map<string, Map<string, InternalRelationship>>;
  slideParts: Map<string, SlidePartInspection>;
  notesParts: Map<string, number>;
  presentationSlideRelationshipIds: string[] | null;
  expandedByteLength: number;
  xmlByteLength: number;
};

function fail(code: PptxOoxmlInspectionErrorCode): never {
  throw new PptxOoxmlInspectionError(code);
}

function resolveLimits(overrides: Partial<PptxOoxmlInspectionLimits> | undefined): PptxOoxmlInspectionLimits {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) fail('RESOURCE_LIMIT_EXCEEDED');
  }
  return limits;
}

function mapZipError(error: unknown): PptxOoxmlInspectionError {
  if (error instanceof PptxOoxmlInspectionError) return error;
  const message = error instanceof Error ? error.message : '';
  if (
    message.includes('invalid characters in fileName') ||
    message.includes('absolute path') ||
    message.includes('invalid relative path')
  ) {
    return new PptxOoxmlInspectionError('UNSAFE_PACKAGE');
  }
  return new PptxOoxmlInspectionError('INVALID_PACKAGE', { cause: error });
}

function updateCrc32(crc: number, chunk: Buffer): number {
  let next = crc;
  for (const byte of chunk) next = CRC32_TABLE[(next ^ byte) & 0xff]! ^ (next >>> 8);
  return next >>> 0;
}

function assertSafeZipEntry(entry: yauzl.Entry): void {
  const name = entry.fileName;
  const isDirectory = name.endsWith('/');
  const segments = name.split('/');
  if (isDirectory) segments.pop();
  if (
    name.length === 0 ||
    Buffer.byteLength(name, 'utf8') > MAX_ZIP_ENTRY_NAME_BYTES ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.startsWith('/') ||
    /^[a-z]:/i.test(name) ||
    segments.length === 0 ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    entry.isEncrypted() ||
    (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) ||
    (isDirectory && entry.uncompressedSize !== 0)
  ) {
    fail('UNSAFE_PACKAGE');
  }

  const platform = entry.versionMadeBy >>> 8;
  if (platform === 3) {
    const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
    const expectedType = isDirectory ? 0o040000 : 0o100000;
    if (fileType !== 0 && fileType !== expectedType) fail('UNSAFE_PACKAGE');
  }
}

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      filePath,
      {
        autoClose: true,
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true,
      },
      (error, zip) => {
        if (error !== null) reject(mapZipError(error));
        else resolve(zip);
      }
    );
  });
}

function readZipEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, maximumByteLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (openError, stream) => {
      if (openError !== null) {
        reject(mapZipError(openError));
        return;
      }
      const chunks: Buffer[] = [];
      let byteLength = 0;
      let crc = 0xffffffff;
      let settled = false;
      const finish = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        if (error !== undefined) reject(mapZipError(error));
        else if (byteLength !== entry.uncompressedSize || (crc ^ 0xffffffff) >>> 0 !== entry.crc32) {
          reject(new PptxOoxmlInspectionError('INVALID_PACKAGE'));
        } else {
          resolve(Buffer.concat(chunks, byteLength));
        }
      };
      stream.on('data', (chunk: Buffer) => {
        byteLength += chunk.length;
        if (
          !Number.isSafeInteger(byteLength) ||
          byteLength > maximumByteLength ||
          byteLength > entry.uncompressedSize
        ) {
          stream.destroy(new PptxOoxmlInspectionError('RESOURCE_LIMIT_EXCEEDED'));
          return;
        }
        crc = updateCrc32(crc, chunk);
        chunks.push(chunk);
      });
      stream.once('error', finish);
      stream.once('end', () => finish());
    });
  });
}

function decodeXml(bytes: Buffer): string {
  try {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('INVALID_XML');
  }
}

function findMarkupEnd(source: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '>') return index;
  }
  return fail('INVALID_XML');
}

function assertBoundedXmlDepth(source: string, maximumDepth: number): void {
  let depth = 0;
  let index = 0;
  while (index < source.length) {
    const opening = source.indexOf('<', index);
    if (opening === -1) break;
    if (source.startsWith('<!--', opening)) {
      const end = source.indexOf('-->', opening + 4);
      if (end === -1) fail('INVALID_XML');
      index = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', opening)) {
      const end = source.indexOf(']]>', opening + 9);
      if (end === -1) fail('INVALID_XML');
      index = end + 3;
      continue;
    }
    if (source.startsWith('<?', opening)) {
      const end = source.indexOf('?>', opening + 2);
      if (end === -1) fail('INVALID_XML');
      index = end + 2;
      continue;
    }
    if (source.startsWith('<!', opening)) fail('INVALID_XML');

    const end = findMarkupEnd(source, opening + 1);
    const markup = source.slice(opening + 1, end).trim();
    if (markup.length === 0) fail('INVALID_XML');
    if (markup.startsWith('/')) {
      depth -= 1;
      if (depth < 0) fail('INVALID_XML');
    } else {
      depth += 1;
      if (depth > maximumDepth) fail('RESOURCE_LIMIT_EXCEEDED');
      if (/\/\s*$/.test(markup)) depth -= 1;
    }
    index = end + 1;
  }
  if (depth !== 0) fail('INVALID_XML');
}

function parseXml(bytes: Buffer, limits: PptxOoxmlInspectionLimits): Document {
  if (bytes.byteLength > limits.maxXmlBytes) fail('RESOURCE_LIMIT_EXCEEDED');
  const source = decodeXml(bytes);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) fail('INVALID_XML');
  assertBoundedXmlDepth(source, limits.maxXmlNestingDepth);
  try {
    const rejectParseIssue = (): never => fail('INVALID_XML');
    const document = new DOMParser({
      errorHandler: {
        warning: rejectParseIssue,
        error: rejectParseIssue,
        fatalError: rejectParseIssue,
      },
    }).parseFromString(source, 'application/xml');
    if (!document.documentElement || document.doctype !== null) fail('INVALID_XML');
    return document;
  } catch (error) {
    if (error instanceof PptxOoxmlInspectionError) throw error;
    return fail('INVALID_XML');
  }
}

function elementsByName(root: Document | Element, namespace: string, localName: string): Element[] {
  const matches = root.getElementsByTagNameNS(namespace, localName);
  const elements: Element[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const element = matches.item(index);
    if (element) elements.push(element);
  }
  return elements;
}

function allElements(root: Document | Element): Element[] {
  const elements: Element[] = [];
  const pending: Node[] = [root.nodeType === 9 ? (root as Document).documentElement : root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    if (node.nodeType === 1) elements.push(node as Element);
    const childNodes = node.childNodes;
    if (!childNodes) continue;
    for (let index = childNodes.length - 1; index >= 0; index -= 1) {
      const child = childNodes.item(index);
      if (child) pending.push(child);
    }
  }
  return elements;
}

function isRoot(document: Document, namespace: string, localName: string): boolean {
  return document.documentElement.namespaceURI === namespace && document.documentElement.localName === localName;
}

function relationshipSourcePart(relationshipsPart: string): string {
  if (relationshipsPart === '_rels/.rels') return '';
  const marker = '/_rels/';
  const markerIndex = relationshipsPart.lastIndexOf(marker);
  if (markerIndex < 0 || !relationshipsPart.endsWith('.rels')) return fail('RELATIONSHIP_INVALID');
  const directory = relationshipsPart.slice(0, markerIndex);
  const fileName = relationshipsPart.slice(markerIndex + marker.length, -'.rels'.length);
  if (fileName.length === 0) return fail('RELATIONSHIP_INVALID');
  return `${directory}/${fileName}`;
}

function resolveInternalTarget(sourcePart: string, rawTarget: string): string {
  if (
    rawTarget.length === 0 ||
    rawTarget.includes('\\') ||
    rawTarget.includes('\0') ||
    /^[a-z][a-z\d+.-]*:/i.test(rawTarget)
  ) {
    return fail('RELATIONSHIP_INVALID');
  }
  const targetWithoutFragment = rawTarget.split(/[?#]/, 1)[0];
  if (!targetWithoutFragment) return fail('RELATIONSHIP_INVALID');
  let decoded: string;
  try {
    decoded = decodeURIComponent(targetWithoutFragment);
  } catch {
    return fail('RELATIONSHIP_INVALID');
  }
  if (decoded.includes('\\') || decoded.includes('\0')) return fail('RELATIONSHIP_INVALID');

  const absolute = decoded.startsWith('/');
  if (absolute && decoded.startsWith('//')) return fail('RELATIONSHIP_INVALID');
  const baseDirectory = sourcePart.length === 0 ? '' : path.posix.dirname(sourcePart);
  const segments = absolute ? [] : baseDirectory.split('/').filter((segment) => segment.length > 0 && segment !== '.');
  const targetSegments = (absolute ? decoded.slice(1) : decoded).split('/');
  for (const segment of targetSegments) {
    if (segment === '' || segment === '.') {
      if (segment === '') return fail('RELATIONSHIP_INVALID');
      continue;
    }
    if (segment === '..') {
      if (segments.length === 0) return fail('RELATIONSHIP_INVALID');
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) return fail('RELATIONSHIP_INVALID');
  return segments.join('/');
}

function parseRelationships(partName: string, document: Document, accumulator: InspectionAccumulator): void {
  if (!isRoot(document, PACKAGE_REL_NS, 'Relationships')) fail('RELATIONSHIP_INVALID');
  const sourcePart = relationshipSourcePart(partName);
  const relationships = new Map<string, InternalRelationship>();
  for (const element of elementsByName(document, PACKAGE_REL_NS, 'Relationship')) {
    const id = element.getAttribute('Id');
    const type = element.getAttribute('Type');
    const rawTarget = element.getAttribute('Target');
    const targetMode = element.getAttribute('TargetMode');
    if (!id || !type || !rawTarget || relationships.has(id)) fail('RELATIONSHIP_INVALID');
    if (targetMode !== '' && targetMode !== 'Internal' && targetMode !== 'External') {
      fail('RELATIONSHIP_INVALID');
    }
    const external = targetMode === 'External';
    relationships.set(id, {
      id,
      type,
      target: external ? rawTarget : resolveInternalTarget(sourcePart, rawTarget),
      external,
    });
  }
  accumulator.relationshipsBySource.set(sourcePart, relationships);
}

function parsePresentation(document: Document, accumulator: InspectionAccumulator): void {
  if (!isRoot(document, PRESENTATION_NS, 'presentation')) fail('INVALID_XML');
  const relationshipIds: string[] = [];
  const seen = new Set<string>();
  for (const slideId of elementsByName(document, PRESENTATION_NS, 'sldId')) {
    const relationshipId = slideId.getAttributeNS(OFFICE_REL_NS, 'id');
    if (!relationshipId || seen.has(relationshipId)) fail('RELATIONSHIP_INVALID');
    seen.add(relationshipId);
    relationshipIds.push(relationshipId);
  }
  accumulator.presentationSlideRelationshipIds = relationshipIds;
}

function inspectSlidePart(document: Document, limits: PptxOoxmlInspectionLimits): SlidePartInspection {
  const elements = allElements(document);
  const shapeCount = elements.filter(
    (element) => element.namespaceURI === PRESENTATION_NS && DRAWABLE_SHAPE_NAMES.has(element.localName)
  ).length;
  if (shapeCount > limits.maxShapesPerSlide) fail('RESOURCE_LIMIT_EXCEEDED');

  const textElements = elementsByName(document, DRAWING_NS, 't');
  const text = textElements.map((element) => element.textContent ?? '').join('');
  if (text.length > limits.maxTextCharsPerSlide) fail('RESOURCE_LIMIT_EXCEEDED');

  let textOnlyShapeCount = 0;
  for (const shape of elementsByName(document, PRESENTATION_NS, 'sp')) {
    if (elementsByName(shape, DRAWING_NS, 't').some((element) => (element.textContent ?? '').trim().length > 0)) {
      textOnlyShapeCount += 1;
    }
  }

  const anchorKinds = new Set<PptxVisualAnchorKind>();
  const anchorReferences: {
    kind: 'picture' | 'chart';
    relationshipId: string;
    expectedType: string;
  }[] = [];
  for (const picture of elementsByName(document, PRESENTATION_NS, 'pic')) {
    anchorKinds.add('picture');
    const embeds = elementsByName(picture, DRAWING_NS, 'blip')
      .map((element) => element.getAttributeNS(OFFICE_REL_NS, 'embed'))
      .filter((id): id is string => id.length > 0);
    if (embeds.length === 0) fail('RELATIONSHIP_INVALID');
    for (const relationshipId of embeds) {
      anchorReferences.push({ kind: 'picture', relationshipId, expectedType: `${OFFICE_REL_NS}/image` });
    }
  }
  for (const chart of elementsByName(document, CHART_NS, 'chart')) {
    anchorKinds.add('chart');
    const relationshipId = chart.getAttributeNS(OFFICE_REL_NS, 'id');
    if (!relationshipId) fail('RELATIONSHIP_INVALID');
    anchorReferences.push({ kind: 'chart', relationshipId, expectedType: `${OFFICE_REL_NS}/chart` });
  }
  if (elementsByName(document, DRAWING_NS, 'tbl').length > 0) anchorKinds.add('table');
  if (elementsByName(document, PRESENTATION_NS, 'cxnSp').length > 0) anchorKinds.add('connector');

  return {
    shapeCount,
    textCharCount: text.length,
    textOnlyShapeCount,
    text,
    visualAnchorKinds: VISUAL_ANCHOR_ORDER.filter((kind) => anchorKinds.has(kind)),
    anchorReferences,
  };
}

function inspectNotesPart(document: Document): number {
  let textCharCount = 0;
  for (const shape of elementsByName(document, PRESENTATION_NS, 'sp')) {
    const placeholders = elementsByName(shape, PRESENTATION_NS, 'ph');
    if (placeholders.some((placeholder) => NON_SPEAKER_NOTE_PLACEHOLDERS.has(placeholder.getAttribute('type')))) {
      continue;
    }
    for (const textElement of elementsByName(shape, DRAWING_NS, 't')) {
      const text = textElement.textContent ?? '';
      if (text.trim().length > 0) textCharCount += text.length;
    }
  }
  return textCharCount;
}

function inspectXmlPart(
  name: string,
  bytes: Buffer,
  limits: PptxOoxmlInspectionLimits,
  accumulator: InspectionAccumulator
): void {
  const document = parseXml(bytes, limits);
  if (name.endsWith('.rels')) parseRelationships(name, document, accumulator);
  if (name === 'ppt/presentation.xml') parsePresentation(document, accumulator);
  if (isRoot(document, PRESENTATION_NS, 'sld')) {
    accumulator.slideParts.set(name, inspectSlidePart(document, limits));
  } else if (isRoot(document, PRESENTATION_NS, 'notes')) {
    accumulator.notesParts.set(name, inspectNotesPart(document));
  }
}

async function inspectZipEntries(
  zip: yauzl.ZipFile,
  limits: PptxOoxmlInspectionLimits,
  accumulator: InspectionAccumulator
): Promise<void> {
  if (zip.entryCount < 1 || zip.entryCount > limits.maxZipEntries) fail('RESOURCE_LIMIT_EXCEEDED');
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      zip.removeListener('entry', onEntry);
      zip.removeListener('end', onEnd);
      zip.removeListener('error', onError);
      if (error === undefined) resolve();
      else reject(mapZipError(error));
    };
    const onEntry = (entry: yauzl.Entry): void => {
      void (async () => {
        assertSafeZipEntry(entry);
        if (
          !Number.isSafeInteger(entry.compressedSize) ||
          !Number.isSafeInteger(entry.uncompressedSize) ||
          entry.compressedSize < 0 ||
          entry.uncompressedSize < 0 ||
          entry.uncompressedSize > limits.maxZipEntryBytes
        ) {
          fail('RESOURCE_LIMIT_EXCEEDED');
        }
        accumulator.expandedByteLength += entry.uncompressedSize;
        if (
          !Number.isSafeInteger(accumulator.expandedByteLength) ||
          accumulator.expandedByteLength > limits.maxZipExpandedBytes
        ) {
          fail('RESOURCE_LIMIT_EXCEEDED');
        }

        const foldedName = entry.fileName.toLocaleLowerCase('en-US');
        if (accumulator.entryNames.has(entry.fileName) || accumulator.foldedEntryNames.has(foldedName)) {
          fail('UNSAFE_PACKAGE');
        }
        accumulator.entryNames.add(entry.fileName);
        accumulator.foldedEntryNames.add(foldedName);

        if (!entry.fileName.endsWith('/')) {
          const isXmlPart = /(?:\.xml|\.rels)$/i.test(entry.fileName);
          if (isXmlPart && entry.uncompressedSize > limits.maxXmlBytes) fail('RESOURCE_LIMIT_EXCEEDED');
          const bytes = await readZipEntry(zip, entry, isXmlPart ? limits.maxXmlBytes : limits.maxZipEntryBytes);
          if (isXmlPart) {
            accumulator.xmlByteLength += bytes.byteLength;
            if (!Number.isSafeInteger(accumulator.xmlByteLength)) fail('RESOURCE_LIMIT_EXCEEDED');
            inspectXmlPart(entry.fileName, bytes, limits, accumulator);
          }
        }
        zip.readEntry();
      })().catch(finish);
    };
    const onEnd = (): void => finish();
    const onError = (error: Error): void => finish(error);
    zip.on('entry', onEntry);
    zip.once('end', onEnd);
    zip.once('error', onError);
    zip.readEntry();
  });
}

function validateRelationshipTargets(accumulator: InspectionAccumulator): void {
  for (const relationships of accumulator.relationshipsBySource.values()) {
    for (const relationship of relationships.values()) {
      if (!relationship.external && !accumulator.entryNames.has(relationship.target)) {
        fail('RELATIONSHIP_INVALID');
      }
    }
  }
}

function requireInternalRelationship(
  relationships: Map<string, InternalRelationship> | undefined,
  relationshipId: string,
  expectedType: string
): InternalRelationship {
  const relationship = relationships?.get(relationshipId);
  if (!relationship || relationship.external || relationship.type !== expectedType) fail('RELATIONSHIP_INVALID');
  return relationship;
}

function assembleInspection(
  zipEntryCount: number,
  accumulator: InspectionAccumulator,
  limits: PptxOoxmlInspectionLimits
): PptxOoxmlInspection {
  for (const required of REQUIRED_ENTRIES) {
    if (!accumulator.entryNames.has(required)) fail('INVALID_PACKAGE');
  }
  validateRelationshipTargets(accumulator);
  const slideRelationshipIds = accumulator.presentationSlideRelationshipIds;
  if (!slideRelationshipIds || slideRelationshipIds.length < 1) fail('INVALID_PACKAGE');
  if (slideRelationshipIds.length > limits.maxSlides) fail('RESOURCE_LIMIT_EXCEEDED');

  const presentationRelationships = accumulator.relationshipsBySource.get('ppt/presentation.xml');
  const seenSlideTargets = new Set<string>();
  const slides: PptxOoxmlSlideInspection[] = [];
  let totalTextChars = 0;
  for (const [index, relationshipId] of slideRelationshipIds.entries()) {
    const relationship = requireInternalRelationship(
      presentationRelationships,
      relationshipId,
      `${OFFICE_REL_NS}/slide`
    );
    if (seenSlideTargets.has(relationship.target)) fail('RELATIONSHIP_INVALID');
    seenSlideTargets.add(relationship.target);
    const part = accumulator.slideParts.get(relationship.target);
    if (!part) fail('RELATIONSHIP_INVALID');

    const slideRelationships = accumulator.relationshipsBySource.get(relationship.target);
    for (const reference of part.anchorReferences) {
      requireInternalRelationship(slideRelationships, reference.relationshipId, reference.expectedType);
    }
    const notesRelationships = [...(slideRelationships?.values() ?? [])].filter(
      (candidate) => candidate.type === `${OFFICE_REL_NS}/notesSlide`
    );
    if (notesRelationships.length > 1) fail('RELATIONSHIP_INVALID');
    let notesTextCharCount = 0;
    if (notesRelationships.length === 1) {
      const notesRelationship = notesRelationships[0]!;
      if (notesRelationship.external) fail('RELATIONSHIP_INVALID');
      const notesCount = accumulator.notesParts.get(notesRelationship.target);
      if (notesCount === undefined) fail('RELATIONSHIP_INVALID');
      notesTextCharCount = notesCount;
    }

    totalTextChars += part.textCharCount;
    if (!Number.isSafeInteger(totalTextChars) || totalTextChars > limits.maxTextCharsTotal) {
      fail('RESOURCE_LIMIT_EXCEEDED');
    }
    slides.push({
      slideNumber: index + 1,
      shapeCount: part.shapeCount,
      textCharCount: part.textCharCount,
      textOnlyShapeCount: part.textOnlyShapeCount,
      notesTextCharCount,
      text: part.text,
      visualAnchorKinds: part.visualAnchorKinds,
    });
  }

  return {
    zipEntryCount,
    expandedByteLength: accumulator.expandedByteLength,
    xmlByteLength: accumulator.xmlByteLength,
    slideCount: slides.length,
    totalTextChars,
    slides,
  };
}

/** Inspect an already-private PPTX copy without granting authority or mutating run state. */
export async function inspectPptxOoxml(
  filePath: string,
  options: PptxOoxmlInspectionOptions = {}
): Promise<PptxOoxmlInspection> {
  const limits = resolveLimits(options.limits);
  const zip = await openZip(filePath);
  const accumulator: InspectionAccumulator = {
    entryNames: new Set(),
    foldedEntryNames: new Set(),
    relationshipsBySource: new Map(),
    slideParts: new Map(),
    notesParts: new Map(),
    presentationSlideRelationshipIds: null,
    expandedByteLength: 0,
    xmlByteLength: 0,
  };
  try {
    await inspectZipEntries(zip, limits, accumulator);
    return assembleInspection(zip.entryCount, accumulator, limits);
  } catch (error) {
    throw mapZipError(error);
  } finally {
    if (zip.isOpen) zip.close();
  }
}
