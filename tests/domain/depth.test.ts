import { describe, expect, it } from 'vitest';


describe('a set’s own substitutions', () => {
  it('replace only the positions the set names, and leave the rest to the base chart', async () => {
    const { chartFor } = await import('../../src/domain/depth');
    const base = { RB: [22, 5], TE: [88, 81], QB: [7] };
    const sets = { jumbo: { TE: [77, 88] } };
    expect(chartFor(base, sets, 'jumbo')).toEqual({ RB: [22, 5], TE: [77, 88], QB: [7] });
    expect(chartFor(base, sets, 'trips')).toBe(base);
    expect(chartFor(base, sets)).toBe(base);
  });

  it('go into a backup and come back out of one', async () => {
    const { readSetCharts, writeSetCharts } = await import('../../src/domain/depth');
    const { makeBackup, readBackup } = await import('../../src/store/backup');
    writeSetCharts({ jumbo: { TE: [77] } });
    const file = JSON.stringify(makeBackup({ plays: [], sections: [], books: [] }));
    writeSetCharts({});
    readBackup(file);
    expect(readSetCharts()).toEqual({ jumbo: { TE: [77] } });
  });
});
