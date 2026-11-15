import { describe, expect, it } from 'vitest';
import { computeGaps } from '../../src/domain/gaps';
import { blockPath, makeBlock, refreshBlocks } from '../../src/domain/presets/blocks';
import { DEFENSE_PRESETS } from '../../src/domain/presets/defense';
import { builtInFormations } from '../../src/domain/presets/formations';
import { CRASH, LOOP, makeCover, makeStunt, stuntPartner } from '../../src/domain/presets/links';
import { ROUTES, naturalHand, routeById, toPreset, toRelative } from '../../src/domain/presets/routes';
import { ZONE_PRESETS } from '../../src/domain/presets/zones';
import { refreshPaths } from '../../src/domain/regenerate';
import { quarterback, type PathPoint } from '../../src/domain/types';
import { VIEW } from '../../src/render/geometry';
import { defense, offense } from '../fixtures/plays';

/**
 * These are characterization tests. Nobody worked the numbers out by hand: they
 * are what the app draws today, written down, so that moving the presets into a
 * sport module can be shown to have changed none of them.
 */
const round = (path: PathPoint[]) =>
  path.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Number((v as number).toFixed(3))])));

const all = () => [...offense(), ...defense()];
const by = (id: string) => all().find((p) => p.id === id)!;

describe('route presets', () => {
  it('draw the same shapes they always have, from a back and from a wing', () => {
    const out: Record<string, unknown> = {};
    for (const r of ROUTES) {
      for (const who of ['rb', 'wb', 'te']) {
        for (const hand of ['right', 'left'] as const) {
          out[`${r.id} ${who} ${hand}`] = round(r.shape(by(who), hand));
        }
      }
    }
    expect(out).toMatchSnapshot();
  });

  it('start on the man, wherever he is standing', () => {
    for (const r of ROUTES) {
      const [first] = r.shape(by('wb'), 'left');
      expect(first, r.id).toMatchObject({ x: -5, y: 1.8 });
    }
  });

  it('keep the ids plays were saved under', () => {
    for (const id of ['in', 'out', 'dive', 'off-tackle', 'wide-right', 'wide-left']) {
      expect(routeById(id), id).not.toBeNull();
    }
  });

  it('run toward the wide side unless the concept forces a hand', () => {
    expect(naturalHand(by('wb'))).toBe('left');
    expect(naturalHand(by('te'))).toBe('right');
    expect(routeById('wide-left')!.hand).toBe('left');
  });

  it('save a hand-drawn route relative to its own first point', () => {
    const drawn = [{ x: 4.2, y: 0.3 }, { x: 4.2, y: -5 }, { x: 8, y: -5, cx: 6, cy: -6 }];
    const rel = toRelative(drawn);
    expect(rel[0]).toEqual({ x: 0, y: 0 });
    // Given to another man it starts on him, not offset by where it was drawn from.
    const preset = toPreset({ id: 'c1', name: 'Mine', group: 'pass', points: rel });
    const given = preset.shape(by('wb'), 'right');
    expect(given[0]).toMatchObject({ x: -5, y: 1.8 });
    expect(given[2].x - given[0].x).toBeCloseTo(3.8);
  });
});

describe('defensive presets', () => {
  it('draw the same shapes they always have', () => {
    const ctx = { gaps: computeGaps(all()), qb: quarterback(all()) };
    const out: Record<string, unknown> = {};
    for (const d of DEFENSE_PRESETS) {
      for (const who of ['w', 'de2', 'fs']) {
        for (const hand of ['right', 'left'] as const) {
          out[`${d.id} ${who} ${hand}`] = round(d.shape(by(who), hand, ctx));
        }
      }
    }
    expect(out).toMatchSnapshot();
  });

  it('lay down the same zones they always have', () => {
    const out: Record<string, unknown> = {};
    for (const z of ZONE_PRESETS) {
      for (const who of ['w', 'cb', 'fs']) {
        out[`${z.id} ${who}`] = z.shape(by(who), naturalHand(by(who)), { halfWidth: VIEW.halfWidth });
      }
    }
    expect(out).toMatchSnapshot();
  });
});

describe('formations', () => {
  it('ship the same sets, front and back', () => {
    const sets = builtInFormations().map((f) => ({
      name: f.name,
      side: f.side,
      men: f.players.map((p) => `${p.label} ${p.x},${p.y} ${p.shape}${p.onLine ? ' line' : ''}${p.backNumber ? ` #${p.backNumber}` : ''}`),
    }));
    expect(sets).toMatchSnapshot();
  });
});

describe('lines stored as who-does-what-to-whom', () => {
  it('redraw a block when either man moves', () => {
    const block = makeBlock('block', by('rg'), by('dt'));
    const moved = all().map((p) => (p.id === 'dt' ? { ...p, x: 3 } : p));
    const [redrawn] = refreshBlocks([block], moved);
    expect(redrawn.path).toEqual(blockPath('block', by('rg'), { ...by('dt'), x: 3 }));
    expect(redrawn.path).not.toEqual(block.path);
  });

  it('drop a block whose man has gone', () => {
    const block = makeBlock('block', by('rg'), by('dt'));
    expect(refreshBlocks([block], offense())).toEqual([]);
  });

  it('leave a route exactly where it was drawn', () => {
    const r = { id: 'r', playerId: 'te', kind: 'route' as const, path: [{ x: 3.6, y: 0 }, { x: 3.6, y: -6 }] };
    const moved = all().map((p) => (p.id === 'te' ? { ...p, x: 6 } : p));
    expect(refreshPaths([r], moved)[0]).toBe(r);
  });

  it('follow both ends of a cover rope', () => {
    const rope = makeCover(by('cb'), by('wb'));
    const moved = all().map((p) => (p.id === 'wb' ? { ...p, x: -8 } : p));
    expect(refreshPaths([rope], moved)[0].path).not.toEqual(rope.path);
  });

  it('make a stunt as two jobs that name each other', () => {
    const [a, b] = makeStunt(by('de2'), by('dt'));
    expect([a.preset, b.preset].sort()).toEqual([CRASH, LOOP].sort());
    expect(stuntPartner(a, [a, b])).toBe(b);
    expect(stuntPartner(b, [a, b])).toBe(a);
  });

  it('draw the same block, pull and combo they always have', () => {
    expect({
      block: round(blockPath('block', by('rg'), by('dt'))),
      pull: round(blockPath('pull', by('lg'), by('de2'))),
      combo: round(blockPath('combo', by('rg'), by('dt'), by('m'))),
      cover: round(makeCover(by('cb'), by('wb')).path),
      stunt: makeStunt(by('de2'), by('dt')).map((s) => round(s.path)),
    }).toMatchSnapshot();
  });
});
