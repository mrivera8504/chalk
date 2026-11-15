import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readFormations, readFoundationId, writeFormations, writeFoundationId } from '../../src/domain/presets/formations';
import { readCustomRoutes, writeCustomRoutes } from '../../src/domain/presets/routes';
import { readRoster, writeRoster } from '../../src/domain/roster';
import type { Formation } from '../../src/domain/types';
import { BACKUP_KIND, BACKUP_VERSION, makeBackup, readBackup } from '../../src/store/backup';
import { getSettings } from '../../src/store/settings';
import { cover3, oldest, sweep } from '../fixtures/book';
import { defense } from '../fixtures/plays';

const front: Formation = { id: 'f-mine', name: 'My 4-3', side: 'defense', players: defense(), builtIn: false };
const custom = () => readFormations().filter((f) => !f.builtIn);

/** A device with a full season on it. */
function fillDevice() {
  writeFormations([...readFormations(), front]);
  writeCustomRoutes([{ id: 'r-mine', name: 'Whip', group: 'pass', points: [{ x: 0, y: 0 }, { x: 2, y: -3 }] }]);
  writeRoster([{ id: 'k1', name: 'Sam', jersey: 12, positions: ['QB'] }]);
  writeFoundationId('builtin-balanced');
  writeFoundationId('f-mine', 'defense');
}

const book = () => ({
  plays: [sweep(), cover3(), { ...oldest(), deletedAt: 1_700_000_500_000 }],
  sections: [{ id: 's1', name: 'Run game', order: 1 }],
});

describe('a backup', () => {
  it('carries everything the app knows, not only the plays', () => {
    fillDevice();
    const b = makeBackup(book());
    expect(b).toMatchObject({ kind: BACKUP_KIND, version: BACKUP_VERSION, foundationDefenseId: 'f-mine' });
    expect(b.formations.map((f) => f.id)).toEqual(['f-mine']);
    expect(b.routes).toHaveLength(1);
    expect(b.roster).toHaveLength(1);
    expect(b.settings).toEqual(getSettings());
  });

  it('carries the trash', () => {
    expect(makeBackup(book()).plays.filter((p) => p.deletedAt)).toHaveLength(1);
  });

  it('leaves the built-in formations out, so a restore gets the current build\'s set', () => {
    fillDevice();
    expect(makeBackup(book()).formations.every((f) => !f.builtIn)).toBe(true);
  });

  it('round-trips through a file onto a clean device', () => {
    fillDevice();
    const text = JSON.stringify(makeBackup(book()));
    localStorage.clear();

    const { book: restored, counts } = readBackup(text);
    expect(restored).toEqual({ ...book(), books: [] });
    expect(counts).toEqual({ plays: 3, sections: 1, formations: 1, routes: 1, roster: 1 });
    expect(custom().map((f) => f.id)).toEqual(['f-mine']);
    expect(readCustomRoutes()).toHaveLength(1);
    expect(readRoster()).toHaveLength(1);
    expect(readFoundationId('defense')).toBe('f-mine');
  });
});

describe('a restore', () => {
  it('writes only what the file carries, and leaves the rest of the device alone', () => {
    // A book rebuilt from the cloud holds plays and sections and nothing else.
    fillDevice();
    readBackup(JSON.stringify({ plays: [sweep()], sections: [] }));
    expect(custom().map((f) => f.id)).toEqual(['f-mine']);
    expect(readCustomRoutes()).toHaveLength(1);
    expect(readRoster()).toHaveLength(1);
    expect(readFoundationId('defense')).toBe('f-mine');
  });

  it('does empty a store the file explicitly carries as empty', () => {
    fillDevice();
    readBackup(JSON.stringify({ plays: [], sections: [], routes: [] }));
    expect(readCustomRoutes()).toEqual([]);
    expect(readRoster()).toHaveLength(1);
  });

  it('gives a setting the file predates its default, not undefined', () => {
    readBackup(JSON.stringify({ plays: [], settings: { playersPerSide: 8 } }));
    expect(getSettings().playersPerSide).toBe(8);
    expect(getSettings().routeColors).toHaveLength(6);
  });

  it('refuses a bad file in words, and touches nothing', () => {
    fillDevice();
    expect(() => readBackup('not json')).toThrow(/not readable/);
    expect(() => readBackup('{"sections":[]}')).toThrow(/no plays/);
    expect(() => readBackup(JSON.stringify({ plays: [], version: BACKUP_VERSION + 1 }))).toThrow(/newer Chalk/);
    expect(custom()).toHaveLength(1);
  });
});

/**
 * A backup file as version 1 of the app wrote it, kept in the repository.
 *
 * This is the promise stage 2 has to keep: whatever the backup format becomes,
 * this exact file restores. It is written once and never regenerated — a
 * fixture rebuilt from the current code would only prove the code agrees with
 * itself.
 */
describe('the version 1 backup file', () => {
  const path = 'tests/fixtures/backup-v1.json';

  it('is still a version 1 file', () => {
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ kind: 'chalk-backup', version: 1 });
    // And this build writes a later one, so the file above really is the old format.
    expect(BACKUP_VERSION).toBe(2);
  });

  it('restores every play, live and trashed, with its id and stamp untouched', () => {
    const { book: restored, counts } = readBackup(readFileSync(path, 'utf8'));
    expect(counts).toEqual({ plays: 3, sections: 1, formations: 1, routes: 1, roster: 1 });
    expect(restored.plays.map((p) => [p.id, p.updatedAt, p.deletedAt ?? null])).toEqual([
      ['sweep', 1_700_000_000_000, null],
      ['cover3', 1_700_000_000_000, null],
      ['oldest', 1_690_000_000_000, 1_700_000_500_000],
    ]);
    expect(readFoundationId()).toBe('builtin-balanced');
    expect(readFoundationId('defense')).toBe('f-mine');
  });
});
