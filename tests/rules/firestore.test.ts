/**
 * The rules, run against the Firestore emulator. `npm run test:rules`.
 *
 * These are what the notes used to say had only been reasoned about. Every case
 * here is a way a coach's playbook could be read or changed by somebody who
 * should not, or a write the app makes every day that must keep working.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const CODE = 'abcdefghijklmnopqrstuv';
const DAY = 24 * 60 * 60 * 1000;

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

/** Lay down the world without the rules in the way. */
const seed = (fn: (db: ReturnType<typeof as>) => Promise<unknown>) =>
  env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()) as Promise<void>);

const ownTeam = (members: Record<string, string> = { owner: 'owner' }) =>
  seed((db) =>
    setDoc(doc(db, 'teams/owner'), {
      name: 'Eagles',
      ownerUid: 'owner',
      members,
      names: Object.fromEntries(Object.keys(members).map((k) => [k, k])),
      books: [],
      sections: [],
      purged: {},
    }),
  );
const invite = (over: Record<string, unknown> = {}) =>
  seed((db) =>
    setDoc(doc(db, `invites/${CODE}`), {
      teamId: 'owner',
      teamName: 'Eagles',
      role: 'coach',
      createdBy: 'owner',
      expiresAt: Date.now() + 7 * DAY,
      ...over,
    }),
  );
const join = (uid: string, over: Record<string, unknown> = {}) =>
  updateDoc(doc(as(uid), 'teams/owner'), {
    [`members.${uid}`]: 'coach',
    [`names.${uid}`]: 'Assistant',
    joinedWith: CODE,
    updatedAt: Date.now(),
    ...over,
  });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-chalk',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

describe('a coach’s own things', () => {
  it('lets the owner make their team, and nobody else make it for them', async () => {
    await assertFails(setDoc(doc(as('intruder'), 'teams/owner'), { members: { intruder: 'owner' } }));
    await assertSucceeds(setDoc(doc(as('owner'), 'teams/owner'), { members: { owner: 'owner' }, books: [] }));
  });

  it('refuses a new team that already has somebody else on it', async () => {
    await assertFails(setDoc(doc(as('owner'), 'teams/owner'), { members: { owner: 'owner', pal: 'coach' } }));
  });

  it('keeps the per-play sync working exactly as it does today', async () => {
    await ownTeam();
    const db = as('owner');
    await assertSucceeds(setDoc(doc(db, 'teams/owner/plays/p1'), { name: 'Sweep', updatedAt: 1 }));
    await assertSucceeds(setDoc(doc(db, 'teams/owner/plays/p1/revisions/1'), { play: {}, savedAt: 1 }));
    await assertSucceeds(setDoc(doc(db, 'teams/owner'), { books: [], sections: [], updatedAt: 2 }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, 'teams/owner/purged/p1'), { play: {}, purgedAt: 3 }));
    await assertSucceeds(deleteDoc(doc(db, 'teams/owner/plays/p1')));
    await assertSucceeds(getDocs(collection(db, 'teams/owner/plays')));
  });

  it('keeps the single-document playbook the owner’s alone', async () => {
    await assertSucceeds(setDoc(doc(as('owner'), 'users/owner/playbook/main'), { plays: [] }));
    await assertFails(getDoc(doc(as('pal'), 'users/owner/playbook/main')));
    await assertFails(getDoc(doc(as(null), 'users/owner/playbook/main')));
  });

  it('shows a team to nobody who is not on it', async () => {
    await ownTeam();
    await seed((db) => setDoc(doc(db, 'teams/owner/plays/p1'), { name: 'Sweep' }));
    await assertFails(getDoc(doc(as('stranger'), 'teams/owner')));
    await assertFails(getDoc(doc(as('stranger'), 'teams/owner/plays/p1')));
    await assertFails(getDocs(collection(as('stranger'), 'teams/owner/plays')));
    await assertFails(setDoc(doc(as('stranger'), 'teams/owner/plays/p2'), { name: 'Mine now' }));
    await assertFails(getDoc(doc(as(null), 'teams/owner/plays/p1')));
  });

  it('answers a team nobody has made yet with a refusal, not an empty book, for anybody but its owner', async () => {
    await assertFails(getDoc(doc(as('stranger'), 'teams/owner')));
    await assertSucceeds(getDoc(doc(as('owner'), 'teams/owner')));
  });
});

describe('what a play may be', () => {
  it('takes a full-sized play', async () => {
    await ownTeam();
    const play = {
      name: 'Trips Right 26 Power',
      players: Array.from({ length: 22 }, (_, i) => ({ id: `m${i}`, x: i, y: 1 })),
      assignments: Array.from({ length: 40 }, (_, i) => ({ id: `a${i}` })),
      annotations: Array.from({ length: 200 }, () => ({ points: [{ x: 0, y: 0 }] })),
      frames: [{}, {}, {}],
      notes: 'x'.repeat(5000),
      updatedAt: 1,
    };
    await assertSucceeds(setDoc(doc(as('owner'), 'teams/owner/plays/p1'), play));
  });

  it('refuses one stuffed past any play a coach could draw', async () => {
    await ownTeam();
    const db = as('owner');
    await assertFails(setDoc(doc(db, 'teams/owner/plays/p1'), { players: Array.from({ length: 101 }, () => ({})) }));
    await assertFails(setDoc(doc(db, 'teams/owner/plays/p1'), { notes: 'x'.repeat(50001) }));
    await assertFails(setDoc(doc(db, 'teams/owner/plays/p1'), { annotations: Array.from({ length: 3001 }, () => ({})) }));
  });

  it('still lets a stuffed play be deleted', async () => {
    await ownTeam();
    await seed((db) => setDoc(doc(db, 'teams/owner/plays/p1'), { players: Array.from({ length: 150 }, () => ({})) }));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'teams/owner/plays/p1')));
  });

  it('allows no collection under a team but the three the app uses', async () => {
    await ownTeam();
    await assertFails(setDoc(doc(as('owner'), 'teams/owner/anything/x'), { a: 1 }));
  });
});

describe('invites', () => {
  it('can only be made by a team’s owner, for that team, to coach', async () => {
    const good = { teamId: 'owner', teamName: 'Eagles', role: 'coach', createdBy: 'owner', expiresAt: Date.now() + DAY };
    await assertFails(setDoc(doc(as('pal'), `invites/${CODE}`), { ...good, createdBy: 'pal' }));
    await assertFails(setDoc(doc(as('owner'), `invites/${CODE}`), { ...good, role: 'owner' }));
    await assertFails(setDoc(doc(as('owner'), 'invites/short'), good));
    await assertSucceeds(setDoc(doc(as('owner'), `invites/${CODE}`), good));
  });

  it('can be read by its code but never listed', async () => {
    await invite();
    await assertSucceeds(getDoc(doc(as('pal'), `invites/${CODE}`)));
    await assertFails(getDocs(collection(as('pal'), 'invites')));
  });

  it('can be taken down by the owner and nobody else', async () => {
    await invite();
    await assertFails(deleteDoc(doc(as('pal'), `invites/${CODE}`)));
    await assertSucceeds(deleteDoc(doc(as('owner'), `invites/${CODE}`)));
  });

  it('cannot be changed to point at somebody else’s team', async () => {
    await invite();
    await assertFails(updateDoc(doc(as('owner'), `invites/${CODE}`), { teamId: 'other' }));
  });
});

describe('joining a team', () => {
  it('lets somebody with a live invite add themselves as a coach', async () => {
    await ownTeam();
    await invite();
    await assertSucceeds(join('pal'));
    await assertSucceeds(getDoc(doc(as('pal'), 'teams/owner')));
    await assertSucceeds(setDoc(doc(as('pal'), 'teams/owner/plays/p1'), { name: 'Counter', updatedAt: 1 }));
  });

  it('refuses without an invite, with an expired one, or with one for another team', async () => {
    await ownTeam();
    await assertFails(join('pal'));
    await invite({ expiresAt: Date.now() - 1 });
    await assertFails(join('pal'));
    await invite({ teamId: 'other' });
    await assertFails(join('pal'));
  });

  it('refuses a joiner who makes themselves the owner', async () => {
    await ownTeam();
    await invite();
    await assertFails(join('pal', { 'members.pal': 'owner' }));
  });

  it('refuses a joiner who adds anybody else, or touches anything but their own entry', async () => {
    await ownTeam();
    await invite();
    await assertFails(join('pal', { 'members.friend': 'coach' }));
    await assertFails(join('pal', { 'names.owner': 'Fired' }));
    await assertFails(join('pal', { books: [{ id: 'b1', name: 'Mine' }] }));
    await assertFails(join('pal', { ownerUid: 'pal' }));
  });
});

describe('a coach on somebody else’s team', () => {
  beforeEach(async () => {
    await ownTeam({ owner: 'owner', pal: 'coach', friend: 'coach' });
  });

  it('can edit the playbook, the folders and the trash', async () => {
    const db = as('pal');
    await assertSucceeds(setDoc(doc(db, 'teams/owner/plays/p1'), { name: 'Trap', updatedAt: 1 }));
    await assertSucceeds(setDoc(doc(db, 'teams/owner'), { books: [], sections: [{ id: 's' }], updatedAt: 2 }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, 'teams/owner'), { purged: { p1: 3 }, updatedAt: 3 }, { merge: true }));
  });

  it('cannot add anybody, promote themselves, or take the team over', async () => {
    const db = as('pal');
    await assertFails(updateDoc(doc(db, 'teams/owner'), { 'members.stranger': 'coach' }));
    await assertFails(updateDoc(doc(db, 'teams/owner'), { 'members.pal': 'owner' }));
    await assertFails(updateDoc(doc(db, 'teams/owner'), { ownerUid: 'pal' }));
    await assertFails(updateDoc(doc(db, 'teams/owner'), { 'names.owner': 'Somebody' }));
    await assertFails(deleteDoc(doc(db, 'teams/owner')));
  });

  it('cannot take another coach off', async () => {
    await assertFails(
      updateDoc(doc(as('pal'), 'teams/owner'), { 'members.friend': deleteField(), 'names.friend': deleteField() }),
    );
  });

  it('can take themselves off, and is out from then on', async () => {
    const db = as('pal');
    await assertSucceeds(
      updateDoc(doc(db, 'teams/owner'), { 'members.pal': deleteField(), 'names.pal': deleteField(), updatedAt: 4 }),
    );
    await assertFails(getDoc(doc(db, 'teams/owner')));
    await assertFails(setDoc(doc(db, 'teams/owner/plays/p9'), { name: 'Back door' }));
  });

  it('is out the moment the owner takes them off', async () => {
    await assertSucceeds(
      updateDoc(doc(as('owner'), 'teams/owner'), { 'members.pal': deleteField(), 'names.pal': deleteField() }),
    );
    await assertFails(getDoc(doc(as('pal'), 'teams/owner/plays/p1')));
    await assertSucceeds(getDoc(doc(as('friend'), 'teams/owner')));
  });

  it('cannot make invites for the team', async () => {
    await assertFails(
      setDoc(doc(as('pal'), `invites/${CODE}`), {
        teamId: 'owner',
        role: 'coach',
        createdBy: 'pal',
        expiresAt: Date.now() + DAY,
      }),
    );
  });

  it('keeps a list of their teams under their own uid, which nobody else can read', async () => {
    await assertSucceeds(setDoc(doc(as('pal'), 'users/pal/teams/owner'), { name: 'Eagles', joinedAt: 1 }));
    await assertFails(getDoc(doc(as('owner'), 'users/pal/teams/owner')));
  });
});

describe('share links', () => {
  it('still open for anybody, and change only for whoever made them', async () => {
    await assertSucceeds(setDoc(doc(as('owner'), `shares/${CODE}`), { ownerUid: 'owner', plays: [] }));
    await assertSucceeds(getDoc(doc(as(null), `shares/${CODE}`)));
    await assertFails(getDocs(collection(as(null), 'shares')));
    await assertFails(setDoc(doc(as('pal'), `shares/${CODE}`), { ownerUid: 'pal', plays: [] }));
    await assertFails(deleteDoc(doc(as('pal'), `shares/${CODE}`)));
  });
});
