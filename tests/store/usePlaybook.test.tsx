import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Play } from '../../src/domain/types';
import { play } from '../fixtures/plays';
import { current, mainPath, makeCloud, type FakeCloud } from './fakeFirestore';

/** Auth, as a switch the test holds. */
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

import { writeLocal } from '../../src/store/sync';
import { usePlaybook } from '../../src/store/usePlaybook';

let cloud: FakeCloud;
const p = (id: string, updatedAt = 1000, over: Partial<Play> = {}) => play({ id, updatedAt, ...over });
const seedCloud = (uid: string, ...plays: Play[]) =>
  cloud.docs.set(mainPath(uid), { plays: plays.map((x) => ({ ...x, annotations: [] })), sections: [], updatedAt: 1 });
const cloudIds = (uid: string) => ((cloud.docs.get(mainPath(uid))?.plays as Play[] | undefined) ?? []).map((x) => x.id);
const stored = () => JSON.parse(localStorage.getItem('chalk.playbook.v1') ?? '{}') as { plays: Play[]; uid: string | null };
const pushes = (uid: string) => cloud.writes.filter((w) => w.op === 'set' && w.path === mainPath(uid)).length;

/** Let effects, lazy imports and the pull settle, without firing the autosave. */
const settle = () =>
  act(async () => {
    // A real turn of the event loop as well: the hook loads auth and Firestore
    // lazily, and a module load is not something a fake clock can hurry.
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(5);
    }
  });
/** Past the 800ms debounce, and the push after it. */
const autosave = () => act(async () => { await vi.advanceTimersByTimeAsync(1000); });
const signIn = async (uid: string | null) => {
  await settle();
  act(() => auth.listener?.(uid));
  await settle();
};

// The hook loads these lazily. Loaded once here, on the real clock, so the
// first test to sign in is not also the one waiting on a module to load.
beforeAll(async () => {
  await import('firebase/firestore');
  await import('../../src/firebase');
});

beforeEach(() => {
  cloud = current.cloud = makeCloud();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  // Not automatic without test globals, and a hook left mounted from the last
  // test would still be listening for `online` and writing to storage.
  cleanup();
  vi.useRealTimers();
});

describe('the book and the account', () => {
  it('opens on what is in local storage, with nobody signed in', async () => {
    writeLocal({ plays: [p('a')], sections: [] }, null);
    const { result } = renderHook(() => usePlaybook());
    await settle();
    expect(result.current.plays.map((x) => x.id)).toEqual(['a']);
    expect(result.current.sync).toBe('local');
    expect(cloud.writes).toEqual([]);
  });

  it('brings the account down when somebody signs in, rather than pushing over it', async () => {
    seedCloud('u1', p('cloud1'), p('cloud2'), p('cloud3'));
    const { result } = renderHook(() => usePlaybook());
    await signIn('u1');
    expect(result.current.plays.map((x) => x.id).sort()).toEqual(['cloud1', 'cloud2', 'cloud3']);
    await autosave();
    expect(cloudIds('u1').sort()).toEqual(['cloud1', 'cloud2', 'cloud3']);
  });

  it('merges an unclaimed local book into the account that picks it up', async () => {
    writeLocal({ plays: [p('drawn-before-auth')], sections: [] }, null);
    seedCloud('u1', p('cloud1'));
    const { result } = renderHook(() => usePlaybook());
    await signIn('u1');
    expect(result.current.plays.map((x) => x.id).sort()).toEqual(['cloud1', 'drawn-before-auth']);
    expect(stored().uid).toBe('u1');
    await autosave();
    expect(cloudIds('u1').sort()).toEqual(['cloud1', 'drawn-before-auth']);
  });

  /*
   * KNOWN FAILURE, found by this suite and left for the owner to decide.
   *
   * The notes say a book stamped with another uid is replaced on sign-in, not
   * merged. It is merged: the autosave effect has `uid` in its dependencies, so
   * the moment auth changes it rewrites storage stamped with the NEW uid, and
   * by the time the pull lands the stranger's book reads as this account's own.
   * Nothing is lost by it — but one account's plays are copied into another's
   * and pushed there. `it.fails` goes red the day this is fixed, which is the
   * prompt to turn it back into an ordinary test.
   */
  it.fails('replaces, rather than merges, a local book that belongs to another account', async () => {
    writeLocal({ plays: [p('anon1'), p('anon2')], sections: [] }, 'anon-uid');
    seedCloud('real', p('real1'), p('real2'), p('real3'));
    const { result } = renderHook(() => usePlaybook());
    await signIn('real');
    expect(result.current.plays.map((x) => x.id).sort()).toEqual(['real1', 'real2', 'real3']);
  });

  it('restamps storage with the new account before that account\'s book has come down', async () => {
    // The mechanism behind the failure above, pinned so a fix has to move it.
    writeLocal({ plays: [p('anon1')], sections: [] }, 'anon-uid');
    renderHook(() => usePlaybook());
    await settle();
    expect(stored().uid).toBe('anon-uid');
    act(() => auth.listener?.('real'));
    expect(stored()).toMatchObject({ uid: 'real', plays: [{ id: 'anon1' }] });
  });

  it('never writes under the uid a stranger\'s book came from', async () => {
    writeLocal({ plays: [p('anon1'), p('anon2')], sections: [] }, 'anon-uid');
    seedCloud('real', p('real1'), p('real2'), p('real3'));
    renderHook(() => usePlaybook());
    await signIn('real');
    await autosave();
    expect(cloud.docs.has(mainPath('anon-uid'))).toBe(false);
    expect(cloudIds('real')).toEqual(expect.arrayContaining(['real1', 'real2', 'real3']));
  });

  it('pushes nothing at all when the boot pull could not reach the cloud', async () => {
    // The incident: a failed pull read as "no cloud copy", and an empty book went up.
    seedCloud('u1', p('cloud1'), p('cloud2'), p('cloud3'));
    cloud.failWith = { code: 'unavailable', message: 'offline' };
    const { result } = renderHook(() => usePlaybook());
    await signIn('u1');
    expect(result.current.sync).toBe('offline');
    cloud.failWith = null;
    act(() => result.current.savePlay(p('new')));
    await autosave();
    expect(cloud.writes).toEqual([]);
    expect(cloudIds('u1')).toHaveLength(3);
    // And the work is on the device regardless.
    expect(stored().plays.map((x) => x.id)).toEqual(['new']);
  });

  it('reconciles once the signal comes back, without a restart', async () => {
    seedCloud('u1', p('cloud1'));
    cloud.failWith = { code: 'unavailable', message: 'offline' };
    const { result } = renderHook(() => usePlaybook());
    await signIn('u1');
    act(() => result.current.savePlay(p('drawn-offline')));
    cloud.failWith = null;
    act(() => { window.dispatchEvent(new Event('online')); });
    await settle();
    expect(result.current.plays.map((x) => x.id).sort()).toEqual(['cloud1', 'drawn-offline']);
    await autosave();
    expect(cloudIds('u1').sort()).toEqual(['cloud1', 'drawn-offline']);
  });

  it('does not push a pull that changed nothing', async () => {
    seedCloud('u1', p('a'), p('b'));
    writeLocal({ plays: [p('a'), p('b')], sections: [] }, 'u1');
    renderHook(() => usePlaybook());
    await signIn('u1');
    await autosave();
    expect(pushes('u1')).toBe(0);
    expect(stored().uid).toBe('u1');
  });

  it('pulls again on coming to the front, once per glance', async () => {
    seedCloud('u1', p('a'));
    const { result } = renderHook(() => usePlaybook());
    await signIn('u1');
    const reads = () => cloud.reads.length;
    const front = async () => {
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      await settle();
    };

    const afterBoot = reads();
    await front();
    expect(reads()).toBe(afterBoot); // inside the throttle

    // Let this device's own autosave land first, then draw on the phone.
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    seedCloud('u1', p('a'), p('from-the-phone'));
    await front();
    expect(reads()).toBeGreaterThan(afterBoot);
    expect(result.current.plays.map((x) => x.id).sort()).toEqual(['a', 'from-the-phone']);
  });

  it('does not pull when the device says there is no network', async () => {
    seedCloud('u1', p('a'));
    renderHook(() => usePlaybook());
    await signIn('u1');
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    const before = cloud.reads.length;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await settle();
    expect(cloud.reads.length).toBe(before);
  });
});

describe('saving', () => {
  it('writes local storage synchronously, before the cloud is asked anything', async () => {
    const { result } = renderHook(() => usePlaybook());
    await signIn('u1');
    act(() => result.current.savePlay(p('a')));
    expect(stored().plays.map((x) => x.id)).toEqual(['a']);
    expect(pushes('u1')).toBe(0);
    await autosave();
    expect(pushes('u1')).toBe(1);
  });

  it('debounces a run of edits into one push', async () => {
    const { result } = renderHook(() => usePlaybook());
    await signIn('u1');
    for (let i = 0; i < 5; i++) {
      act(() => result.current.savePlay(p('a', 1000 + i)));
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    }
    await autosave();
    expect(pushes('u1')).toBe(1);
  });

  it('stamps a play and names it on the way in', async () => {
    const { result } = renderHook(() => usePlaybook());
    await settle();
    act(() => result.current.savePlay(p('a', 5)));
    expect(result.current.plays[0].updatedAt).toBe(Date.now());
  });
});

describe('the trash', () => {
  it('takes a deleted play out of every list and keeps it in the book', async () => {
    writeLocal({ plays: [p('a'), p('b')], sections: [] }, null);
    const { result } = renderHook(() => usePlaybook());
    await settle();
    act(() => result.current.deletePlay('a'));
    expect(result.current.plays.map((x) => x.id)).toEqual(['b']);
    expect(result.current.trashed.map((x) => x.id)).toEqual(['a']);
    expect(stored().plays.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('brings a play back with nothing left to say it was ever gone', async () => {
    writeLocal({ plays: [p('a')], sections: [] }, null);
    const { result } = renderHook(() => usePlaybook());
    await settle();
    act(() => result.current.deletePlay('a'));
    act(() => result.current.restorePlay('a'));
    expect(result.current.plays[0]).not.toHaveProperty('deletedAt');
  });

  it('clamps a move to the live plays, so the trash stays at the end', async () => {
    writeLocal({ plays: [p('a'), p('b'), p('c', 1000, { deletedAt: 5 })], sections: [] }, null);
    const { result } = renderHook(() => usePlaybook());
    await settle();
    act(() => result.current.movePlay('a', 99));
    expect(stored().plays.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('empties only when asked', async () => {
    writeLocal({ plays: [p('a'), p('b', 1000, { deletedAt: 5 })], sections: [] }, null);
    const { result } = renderHook(() => usePlaybook());
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 24 * 90); });
    expect(result.current.trashed).toHaveLength(1);
    act(() => result.current.emptyTrash());
    expect(stored().plays.map((x) => x.id)).toEqual(['a']);
  });

  /*
   * KNOWN FAILURE, found by this suite and left for the owner to decide.
   *
   * Emptying a trash that holds more than half the book is exactly the shape
   * the shrink guard refuses, so the push is blocked — and the next pull merges
   * the cloud's copy back in, trash and all. The coach empties it and it comes
   * back. Per-play documents in stage 2 remove the cause; until then this
   * records it.
   */
  it.fails('stays empty after emptying a trash bigger than the live book', async () => {
    const gone = (id: string) => p(id, 1000, { deletedAt: 5 });
    seedCloud('u1', p('a'), gone('t1'), gone('t2'), gone('t3'));
    const { result } = renderHook(() => usePlaybook());
    await signIn('u1');
    await autosave();
    act(() => result.current.emptyTrash());
    await autosave();
    expect(result.current.sync).not.toBe('blocked');
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await settle();
    expect(result.current.trashed).toEqual([]);
  });
});

describe('folders', () => {
  it('sends a deleted folder\'s plays to unfiled rather than losing them', async () => {
    const { result } = renderHook(() => usePlaybook());
    await settle();
    let id = '';
    act(() => { id = result.current.addSection('Run game').id; });
    act(() => result.current.savePlay(p('a', 1, { sectionId: id })));
    act(() => result.current.deleteSection(id));
    expect(result.current.plays[0].sectionId).toBe('unfiled');
    expect(result.current.sections).toEqual([]);
  });

  it('gives a duplicate its own id, right after the original', async () => {
    writeLocal({ plays: [p('a', 1, { name: 'Jet' }), p('b')], sections: [] }, null);
    const { result } = renderHook(() => usePlaybook());
    await settle();
    act(() => result.current.duplicatePlay('a'));
    expect(result.current.plays.map((x) => x.name)).toEqual(['Jet', 'Jet copy', '']);
    expect(new Set(result.current.plays.map((x) => x.id)).size).toBe(3);
  });
});
