import { describe, expect, it } from 'vitest';
import { routeById } from '../../src/domain/presets/routes';
import { contentAspect, viewForPlays } from '../../src/export/view';
import { offense, play, route } from '../fixtures/plays';

const inside = (v: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
  x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h;

const sweep = () => {
  const rb = offense().find((p) => p.id === 'rb')!;
  return play({ players: offense(), assignments: [route('r', 'rb', { path: routeById('wide-right')!.shape(rb, 'right') })] });
};

describe('the printed window', () => {
  it('never crops anything a play draws, whatever shape the paper is', () => {
    const p = sweep();
    for (const aspect of [0.5, 0.73, 1, 1.29, 2.4]) {
      const v = viewForPlays([p], aspect);
      for (const m of p.players) expect(inside(v, m.x, m.y), `${aspect} ${m.id}`).toBe(true);
      for (const pt of p.assignments[0].path) expect(inside(v, pt.x, pt.y), `${aspect}`).toBe(true);
    }
  });

  it('always has the line of scrimmage in it', () => {
    const deep = play({ players: [], annotations: [[{ x: 0, y: -18 }, { x: 3, y: -15 }]] });
    const v = viewForPlays([deep], 1);
    expect(inside(v, 0, 0)).toBe(true);
  });

  it('gives back the depth nobody runs into', () => {
    const v = viewForPlays([sweep()], 22 / 30);
    expect(v.h).toBeLessThan(30);
  });

  it('floors a goal-line play at 18 by 15 rather than blowing it up', () => {
    const tight = play({ players: offense().slice(0, 3) });
    const v = viewForPlays([tight], 18 / 15);
    expect(v.w).toBeCloseTo(18);
    expect(v.h).toBeCloseTo(15);
  });

  it('leans toward the paper by a quarter and no further', () => {
    const p = sweep();
    const natural = contentAspect([p]);
    const wide = viewForPlays([p], 5);
    const tall = viewForPlays([p], 0.1);
    const base = viewForPlays([p], natural);
    expect(wide.w).toBeCloseTo(base.w * 1.25);
    expect(wide.h).toBeCloseTo(base.h);
    expect(tall.h).toBeCloseTo(base.h * 1.25);
    expect(tall.w).toBeCloseTo(base.w);
  });

  it('is one window for every play on the page', () => {
    const wide = sweep();
    const deep = play({ id: 'p2', players: offense(), zones: [{ playerId: 'x', x: 0, y: -16, w: 7, h: 5 }] });
    const v = viewForPlays([wide, deep], 1);
    expect(inside(v, 9.9, 4)).toBe(true);
    expect(inside(v, 0, -18.5)).toBe(true);
  });

  it('measures a block where it is drawn now, not where it was stored', () => {
    const stale = play({
      players: [...offense(), { id: 'd', label: 'N', side: 'defense', x: 0, y: -1.7, onLine: false, onLineLocked: false, shape: 'x' }],
      assignments: [{ id: 'b', playerId: 'c', kind: 'block', targetPlayerId: 'd', path: [{ x: 0, y: 0 }, { x: 40, y: -40 }] }],
    });
    expect(viewForPlays([stale], 1).w).toBeLessThan(30);
  });
});
