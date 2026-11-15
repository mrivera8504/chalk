import { describe, expect, it } from 'vitest';
import { eraseAt } from '../../src/domain/erase';

const line = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0, cx: i - 0.5, cy: 1 }));

describe('eraser', () => {
  it('returns null when nothing was touched, so a hover re-renders nothing', () => {
    expect(eraseAt([line(5)], { x: 2, y: 9 }, 0.5)).toBeNull();
  });

  it('splits a stroke in two around the rubbed-out part', () => {
    const out = eraseAt([line(7)], { x: 3, y: 0 }, 0.5)!;
    expect(out.map((s) => s.map((p) => p.x))).toEqual([[0, 1, 2], [4, 5, 6]]);
  });

  it('strips the control point from a run that starts partway through', () => {
    const [, tail] = eraseAt([line(7)], { x: 3, y: 0 }, 0.5)!;
    expect(tail[0]).toEqual({ x: 4, y: 0 });
    expect(tail[1]).toMatchObject({ cx: 4.5, cy: 1 });
  });

  it('drops a single point left over, which is not a line', () => {
    const out = eraseAt([line(4)], { x: 1, y: 0 }, 0.5)!;
    expect(out.map((s) => s.map((p) => p.x))).toEqual([[2, 3]]);
  });

  it('keeps the weight of the stroke a fragment was cut from', () => {
    const heavy = line(5).map((p) => ({ ...p, w: 0.3 }));
    const out = eraseAt([heavy], { x: 2, y: 0 }, 0.5)!;
    expect(out.flat().every((p) => p.w === 0.3)).toBe(true);
  });

  it('leaves untouched strokes in the result', () => {
    const far = [{ x: 0, y: 8 }, { x: 1, y: 8 }];
    expect(eraseAt([line(3), far], { x: 1, y: 0 }, 0.5)).toEqual([far]);
  });
});
