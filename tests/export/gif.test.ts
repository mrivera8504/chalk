import { describe, expect, it } from 'vitest';
import { encodeGif, indexPixels, lzw, paletteFor, type Rgb } from '../../src/export/gif';

/** A plain GIF LZW decoder, to prove the encoder's stream reads back. */
function unlzw(data: Uint8Array, minCodeSize = 8): number[] {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let size = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = Array.from({ length: eoi + 1 }, (_, i) => [i]);
    size = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let pos = 0;
  const read = () => {
    let code = 0;
    for (let i = 0; i < size; i++, pos++) code |= ((data[pos >> 3] >> (pos & 7)) & 1) << i;
    return code;
  };
  let prev: number[] | null = null;
  while (pos < data.length * 8) {
    const code = read();
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error('bad stream');
    out.push(...entry);
    if (prev && dict.length < 4096) dict.push([...prev, entry[0]]);
    if (dict.length === 1 << size && size < 12) size++;
    prev = entry;
  }
  return out;
}

describe('the GIF encoder', () => {
  it('reads back what it wrote, past the point the code table fills', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    // Noisy enough to fill the table several times, with runs like a board's.
    const pixels = Uint8Array.from({ length: 60000 }, (_, i) => (rand() < 0.3 ? Math.floor(rand() * 256) : (i >> 6) & 7));
    expect(unlzw(lzw(pixels))).toEqual([...pixels]);
  });

  it('reads back a flat field and a single pixel', () => {
    expect(unlzw(lzw(new Uint8Array(5000)))).toEqual(new Array(5000).fill(0));
    expect(unlzw(lzw(Uint8Array.of(9)))).toEqual([9]);
  });

  it('writes a looping GIF89a with one image per frame', () => {
    const palette: Rgb[] = [[0, 128, 0], [255, 255, 255]];
    const gif = encodeGif([new Uint8Array(4), Uint8Array.of(1, 1, 0, 0)], 2, 2, palette);
    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a');
    expect(String.fromCharCode(...gif.slice(13 + 768 + 3, 13 + 768 + 14))).toBe('NETSCAPE2.0');
    expect(gif.filter((b, i) => b === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 0x04).length).toBe(2);
    expect(gif[gif.length - 1]).toBe(0x3b);
  });

  it('keeps a board’s flat colors exact', () => {
    const turf = [40, 110, 60];
    const white = [250, 250, 250];
    const data = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i++) data.set([...(i % 5 ? turf : white), 255], i * 4);
    const palette = paletteFor([data]);
    expect(palette[0]).toEqual(turf);
    expect(palette[1]).toEqual(white);
    const idx = indexPixels(data, palette);
    expect(idx[0]).toBe(1);
    expect(idx[1]).toBe(0);
  });
});
