import { describe, expect, it } from 'vitest';
import { mirrorAbout, mirrorAnnotations, mirrorAssignments, mirrorPlayers, mirrorZones } from '../../src/domain/mirror';
import { routeById } from '../../src/domain/presets/routes';
import { offense, route } from '../fixtures/plays';

describe('mirroring a play', () => {
  it('changes x and nothing else about a man', () => {
    const [a] = mirrorPlayers([{ ...offense()[3], jersey: 12 }]);
    expect(a).toMatchObject({ x: -3.6, y: 0, label: 'TE', jersey: 12, onLine: true });
  });

  it('flips the hand with the geometry', () => {
    const rb = offense().find((p) => p.id === 'rb')!;
    const sweep = route('a', 'rb', { preset: 'dive', hand: 'right', path: routeById('dive')!.shape(rb, 'right') });
    const [m] = mirrorAssignments([sweep]);
    expect(m.hand).toBe('left');
    expect(m.preset).toBe('dive');
    // Mirrored is exactly what the other hand would have drawn from the mirrored man.
    expect(m.path).toEqual(routeById('dive')!.shape({ ...rb, x: -rb.x }, 'left'));
  });

  it('swaps a wide run for its twin, so the name keeps telling the truth', () => {
    const rb = offense().find((p) => p.id === 'rb')!;
    const wide = route('a', 'rb', { preset: 'wide-right', hand: 'right', path: routeById('wide-right')!.shape(rb, 'right') });
    const [m] = mirrorAssignments([wide]);
    expect(m.preset).toBe('wide-left');
    expect(m.path).toEqual(routeById('wide-left')!.shape({ ...rb, x: -rb.x }, 'left'));
  });

  it('mirrored twice is the play it started as', () => {
    const rb = offense().find((p) => p.id === 'rb')!;
    const wide = route('a', 'rb', { preset: 'wide-right', hand: 'right', path: routeById('wide-right')!.shape(rb, 'right') });
    const back = mirrorAssignments(mirrorAssignments([wide]));
    expect(back[0].preset).toBe('wide-right');
    expect(back[0].hand).toBe('right');
    back[0].path.forEach((p, i) => {
      expect(p.x).toBeCloseTo(wide.path[i].x);
      expect(p.y).toBeCloseTo(wide.path[i].y);
    });
  });

  it('carries control points and stroke weight across', () => {
    expect(mirrorAnnotations([[{ x: 1, y: 2, cx: 3, cy: 4, w: 0.2 }]])).toEqual([[{ x: -1, y: 2, cx: -3, cy: 4, w: 0.2 }]]);
  });

  it('moves a zone and leaves its size and color alone', () => {
    expect(mirrorZones([{ playerId: 'fs', x: 4, y: -12, w: 7, h: 5, color: 'var(--route-1)' }])).toEqual([
      { playerId: 'fs', x: -4, y: -12, w: 7, h: 5, color: 'var(--route-1)' },
    ]);
  });

  it('turns one hand-drawn run round about its own first point', () => {
    expect(mirrorAbout([{ x: 2, y: 0 }, { x: 5, y: -3, cx: 4, cy: -1 }], 2)).toEqual([
      { x: 2, y: 0 },
      { x: -1, y: -3, cx: 0, cy: -1 },
    ]);
  });
});
