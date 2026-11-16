import type { Play } from '../domain/types';
import { fromCloud, toCloud } from './sync';

/**
 * A link a player opens on a phone to see a play, with no account.
 *
 *   /shares/{token}    a frozen copy of one play or of a playbook
 *
 * Frozen rather than live: a coach reworking a play on Tuesday night should
 * not change what a kid was reading on the bus that morning until the coach
 * says so. Sharing the same play again updates the same link, because the
 * token is kept on the play — so the link a team already has goes on working
 * and shows the newest version.
 *
 * Readable by anyone who has the exact token and listable by nobody; the token
 * is 132 random bits, which is the whole of the protection, and is the same
 * bargain every unlisted link on the web makes. Writable only by whoever made
 * it. See `firestore.rules`.
 */

export interface Shared {
  kind: 'play' | 'book';
  title: string;
  plays: Play[];
  sharedAt: number;
}

/** One document holds 1 MiB. The check is ours too, so it fails in words. */
const MAX_BYTES = 900_000;

/** 22 characters of URL-safe base64: 132 bits. */
export function newToken(): string {
  const bytes = new Uint8Array(17);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 22);
}

/** A token as it appears in a link, or null for anything that is not one. */
export function asToken(s: string): string | null {
  return /^[A-Za-z0-9_-]{20,40}$/.test(s) ? s : null;
}

export function shareUrl(token: string): string {
  return `${location.origin}/s/${token}`;
}

/**
 * What leaves the device. Where it sits in the coach's own book — which
 * playbook, which folder, what state it is in, its link — is the coach's
 * business and none of the reader's.
 */
export function forSharing(play: Play): Play {
  const { bookId: _b, status: _s, deletedAt: _d, shareToken: _t, ...rest } = play;
  return { ...rest, sectionId: 'shared' };
}

export type ShareResult = { ok: true; token: string } | { ok: false; reason: string };

async function open() {
  const { db, ensureSignedIn } = await import('../firebase');
  const fs = await import('firebase/firestore');
  return { db, fs, ensureSignedIn };
}

/** Write (or rewrite) the frozen copy behind a link. */
export async function publishShare(
  kind: Shared['kind'],
  title: string,
  plays: Play[],
  token = newToken(),
): Promise<ShareResult> {
  const body = {
    kind,
    title,
    plays: toCloud(plays.map(forSharing)),
    sharedAt: Date.now(),
    schema: 1,
  };
  if (JSON.stringify(body).length > MAX_BYTES) {
    return { ok: false, reason: 'That is too much to share in one link. Try a folder at a time.' };
  }
  try {
    const { db, fs, ensureSignedIn } = await open();
    const uid = await ensureSignedIn();
    await fs.setDoc(fs.doc(db, 'shares', token), { ...body, ownerUid: uid });
    return { ok: true, token };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    return {
      ok: false,
      reason:
        code === 'permission-denied'
          ? 'Sharing is not switched on yet: the Firestore rules for shares have not been published.'
          : 'Could not reach the cloud to make the link. It needs a signal.',
    };
  }
}

/** Take a link down. Anybody holding it sees "no longer shared". */
export async function revokeShare(token: string): Promise<boolean> {
  try {
    const { db, fs } = await open();
    await fs.deleteDoc(fs.doc(db, 'shares', token));
    return true;
  } catch {
    return false;
  }
}

export type ReadResult = { ok: true; shared: Shared } | { ok: false; reason: 'gone' | 'offline' };

/** Read a link. Needs no account: the rules let anybody get one by its token. */
export async function readShare(token: string): Promise<ReadResult> {
  try {
    const { db, fs } = await open();
    const snap = await fs.getDoc(fs.doc(db, 'shares', token));
    if (!snap.exists()) return { ok: false, reason: 'gone' };
    const data = snap.data() as Partial<Shared> & { plays?: unknown };
    return {
      ok: true,
      shared: {
        kind: data.kind === 'book' ? 'book' : 'play',
        title: typeof data.title === 'string' ? data.title : 'Shared play',
        plays: fromCloud(data.plays),
        sharedAt: typeof data.sharedAt === 'number' ? data.sharedAt : 0,
      },
    };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    return { ok: false, reason: code === 'permission-denied' || code === 'not-found' ? 'gone' : 'offline' };
  }
}

/*
 * Taking a copy into your own playbook. The viewer runs without the playbook
 * loaded at all, so it hands the plays over through session storage and the
 * app picks them up when it starts.
 */
const IMPORT_KEY = 'chalk.import.v1';

export function handOver(plays: Play[]): void {
  try {
    sessionStorage.setItem(IMPORT_KEY, JSON.stringify(plays));
  } catch {
    /* storage blocked: the copy is not taken, and nothing else is affected */
  }
}

export function takeHandOver(): Play[] {
  try {
    const raw = sessionStorage.getItem(IMPORT_KEY);
    sessionStorage.removeItem(IMPORT_KEY);
    const plays = raw ? (JSON.parse(raw) as Play[]) : [];
    return Array.isArray(plays) ? plays : [];
  } catch {
    return [];
  }
}
