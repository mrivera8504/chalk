import { describe, expect, it } from 'vitest';
import { applyOnLine, checkFormation, countOnLine, eligibleReceivers } from '../../src/domain/legality';
import { DEFAULT_SETTINGS } from '../../src/domain/types';
import { defense, offense } from '../fixtures/plays';

describe('legality', () => {
  it('passes the shipped 7-man set', () => {
    expect(countOnLine(offense())).toBe(4);
    expect(checkFormation(offense(), DEFAULT_SETTINGS)).toEqual([]);
  });

  it('flags a short line and a wrong head count without blocking anything', () => {
    const three = offense().map((p) => (p.id === 'te' ? { ...p, y: 3, onLine: false } : p)).slice(0, 6);
    expect(checkFormation(three, DEFAULT_SETTINGS).map((i) => i.text)).toEqual([
      '6 on offense, need 7',
      '3 on the line, need 4',
    ]);
  });

  it('reads the live rule, not the shipped one', () => {
    const issues = checkFormation(offense(), { ...DEFAULT_SETTINGS, minOnLine: 5 });
    expect(issues.map((i) => i.text)).toEqual(['4 on the line, need 5']);
  });

  it('puts a man on the line by depth unless he is locked', () => {
    const moved = offense().map((p) =>
      p.id === 'wb' ? { ...p, y: 0.5 } : p.id === 'te' ? { ...p, y: 4, onLineLocked: true } : p,
    );
    const out = applyOnLine(moved, DEFAULT_SETTINGS);
    expect(out.find((p) => p.id === 'wb')!.onLine).toBe(true);
    expect(out.find((p) => p.id === 'te')!.onLine).toBe(true);
  });

  it('never counts a defender as on the line', () => {
    const out = applyOnLine(defense().map((p) => ({ ...p, y: 0 })), DEFAULT_SETTINGS);
    expect(out.every((p) => !p.onLine)).toBe(true);
  });

  it('returns the same object for a man whose flag did not change', () => {
    const men = offense();
    expect(applyOnLine(men, DEFAULT_SETTINGS)[0]).toBe(men[0]);
  });

  it('makes the ends and the backs eligible, never the quarterback or the interior', () => {
    expect(eligibleReceivers(offense()).map((p) => p.id).sort()).toEqual(['lg', 'rb', 'te', 'wb']);
    const all = [...offense(), ...defense()];
    expect(eligibleReceivers(all).every((p) => p.side === 'offense')).toBe(true);
  });
});
