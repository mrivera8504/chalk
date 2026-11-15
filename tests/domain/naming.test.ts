import { describe, expect, it } from 'vitest';
import { mirrorAssignments, mirrorPlayers } from '../../src/domain/mirror';
import { suggestDefenseName, suggestName, withSuggestion } from '../../src/domain/naming';
import { COVERAGES, applyCoverage } from '../../src/domain/presets/coverages';
import { makeCover } from '../../src/domain/presets/links';
import { routeById } from '../../src/domain/presets/routes';
import { computeGaps } from '../../src/domain/gaps';
import { DEFAULT_SETTINGS, type Assignment } from '../../src/domain/types';
import { VIEW } from '../../src/render/geometry';
import { defense, offense, play, route } from '../fixtures/plays';

const FIELD = { halfWidth: VIEW.halfWidth, downfield: VIEW.downfield };
const rb = () => offense().find((p) => p.id === 'rb')!;
const run = (preset: string, hand: 'right' | 'left' = 'right'): Assignment =>
  route('run', 'rb', { kind: 'carry', preset, hand, path: routeById(preset)!.shape(rb(), hand) });

describe('the offensive name', () => {
  it('is back number, hole, concept', () => {
    expect(suggestName(offense(), [run('wide-right')], DEFAULT_SETTINGS)).toEqual({
      name: '26 All the way right',
      backNumber: 2,
      hole: 6,
    });
  });

  it('renumbers when the play is mirrored: 26 becomes 25', () => {
    const s = suggestName(mirrorPlayers(offense()), mirrorAssignments([run('wide-right')]), DEFAULT_SETTINGS);
    expect(s).toMatchObject({ backNumber: 2, hole: 5, name: '25 All the way left' });
  });

  it('trusts the star over the drawn lines', () => {
    // A plain hand-drawn route, which no preset would have marked as a carry.
    const plain = route('r', 'rb', { path: [{ x: 0, y: 5 }, { x: 0.9, y: -3 }] });
    expect(suggestName(offense(), [plain], DEFAULT_SETTINGS)).toBeNull();
    expect(suggestName(offense(), [plain], DEFAULT_SETTINGS, 'rb')?.name).toBe('22');
  });

  it('gives up on two carries with no star', () => {
    const second = { ...run('dive'), id: 'run2' };
    expect(suggestName(offense(), [run('wide-right'), second], DEFAULT_SETTINGS)).toBeNull();
  });

  it('writes the suggestion and its coordinates onto the play', () => {
    const p = withSuggestion(play({ assignments: [run('wide-right')] }), DEFAULT_SETTINGS);
    expect(p).toMatchObject({ suggestedName: '26 All the way right', backNumber: 2, hole: 6 });
  });
});

describe('the defensive name', () => {
  const all = () => [...offense(), ...defense()];

  it('reads every shipped coverage back off the zones it laid down', () => {
    const names = COVERAGES.map((c) => {
      const r = applyCoverage(c, all(), FIELD);
      const ropes = r.man.map((m) =>
        makeCover(all().find((p) => p.id === m.defenderId)!, all().find((p) => p.id === m.receiverId)!),
      );
      return [c.id, suggestDefenseName(all(), ropes, r.zones, '5-2')?.name];
    });
    expect(names).toMatchSnapshot();
  });

  it('calls Cover 3 with two deep men Cover 3, a third vacated', () => {
    const short = all().filter((p) => p.id !== 'cb' && p.id !== 'w' && p.id !== 'm');
    const three = COVERAGES.find((c) => c.deep === 3 && !c.manUnder)!;
    const r = applyCoverage(three, short, FIELD);
    expect(suggestDefenseName(short, [], r.zones)?.name).toBe('Cover 3');
  });

  it('pairs man coverage with eligible receivers only', () => {
    const man = COVERAGES.find((c) => c.manUnder)!;
    const r = applyCoverage(man, all(), FIELD);
    const covered = r.man.map((m) => m.receiverId);
    expect(covered).not.toContain('c');
    expect(covered).not.toContain('rg');
    expect(covered).not.toContain('qb');
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('names a blitz by the gap its path crosses the line in', () => {
    const w = defense().find((p) => p.id === 'w')!; // lined up outside the guard, at x=-2
    const aGap = computeGaps(all()).find((g) => g.letter === 'A' && g.side === 'left')!;
    const blitz = route('b', 'w', { kind: 'blitz', path: [{ x: w.x, y: w.y }, { x: aGap.x, y: 1 }] });
    expect(suggestDefenseName(all(), [blitz], [], '5-2')?.name).toBe('5-2 W A Fire');
  });

  it('does not call a down lineman rushing a blitz', () => {
    const rush = route('b', 'dt', { kind: 'blitz', path: [{ x: 0, y: -1.7 }, { x: 0.9, y: 1 }] });
    expect(suggestDefenseName(all(), [rush], [])).toBeNull();
  });

  it('clears a stale back number and hole off a defensive play', () => {
    const p = withSuggestion(play({ unit: 'defense', backNumber: 2, hole: 6 }), DEFAULT_SETTINGS);
    expect(p.backNumber).toBeUndefined();
    expect(p.hole).toBeUndefined();
  });
});
