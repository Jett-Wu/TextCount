import { read, find } from 'cfb';
import { unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import { checkedText, DocumentError, MAX_TEXT_LENGTH, MAX_XML_BYTES } from './format';

const WORD_NS = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']);
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const isOle = (data: Uint8Array) => OLE_MAGIC.every((value, index) => data[index] === value);

/** Only document.xml is read: images, macros and external relationships are never opened. */
export function extractDocx(data: Uint8Array): string {
  if (isOle(data)) throw new DocumentError('encrypted');
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new DocumentError('invalid');
  const files = unzipSync(data, { filter: (entry) => {
    if (entry.name !== 'word/document.xml') return false;
    if (entry.originalSize > MAX_XML_BYTES) throw new DocumentError('tooLarge');
    return true;
  } });
  const xml = files['word/document.xml'];
  if (!xml) throw new DocumentError('invalid');
  if (xml.length > MAX_XML_BYTES) throw new DocumentError('tooLarge');
  // OPC permits UTF-8 and UTF-16 XML, including either UTF-16 byte order.
  const encoding = (xml[0] === 0xff && xml[1] === 0xfe) || (xml[0] === 0x3c && xml[1] === 0)
    ? 'utf-16le' : (xml[0] === 0xfe && xml[1] === 0xff) || (xml[0] === 0 && xml[1] === 0x3c)
      ? 'utf-16be' : 'utf-8';
  return extractWordXml(new TextDecoder(encoding, { fatal: true }).decode(xml));
}

export function extractWordXml(xml: string): string {
  const parser = new SaxesParser({ xmlns: true });
  const parts: string[] = [];
  let length = 0;
  let inBody = false;
  let inText = false;
  let suppressed = 0;
  let hasDocument = false;
  const append = (text: string) => {
    length += text.length;
    if (length > MAX_TEXT_LENGTH) throw new DocumentError('tooLarge');
    parts.push(text);
  };
  parser.on('doctype', () => { throw new DocumentError('invalid'); });
  parser.on('opentag', (tag) => {
    if (!WORD_NS.has(tag.uri)) return;
    if (tag.local === 'document') hasDocument = true;
    if (tag.local === 'body') inBody = true;
    if (!inBody) return;
    if (['del', 'moveFrom', 'txbxContent'].includes(tag.local)) suppressed++;
    if (suppressed) return;
    if (tag.local === 't') inText = true;
    if (tag.local === 'tab') append('\t');
    if (tag.local === 'br' || tag.local === 'cr') append('\n');
    if (tag.local === 'noBreakHyphen') append('\u2011');
    if (tag.local === 'softHyphen') append('\u00ad');
  });
  parser.on('text', (text) => { if (inBody && inText && !suppressed) append(text); });
  parser.on('cdata', (text) => { if (inBody && inText && !suppressed) append(text); });
  parser.on('closetag', (tag) => {
    if (!WORD_NS.has(tag.uri)) return;
    if (inBody && !suppressed) {
      if (tag.local === 't') inText = false;
      if (tag.local === 'p') append('\n');
      if (tag.local === 'tc') {
        // Paragraph ends within cells become tabs, so adjacent cells do not merge into words.
        if (parts.at(-1) === '\n') parts.pop();
        append('\t');
      }
      if (tag.local === 'tr') {
        if (parts.at(-1) === '\t') parts.pop();
        append('\n');
      }
    }
    if (['del', 'moveFrom', 'txbxContent'].includes(tag.local) && inBody) suppressed--;
    if (tag.local === 'body') inBody = false;
  });
  parser.write(xml).close();
  if (!hasDocument) throw new DocumentError('invalid');
  return checkedText(parts.join('').replace(/\n$/, ''));
}

/** MS-DOC: FibRgFcLcb97.fcClx -> Clx -> PlcPcd; CP order differs from physical stream order. */
export function extractDoc(data: Uint8Array): string {
  if (!isOle(data)) throw new DocumentError('invalid');
  const container = read(data, { type: 'array' });
  if (find(container, 'EncryptedPackage')) throw new DocumentError('encrypted');
  const stream = (name: string): Uint8Array => {
    const entry = find(container, name);
    if (!entry) throw new DocumentError('invalid');
    return new Uint8Array(entry.content);
  };
  const word = stream('WordDocument');
  const view = new DataView(word.buffer, word.byteOffset, word.byteLength);
  if (word.length < 0x1aa || view.getUint16(0, true) !== 0xa5ec) throw new DocumentError('invalid');
  if (view.getUint16(2, true) < 0xc1) throw new DocumentError('unsupported');
  const flags = view.getUint16(0xa, true);
  if (flags & 0x8100) throw new DocumentError('encrypted');
  const bodyLength = view.getUint32(0x4c, true);
  if (bodyLength > MAX_TEXT_LENGTH) throw new DocumentError('tooLarge');
  const table = stream(flags & 0x200 ? '1Table' : '0Table');
  const clxStart = view.getUint32(0x1a2, true);
  const clxSize = view.getUint32(0x1a6, true);
  if (clxStart + clxSize > table.length) throw new DocumentError('invalid');
  const clx = new DataView(table.buffer, table.byteOffset + clxStart, clxSize);
  let pos = 0;
  while (pos < clx.byteLength && clx.getUint8(pos) === 1) pos += 3 + clx.getUint16(pos + 1, true);
  if (clx.getUint8(pos++) !== 2) throw new DocumentError('invalid');
  const size = clx.getUint32(pos, true);
  pos += 4;
  const count = (size - 4) / 12;
  if (!Number.isInteger(count) || count < 0 || pos + size > clx.byteLength) throw new DocumentError('invalid');
  const parts: string[] = [];
  let previous = 0;
  for (let i = 0; i < count; i++) {
    const start = clx.getUint32(pos + i * 4, true);
    const end = clx.getUint32(pos + (i + 1) * 4, true);
    if (start !== previous || end < start) throw new DocumentError('invalid');
    previous = end;
    if (start >= bodyLength) break;
    const fc = clx.getUint32(pos + (count + 1) * 4 + i * 8 + 2, true);
    const compressed = Boolean(fc & 0x40000000);
    const offset = (fc & 0x3fffffff) / (compressed ? 2 : 1);
    const byteLength = (Math.min(end, bodyLength) - start) * (compressed ? 1 : 2);
    if (!Number.isInteger(offset) || offset + byteLength > word.length) throw new DocumentError('invalid');
    parts.push(new TextDecoder(compressed ? 'windows-1252' : 'utf-16le').decode(word.subarray(offset, offset + byteLength)));
  }
  if (previous < bodyLength) throw new DocumentError('invalid');
  // Field instructions (e.g. hyperlink targets) must not be counted as the visible field result.
  const fields: boolean[] = [];
  const output: string[] = [];
  for (const char of parts.join('')) {
    if (char === '\x13') fields.push(false);
    else if (char === '\x14' && fields.length) fields[fields.length - 1] = true;
    else if (char === '\x15') fields.pop();
    else if (fields.every(Boolean)) output.push(char);
  }
  return checkedText(output.join('').replace(/\r\x07/g, '\t').replace(/\x07/g, '\t')
    .replace(/[\r\x0b\x0c]/g, '\n').replace(/[\x00-\x08\x0e-\x1f]/g, '').replace(/[\t\n]+$/, ''));
}
