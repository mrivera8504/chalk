import { afterEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { embedBrand, hexToRgb } from '../../src/export/pdf';
import { resetSettings, setSettings } from '../../src/store/settings';

// A one-pixel PNG: all the embedding needs to prove it happened.
const DOT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

afterEach(() => resetSettings());

describe('branded sheets', () => {
  it('is a plain sheet until the coach says who the team is', async () => {
    const brand = await embedBrand(await PDFDocument.create());
    expect(brand.name).toBe('');
    expect(brand.logo).toBeNull();
  });

  it('carries the name, the colour and the logo once they are set', async () => {
    setSettings({ teamName: '  Hornets ', teamColor: '#d81f4f', teamLogo: DOT });
    const brand = await embedBrand(await PDFDocument.create());
    expect(brand.name).toBe('Hornets');
    expect(brand.logo).not.toBeNull();
    expect(brand.rule).toEqual(hexToRgb('#d81f4f'));
  });

  it('drops a logo it cannot read rather than the sheet', async () => {
    setSettings({ teamLogo: 'data:image/png;base64,bm90IGFuIGltYWdl' });
    const brand = await embedBrand(await PDFDocument.create());
    expect(brand.logo).toBeNull();
  });

  it('reads only a six-digit colour', () => {
    expect(hexToRgb('#ff0000')).toEqual(expect.objectContaining({ red: 1, green: 0, blue: 0 }));
    expect(hexToRgb('red')).toBeNull();
  });
});
