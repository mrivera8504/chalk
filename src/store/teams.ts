import { explain, type SyncState } from './sync';
import { newToken } from './share';

/**
 * Coaching on somebody else's team.
 *
 *   /teams/{teamId}                      `members` (uid → role) and `names` (uid → name)
 *   /invites/{code}                      a link an owner sends an assistant
 *   /users/{uid}/teams/{teamId}          the teams this coach has joined
 *
 * A coach's own team has their uid for its id, and nothing about it changes
 * here: it is still the book `usePlaybook` keeps, on the device and in the
 * cloud, exactly as before. Another coach's team is a second, separate book —
 * its own local copy, its own sync stamps — so opening it can never merge it
 * into the coach's own, which is the reason team members were left out of
 * stage 6.
 *
 * Two roles to give. A `coach` edits the playbook as the owner does. A
 * `viewer` — a player, a parent — reads the team's playbook, always the
 * newest, and changes nothing; a share link is still the way to show one play
 * to somebody with no account.
 * Nobody but the owner can add or remove anybody, and the rules — tested
 * against the emulator in `tests/rules/` — are what hold that, not this file.
 */

type Fs = typeof import('firebase/firestore');

async function open(): Promise<{ fs: Fs; db: import('firebase/firestore').Firestore }> {
  const { db } = await import('../firebase');
  const fs = await import('firebase/firestore');
  return { fs, db };
}

/** How long an invite link works for. */
export const INVITE_DAYS = 14;

export type Role = 'owner' | 'coach' | 'viewer';

export interface Invite {
  code: string;
  teamId: string;
  teamName: string;
  role: 'coach' | 'viewer';
  createdBy: string;
  expiresAt: number;
}

export interface Member {
  uid: string;
  name: string;
  role: Role;
}

/** A team this coach has joined, as remembered under their own uid. */
export interface JoinedTeam {
  teamId: string;
  name: string;
  joinedAt: number;
  /** Absent on a team joined before there were viewers: a coach. */
  role?: 'coach' | 'viewer';
}

export function inviteUrl(code: string): string {
  return `${location.origin}/j/${code}`;
}

/** A code as it appears in a link, or null for anything that is not one. */
export function asInviteCode(s: string): string | null {
  return /^[A-Za-z0-9_-]{20,40}$/.test(s) ? s : null;
}

/** Say why, in words a coach can do something about. */
function why(err: unknown, denied: string): string {
  const state: SyncState = explain(err);
  if (state === 'denied') return denied;
  if (state === 'offline') return 'No connection. Try again once you have signal.';
  return 'Something went wrong talking to the cloud. Try again in a moment.';
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Make a link that lets one more coach onto this coach's own team.
 *
 * The team has to be in the per-play shape first — that is what a member
 * reads and writes — so a book still on the single document says so rather
 * than handing out a link to nothing.
 */
export async function createInvite(
  uid: string,
  teamName: string,
  role: Invite['role'] = 'coach',
): Promise<Result<Invite>> {
  try {
    const { fs, db } = await open();
    const team = fs.doc(db, 'teams', uid);
    if (!(await fs.getDoc(team)).exists()) {
      return { ok: false, reason: 'Your playbook has not moved to the team cloud yet. Open the playbook with signal, then try again.' };
    }
    const name = teamName.trim() || 'My team';
    await fs.setDoc(team, { name, updatedAt: Date.now() }, { merge: true });
    const invite: Invite = {
      code: newToken(),
      teamId: uid,
      teamName: name,
      role,
      createdBy: uid,
      expiresAt: Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000,
    };
    const { code: _c, ...data } = invite;
    await fs.setDoc(fs.doc(db, 'invites', invite.code), data);
    return { ok: true, value: invite };
  } catch (err) {
    return { ok: false, reason: why(err, 'The cloud refused. The team rules may need publishing again — see firestore.rules.') };
  }
}

export async function readInvite(code: string): Promise<Result<Invite>> {
  try {
    const { fs, db } = await open();
    const snap = await fs.getDoc(fs.doc(db, 'invites', code));
    if (!snap.exists()) return { ok: false, reason: 'That invite has been taken down, or the link is not complete.' };
    const invite = { code, ...(snap.data() as Omit<Invite, 'code'>) };
    if (invite.expiresAt <= Date.now()) {
      return { ok: false, reason: `That invite to ${invite.teamName} has run out. Ask for a new link.` };
    }
    return { ok: true, value: invite };
  } catch (err) {
    return { ok: false, reason: why(err, 'That invite could not be read. Sign in and try the link again.') };
  }
}

/** Put this coach on the team an invite names, and remember it under their uid. */
export async function joinTeam(uid: string, invite: Invite, myName: string): Promise<Result<JoinedTeam>> {
  if (invite.teamId === uid) return { ok: false, reason: 'That is an invite to your own team.' };
  try {
    const { fs, db } = await open();
    const now = Date.now();
    await fs.updateDoc(fs.doc(db, 'teams', invite.teamId), {
      [`members.${uid}`]: invite.role,
      [`names.${uid}`]: myName.trim() || 'A coach',
      joinedWith: invite.code,
      updatedAt: now,
    });
    const joined: JoinedTeam = { teamId: invite.teamId, name: invite.teamName, joinedAt: now, role: invite.role };
    await fs.setDoc(fs.doc(db, 'users', uid, 'teams', invite.teamId), {
      name: joined.name,
      joinedAt: now,
      role: invite.role,
    });
    return { ok: true, value: joined };
  } catch (err) {
    return { ok: false, reason: why(err, 'The cloud would not let you join. The invite may have been taken down.') };
  }
}

/** The teams this coach has joined. Their own is not on the list. */
export async function listJoined(uid: string): Promise<Result<JoinedTeam[]>> {
  try {
    const { fs, db } = await open();
    const snap = await fs.getDocs(fs.collection(fs.doc(db, 'users', uid), 'teams'));
    return {
      ok: true,
      value: snap.docs
        .map((d) => {
          const data = d.data() as { name?: string; joinedAt?: number; role?: string };
          return {
            teamId: d.id,
            name: data.name ?? 'A team',
            joinedAt: data.joinedAt ?? 0,
            role: data.role === 'viewer' ? ('viewer' as const) : ('coach' as const),
          };
        })
        .sort((a, b) => a.joinedAt - b.joinedAt),
    };
  } catch (err) {
    return { ok: false, reason: why(err, 'Your teams could not be read.') };
  }
}

/** Who is on a team, owner first. */
export async function listMembers(teamId: string): Promise<Result<Member[]>> {
  try {
    const { fs, db } = await open();
    const snap = await fs.getDoc(fs.doc(db, 'teams', teamId));
    if (!snap.exists()) return { ok: true, value: [] };
    const data = snap.data() as { members?: Record<string, string>; names?: Record<string, string> };
    const members = Object.entries(data.members ?? {}).map(([uid, role]) => ({
      uid,
      role: (role === 'owner' || role === 'viewer' ? role : 'coach') as Role,
      name: data.names?.[uid] ?? (role === 'owner' ? 'You' : 'A coach'),
    }));
    const rank = { owner: 0, coach: 1, viewer: 2 };
    return { ok: true, value: members.sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name)) };
  } catch (err) {
    return { ok: false, reason: why(err, 'You are not on that team any more.') };
  }
}

/** Take a coach off the team. The owner's to do, and only the owner's. */
export async function removeMember(teamId: string, memberUid: string): Promise<Result<null>> {
  if (memberUid === teamId) return { ok: false, reason: 'The owner cannot be taken off their own team.' };
  try {
    const { fs, db } = await open();
    await fs.updateDoc(fs.doc(db, 'teams', teamId), {
      [`members.${memberUid}`]: fs.deleteField(),
      [`names.${memberUid}`]: fs.deleteField(),
      updatedAt: Date.now(),
    });
    return { ok: true, value: null };
  } catch (err) {
    return { ok: false, reason: why(err, 'Only the team’s owner can take a coach off.') };
  }
}

/**
 * Leave somebody else's team.
 *
 * Taking yourself off the team first, then forgetting it: the other way round,
 * a failure halfway leaves a coach still on a team their app no longer offers
 * to open. A team that has already let them go is not an error to report.
 */
export async function leaveTeam(uid: string, teamId: string): Promise<Result<null>> {
  try {
    const { fs, db } = await open();
    try {
      await fs.updateDoc(fs.doc(db, 'teams', teamId), {
        [`members.${uid}`]: fs.deleteField(),
        [`names.${uid}`]: fs.deleteField(),
        updatedAt: Date.now(),
      });
    } catch (err) {
      if (explain(err) !== 'denied') throw err;
    }
    await fs.deleteDoc(fs.doc(db, 'users', uid, 'teams', teamId));
    return { ok: true, value: null };
  } catch (err) {
    return { ok: false, reason: why(err, 'Could not leave the team.') };
  }
}

/** Forget a team the owner has already taken this coach off. */
export async function forgetTeam(uid: string, teamId: string): Promise<void> {
  try {
    const { fs, db } = await open();
    await fs.deleteDoc(fs.doc(db, 'users', uid, 'teams', teamId));
  } catch {
    /* it will be offered again, and refused again, which says the same thing */
  }
}

const PENDING_KEY = 'chalk.invite.pending.v1';

/**
 * An invite link, kept until the app is signed in and can act on it.
 *
 * The link lands before auth has answered, and on a new device before there
 * is an account at all, so it is parked in session storage and the address is
 * put back to the playbook.
 */
export function parkInvite(code: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, code);
  } catch {
    /* the link can be opened again */
  }
}

export function takeParkedInvite(): string | null {
  try {
    const code = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return code;
  } catch {
    return null;
  }
}
