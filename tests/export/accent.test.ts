import { describe, expect, it } from 'vitest';
import { accentFor } from '../../src/export/printInk';

/** WCAG contrast between two hex colors. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (n: number) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

describe('a team color as the accent', () => {
  it('leaves a color that already reads exactly as chosen', () => {
    expect(accentFor('#ffcf3d', 'dark')!.accent).toBe('#ffcf3d');
    expect(accentFor('#1f4fd8', 'light')!.accent).toBe('#1f4fd8');
  });

  it('lightens a navy team on the dark page until it reads', () => {
    const { accent } = accentFor('#0b1f4d', 'dark')!;
    expect(contrast(accent, '#10161a')).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens a gold team on the light page until it reads', () => {
    const { accent } = accentFor('#ffd400', 'light')!;
    expect(contrast(accent, '#f4f5f7')).toBeGreaterThanOrEqual(4.5);
  });

  it('puts readable text on the filled accent', () => {
    for (const [c, page] of [['#ffcf3d', 'dark'], ['#1f4fd8', 'light'], ['#0b1f4d', 'dark'], ['#c8102e', 'light']] as const) {
      const { accent, onAccent } = accentFor(c, page)!;
      expect(contrast(accent, onAccent)).toBeGreaterThanOrEqual(3);
    }
  });

  it('refuses what is not a color', () => {
    expect(accentFor('', 'dark')).toBeNull();
    expect(accentFor('red', 'dark')).toBeNull();
  });
});
