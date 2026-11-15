import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Play } from '../../src/domain/types';
import { play } from '../fixtures/plays';
import { current, mainPath, makeCloud, oldRules, teamPath, type FakeCloud } from './fakeFirestore';

const auth = { listener: null as ((uid: string | null) => void) | null };
vi.mock('../../src/firebase', () => ({
  db: {},
  watchUid: (fn: (uid: string | null) => void) => {
    auth.listener = fn;
    return () => {
      auth.listener = null;
    };
  },
}));

import * as cloud2 from '../../src/store/cloud2';
import { writeLocal } from '../../src/store/sync';
import { usePlaybook } from '../../src/store/usePlaybook';

let cloud: FakeCloud;
const p = (id: string, updatedAt = 1000, over: Partial<Play> = {}) => play({ id, updatedAt, ...over });
const legacy = (uid: string, plays: Play[], stamp = 1) =>
  cloud.docs.set(mainPath(uid), { plays, sections: [{ id: 's1', name: 'Run', order: 1 }], updatedAt: stamp });
const playPath = (uid: string, id: string) => `${teamPath(uid)}/plays/${id}`;
const cloudPlays = (uid: string) =>
  [...cloud.docs.keys()].filter((k) => k.startsWith(`${teamPath(uid)}/plays/`) && k.split('/').length === 4).map((k) => k.split('/')[3]).sort();
const team = (uid: string) => cloud.docs.get(teamPath(uid)) as Record<string, unknown> | undefined;
const writesTo = (prefix: string) => cloud.writes.filter((w) => w.path.startsWith(prefix)).length;
const ids = (plays: Play[]) => plays.map((x) => x.id).sort();

const settle = () =>
  act(async () => {
    for (let i = 0; i < 14; i++) {
      await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(5);
    }
  });
const autosave = async () => {
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  await settle();
};
const signIn = async (uid: string) => {
  await settle();
  act(() => auth.listener?.(uid));
  await settle();
};
const front = async () => {
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await settle();
};
const device = async (uid = 'u1') => {
  const hook = renderHook(() => usePlaybook());
  await signIn(uid);
  return hook.result;
};

beforeAll(async () => {
  await import('firebase/firestore');
  await import('../../src/firebase');
});
beforeEach(() => {
  cloud = current.cloud = makeCloud();
  cloud2.resetCloud2();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('before the new rules are published', () => {
  it('stays on the single document, and writes nothing anywhere else', async () => {
    cloud.deny = oldRules;
    legacy('u1', [p('a'), p('b'), p('c')]);
    const r = await device();
    expect(ids(r.current.plays)).toEqual(['a', 'b', 'c']);
    act(() => r.current.savePlay(p('new')));
    await autosave();
    expect((cloud.docs.get(mainPath('u1'))!.plays as Play[]).length).toBe(4);
    expect(writesTo('teams/')).toBe(0);
  });
});

describe('migrating an account', () => {
  it('copies every play, live and trashed, with its id and stamp untouched', async () => {
    const plays = [p('a', 1111), p('b', 2222, { name: 'Jet' }), p('gone', 3333, { deletedAt: 3000 })];
    legacy('u1', plays);
    await device();
    expect(cloudPlays('u1')).toEqual(['a', 'b', 'gone']);
    expect(cloud.docs.get(playPath('u1', 'b'))).toMatchObject({ id: 'b', name: 'Jet', updatedAt: 2222 });
    expect(cloud.docs.get(playPath('u1', 'gone'))).toMatchObject({ deletedAt: 3000, updatedAt: 3333 });
    expect(team('u1')).toMatchObject({ schema: 2, ownerUid: 'u1', sections: [{ id: 's1' }] });
  });

  it('never touches the old document', async () => {
    legacy('u1', [p('a'), p('b')], 77);
    const before = structuredClone(cloud.docs.get(mainPath('u1')));
    const r = await device();
    act(() => r.current.savePlay(p('new')));
    await autosave();
    expect(cloud.docs.get(mainPath('u1'))).toEqual(before);
    expect(cloud.writes.some((w) => w.path.startsWith('users/'))).toBe(false);
  });

  it('takes what is only on this device with it, and needs no old document at all', async () => {
    writeLocal({ plays: [p('local')], sections: [] }, null);
    await device();
    expect(cloudPlays('u1')).toEqual(['local']);
  });

  it('writes the team document last, so a migration cut short is simply run again', async () => {
    legacy('u1', [p('a'), p('b')]);
    await device();
    const order = cloud.writes.map((w) => w.path);
    expect(order[order.length - 1]).toBe(teamPath('u1'));
    expect(order.slice(0, -1).every((x) => x.includes('/plays/'))).toBe(true);
  });

  it('does not switch over when a play fails to arrive, and carries on with the old sync', async () => {
    legacy('u1', [p('a'), p('b'), p('c')]);
    // The play documents are refused; the team document is not.
    cloud.deny = (path) => path.includes('/plays/c');
    const r = await device();
    expect(team('u1')).toBeUndefined();
    expect(ids(r.current.plays)).toEqual(['a', 'b', 'c']);
    act(() => r.current.savePlay(p('new')));
    await autosave();
    expect((cloud.docs.get(mainPath('u1'))!.plays as Play[]).length).toBe(4);
  });

  it('is the same result run twice', async () => {
    legacy('u1', [p('a', 1111), p('b', 2222)]);
    await device();
    const once = structuredClone([...cloud.docs.entries()].filter(([k]) => k.includes('/plays/')));
    cleanup();
    cloud.docs.delete(teamPath('u1')); // as if the marker never landed
    await device();
    expect([...cloud.docs.entries()].filter(([k]) => k.includes('/plays/'))).toEqual(once);
  });

  it('still takes a play an old build writes to the old document afterwards', async () => {
    legacy('u1', [p('a')], 10);
    const r = await device();
    // A phone that has not updated yet draws a play and saves the old way.
    legacy('u1', [p('a'), p('from-old-build', 5000)], 20);
    await front();
    expect(ids(r.current.plays)).toEqual(['a', 'from-old-build']);
    await autosave();
    expect(cloudPlays('u1')).toEqual(['a', 'from-old-build']);
  });

  it('does not bring a deleted folder back out of the old document on every sync', async () => {
    legacy('u1', [p('a')], 10);
    const r = await device();
    act(() => r.current.deleteSection('s1'));
    await autosave();
    await front();
    expect(r.current.sections).toEqual([]);
  });
});

describe('one document per play', () => {
  const migrated = async (plays: Play[] = [p('a'), p('b'), p('c')]) => {
    legacy('u1', plays);
    const r = await device();
    cloud.writes.length = 0;
    cloud.reads.length = 0;
    return r;
  };

  it('sends one play when one play changes', async () => {
    const r = await migrated();
    act(() => r.current.savePlay({ ...p('b'), name: 'Renamed' }));
    await autosave();
    // The play itself, and the copy of what it replaced. No other play is touched.
    const sent = cloud.writes.filter((w) => w.path.includes('/plays/')).map((w) => w.path);
    expect(sent.filter((x) => !x.includes('/revisions/'))).toEqual([playPath('u1', 'b')]);
    expect(sent.every((x) => x.startsWith(playPath('u1', 'b')))).toBe(true);
    expect(cloud.docs.get(playPath('u1', 'b'))).toMatchObject({ name: 'Renamed' });
  });

  it('sends nothing when nothing changed', async () => {
    await migrated();
    await front();
    await autosave();
    expect(cloud.writes.filter((w) => w.path.includes('/plays/'))).toEqual([]);
  });

  it('has no size ceiling across the book: each play is its own document', async () => {
    const stroke = Array.from({ length: 400 }, (_, i) => ({ x: i * 1.0001, y: i * 1.0001, cx: i * 1.0001, cy: i * 1.0001 }));
    // Well over the megabyte one document could hold.
    const heavy = Array.from({ length: 40 }, (_, i) => p(`h${i}`, 1000, { annotations: [stroke, stroke] }));
    writeLocal({ plays: heavy, sections: [] }, null);
    const r = await device();
    expect(cloudPlays('u1')).toHaveLength(40);
    expect(r.current.sync).toBe('synced');
  });

  it('brings a play drawn on another device down, and asks only for what changed', async () => {
    const r = await migrated();
    cloud.docs.set(playPath('u1', 'phone'), { ...p('phone', Date.now() + 1000), annotations: [] });
    await front();
    expect(ids(r.current.plays)).toEqual(['a', 'b', 'c', 'phone']);
  });

  it('does not write over a newer copy another device has already sent', async () => {
    const r = await migrated();
    cloud.docs.set(playPath('u1', 'b'), { ...p('b', Date.now() + 60_000, { name: 'Phone rename' }), annotations: [] });
    act(() => r.current.savePlay({ ...p('b'), name: 'Tablet rename' }));
    await autosave();
    expect(cloud.docs.get(playPath('u1', 'b'))).toMatchObject({ name: 'Phone rename' });
  });

  it('carries a delete to another device, and a put-back after it', async () => {
    const r = await migrated();
    act(() => r.current.deletePlay('b'));
    await autosave();
    expect(cloud.docs.get(playPath('u1', 'b'))!.deletedAt).toBeGreaterThan(0);

    cleanup();
    localStorage.clear();
    const other = await device();
    expect(ids(other.current.plays)).toEqual(['a', 'c']);
    expect(ids(other.current.trashed)).toEqual(['b']);
  });

  it('keeps the copy a save replaces, and can list them', async () => {
    const r = await migrated();
    act(() => r.current.savePlay({ ...p('b'), name: 'Second' }));
    await autosave();
    const past = await r.current.revisions('b');
    expect(past).toHaveLength(1);
    expect(past[0].play).toMatchObject({ id: 'b', name: '' });
  });

  it('keeps ten revisions of a play and prunes the oldest', async () => {
    const r = await migrated();
    for (let i = 1; i <= 14; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(11 * 60 * 1000); });
      act(() => r.current.savePlay({ ...p('b'), name: `v${i}` }));
      await autosave();
    }
    expect(await r.current.revisions('b')).toHaveLength(10);
  });

  it('never deletes a play document for being left out of a save', async () => {
    const r = await migrated();
    act(() => r.current.reset());
    await autosave();
    expect(cloudPlays('u1')).toEqual(['a', 'b', 'c']);
  });
});

describe('emptying the trash', () => {
  const gone = (id: string) => p(id, 1000, { deletedAt: 5 });

  it('stays empty, however much of the book it was', async () => {
    // The shape the single document refused: most of the book going at once.
    legacy('u1', [p('a'), gone('t1'), gone('t2'), gone('t3')]);
    const r = await device();
    act(() => r.current.emptyTrash());
    await autosave();
    expect(r.current.sync).toBe('synced');
    await front();
    expect(r.current.trashed).toEqual([]);
    expect(cloudPlays('u1')).toEqual(['a']);
  });

  it('keeps a last copy of each play it removes', async () => {
    legacy('u1', [p('a'), gone('t1')]);
    const r = await device();
    act(() => r.current.emptyTrash());
    await autosave();
    expect(cloud.docs.get(`${teamPath('u1')}/purged/t1`)).toMatchObject({ play: { id: 't1' } });
  });

  it('is not undone by another device that still holds the trash', async () => {
    legacy('u1', [p('a'), gone('t1')]);
    const r = await device();
    const stale = localStorage.getItem('chalk.playbook.v1')!;
    act(() => r.current.emptyTrash());
    await autosave();

    cleanup();
    localStorage.clear();
    localStorage.setItem('chalk.playbook.v1', stale);
    const other = await device();
    await autosave();
    expect(other.current.trashed).toEqual([]);
    expect(cloudPlays('u1')).toEqual(['a']);
  });
});

describe('restoring a backup', () => {
  it('makes the cloud that book and nothing else', async () => {
    legacy('u1', [p('a'), p('b'), p('c')]);
    const r = await device();
    act(() => { r.current.importJson(JSON.stringify({ plays: [p('z', 9000)], sections: [] })); });
    await autosave();
    expect(cloudPlays('u1')).toEqual(['z']);
    await front();
    expect(ids(r.current.plays)).toEqual(['z']);
  });
});
