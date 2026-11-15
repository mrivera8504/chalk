import { describe, expect, it } from 'vitest';
import { computeGaps, findGap, nearestGap } from '../../src/domain/gaps';
import { computeHoles, nearestHole } from '../../src/domain/holes';
import { mirrorPlayers } from '../../src/domain/mirror';
import { DEFAULT_SETTINGS } from '../../src/domain/types';
import { offense } from '../fixtures/plays';

const numbers = (hs: { number: number }[]) => hs.map((h) => h.number);
const letters = (gs: { letter: string }[]) => gs.map((g) => g.letter).join('');

describe('holes', () => {
  it('numbers outward from the center, even to the right', () => {
    // LG C RG TE: one gap left of the center and off the end, two right and off the end.
    expect(numbers(computeHoles(offense(), DEFAULT_SETTINGS))).toEqual([3, 1, 2, 4, 6]);
  });

  it('follows the league rule for which side is even', () => {
    const holes = computeHoles(offense(), { ...DEFAULT_SETTINGS, evenHolesSide: 'left' });
    expect(numbers(holes)).toEqual([4, 2, 1, 3, 5]);
  });

  it('renumbers for free when the play is mirrored', () => {
    const holes = computeHoles(offense(), DEFAULT_SETTINGS);
    const mirrored = computeHoles(mirrorPlayers(offense()), DEFAULT_SETTINGS);
    // The 6 hole outside the tight end becomes the 5 hole on the other side.
    expect(nearestHole(holes, 5.2)?.number).toBe(6);
    expect(nearestHole(mirrored, -5.2)?.number).toBe(5);
  });

  it('is rebuilt from whoever is on the line', () => {
    const shifted = offense().map((p) => (p.id === 'wb' ? { ...p, y: 0, onLine: true } : p));
    expect(numbers(computeHoles(shifted, DEFAULT_SETTINGS))).toEqual([5, 3, 1, 2, 4, 6]);
  });

  it('has nothing to say about a line of one', () => {
    expect(computeHoles(offense().slice(1, 2), DEFAULT_SETTINGS)).toEqual([]);
  });
});

describe('gaps', () => {
  it('letters the same way on both sides of the ball', () => {
    expect(letters(computeGaps(offense()))).toBe('BAABC');
  });

  it('puts the A gap exactly where the 2 hole is', () => {
    const hole = computeHoles(offense(), DEFAULT_SETTINGS).find((h) => h.number === 2)!;
    const gap = findGap(computeGaps(offense()), 'A', 'right')!;
    expect(gap.x).toBe(hole.x);
  });

  it('sends a mirrored C-gap blitz into the other C gap', () => {
    const c = findGap(computeGaps(offense()), 'C', 'right')!;
    const mirrored = computeGaps(mirrorPlayers(offense()));
    expect(nearestGap(mirrored, -c.x)).toMatchObject({ letter: 'C', side: 'left' });
  });

  it('falls back to the letter on the other side, then to nothing', () => {
    const gaps = computeGaps(offense());
    expect(findGap(gaps, 'C', 'left')).toMatchObject({ letter: 'C', side: 'right' });
    expect(findGap(gaps, 'D', 'left')).toBeNull();
  });
});
