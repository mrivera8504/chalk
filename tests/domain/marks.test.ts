import { describe, expect, it } from 'vitest';
import { markAt, mirrorMarks, placeFor, type BoardMark } from '../../src/domain/marks';
import { withSuggestion } from '../../src/domain/naming';
import { DEFAULT_SETTINGS } from '../../src/domain/types';
import { boundsView } from './marksView';
import { blankPlay } from '../../src/store/usePlaybook';

const cone = (id: string, x: number, y: number): BoardMark => ({ id, kind: 'cone', x, y });

describe('marks', () => {
  it('picks the nearest mark within reach, and nothing beyond it', () => {
    const marks = [cone('a', 0, 0), cone('b', 1.2, 0)];
    expect(markAt(marks, { x: 0.8, y: 0 })?.id).toBe('b');
    expect(markAt(marks, { x: 0.2, y: 0.1 })?.id).toBe('a');
    expect(markAt(marks, { x: 5, y: 5 })).toBeNull();
  });

  it('mirrors with the board', () => {
    expect(mirrorMarks([cone('a', 3, -2)])[0]).toMatchObject({ x: -3, y: -2 });
  });

  it('never puts a new one on top of one already there', () => {
    let marks: BoardMark[] = [];
    for (let i = 0; i < 8; i++) marks = [...marks, cone(String(i), ...Object.values(placeFor(marks, { x: 0, y: 0 })) as [number, number])];
    for (const [i, a] of marks.entries()) {
      for (const b of marks.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(1);
    }
  });

  it('is part of what a sheet has to show', () => {
    const view = boundsView([cone('far', 9, -18)]);
    expect(view.x + view.w).toBeGreaterThanOrEqual(9);
    expect(view.y).toBeLessThanOrEqual(-18);
  });
});

describe('drills', () => {
  it('open on an empty board, in any sport, and say they are drills', () => {
    for (const v of [undefined, 'flag5', 'hoops', 'soccer7']) {
      const d = blankPlay(undefined, 'offense', undefined, v, true);
      expect(d.players).toEqual([]);
      expect(d.drill).toBe(true);
      expect(d.ballCarrierId).toBeUndefined();
    }
  });

  it('leave a play stored as a play always was', () => {
    expect('drill' in blankPlay()).toBe(false);
    expect('marks' in blankPlay()).toBe(false);
  });

  it('are given no name: there is no hole to run at', () => {
    const d = withSuggestion(blankPlay(undefined, 'offense', undefined, undefined, true), DEFAULT_SETTINGS);
    expect(d.suggestedName).toBeUndefined();
  });
});
