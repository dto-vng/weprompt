/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { deflateRawSync } from 'node:zlib';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  inspectPptxOoxml,
  type PptxOoxmlInspectionLimits,
} from '@/process/services/office-artifact/service/pptxOoxmlInspector';

const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const CHART_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPE_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

type ZipFixtureEntry = {
  name: string;
  bytes: Buffer;
  compressionMethod?: 0 | 8 | 99;
  flags?: number;
  versionMadeBy?: number;
  externalFileAttributes?: number;
};

type SlideFixture = {
  texts?: readonly string[];
  anchors?: readonly ('picture' | 'chart' | 'table' | 'connector')[];
  notes?: string;
  notesTarget?: string;
  extraRelationships?: string;
};

type PptxFixtureOptions = {
  slides?: readonly SlideFixture[];
  presentationOrder?: readonly number[];
  extraEntries?: readonly ZipFixtureEntry[];
};

const crc32 = (bytes: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const createZip = (
  entries: readonly ZipFixtureEntry[]
): { bytes: Buffer; payloadOffsets: readonly { name: string; offset: number; byteLength: number }[] } => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const payloadOffsets: { name: string; offset: number; byteLength: number }[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const method = entry.compressionMethod ?? 8;
    const compressed = method === 8 ? deflateRawSync(entry.bytes) : Buffer.from(entry.bytes);
    const checksum = crc32(entry.bytes);
    const flags = entry.flags ?? 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    payloadOffsets.push({
      name: entry.name,
      offset: localOffset + local.length + name.length,
      byteLength: compressed.length,
    });
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.versionMadeBy ?? 0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.externalFileAttributes ?? (0o100600 << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return { bytes: Buffer.concat([...localParts, centralDirectory, end]), payloadOffsets };
};

const xml = (value: string): Buffer => Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${value}`);

const escapeXml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const textShape = (id: number, text: string): string => `
  <p:sp>
    <p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr/>
    <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p></p:txBody>
  </p:sp>`;

const pictureShape = (): string => `
  <p:pic><p:nvPicPr><p:cNvPr id="100" name="Picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
    <p:blipFill><a:blip r:embed="rIdImage"/></p:blipFill><p:spPr/>
  </p:pic>`;

const chartShape = (): string => `
  <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="101" name="Chart"/></p:nvGraphicFramePr>
    <a:graphic><a:graphicData uri="${CHART_NS}"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic>
  </p:graphicFrame>`;

const tableShape = (): string => `
  <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="102" name="Table"/></p:nvGraphicFramePr>
    <a:graphic><a:graphicData uri="${DRAWING_NS}/table"><a:tbl><a:tblPr/><a:tblGrid/></a:tbl></a:graphicData></a:graphic>
  </p:graphicFrame>`;

const connectorShape = (): string => `
  <p:cxnSp><p:nvCxnSpPr><p:cNvPr id="103" name="Connector"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr/></p:cxnSp>`;

const relationshipsXml = (relationships: string): Buffer =>
  xml(`<Relationships xmlns="${PACKAGE_REL_NS}">${relationships}</Relationships>`);

const createPptxEntries = ({
  slides = [{ texts: ['Title', 'Body'] }],
  presentationOrder = slides.map((_slide, index) => index + 1),
  extraEntries = [],
}: PptxFixtureOptions = {}): ZipFixtureEntry[] => {
  const entries: ZipFixtureEntry[] = [
    {
      name: '[Content_Types].xml',
      bytes: xml(
        `<Types xmlns="${CONTENT_TYPE_NS}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`
      ),
    },
    {
      name: '_rels/.rels',
      bytes: relationshipsXml(
        `<Relationship Id="rIdPresentation" Type="${OFFICE_REL_NS}/officeDocument" Target="ppt/presentation.xml"/>`
      ),
    },
    {
      name: 'ppt/presentation.xml',
      bytes: xml(
        `<p:presentation xmlns:p="${PRESENTATION_NS}" xmlns:r="${OFFICE_REL_NS}"><p:sldIdLst>${presentationOrder
          .map((slideNumber, index) => `<p:sldId id="${256 + index}" r:id="rIdSlide${slideNumber}"/>`)
          .join('')}</p:sldIdLst></p:presentation>`
      ),
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      bytes: relationshipsXml(
        slides
          .map(
            (_slide, index) =>
              `<Relationship Id="rIdSlide${index + 1}" Type="${OFFICE_REL_NS}/slide" Target="/ppt/slides/slide${index + 1}.xml"/>`
          )
          .join('')
      ),
    },
  ];

  for (const [index, slide] of slides.entries()) {
    const slideNumber = index + 1;
    const anchors = new Set(slide.anchors ?? []);
    const slideShapes = [
      ...(slide.texts ?? []).map((text, textIndex) => textShape(textIndex + 2, text)),
      ...(anchors.has('picture') ? [pictureShape()] : []),
      ...(anchors.has('chart') ? [chartShape()] : []),
      ...(anchors.has('table') ? [tableShape()] : []),
      ...(anchors.has('connector') ? [connectorShape()] : []),
    ].join('');
    entries.push({
      name: `ppt/slides/slide${slideNumber}.xml`,
      bytes: xml(
        `<p:sld xmlns:p="${PRESENTATION_NS}" xmlns:a="${DRAWING_NS}" xmlns:r="${OFFICE_REL_NS}" xmlns:c="${CHART_NS}"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${slideShapes}</p:spTree></p:cSld></p:sld>`
      ),
    });

    const relationships = [
      ...(anchors.has('picture')
        ? [`<Relationship Id="rIdImage" Type="${OFFICE_REL_NS}/image" Target="/ppt/media/image1.png"/>`]
        : []),
      ...(anchors.has('chart')
        ? [`<Relationship Id="rIdChart" Type="${OFFICE_REL_NS}/chart" Target="/ppt/charts/chart1.xml"/>`]
        : []),
      ...(slide.notes !== undefined
        ? [
            `<Relationship Id="rIdNotes" Type="${OFFICE_REL_NS}/notesSlide" Target="${
              slide.notesTarget ?? `/ppt/notesSlides/notesSlide${slideNumber}.xml`
            }"/>`,
          ]
        : []),
      slide.extraRelationships ?? '',
    ].join('');
    if (relationships.length > 0) {
      entries.push({
        name: `ppt/slides/_rels/slide${slideNumber}.xml.rels`,
        bytes: relationshipsXml(relationships),
      });
    }
    if (anchors.has('picture') && !entries.some((entry) => entry.name === 'ppt/media/image1.png')) {
      entries.push({ name: 'ppt/media/image1.png', bytes: Buffer.from('synthetic image') });
    }
    if (anchors.has('chart') && !entries.some((entry) => entry.name === 'ppt/charts/chart1.xml')) {
      entries.push({ name: 'ppt/charts/chart1.xml', bytes: xml(`<c:chartSpace xmlns:c="${CHART_NS}"/>`) });
    }
    if (slide.notes !== undefined) {
      entries.push({
        name: `ppt/notesSlides/notesSlide${slideNumber}.xml`,
        bytes: xml(`<p:notes xmlns:p="${PRESENTATION_NS}" xmlns:a="${DRAWING_NS}"><p:cSld><p:spTree>
          <p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide image"/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Ignored placeholder</a:t></a:r></a:p></p:txBody></p:sp>
          <p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${escapeXml(
            slide.notes
          )}</a:t></a:r></a:p></p:txBody></p:sp>
        </p:spTree></p:cSld></p:notes>`),
      });
    }
  }
  entries.push(...extraEntries);
  return entries;
};

const replaceEntry = (entries: readonly ZipFixtureEntry[], name: string, bytes: Buffer): ZipFixtureEntry[] =>
  entries.map((entry) => (entry.name === name ? { ...entry, bytes } : entry));

describe('inspectPptxOoxml', () => {
  let fixtureRoot: string;
  let fixtureSequence: number;

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(path.join(tmpdir(), 'pptx-ooxml-inspector-'));
    fixtureSequence = 0;
  });

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const inspectEntries = async (entries: readonly ZipFixtureEntry[], limits?: Partial<PptxOoxmlInspectionLimits>) => {
    const fixturePath = path.join(fixtureRoot, `fixture-${fixtureSequence++}.pptx`);
    const archive = createZip(entries);
    await writeFile(fixturePath, archive.bytes);
    return inspectPptxOoxml(fixturePath, { limits });
  };

  it('reports the structurally valid 11-slide WMS regression without promoting policy signals', async () => {
    const slides = Array.from({ length: 11 }, (_, index) => ({
      texts: index === 0 ? ['WMS Requirements', 'Overview'] : [`Section ${index + 1}`, 'Line one\\nLine two'],
    }));

    const inspected = await inspectEntries(createPptxEntries({ slides }));

    expect(inspected.slideCount).toBe(11);
    expect(inspected.slides).toHaveLength(11);
    expect(inspected.slides.every((slide) => slide.shapeCount === 2 && slide.textOnlyShapeCount === 2)).toBe(true);
    expect(
      inspected.slides.every((slide) => slide.notesTextCharCount === 0 && slide.visualAnchorKinds.length === 0)
    ).toBe(true);
    expect(inspected.slides.slice(1).every((slide) => slide.text.includes('\\n'))).toBe(true);
  });

  it('reports meaningful notes and only the four supported non-text visual anchors', async () => {
    const inspected = await inspectEntries(
      createPptxEntries({
        slides: [
          {
            texts: ['Title'],
            anchors: ['picture', 'chart', 'table', 'connector'],
            notes: 'Explain this slide.',
          },
        ],
      })
    );

    expect(inspected.slides[0]).toMatchObject({
      shapeCount: 5,
      textOnlyShapeCount: 1,
      notesTextCharCount: 'Explain this slide.'.length,
      visualAnchorKinds: ['picture', 'chart', 'table', 'connector'],
    });
  });

  it('preserves presentation relationship order instead of sorting slide part names', async () => {
    const inspected = await inspectEntries(
      createPptxEntries({
        slides: [{ texts: ['First part'] }, { texts: ['Second part'] }],
        presentationOrder: [2, 1],
      })
    );

    expect(inspected.slides.map((slide) => slide.text)).toEqual(['Second part', 'First part']);
    expect(inspected.slides.map((slide) => slide.slideNumber)).toEqual([1, 2]);
  });

  it.each([
    ['an exact duplicate', '[Content_Types].xml'],
    ['a case-folded duplicate', '[content_types].xml'],
  ])('rejects %s ZIP name', async (_label, duplicateName) => {
    const entries = createPptxEntries();
    entries.push({ name: duplicateName, bytes: xml('<duplicate/>') });

    await expect(inspectEntries(entries)).rejects.toMatchObject({ code: 'UNSAFE_PACKAGE' });
  });

  it.each(['../escape.xml', '/absolute.xml', 'C:/drive.xml', 'ppt\\evil.xml', 'ppt//evil.xml', 'ppt/./evil.xml'])(
    'rejects unsafe ZIP name %s',
    async (unsafeName) => {
      const entries = createPptxEntries();
      entries.push({ name: unsafeName, bytes: xml('<unsafe/>') });

      await expect(inspectEntries(entries)).rejects.toMatchObject({ code: 'UNSAFE_PACKAGE' });
    }
  );

  it.each([
    ['an encrypted entry', { flags: 1 }],
    ['an unsupported compression method', { compressionMethod: 99 as const }],
    ['a Unix symlink entry', { externalFileAttributes: (0o120777 << 16) >>> 0 }],
  ])('rejects %s', async (_label, attributes) => {
    const entries = createPptxEntries();
    entries.push({ name: 'ppt/unsafe.bin', bytes: Buffer.from('unsafe'), ...attributes });

    await expect(inspectEntries(entries)).rejects.toMatchObject({ code: 'UNSAFE_PACKAGE' });
  });

  it('accepts the ZIP entry-count boundary and rejects one over', async () => {
    const entries = createPptxEntries();

    await expect(inspectEntries(entries, { maxZipEntries: entries.length })).resolves.toMatchObject({
      zipEntryCount: entries.length,
    });
    await expect(inspectEntries(entries, { maxZipEntries: entries.length - 1 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
    });
  });

  it('accepts exact entry and expanded-byte limits and rejects one byte over', async () => {
    const entries = createPptxEntries();
    const maximumEntryBytes = Math.max(...entries.map((entry) => entry.bytes.length));
    const expandedBytes = entries.reduce((total, entry) => total + entry.bytes.length, 0);

    await expect(
      inspectEntries(entries, { maxZipEntryBytes: maximumEntryBytes, maxZipExpandedBytes: expandedBytes })
    ).resolves.toMatchObject({ expandedByteLength: expandedBytes });
    await expect(inspectEntries(entries, { maxZipEntryBytes: maximumEntryBytes - 1 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
    });
    await expect(inspectEntries(entries, { maxZipExpandedBytes: expandedBytes - 1 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
    });
  });

  it('accepts the XML-byte boundary and rejects one byte over', async () => {
    const entries = createPptxEntries();
    const maximumXmlBytes = Math.max(
      ...entries.filter((entry) => /(?:\.xml|\.rels)$/i.test(entry.name)).map((entry) => entry.bytes.length)
    );

    await expect(inspectEntries(entries, { maxXmlBytes: maximumXmlBytes })).resolves.toMatchObject({ slideCount: 1 });
    await expect(inspectEntries(entries, { maxXmlBytes: maximumXmlBytes - 1 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
    });
  });

  it('accepts XML nesting at the boundary and rejects one level deeper', async () => {
    const nested = (depth: number): Buffer => xml(`${'<n>'.repeat(depth)}${'</n>'.repeat(depth)}`);
    const entries = createPptxEntries({ extraEntries: [{ name: 'ppt/custom/deep.xml', bytes: nested(20) }] });

    await expect(inspectEntries(entries, { maxXmlNestingDepth: 20 })).resolves.toMatchObject({ slideCount: 1 });
    await expect(inspectEntries(entries, { maxXmlNestingDepth: 19 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
    });
  });

  it.each([
    ['malformed XML', xml('<broken><child></broken>')],
    ['a DTD declaration', xml('<!DOCTYPE root><root/>')],
    ['an entity declaration', xml('<!ENTITY secret "value"><root/>')],
  ])('rejects %s before returning evidence', async (_label, unsafeXml) => {
    const entries = createPptxEntries({ extraEntries: [{ name: 'ppt/custom/unsafe.xml', bytes: unsafeXml }] });

    await expect(inspectEntries(entries)).rejects.toMatchObject({ code: 'INVALID_XML' });
  });

  it('accepts the slide-count boundary and rejects one over', async () => {
    const entries = createPptxEntries({ slides: Array.from({ length: 3 }, () => ({ texts: ['Slide'] })) });

    await expect(inspectEntries(entries, { maxSlides: 3 })).resolves.toMatchObject({ slideCount: 3 });
    await expect(inspectEntries(entries, { maxSlides: 2 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
    });
  });

  it('accepts the per-slide shape boundary and rejects one over', async () => {
    const entries = createPptxEntries({ slides: [{ texts: ['1', '2', '3', '4', '5'] }] });

    await expect(inspectEntries(entries, { maxShapesPerSlide: 5 })).resolves.toMatchObject({ slideCount: 1 });
    await expect(inspectEntries(entries, { maxShapesPerSlide: 4 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
    });
  });

  it('accepts per-slide and total text boundaries and rejects one over', async () => {
    const entries = createPptxEntries({ slides: [{ texts: ['123456'] }, { texts: ['abcdef'] }] });

    await expect(inspectEntries(entries, { maxTextCharsPerSlide: 6, maxTextCharsTotal: 12 })).resolves.toMatchObject({
      totalTextChars: 12,
    });
    await expect(inspectEntries(entries, { maxTextCharsPerSlide: 5 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
    });
    await expect(inspectEntries(entries, { maxTextCharsTotal: 11 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
    });
  });

  it('rejects a missing internal relationship target', async () => {
    const entries = createPptxEntries({ slides: [{ texts: ['Title'], anchors: ['picture'] }] }).filter(
      (entry) => entry.name !== 'ppt/media/image1.png'
    );

    await expect(inspectEntries(entries)).rejects.toMatchObject({ code: 'RELATIONSHIP_INVALID' });
  });

  it('rejects duplicate relationship IDs', async () => {
    const entries = createPptxEntries({
      slides: [
        {
          texts: ['Title'],
          extraRelationships: `<Relationship Id="rIdDuplicate" Type="${OFFICE_REL_NS}/image" Target="/ppt/media/one.png"/><Relationship Id="rIdDuplicate" Type="${OFFICE_REL_NS}/image" Target="/ppt/media/two.png"/>`,
        },
      ],
      extraEntries: [
        { name: 'ppt/media/one.png', bytes: Buffer.from('one') },
        { name: 'ppt/media/two.png', bytes: Buffer.from('two') },
      ],
    });

    await expect(inspectEntries(entries)).rejects.toMatchObject({ code: 'RELATIONSHIP_INVALID' });
  });

  it('accepts an external hyperlink without requiring a package target', async () => {
    const entries = createPptxEntries({
      slides: [
        {
          texts: ['Title'],
          extraRelationships: `<Relationship Id="rIdLink" Type="${OFFICE_REL_NS}/hyperlink" Target="https://example.com" TargetMode="External"/>`,
        },
      ],
    });

    await expect(inspectEntries(entries)).resolves.toMatchObject({ slideCount: 1 });
  });

  it('resolves a safe relative notes target and ignores placeholder-only note text', async () => {
    const inspected = await inspectEntries(
      createPptxEntries({ slides: [{ texts: ['Title'], notes: '   ', notesTarget: '../notesSlides/notesSlide1.xml' }] })
    );

    expect(inspected.slides[0]?.notesTextCharCount).toBe(0);
  });

  it('rejects corrupt compressed entry bytes even when the central metadata is unchanged', async () => {
    const entries = createPptxEntries();
    const archive = createZip(entries);
    const presentationPayload = archive.payloadOffsets.find((entry) => entry.name === 'ppt/presentation.xml');
    if (!presentationPayload) throw new Error('Missing presentation payload');
    archive.bytes[presentationPayload.offset + Math.floor(presentationPayload.byteLength / 2)]! ^= 0xff;
    const fixturePath = path.join(fixtureRoot, `fixture-${fixtureSequence++}.pptx`);
    await writeFile(fixturePath, archive.bytes);

    await expect(inspectPptxOoxml(fixturePath)).rejects.toMatchObject({ code: 'INVALID_PACKAGE' });
  });

  it('rejects a presentation relationship that does not resolve to an existing slide', async () => {
    const entries = replaceEntry(
      createPptxEntries(),
      'ppt/_rels/presentation.xml.rels',
      relationshipsXml(`<Relationship Id="rIdSlide1" Type="${OFFICE_REL_NS}/slide" Target="/ppt/slides/missing.xml"/>`)
    );

    await expect(inspectEntries(entries)).rejects.toMatchObject({ code: 'RELATIONSHIP_INVALID' });
  });
});
