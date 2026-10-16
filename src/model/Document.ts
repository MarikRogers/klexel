export const MAX_SIZE = 128;

export type Color = number; // 0xRRGGBBAA

export class PixelDocument {
  readonly width: number;
  readonly height: number;
  readonly data: Uint32Array; // RGBA packed as 0xRRGGBBAA, 0 = transparent

  constructor(width: number, height: number, data?: Uint32Array) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE) {
      throw new RangeError(`Größe muss 1..${MAX_SIZE} sein`);
    }
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint32Array(width * height);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Color {
    return this.inBounds(x, y) ? this.data[y * this.width + x] : 0;
  }

  set(x: number, y: number, c: Color): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    if (this.data[i] === c) return false;
    this.data[i] = c;
    return true;
  }
}
