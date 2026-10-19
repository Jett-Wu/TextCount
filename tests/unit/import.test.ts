import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { utils, write } from 'cfb';
import { extractDoc, extractDocx, extractWordXml } from '../../src/import/word';
import { checkedText, documentKind, MAX_FILE_BYTES, MAX_XML_BYTES } from '../../src/import/format';

const wrap = (body: string) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;

describe('local document extraction', () => {
  test('validates format and size without reading a file', () => {
    expect(documentKind('writing.DOCX', 100)).toBe('docx');
    expect(documentKind('paper.pdf', MAX_FILE_BYTES)).toBe('pdf');
    expect(() => documentKind('paper.pdf.exe', 100)).toThrow('unsupported');
    expect(() => documentKind('paper.doc', MAX_FILE_BYTES + 1)).toThrow('tooLarge');
    expect(() => documentKind('paper.pdf', 0)).toThrow('empty');
    expect(() => checkedText(' \n')).toThrow('empty');
  });

  test('keeps Unicode, spaces, tabs and table boundaries; excludes instructions and deleted text', () => {
    const xml = wrap('<w:p><w:r><w:t xml:space="preserve">你好 &amp; café </w:t><w:tab/><w:t>🙂</w:t><w:br/><w:t>第二行</w:t></w:r><w:del><w:r><w:t>deleted</w:t></w:r></w:del><w:r><w:instrText>HYPERLINK secret</w:instrText><w:t>链接</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
    expect(extractWordXml(xml)).toBe('你好 & café \t🙂\n第二行链接\nA\tB');
    const docx = zipSync({ 'word/document.xml': strToU8(xml), 'word/header1.xml': strToU8('not included') });
    expect(extractDocx(docx)).toBe(extractWordXml(xml));
  });

  test('handles alternate namespace prefixes and strict OOXML', () => {
    expect(extractWordXml('<a:document xmlns:a="http://purl.oclc.org/ooxml/wordprocessingml/main"><a:body><a:p><a:r><a:t>Hello</a:t></a:r></a:p></a:body></a:document>')).toBe('Hello');
  });

  test('accepts both UTF-16 byte orders in DOCX XML', () => {
    const xml = '<?xml version="1.0" encoding="UTF-16"?>' + wrap('<w:p><w:r><w:t>中文 café</w:t></w:r></w:p>');
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
    expect(extractDocx(zipSync({ 'word/document.xml': le }))).toBe('中文 café');
    expect(extractDocx(zipSync({ 'word/document.xml': le.swap16() }))).toBe('中文 café');
  });

  test('rejects invalid XML, entities, empty documents and archive expansion beyond the limit', () => {
    expect(() => extractWordXml('<broken>')).toThrow();
    expect(() => extractWordXml('<!DOCTYPE w:document [<!ENTITY ext SYSTEM "https://example.com/private">]>' + wrap(''))).toThrow('invalid');
    expect(() => extractDocx(zipSync({ 'word/document.xml': strToU8(wrap('<w:p/>')) }))).toThrow('empty');
    const zip = zipSync({ 'word/document.xml': strToU8('small') });
    // The central directory advertises the inflated size before allocation.
    const view = new DataView(zip.buffer);
    for (let i = 0; i < zip.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, MAX_XML_BYTES + 1, true);
    expect(() => extractDocx(zip)).toThrow('tooLarge');
  });

  test('extracts real Word 97 documents independently produced by Word', () => {
    const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/import/${name}`, import.meta.url)));
    expect(extractDoc(fixture('simple.doc'))).toBe('This is a simple file created with Word 97-SR2.');
    expect(extractDoc(fixture('simple-table.doc'))).toContain('This is a Word document');
    expect(extractDoc(fixture('HeaderFooterUnicode.doc'))).not.toMatch(/[\uFFFD]/);
    expect(() => extractDoc(fixture('empty.doc'))).toThrow('empty');
    expect(() => extractDoc(fixture('PasswordProtected.doc'))).toThrow('encrypted');
  });

  test('reads reordered compressed/uncompressed DOC pieces and only the body story', () => {
    const word = new Uint8Array(1024);
    const fib = new DataView(word.buffer);
    fib.setUint16(0, 0xa5ec, true); fib.setUint16(2, 0xc1, true);
    fib.setUint32(0x4c, 6, true); fib.setUint32(0x1a2, 0, true); fib.setUint32(0x1a6, 45, true);
    word.set(new TextEncoder().encode('Café'), 900);
    word[903] = 0xe9;
    word.set(new Uint8Array([0x60, 0x4f, 0x0d, 0]), 800);
    word.set(new TextEncoder().encode('footer'), 920);
    const table = new Uint8Array(45); const v = new DataView(table.buffer);
    table[0] = 2; v.setUint32(1, 40, true);
    [0, 4, 6, 12].forEach((cp, i) => v.setUint32(5 + i * 4, cp, true));
    [0x40000000 | 1800, 800, 0x40000000 | 1840].forEach((fc, i) => v.setUint32(23 + i * 8, fc, true));
    const cfb = utils.cfb_new(); utils.cfb_add(cfb, 'WordDocument', word); utils.cfb_add(cfb, '0Table', table);
    expect(extractDoc(new Uint8Array(write(cfb, { type: 'array' })))).toBe('Café你');
    fib.setUint32(0x1a2, 9999, true);
    utils.cfb_add(cfb, 'WordDocument', word);
    expect(() => extractDoc(new Uint8Array(write(cfb, { type: 'array' })))).toThrow('invalid');
  });
});
