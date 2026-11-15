import { describe, expect, it } from 'vitest';
import { INK_CONTRAST, TEXT_CONTRAST, inkForPaper } from '../../src/export/printInk';
import { DEFAULT_APP_SETTINGS } from '../../src/store/settings';
import { paperPalette } from '../../src/ui/surface';

/** Independent of the module under test, so the test is not marking its own homework. */
function contrastOnWhite(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

function hue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const SHIPPED = [...DEFAULT_APP_SETTINGS.routeColors, DEFAULT_APP_SETTINGS.carryColor, DEFAULT_APP_SETTINGS.blockColor, DEFAULT_APP_SETTINGS.zoneColor];

describe('ink for white paper', () => {
  /*
   * The values a real printer confirmed on 2026-09-17. If this test fails the
   * derivation has moved, and a screenshot cannot say whether that is an
   * improvement: print a sheet.
   */
  it('prints the shipped palette exactly as it did on the confirmed sheet', () => {
    expect(Object.fromEntries(SHIPPED.map((c) => [c, inkForPaper(c)]))).toMatchSnapshot();
  });

  it('prints the block gold as #d7b42e', () => {
    expect(inkForPaper('#f2dfa0')).toBe('#d7b42e');
  });

  it('gets every shipped ink to 2:1 on white', () => {
    for (const c of SHIPPED) expect(contrastOnWhite(inkForPaper(c)), c).toBeGreaterThanOrEqual(INK_CONTRAST - 0.03);
  });

  it('keeps the yellow yellow and the lime lime', () => {
    // The original complaint: gold went 46deg to 36deg, lime 69deg to 86deg.
    for (const c of ['#f2dfa0', '#d6e86b', '#ffcf3d']) {
      expect(Math.abs(hue(inkForPaper(c)) - hue(c)), c).toBeLessThan(6);
    }
  });

  it('leaves an ink that already reads on white exactly as chosen', () => {
    for (const c of ['#1c5fd0', '#b3261e', '#2a7a3c']) expect(inkForPaper(c)).toBe(c);
  });

  it('never lightens', () => {
    for (const c of SHIPPED) expect(contrastOnWhite(inkForPaper(c)), c).toBeGreaterThanOrEqual(contrastOnWhite(c) - 0.02);
  });

  it('turns gray into gray, never an invented color', () => {
    const out = inkForPaper('#e8ede9', TEXT_CONTRAST);
    expect(hue(out)).toBe(0);
    expect(contrastOnWhite(out)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it('hands back anything that is not a plain hex untouched', () => {
    expect(inkForPaper('rgba(0, 0, 0, 0.16)')).toBe('rgba(0, 0, 0, 0.16)');
    expect(inkForPaper('')).toBe('');
  });
});

describe('the paper palette', () => {
  it('derives from whatever is on the root, so a coach\'s own swatch reaches paper', () => {
    const before = paperPalette()['--route-0'];
    document.documentElement.style.setProperty('--route-0', '#ffe14d');
    const after = paperPalette()['--route-0'];
    expect(after).not.toBe(before);
    expect(Math.abs(hue(after) - hue('#ffe14d'))).toBeLessThan(6);
  });

  it('is the same palette it always was for the shipped tokens', () => {
    expect(paperPalette()).toMatchSnapshot();
  });
});
