import { describe, expect, it } from 'vitest';
import { fillFromDepth, positionsFor } from '../../src/domain/depth';
import { clockLabel, newPractice, schedule, totalMinutes } from '../../src/domain/practice';
import { offense } from '../fixtures/plays';

describe('a practice', () => {
  it('runs its clock block by block from the start time', () => {
    const p = newPractice();
    const s = schedule(p);
    expect(s[0]).toMatchObject({ start: '5:30 PM', end: '5:40 PM' });
    expect(s[s.length - 1].end).toBe(clockLabel(17 * 60 + 30 + totalMinutes(p)));
    expect(totalMinutes(p)).toBe(65);
  });

  it('writes noon, midnight and the morning the way a clock does', () => {
    expect(clockLabel(0)).toBe('12:00 AM');
    expect(clockLabel(12 * 60 + 5)).toBe('12:05 PM');
    expect(clockLabel(9 * 60)).toBe('9:00 AM');
    expect(clockLabel(24 * 60 + 30)).toBe('12:30 AM');
  });
});

describe('the depth chart', () => {
  const men = offense();
  const label = (l: string) => men.find((m) => m.label === l)!;

  it('puts the starters in their slots and leaves the rest alone', () => {
    const out = fillFromDepth(men, { QB: [7, 12], RB: [22] }, 'offense');
    expect(out.find((m) => m.id === label('QB').id)?.jersey).toBe(7);
    expect(out.find((m) => m.id === label('RB').id)?.jersey).toBe(22);
    expect(out.find((m) => m.id === label('C').id)?.jersey).toBe(label('C').jersey);
  });

  it('takes a string below the starters', () => {
    const out = fillFromDepth(men, { QB: [7, 12] }, 'offense', 1);
    expect(out.find((m) => m.id === label('QB').id)?.jersey).toBe(12);
  });

  it('never puts one kid in two slots', () => {
    const out = fillFromDepth(men, { TE: [88], RB: [88, 22] }, 'offense');
    const shirts = out.filter((m) => m.jersey !== undefined).map((m) => m.jersey);
    expect(new Set(shirts).size).toBe(shirts.length);
    expect(out.find((m) => m.id === label('RB').id)?.jersey).toBe(22);
  });

  it('lists the board’s positions first, then anything else charted, once each', () => {
    expect(positionsFor(['QB', 'RB', 'QB'], { K: [3], QB: [7] })).toEqual(['QB', 'RB', 'K']);
  });
});
