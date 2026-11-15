import { describe, expect, it } from 'vitest';
import { PLAYER_R } from '../../src/domain/types';
import { VIEW, VIEW_BOX, distanceToPath, pickAt, snap, snapDepth, toPathD } from '../../src/render/geometry';
import { simplify, snapEnd, straighten, toSmoothPath, widthFromPressure } from '../../src/render/smooth';

describe('the board window', () => {
  it('is 22 yards across and 30 deep, in yards', () => {
    expect(VIEW_BOX).toBe('-11 -20 22 30');
    expect(VIEW).toEqual({ halfWidth: 11, downfield: 20, behind: 10 });
  });
});

describe('snapping', () => {
  it('magnetises a mark onto the line and grids everything else', () => {
    expect(snapDepth(0.3, 0.5, 0.25)).toBe(0);
    expect(snapDepth(-0.4, 0.5, 0.25)).toBe(0);
    expect(snapDepth(0.6, 0.5, 0.25)).toBe(0.5);
    expect(snapDepth(0.3, 0, 0.25)).toBe(0.25);
    expect(snap(1.13)).toBe(1.25);
  });
});

describe('paths', () => {
  it('writes a quadratic for a point that carries a control point', () => {
    expect(toPathD([{ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 3, y: -1, cx: 2, cy: -2 }])).toBe(
      'M 0 0 L 1 -1 Q 2 -2 3 -1',
    );
    expect(toPathD([])).toBe('');
  });

  it('measures to the segment, not just its ends', () => {
    expect(distanceToPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 5, y: 1 })).toBeCloseTo(1);
  });
});

describe('what a tap is asking for', () => {
  const guard = { id: 'rg', x: 1.8, y: 0 };
  const block = { id: 'b', path: [{ x: -1.8, y: 0 }, { x: 4, y: 0 }] }; // runs under him

  it('is the man when it lands inside his mark, whatever is drawn under him', () => {
    // The five taps off the device trace: 0.22 to 0.67 yards from a guard.
    for (const d of [0.22, 0.35, 0.48, 0.6, 0.67]) {
      expect(pickAt([guard], [block], { x: 1.8, y: d }, 2, PLAYER_R)).toMatchObject({ kind: 'player', id: 'rg' });
    }
  });

  it('is the line everywhere it is not underneath somebody', () => {
    expect(pickAt([guard], [block], { x: 3.4, y: 0.1 }, 2, PLAYER_R)).toMatchObject({ kind: 'assignment', id: 'b' });
  });

  it('is nothing on open grass', () => {
    expect(pickAt([guard], [block], { x: 8, y: -9 }, 1, PLAYER_R)).toBeNull();
  });

  it('is the nearest man when two are in range', () => {
    const center = { id: 'c', x: 0, y: 0 };
    expect(pickAt([center, guard], [], { x: 1.1, y: 0 }, 2, PLAYER_R)).toMatchObject({ id: 'rg' });
  });
});

describe('finishing a freehand stroke', () => {
  it('drops the points that carry no shape', () => {
    const wobble = Array.from({ length: 50 }, (_, i) => ({ x: i / 10, y: i % 2 ? 0.02 : 0 }));
    expect(simplify(wobble)).toEqual([wobble[0], wobble[49]]);
  });

  it('squares a near-flat segment and leaves a real diagonal alone', () => {
    const out = straighten([{ x: 0, y: 0 }, { x: 5, y: 0.3 }, { x: 8, y: 3.3 }]);
    expect(out[1].y).toBe(0);
    expect(out[2]).toEqual({ x: 8, y: 3.3 });
  });

  it('settles the end onto a whole yard of depth, not of width', () => {
    const out = snapEnd([{ x: 0, y: 0 }, { x: 0.2, y: -6 }, { x: 4.37, y: -11.6 }]);
    expect(out[2]).toEqual({ x: 4.37, y: -12 });
  });

  it('carries a flat last segment with the end, so no kink comes back', () => {
    const out = snapEnd([{ x: 0, y: 0 }, { x: 0, y: -6.3 }, { x: 4, y: -6.3 }]);
    expect(out[1].y).toBe(-6);
    expect(out[2].y).toBe(-6);
  });

  it('smooths into a path that starts and ends where the hand did', () => {
    const pts = [{ x: 0, y: 0 }, { x: 2, y: -3 }, { x: 5, y: -3 }];
    const path = toSmoothPath(pts);
    expect(path[0]).toMatchObject({ x: 0, y: 0 });
    expect(path[path.length - 1]).toMatchObject({ x: 5, y: -3 });
  });

  it('takes one width from the hardest sample, never the mean', () => {
    const light = widthFromPressure([0, 0, 0, 0.02]);
    const hard = widthFromPressure([0, 0, 0, 0.13]);
    expect(hard!).toBeGreaterThan(light!);
    expect(widthFromPressure([0, 0, 0, 0.13, 0, 0])).toBe(hard);
  });
});
