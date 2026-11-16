import { describe, expect, it } from 'vitest';
import { builtInFormations, formationsFor } from '../../src/domain/presets/formations';
import { framesOf, nextFrame } from '../../src/domain/frames';
import { HOOPS_ACTIONS, makeShot } from '../../src/domain/presets/hoops';
import { SOCCER_ACTIONS } from '../../src/domain/presets/soccer';
import { refreshPaths } from '../../src/domain/regenerate';
import { naturalHand } from '../../src/domain/presets/routes';
import { PLAYER_R } from '../../src/domain/types';
import { SPORTS, isFootball, sportOf, surfaceOf, viewOf } from '../../src/sports';
import { GOAL, PITCH } from '../../src/sports/soccer/pitch';
import { blankPlay } from '../../src/store/usePlaybook';

/**
 * What every sport owes the board, whichever it is: sets that field the right
 * number, with nobody on anybody and everybody inside the window.
 */
describe('every sport', () => {
  it('is football, basketball and soccer, and no two share a variant', () => {
    expect(SPORTS.map((s) => s.id)).toEqual(['football', 'basketball', 'soccer']);
    const ids = SPORTS.flatMap((s) => s.variants.map((v) => v.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads the sport off the variant, and nothing as football', () => {
    expect(sportOf(undefined).id).toBe('football');
    expect(sportOf('from-a-newer-build').id).toBe('football');
    expect(surfaceOf('hoops')).toBe('court');
    expect(surfaceOf('soccer7')).toBe('pitch');
    expect(surfaceOf('eleven')).toBe('field');
    expect(isFootball('soccer11')).toBe(false);
  });

  for (const sport of SPORTS) {
    for (const v of sport.variants) {
      describe(`${sport.name} ${v.name}`, () => {
        const sets = formationsFor(builtInFormations(), v.id);
        const view = viewOf(v.id);

        it('has a set for each side, each the right size', () => {
          for (const side of ['offense', 'defense'] as const) {
            const mine = sets.filter((f) => f.side === side);
            expect(mine.length, side).toBeGreaterThan(0);
            for (const f of mine) expect(f.players.length, f.name).toBe(v.playersPerSide);
          }
        });

        it('stands nobody on anybody, and everybody on the board', () => {
          for (const f of sets) {
            for (const [i, a] of f.players.entries()) {
              expect(Math.abs(a.x), `${f.name} ${a.label}`).toBeLessThanOrEqual(view.halfWidth - 1);
              expect(a.y, `${f.name} ${a.label}`).toBeGreaterThan(-view.downfield + 1);
              expect(a.y, `${f.name} ${a.label}`).toBeLessThan(view.behind - 1);
              for (const b of f.players.slice(i + 1)) {
                expect(Math.hypot(a.x - b.x, a.y - b.y), `${f.name}: ${a.label}, ${b.label}`).toBeGreaterThanOrEqual(PLAYER_R * 2);
              }
            }
          }
        });

        it('opens a new play in its first set, and steps it', () => {
          const play = blankPlay(undefined, 'offense', undefined, v.id);
          expect(play.players.length).toBe(v.playersPerSide);
          expect(nextFrame(framesOf(play)[0]).players.length).toBe(v.playersPerSide);
          // Off a football field somebody has the ball from the start.
          if (!isFootball(v.id)) expect(play.players.some((p) => p.id === play.ballCarrierId)).toBe(true);
        });
      });
    }
  }
});

describe('soccer', () => {
  const play = blankPlay(undefined, 'offense', undefined, 'soccer11');
  const striker = play.players.find((p) => p.label === 'ST')!;

  it('faces the other team the other way', () => {
    const sets = formationsFor(builtInFormations(), 'soccer11');
    const ours = sets.find((f) => f.id === 'builtin-soccer11-4-4-2')!;
    const theirs = sets.find((f) => f.id === 'builtin-soccer11-d-4-4-2')!;
    expect(ours.players.find((p) => p.label === 'GK')!.y).toBeGreaterThan(0);
    expect(theirs.players.find((p) => p.label === 'GK')!.y).toBeLessThan(0);
    expect(theirs.players.every((p) => p.side === 'defense')).toBe(true);
  });

  it('runs forward for whichever goal a man is attacking, and stays on the pitch', () => {
    const through = SOCCER_ACTIONS.find((a) => a.id === 'soccer-through')!;
    const up = through.shape(striker, naturalHand(striker));
    expect(up[1].y).toBeLessThan(striker.y);
    const marker = { ...striker, side: 'defense' as const };
    expect(through.shape(marker, 'right')[1].y).toBeGreaterThan(striker.y);
    for (const a of SOCCER_ACTIONS) {
      for (const p of play.players) {
        for (const pt of a.shape(p, naturalHand(p))) {
          expect(Math.abs(pt.x), a.id).toBeLessThanOrEqual(PITCH.halfWidth);
          expect(Math.abs(pt.y), a.id).toBeLessThanOrEqual(PITCH.halfLength);
        }
      }
    }
  });

  it('keeps a shot aimed at the goal it was drawn at when the shooter moves', () => {
    const shot = makeShot(striker, [], GOAL);
    const moved = play.players.map((p) => (p.id === striker.id ? { ...p, x: p.x + 3 } : p));
    const [again] = refreshPaths([shot], moved);
    expect(again.path[1]).toEqual(GOAL);
    expect(again.path[0].x).not.toBeCloseTo(shot.path[0].x);
  });

  it('gives a court its own list and a pitch its own', () => {
    const ids = new Set([...HOOPS_ACTIONS, ...SOCCER_ACTIONS].map((a) => a.id));
    expect(ids.size).toBe(HOOPS_ACTIONS.length + SOCCER_ACTIONS.length);
  });
});
