import type { Play } from '../domain/types';
import { videoFrames } from './video';
import { boardView } from './view';

/*
 * A running play as an animated GIF.
 *
 * Video is the better file, but not every chat, email or slide deck plays one
 * inline, and a GIF plays everywhere and loops on its own. The frames are the
 * video's own — `videoFrames`, posed by the board's playback and drawn by the
 * exporter — at half the rate, so a GIF cannot move or draw a play differently
 * either.
 *
 * Encoded here rather than with a library. A board is a handful of flat colors
 * plus their antialiased edges, so a palette chosen by popularity covers it,
 * and LZW is sixty lines. The dependency list is kept deliberately small.
 */

export const GIF_FPS = 12;
const DELAY_CS = Math.round(100 / GIF_FPS);

export type Rgb = [number, number, number];

/**
 * Up to 256 colors that cover these frames, most used first.
 *
 * Every pixel is counted in a 5-bit-per-channel bucket; the busiest buckets
 * become the palette, each as the average of what landed in it. Turf, the
 * marks and the lines are always the busiest, so they come out exact.
 */
export function paletteFor(images: Uint8ClampedArray[]): Rgb[] {
  const count = new Uint32Array(32768);
  const sum = new Float64Array(32768 * 3);
  for (const data of images) {
    for (let i = 0; i < data.length; i += 4) {
      const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      count[k]++;
      sum[k * 3] += data[i];
      sum[k * 3 + 1] += data[i + 1];
      sum[k * 3 + 2] += data[i + 2];
    }
  }
  const used: number[] = [];
  for (let k = 0; k < count.length; k++) if (count[k]) used.push(k);
  used.sort((a, b) => count[b] - count[a]);
  return used.slice(0, 256).map((k) => [
    Math.round(sum[k * 3] / count[k]),
    Math.round(sum[k * 3 + 1] / count[k]),
    Math.round(sum[k * 3 + 2] / count[k]),
  ]);
}

/** Each pixel's nearest palette entry, remembered per bucket so it is found once. */
export function indexPixels(data: Uint8ClampedArray, palette: Rgb[], cache = new Int16Array(32768).fill(-1)): Uint8Array {
  const out = new Uint8Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    let best = cache[k];
    if (best < 0) {
      let d = Infinity;
      for (let j = 0; j < palette.length; j++) {
        const [r, g, b] = palette[j];
        const e = (r - data[i]) ** 2 + (g - data[i + 1]) ** 2 + (b - data[i + 2]) ** 2;
        if (e < d) {
          d = e;
          best = j;
        }
      }
      cache[k] = best;
    }
    out[p] = best;
  }
  return out;
}

/** GIF's variable-width LZW, as a byte stream (not yet cut into sub-blocks). */
export function lzw(indices: Uint8Array, minCodeSize = 8): Uint8Array {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  let size = minCodeSize + 1;
  let next = eoi + 1;
  const dict = new Map<number, number>();

  const put = (code: number) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      bytes.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
    }
  };

  put(clear);
  if (!indices.length) {
    put(eoi);
    if (bits) bytes.push(acc & 0xff);
    return Uint8Array.from(bytes);
  }
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    put(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      // The decoder widens once the code it will add next no longer fits.
      if (next > 1 << size && size < 12) size++;
    } else {
      put(clear);
      dict.clear();
      next = eoi + 1;
      size = minCodeSize + 1;
    }
    prefix = k;
  }
  put(prefix);
  put(eoi);
  if (bits) bytes.push(acc & 0xff);
  return Uint8Array.from(bytes);
}

/** A whole GIF89a, looping forever. */
export function encodeGif(frames: Uint8Array[], width: number, height: number, palette: Rgb[], delayCs = DELAY_CS): Uint8Array {
  const out: number[] = [];
  const u16 = (n: number) => out.push(n & 0xff, (n >> 8) & 0xff);
  const ascii = (s: string) => out.push(...[...s].map((c) => c.charCodeAt(0)));

  ascii('GIF89a');
  u16(width);
  u16(height);
  out.push(0xf7, 0, 0); // a global table of 256 entries
  for (let i = 0; i < 256; i++) out.push(...(palette[i] ?? [0, 0, 0]));
  // Loop forever.
  out.push(0x21, 0xff, 0x0b);
  ascii('NETSCAPE2.0');
  out.push(0x03, 0x01, 0, 0, 0);

  for (const frame of frames) {
    out.push(0x21, 0xf9, 0x04, 0x00);
    u16(delayCs);
    out.push(0, 0);
    out.push(0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    out.push(0);
    out.push(8);
    const data = lzw(frame, 8);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.subarray(i, i + 255);
      out.push(block.length, ...block);
    }
    out.push(0);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}

async function decode(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  return img;
}

/** Record the play as a GIF, in the browser. */
export async function playToGif(play: Play, widthPx = 480, onProgress?: (f: number) => void): Promise<Blob> {
  const view = boardView(play);
  const width = widthPx;
  const height = Math.round((width * view.h) / view.w);
  const svgs = videoFrames(play, GIF_FPS);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const images: Uint8ClampedArray[] = [];
  for (const [i, svg] of svgs.entries()) {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(await decode(svg), 0, 0, width, height);
    images.push(ctx.getImageData(0, 0, width, height).data);
    onProgress?.((i / svgs.length) * 0.7);
  }
  // Sampled, not every frame: the colors of a play do not change as it runs.
  const sample = images.filter((_, i) => i % Math.max(1, Math.floor(images.length / 6)) === 0);
  const palette = paletteFor(sample);
  const cache = new Int16Array(32768).fill(-1);
  const indexed = images.map((data, i) => {
    onProgress?.(0.7 + (i / images.length) * 0.3);
    return indexPixels(data, palette, cache);
  });
  return new Blob([encodeGif(indexed, width, height, palette) as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
}
