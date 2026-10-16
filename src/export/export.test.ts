import { describe, it, expect } from 'vitest';
import { sheetLayout } from './sheet';
import { crc32, buildZip } from './zip';

const enc = new TextEncoder();

describe('sheetLayout', () => {
  it('row', () => {
    const l = sheetLayout(3, 16, 8, 'row');
    expect(l).toMatchObject({ cols: 3, rows: 1, width: 48, height: 8 });
    expect(l.positions).toEqual([{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 32, y: 0 }]);
  });
  it('column', () => {
    const l = sheetLayout(3, 16, 8, 'column');
    expect(l).toMatchObject({ cols: 1, rows: 3, width: 16, height: 24 });
    expect(l.positions).toEqual([{ x: 0, y: 0 }, { x: 0, y: 8 }, { x: 0, y: 16 }]);
  });
  it('grid mit columns 2', () => {
    const l = sheetLayout(5, 8, 8, 'grid', 2);
    expect(l).toMatchObject({ cols: 2, rows: 3, width: 16, height: 24 });
    expect(l.positions).toEqual([
      { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 }, { x: 0, y: 16 },
    ]);
  });
  it('grid klemmt columns', () => {
    expect(sheetLayout(5, 8, 8, 'grid', 9).cols).toBe(5);
    expect(sheetLayout(5, 8, 8, 'grid', 0).cols).toBe(1);
    expect(sheetLayout(5, 8, 8, 'grid').cols).toBe(3);
  });
});

describe('crc32', () => {
  it('Testvektoren', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('buildZip', () => {
  it('Struktur', () => {
    const a = { name: 'a.txt', data: enc.encode('hi') };
    const b = { name: 'b.bin', data: new Uint8Array([1, 2, 3]) };
    const zip = buildZip([a, b]);
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const local = (f: { name: string; data: Uint8Array }) => 30 + f.name.length + f.data.length;
    const central = (f: { name: string }) => 46 + f.name.length;
    const cdOffset = local(a) + local(b);
    expect(zip.length).toBe(cdOffset + central(a) + central(b) + 22);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const eocd = zip.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    expect(v.getUint16(eocd + 8, true)).toBe(2);
    expect(v.getUint16(eocd + 10, true)).toBe(2);
    expect(v.getUint32(eocd + 12, true)).toBe(central(a) + central(b));
    expect(v.getUint32(eocd + 16, true)).toBe(cdOffset);
    // Central Directory Einträge
    let p = cdOffset;
    for (const f of [a, b]) {
      expect(v.getUint32(p, true)).toBe(0x02014b50);
      expect(v.getUint32(p + 16, true)).toBe(crc32(f.data));
      expect(v.getUint32(p + 20, true)).toBe(f.data.length);
      expect(v.getUint32(p + 24, true)).toBe(f.data.length);
      const off = v.getUint32(p + 42, true);
      expect(v.getUint32(off, true)).toBe(0x04034b50);
      expect(v.getUint32(off + 14, true)).toBe(crc32(f.data));
      expect(zip.slice(off + 30, off + 30 + f.name.length)).toEqual(enc.encode(f.name));
      expect(zip.slice(off + 30 + f.name.length, off + local(f))).toEqual(f.data);
      p += central(f);
    }
  });
});
