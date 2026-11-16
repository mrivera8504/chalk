import { describe, expect, it } from 'vitest';
import { applyCoverage, COVERAGES } from '../../src/domain/presets/coverages';
import { rushPresets } from '../../src/domain/presets/defense';
import {
  baseFrontId,
  builtInFormations,
  formationsFor,
  foundationDefense,
  foundationOffense,
  readFoundationId,
  writeFoundationId,
} from '../../src/domain/presets/formations';
import { applyOnLine, checkFormation } from '../../src/domain/legality';
import { DEFAULT_SETTINGS, PLAYER_R } from '../../src/domain/types';
import { toolsFor } from '../../src/editor/BlockTool';
import { VIEW } from '../../src/render/geometry';
import { football, rulesFor, variantKey, variantOf } from '../../src/sports/football';
import { blankPlay } from '../../src/store/usePlaybook';

describe('the kinds of football', () => {
  it('offers flag, 6, 7, 8, 9 and 11, smallest first', () => {
    expect(football.variants.map((v) => v.playersPerSide)).toEqual([5, 6, 7, 8, 9, 11]);
  });

  it('stores nothing for seven-man, and reads a stranger as seven-man', () => {
    expect(variantKey('seven')).toBeUndefined();
    expect(variantKey(undefined)).toBeUndefined();
    expect(variantKey('flag5')).toBe('flag5');
    expect(variantOf('from-a-newer-build').id).toBe('seven');
  });

  it('holds seven-man to the coach’s own rules and the rest to their own', () => {
    const house = { ...DEFAULT_SETTINGS, playersPerSide: 8, minOnLine: 5, evenHolesSide: 'left' as const };
    expect(rulesFor(undefined, house)).toBe(house);
    const flag = rulesFor('flag5', house);
    expect([flag.playersPerSide, flag.minOnLine]).toEqual([5, 1]);
    // Everything that is not a head count is still the coach's.
    expect(flag.evenHolesSide).toBe('left');
  });

  for (const v of football.variants) {
    describe(v.name, () => {
      const rules = rulesFor(v.id, DEFAULT_SETTINGS);
      const sets = formationsFor(builtInFormations(), v.id);

      it('has a set and a front built in', () => {
        expect(sets.some((f) => f.side === 'offense')).toBe(true);
        expect(sets.some((f) => f.side === 'defense')).toBe(true);
        expect(sets.some((f) => f.id === baseFrontId(v.id))).toBe(true);
      });

      it('fields the right number in every one of them, legally', () => {
        for (const f of sets) {
          expect(f.players.length, f.name).toBe(v.playersPerSide);
          if (f.side === 'offense') {
            expect(checkFormation(applyOnLine(f.players, rules), rules), f.name).toEqual([]);
            // One quarterback, or the cone and the namer have nobody to find.
            expect(f.players.filter((p) => p.backNumber === 1).length, f.name).toBe(1);
          }
        }
      });

      it('stands nobody on anybody, and everybody on the board', () => {
        for (const f of sets) {
          for (const [i, a] of f.players.entries()) {
            expect(Math.abs(a.x), `${f.name} ${a.label}`).toBeLessThanOrEqual(VIEW.halfWidth - 1);
            expect(a.y).toBeGreaterThan(-VIEW.downfield + 1);
            expect(a.y).toBeLessThan(VIEW.behind - 1);
            for (const b of f.players.slice(i + 1)) {
              const gap = Math.hypot(a.x - b.x, a.y - b.y);
              expect(gap, `${f.name}: ${a.label} and ${b.label}`).toBeGreaterThanOrEqual(PLAYER_R * 2);
            }
          }
        }
      });

      it('opens a new play of each unit with both sides the right size', () => {
        const d = blankPlay(undefined, 'defense', undefined, v.id);
        expect(d.players.filter((p) => p.side === 'offense').length).toBe(v.playersPerSide);
        expect(d.players.filter((p) => p.side === 'defense').length).toBe(v.playersPerSide);
        expect(d.variant).toBe(variantKey(v.id));
        expect(d.defenseFormationId).toBe(baseFrontId(v.id));
      });

      it('takes every coverage without throwing or inventing men', () => {
        const players = blankPlay(undefined, 'defense', undefined, v.id).players;
        for (const c of COVERAGES) {
          const out = applyCoverage(c, players, VIEW);
          const ids = new Set(players.map((p) => p.id));
          for (const z of out.zones) expect(ids.has(z.playerId), c.name).toBe(true);
        }
      });
    });
  }

  it('keeps one kind’s star away from another’s', () => {
    writeFoundationId('builtin-eleven-gun-spread', 'offense', 'eleven');
    expect(readFoundationId('offense')).toBeNull();
    expect(readFoundationId('offense', 'seven')).toBeNull();
    expect(foundationOffense('eleven').length).toBe(11);
    expect(foundationOffense().length).toBe(7);
    expect(foundationDefense('flag5').length).toBe(5);
    writeFoundationId(null, 'offense', 'eleven');
  });

  it('never shows a seven-man set on an eleven-man play, or the reverse', () => {
    const all = builtInFormations();
    expect(formationsFor(all).every((f) => f.players.length === 7)).toBe(true);
    expect(formationsFor(all, 'seven')).toEqual(formationsFor(all));
    expect(formationsFor(all, 'eleven').every((f) => f.players.length === 11)).toBe(true);
  });

  it('leaves a seven-man play stored exactly as it always was', () => {
    const p = blankPlay();
    expect('variant' in p).toBe(false);
    expect(blankPlay(undefined, 'offense', undefined, 'seven')).not.toHaveProperty('variant');
  });
});

describe('flag', () => {
  it('has no block tools, and no stunt', () => {
    expect(toolsFor('offense', false).map((t) => t.id)).toEqual(['select', 'routes', 'erase']);
    expect(toolsFor('defense', false).map((t) => t.id)).toEqual(['select', 'routes', 'erase', 'cover']);
    expect(toolsFor('offense').map((t) => t.id)).toContain('block');
  });

  it('rushes for the flag; tackle football is never offered it', () => {
    expect(rushPresets(false).map((p) => p.id)).toEqual(['pull-flag', 'contain', 'spy']);
    expect(rushPresets(true).map((p) => p.id)).not.toContain('pull-flag');
    expect(rushPresets(true).length).toBeGreaterThan(3);
  });
});
