import { describe, expect, it } from 'vitest';
import {
  CHATTER_MS,
  CHATTER_YARDS,
  DRAG_SLOP_PX,
  beyondSlop,
  dragTarget,
  isContactBounce,
  panOffset,
  slideRoute,
  type DragState,
  type Drop,
} from '../../src/editor/gesture';
import { readDrawerOpen, writeDrawerOpen } from '../../src/editor/drawerPrefs';

const grab = (over: Partial<DragState> = {}): DragState => ({
  kind: 'player', id: 'rb', dx: 0, dy: 0, ox: 0, oy: 5, moved: false, ...over,
});
const drop = (over: Partial<Drop> = {}): Drop => ({ ...grab(), at: 1000, x: 0, y: 5, ...over });
const rules = { step: 0.25, magnet: 0.5 };

describe('the numbers the pen is read with', () => {
  it('are the ones the device traces set', () => {
    // Bounce gaps ran 10-25ms; a genuine second tap was never under 200ms.
    expect(CHATTER_MS).toBe(120);
    expect(CHATTER_YARDS).toBe(2.5);
    expect(DRAG_SLOP_PX).toBe(12);
  });
});

describe('a contact bounce', () => {
  it('is a contact soon after, and near, a drag that just ended', () => {
    expect(isContactBounce(drop(), 1014, { x: 0.3, y: 5.2 })).toBe(true);
    expect(isContactBounce(drop(), 1025, { x: -1, y: 4 })).toBe(true);
  });

  it('is not one a genuine second tap later', () => {
    expect(isContactBounce(drop(), 1200, { x: 0, y: 5 })).toBe(false);
    expect(isContactBounce(drop(), 1000 + CHATTER_MS, { x: 0, y: 5 })).toBe(false);
  });

  it('is not one across the field, however soon', () => {
    expect(isContactBounce(drop(), 1010, { x: 6, y: -4 })).toBe(false);
  });

  it('is nothing without a drag to resume', () => {
    expect(isContactBounce(null, 1010, { x: 0, y: 5 })).toBe(false);
  });
});

describe('the slop', () => {
  it('holds a man still through a tap that wobbles', () => {
    expect(beyondSlop(grab(), { x: 0.2, y: 5.1 }, 0.5)).toBe(false);
  });

  it('lets go once the pen has really travelled, measured from the grab', () => {
    expect(beyondSlop(grab(), { x: 0.5, y: 5 }, 0.5)).toBe(true);
    expect(beyondSlop(grab({ ox: 3, oy: 3 }), { x: 3.1, y: 3 }, 0.5)).toBe(false);
  });
});

describe('where a drag lands', () => {
  it('keeps the grab offset, so the mark does not jump to the pen', () => {
    expect(dragTarget(grab({ dx: 0.25, dy: -0.5 }), { x: 4, y: 6 }, rules)).toEqual({ x: 4.25, y: 5.5 });
  });

  it('snaps to the grid', () => {
    expect(dragTarget(grab(), { x: 4.11, y: 6.38 }, rules)).toEqual({ x: 4, y: 6.5 });
  });

  it('clicks a player onto the line inside the magnet', () => {
    expect(dragTarget(grab(), { x: -5, y: 0.3 }, rules).y).toBe(0);
    expect(dragTarget(grab(), { x: -5, y: 0.3 }, { step: 0.25, magnet: 0 }).y).toBe(0.25);
  });

  it('magnetises nothing that is not a player', () => {
    for (const kind of ['vision', 'focus', 'zone', 'zone-size', 'route-point'] as const) {
      expect(dragTarget(grab({ kind }), { x: 0, y: 0.3 }, rules).y, kind).toBe(0.25);
    }
  });

  it('keeps a man a yard inside the board', () => {
    expect(dragTarget(grab(), { x: 40, y: -40 }, rules)).toEqual({ x: 10, y: -19 });
    expect(dragTarget(grab(), { x: -40, y: 40 }, rules)).toEqual({ x: -10, y: 9 });
  });

  it('lets a zone corner, and only that, reach the edge', () => {
    expect(dragTarget(grab({ kind: 'zone-size' }), { x: 40, y: -40 }, rules)).toEqual({ x: 11, y: -20 });
    expect(dragTarget(grab({ kind: 'zone' }), { x: 40, y: -40 }, rules)).toEqual({ x: 10, y: -19 });
  });
});

describe('sliding the board', () => {
  const from = { x: 500, y: 400, ox: 0, oy: 0 };
  const scale = { a: 20, d: 20 };

  it('moves the window against the pen: drag right, the field goes right', () => {
    expect(panOffset(from, { x: 540, y: 400 }, scale)).toEqual({ x: -2, y: 0 });
  });

  it('is set from where the grab began, never accumulated', () => {
    const once = panOffset(from, { x: 560, y: 380 }, scale);
    panOffset(from, { x: 520, y: 390 }, scale);
    expect(panOffset(from, { x: 560, y: 380 }, scale)).toEqual(once);
  });

  it('starts from the offset the board already had', () => {
    expect(panOffset({ ...from, ox: 3, oy: -2 }, { x: 520, y: 400 }, scale)).toEqual({ x: 2, y: -2 });
  });

  it('cannot slide the board off the screen', () => {
    expect(panOffset(from, { x: -9000, y: 9000 }, scale)).toEqual({ x: 11, y: -15 });
  });
});

describe('running a route deeper by its handle', () => {
  const route = { id: 'r', playerId: 'te', kind: 'route' as const, preset: 'out', path: [{ x: 3, y: 0 }, { x: 3, y: -7 }, { x: 7.5, y: -7.4, cx: 5, cy: -8 }] };

  it('slides everything past the man together, and leaves him where he is', () => {
    const out = slideRoute(route, 2, -10.4);
    expect(out.path).toEqual([{ x: 3, y: 0 }, { x: 3, y: -10 }, { x: 7.5, y: -10.4, cx: 5, cy: -11 }]);
  });

  it('never leans the stem: x does not move', () => {
    expect(slideRoute(route, 2, -12).path.map((p) => p.x)).toEqual([3, 3, 7.5]);
  });

  it('marks it edited and keeps the concept, so the namer still calls it an out', () => {
    expect(slideRoute(route, 2, -12)).toMatchObject({ edited: true, preset: 'out' });
  });

  it('hands back the same assignment when nothing moved', () => {
    expect(slideRoute(route, 2, -7.4)).toBe(route);
    expect(slideRoute(route, 9, -3)).toBe(route);
  });
});

describe('the drawer', () => {
  it('remembers only what the coach chose', () => {
    writeDrawerOpen(false);
    expect(readDrawerOpen()).toBe(false);
    writeDrawerOpen(true);
    expect(readDrawerOpen()).toBe(true);
  });
});
