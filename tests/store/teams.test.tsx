import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Play } from '../../src/domain/types';
import { play } from '../fixtures/plays';
import { current, makeCloud, teamPath, type FakeCloud } from './fakeFirestore';

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
import { readLocal } from '../../src/store/sync';
import {
  createInvite,
  joinTeam,
  leaveTeam,
  readInvite,
  removeMember,
  type Invite,
} from '../../src/store/teams';
import { usePlaybook } from '../../src/store/usePlaybook';
import { useTeamBook } from '../../src/store/useTeamBook';
import { useTeams } from '../../src/store/useTeams';

let cloud: FakeCloud;
const p = (id: string, updatedAt = 1000, over: Partial<Play> = {}) => play({ id, updatedAt, ...over });
const ids = (plays: Play[]) => plays.map((x) => x.id).sort();
const playsIn = (team: string) =>
  [...cloud.docs.keys()]
    .filter((k) => k.startsWith(`${teamPath(team)}/plays/`) && k.split('/').length === 4)
    .map((k) => k.split('/')[3])
    .sort();

// Longer than the other sync suites: two books reconcile side by side here.
const settle = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(5);
    }
  });
const autosave = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await settle();
};
const front = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await settle();
};

/** A head coach's team, in the cloud, with this coach on it. */
function headCoach(plays: Play[] = [p('h1', 500, { name: 'Power' }), p('h2', 600)]) {
  cloud.docs.set(teamPath('boss'), {
    name: 'Eagles',
    ownerUid: 'boss',
    members: { boss: 'owner', u1: 'coach' },
    names: { u1: 'Sam' },
    books: [],
    sections: [],
    purged: {},
    schema: 2,
  });
  for (const x of plays) cloud.docs.set(`${teamPath('boss')}/plays/${x.id}`, { ...x });
  cloud.docs.set('users/u1/teams/boss', { name: 'Eagles', joinedAt: 1 });
}

/** This coach's own book, already on the per-play cloud. */
function ownTeam(plays: Play[] = [p('m1', 700, { name: 'Mine' })]) {
  cloud.docs.set(teamPath('u1'), { name: 'My team', members: { u1: 'owner' }, books: [], sections: [], purged: {}, schema: 2 });
  for (const x of plays) cloud.docs.set(`${teamPath('u1')}/plays/${x.id}`, { ...x });
}

/** What App does: the coach's own book always, and a team's when one is open. */
const app = async (uid = 'u1') => {
  const hook = renderHook(() => {
    const own = usePlaybook();
    const teams = useTeams(own.uid);
    const team = useTeamBook(teams.open?.teamId ?? null, own.uid, teams.removed);
    return { own, teams, team };
  });
  await settle();
  act(() => auth.listener?.(uid));
  await settle();
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
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a team somebody else owns', () => {
  it('is offered once joined, and opens with its own plays', async () => {
    ownTeam();
    headCoach();
    const r = await app();
    expect(r.current.teams.joined.map((t) => t.name)).toEqual(['Eagles']);
    act(() => r.current.teams.openTeam({ teamId: 'boss', name: 'Eagles' }));
    await settle();
    expect(ids(r.current.team.plays)).toEqual(['h1', 'h2']);
    expect(ids(r.current.own.plays)).toEqual(['m1']);
  });

  it('never puts its plays into the coach’s own book, on the device or in the cloud', async () => {
    ownTeam();
    headCoach();
    const r = await app();
    act(() => r.current.teams.openTeam({ teamId: 'boss', name: 'Eagles' }));
    await settle();
    act(() => r.current.team.savePlay(p('drawn-for-boss', 2000)));
    await autosave();
    expect(playsIn('boss')).toEqual(['drawn-for-boss', 'h1', 'h2']);
    expect(playsIn('u1')).toEqual(['m1']);
    expect(ids(readLocal().plays)).toEqual(['m1']);
    expect(ids(r.current.own.plays)).toEqual(['m1']);
  });

  it('leaves the coach’s own book syncing as before while it is open', async () => {
    ownTeam();
    headCoach();
    const r = await app();
    act(() => r.current.teams.openTeam({ teamId: 'boss', name: 'Eagles' }));
    await settle();
    act(() => r.current.own.savePlay(p('m2', 3000)));
    await autosave();
    expect(playsIn('u1')).toEqual(['m1', 'm2']);
    expect(playsIn('boss')).toEqual(['h1', 'h2']);
  });

  it('brings down what the head coach drew, when the app comes back to the front', async () => {
    headCoach();
    /*
     * The team's book alone. With the coach's own beside it both pull on the
     * same event, and two concurrent imports of a `vi.mock`ed module hand one
     * of them the real Firebase — the trap the Firestore alias exists for.
     */
    const r = renderHook(() => useTeamBook('boss', 'u1')).result;
    await settle();
    expect(ids(r.current.plays)).toEqual(['h1', 'h2']);
    cloud.docs.set(`${teamPath('boss')}/plays/h3`, { ...p('h3', Date.now() + 1, { name: 'New one' }) });
    await front();
    expect(ids(r.current.plays)).toEqual(['h1', 'h2', 'h3']);
    expect(readLocal().plays).toEqual([]);
  });

  it('keeps each book where it was when switching back and forth', async () => {
    ownTeam();
    headCoach();
    const r = await app();
    act(() => r.current.teams.openTeam({ teamId: 'boss', name: 'Eagles' }));
    await settle();
    act(() => r.current.team.savePlay(p('offline-edit', 2000)));
    act(() => r.current.teams.openTeam(null));
    await settle();
    act(() => r.current.teams.openTeam({ teamId: 'boss', name: 'Eagles' }));
    await settle();
    expect(ids(r.current.team.plays)).toEqual(['h1', 'h2', 'offline-edit']);
  });

  it('pushes nothing until it has been read this session', async () => {
    ownTeam();
    headCoach();
    cloud.failWith = { code: 'unavailable', message: 'offline' };
    const r = await app();
    act(() => r.current.teams.openTeam({ teamId: 'boss', name: 'Eagles' }));
    await settle();
    const writes = cloud.writes.length;
    act(() => r.current.team.savePlay(p('x', 2000)));
    await autosave();
    expect(cloud.writes.length).toBe(writes);
  });

  it('goes back to the coach’s own book when the owner takes them off', async () => {
    ownTeam();
    headCoach();
    const r = await app();
    act(() => r.current.teams.openTeam({ teamId: 'boss', name: 'Eagles' }));
    await settle();
    // What the rules answer once `u1` is off the members map.
    cloud.deny = (path) => path.startsWith('teams/boss');
    await front();
    expect(r.current.teams.open).toBeNull();
    expect(r.current.teams.joined).toEqual([]);
    expect(cloud.docs.has('users/u1/teams/boss')).toBe(false);
    expect(ids(r.current.own.plays)).toEqual(['m1']);
  });

  it('refuses a restore, which is the owner’s call to make', async () => {
    ownTeam();
    headCoach();
    const r = await app();
    act(() => r.current.teams.openTeam({ teamId: 'boss', name: 'Eagles' }));
    await settle();
    expect(() => r.current.team.importJson('{}')).toThrow(/your own playbook/);
    expect(playsIn('boss')).toEqual(['h1', 'h2']);
  });

  it('empties its trash out of the team’s cloud, not the coach’s', async () => {
    ownTeam([p('m1', 700), p('h1', 700)]);
    headCoach();
    const r = await app();
    act(() => r.current.teams.openTeam({ teamId: 'boss', name: 'Eagles' }));
    await settle();
    act(() => r.current.team.deletePlay('h1'));
    await autosave();
    act(() => r.current.team.emptyTrash());
    await settle();
    expect(playsIn('boss')).toEqual(['h2']);
    // A play with the same id in the coach's own book is a different play.
    expect(playsIn('u1')).toEqual(['h1', 'm1']);
  });
});

describe('leaving', () => {
  it('takes the coach off, forgets the team, and drops its copy from the device', async () => {
    ownTeam();
    headCoach();
    const r = await app();
    act(() => r.current.teams.openTeam({ teamId: 'boss', name: 'Eagles' }));
    await settle();
    await act(async () => {
      await r.current.teams.leave('boss');
    });
    await settle();
    expect(r.current.teams.open).toBeNull();
    expect((cloud.docs.get(teamPath('boss'))!.members as Record<string, string>).u1).toBeUndefined();
    expect(cloud.docs.has('users/u1/teams/boss')).toBe(false);
    expect(localStorage.getItem('chalk.team.boss.v1')).toBeNull();
    expect(playsIn('boss')).toEqual(['h1', 'h2']);
  });
});

describe('invites', () => {
  it('are refused for a book not yet on the team cloud', async () => {
    const made = await createInvite('u1', 'Eagles');
    expect(made.ok).toBe(false);
  });

  it('name the team, offer coach, and run out', async () => {
    ownTeam();
    const made = await createInvite('u1', 'Hawks');
    expect(made.ok).toBe(true);
    const inv = (made as { value: Invite }).value;
    expect(inv.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(cloud.docs.get(`invites/${inv.code}`)).toMatchObject({ teamId: 'u1', teamName: 'Hawks', role: 'coach', createdBy: 'u1' });
    expect(cloud.docs.get(teamPath('u1'))).toMatchObject({ name: 'Hawks' });
    expect((await readInvite(inv.code)).ok).toBe(true);
    vi.setSystemTime(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const late = await readInvite(inv.code);
    expect(late.ok).toBe(false);
  });

  it('put the joiner on the team under their own name, and on their own list', async () => {
    ownTeam();
    const inv = ((await createInvite('u1', 'Hawks')) as { value: Invite }).value;
    const joined = await joinTeam('pal', inv, 'Pat');
    expect(joined.ok).toBe(true);
    expect(cloud.docs.get(teamPath('u1'))).toMatchObject({
      members: { u1: 'owner', pal: 'coach' },
      names: { pal: 'Pat' },
      joinedWith: inv.code,
    });
    expect(cloud.docs.get('users/pal/teams/u1')).toMatchObject({ name: 'Hawks' });
  });

  it('cannot be used on the coach’s own team', async () => {
    ownTeam();
    const inv = ((await createInvite('u1', 'Hawks')) as { value: Invite }).value;
    expect((await joinTeam('u1', inv, 'Me')).ok).toBe(false);
  });

  it('leave the owner able to take a coach off again', async () => {
    ownTeam();
    const inv = ((await createInvite('u1', 'Hawks')) as { value: Invite }).value;
    await joinTeam('pal', inv, 'Pat');
    expect((await removeMember('u1', 'pal')).ok).toBe(true);
    expect(cloud.docs.get(teamPath('u1'))).toMatchObject({ members: { u1: 'owner' }, names: {} });
    expect((await removeMember('u1', 'u1')).ok).toBe(false);
  });

  it('let a coach leave a team that has already let them go', async () => {
    cloud.docs.set('users/pal/teams/u1', { name: 'Hawks' });
    cloud.deny = (path) => path === teamPath('u1');
    expect((await leaveTeam('pal', 'u1')).ok).toBe(true);
    expect(cloud.docs.has('users/pal/teams/u1')).toBe(false);
  });
});

describe('a viewer', () => {
  it('gets an invite that says so, and joins as one', async () => {
    ownTeam();
    const inv = ((await createInvite('u1', 'Hawks', 'viewer')) as { value: Invite }).value;
    expect(inv.role).toBe('viewer');
    const joined = await joinTeam('kid', inv, 'Jo');
    expect(joined.ok && joined.value.role).toBe('viewer');
    expect(cloud.docs.get(teamPath('u1'))).toMatchObject({ members: { kid: 'viewer' } });
    expect(cloud.docs.get('users/kid/teams/u1')).toMatchObject({ role: 'viewer' });
  });

  it('reads the team’s book and sends nothing back up', async () => {
    headCoach();
    const r = renderHook(() => useTeamBook('boss', 'u1', undefined, true)).result;
    await settle();
    expect(ids(r.current.plays)).toEqual(['h1', 'h2']);
    const writes = cloud.writes.length;
    act(() => r.current.savePlay(p('x', 5000)));
    await autosave();
    await act(async () => {
      await r.current.saveNow();
    });
    expect(cloud.writes.length).toBe(writes);
  });
});
