import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { current, makeCloud, type FakeCloud } from './fakeFirestore';

vi.mock('../../src/firebase', () => ({ db: {}, watchUid: () => () => {} }));

import { readDepth, writeDepth } from '../../src/domain/depth';
import { readFormations, writeFormations } from '../../src/domain/presets/formations';
import { readRoster, writeRoster, type RosterEntry } from '../../src/domain/roster';
import { mergeList, syncKit } from '../../src/store/kit';
import { getSettings, setSettings } from '../../src/store/settings';

let cloud: FakeCloud;
const kid = (id: string, jersey: number, name = id): RosterEntry => ({ id, jersey, name, positions: [] });

/** Two devices are two local storages; the cloud is shared. */
const devices: Record<string, Record<string, string>> = {};
function on(name: string) {
  const keep: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    keep[k] = localStorage.getItem(k)!;
  }
  if (current_device) devices[current_device] = keep;
  localStorage.clear();
  for (const [k, v] of Object.entries(devices[name] ?? {})) localStorage.setItem(k, v);
  current_device = name;
}
let current_device: string | null = null;

beforeAll(async () => {
  await import('firebase/firestore');
});
beforeEach(() => {
  cloud = current.cloud = makeCloud();
  localStorage.clear();
  for (const k of Object.keys(devices)) delete devices[k];
  current_device = null;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());
const later = () => vi.setSystemTime(Date.now() + 60_000);

describe('the roster across two devices', () => {
  it('reaches a new tablet, and the empty tablet takes nothing away', async () => {
    on('phone');
    writeRoster([kid('a', 7), kid('b', 22)]);
    await syncKit('u1');
    on('tablet');
    expect(readRoster()).toEqual([]);
    await syncKit('u1');
    expect(readRoster().map((r) => r.jersey)).toEqual([7, 22]);
    on('phone');
    await syncKit('u1');
    expect(readRoster().map((r) => r.jersey)).toEqual([7, 22]);
  });

  it('keeps a roster typed on each device before either synced', async () => {
    on('phone');
    writeRoster([kid('a', 7)]);
    on('tablet');
    writeRoster([kid('b', 22)]);
    await syncKit('u1');
    on('phone');
    await syncKit('u1');
    expect(readRoster().map((r) => r.jersey)).toEqual([7, 22]);
  });

  it('carries a removal across, and an edit after it brings the kid back', async () => {
    on('phone');
    writeRoster([kid('a', 7), kid('b', 22)]);
    await syncKit('u1');
    on('tablet');
    await syncKit('u1');

    on('phone');
    later();
    writeRoster([kid('a', 7)]);
    await syncKit('u1');
    on('tablet');
    await syncKit('u1');
    expect(readRoster().map((r) => r.jersey)).toEqual([7]);

    // The tablet still had b's older copy; the phone edits b back in later.
    on('phone');
    later();
    writeRoster([kid('a', 7), kid('b', 22, 'Back again')]);
    await syncKit('u1');
    on('tablet');
    await syncKit('u1');
    expect(readRoster().find((r) => r.id === 'b')?.name).toBe('Back again');
  });

  it('takes the newer edit of the same kid', async () => {
    on('phone');
    writeRoster([kid('a', 7, 'Sam')]);
    await syncKit('u1');
    on('tablet');
    await syncKit('u1');
    later();
    writeRoster([kid('a', 7, 'Samuel')]);
    await syncKit('u1');
    on('phone');
    await syncKit('u1');
    expect(readRoster()[0].name).toBe('Samuel');
  });

  it('does not stamp what the sync itself wrote', async () => {
    on('phone');
    writeRoster([kid('a', 7)]);
    await syncKit('u1');
    on('tablet');
    await syncKit('u1');
    const stamps = JSON.parse(localStorage.getItem('chalk.kit.meta.v1')!).roster.stamps;
    on('phone');
    const theirs = JSON.parse(localStorage.getItem('chalk.kit.meta.v1')!).roster.stamps;
    expect(stamps).toEqual(theirs);
  });
});

describe('saved formations', () => {
  it('reach the other device, and never the built-ins', async () => {
    on('phone');
    const mine = { id: 'f1', name: 'Trips', side: 'offense' as const, players: [], builtIn: false };
    writeFormations([...readFormations(), mine]);
    await syncKit('u1');
    const stored = cloud.docs.get('teams/u1/kit/formations') as { items: { id: string }[] };
    expect(stored.items.map((f) => f.id)).toEqual(['f1']);
    on('tablet');
    await syncKit('u1');
    expect(readFormations().filter((f) => !f.builtIn).map((f) => f.name)).toEqual(['Trips']);
  });
});

describe('the league rules', () => {
  it('a fresh tablet’s defaults lose to a device that changed them, even with no stamp on either', async () => {
    on('tablet');
    await syncKit('u1');
    on('phone');
    // Set before the kit synced: not the default, and no stamp.
    setSettings({ minOnLine: 5 });
    const meta = JSON.parse(localStorage.getItem('chalk.kit.meta.v1')!);
    delete meta.at.rules;
    localStorage.setItem('chalk.kit.meta.v1', JSON.stringify(meta));
    await syncKit('u1');
    expect((cloud.docs.get('teams/u1/kit/rules') as { value: { minOnLine: number } }).value.minOnLine).toBe(5);
    on('tablet');
    setSettings({ minOnLine: 4 });
    const m2 = JSON.parse(localStorage.getItem('chalk.kit.meta.v1') ?? '{}');
    if (m2.at) delete m2.at.rules;
    localStorage.setItem('chalk.kit.meta.v1', JSON.stringify(m2));
    await syncKit('u1');
    expect(getSettings().minOnLine).toBe(5);
  });

  it('the newer edit wins', async () => {
    on('phone');
    setSettings({ minOnLine: 5 });
    await syncKit('u1');
    on('tablet');
    await syncKit('u1');
    expect(getSettings().minOnLine).toBe(5);
    later();
    setSettings({ minOnLine: 4 });
    await syncKit('u1');
    on('phone');
    await syncKit('u1');
    expect(getSettings().minOnLine).toBe(4);
  });
});

describe('the depth chart', () => {
  it('goes across whole, and an empty one never wins', async () => {
    on('phone');
    writeDepth({ RB: [22, 5] });
    await syncKit('u1');
    on('tablet');
    await syncKit('u1');
    expect(readDepth()).toEqual({ RB: [22, 5] });
  });
});

describe('mergeList', () => {
  it('is a union by id, newest stamp wins, deletions only over older copies', () => {
    const out = mergeList(
      [kid('a', 1, 'mine'), kid('b', 2)],
      { stamps: { a: 5, b: 1 }, deleted: { c: 9 } },
      { items: [kid('a', 1, 'theirs'), kid('c', 3), kid('d', 4)], stamps: { a: 3, c: 2, d: 1 }, deleted: { b: 2 } },
    );
    expect(out.items.map((x) => `${x.id}:${x.name}`).sort()).toEqual(['a:mine', 'd:d']);
    expect(out.meta.deleted).toEqual({ b: 2, c: 9 });
  });
});
