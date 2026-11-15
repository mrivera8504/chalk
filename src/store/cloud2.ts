import type { Book, Play, Section } from '../domain/types';
import { explain, fromCloud, toCloud, type Playbook, type SyncState } from './sync';

/**
 * The cloud, one document per play.
 *
 *   /teams/{teamId}                      the playbooks, the folders, who is on it
 *   /teams/{teamId}/plays/{playId}       one play
 *   /teams/{teamId}/plays/{playId}/revisions/{stamp}
 *   /teams/{teamId}/purged/{playId}      the last copy of a play emptied from the trash
 *
 * The whole book used to be one document, which capped it at 1 MiB — about a
 * hundred heavily drawn plays across every playbook put together — and meant a
 * single stroke rewrote all of it after reading all of it. A play is the unit
 * that changes and the unit two copies merge by, so it is the unit stored.
 *
 * A coach's own team has their uid for its id. That makes it findable with no
 * lookup and makes creating it idempotent: two devices migrating at once write
 * the same documents to the same place. A team somebody is invited to will have
 * an id of its own; `members` is already on the document for that day.
 *
 * Every rule in *The playbook, and how it syncs* still holds here, and the
 * notes say how each one translates. The short version: nothing in this file
 * can remove a play except `purge`, which is only ever handed plays a coach has
 * just emptied from the trash, and which keeps a last copy even then.
 */

type Fs = typeof import('firebase/firestore');

async function open(): Promise<{ fs: Fs; db: import('firebase/firestore').Firestore }> {
  // One after the other. Loaded together, a test's stand-in for Firestore is
  // handed to one of the two and the real library to the other.
  const { db } = await import('../firebase');
  const fs = await import('firebase/firestore');
  return { fs, db };
}

/** How many past copies of one play to keep, and how often to take one. */
export const KEEP_REVISIONS = 10;
const REVISION_EVERY_MS = 10 * 60 * 1000;

/** How many writes to have in the air at once. */
const CHUNK = 20;

/** Purges are remembered so no device hands a purged play back. Bounded. */
const KEEP_PURGES = 500;

export interface TeamMeta {
  name: string;
  sport: 'football';
  books: Book[];
  sections: Section[];
  /** Play id to when it was emptied from the trash. */
  purged: Record<string, number>;
}

async function inChunks<T>(items: T[], run: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += CHUNK) {
    await Promise.all(items.slice(i, i + CHUNK).map(run));
  }
}

const playOut = (p: Play) => toCloud([p])[0] as Record<string, unknown>;
const playIn = (d: unknown) => fromCloud([d])[0];

/**
 * Whether this account's cloud is in the new shape, and whether it may be.
 *
 * `denied` is the answer on a project whose new rules have not been published:
 * the app then carries on with the single document exactly as before, and asks
 * again next time. That is what lets this ship ahead of the rules.
 */
export type Probe = 'ready' | 'fresh' | 'denied' | { failed: SyncState };

export async function probe(uid: string): Promise<Probe> {
  try {
    const { fs, db } = await open();
    const snap = await fs.getDoc(fs.doc(db, 'teams', uid));
    return snap.exists() ? 'ready' : 'fresh';
  } catch (err) {
    const state = explain(err);
    return state === 'denied' ? 'denied' : { failed: state };
  }
}

/**
 * Copy a book into the new shape. Copy, verify, and only then say so.
 *
 * The plays go first and the team document last, because the team document is
 * the marker: a device that finds it treats the migration as done. Stopped
 * halfway — a closed tab, a lost signal — there is no marker, and the next
 * attempt writes the same plays to the same ids again. Nothing here touches the
 * old document. It stays where it is as the copy to go back to.
 */
export async function migrate(uid: string, book: Playbook): Promise<SyncState> {
  try {
    const { fs, db } = await open();
    const plays = fs.collection(fs.doc(db, 'teams', uid), 'plays');
    await inChunks(book.plays, (p) => fs.setDoc(fs.doc(plays, p.id), playOut(p)));

    // Read back before believing it.
    const there = new Set((await fs.getDocs(plays)).docs.map((d) => d.id));
    const missing = book.plays.filter((p) => !there.has(p.id));
    if (missing.length) {
      console.warn(`Migration stopped: ${missing.length} plays did not arrive. Nothing was switched over.`);
      return 'failed';
    }

    await fs.setDoc(fs.doc(db, 'teams', uid), {
      name: 'My team',
      sport: 'football',
      ownerUid: uid,
      members: { [uid]: 'owner' },
      books: book.books ?? [],
      sections: book.sections,
      purged: {},
      schema: 2,
      migratedFrom: `users/${uid}/playbook/main`,
      migratedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return 'synced';
  } catch (err) {
    return explain(err);
  }
}

export type Pull2 =
  | { ok: true; book: Playbook; purged: Record<string, number>; team: string }
  | { ok: false; state: SyncState };

/**
 * What has changed in the cloud since `since`.
 *
 * Only the plays stamped later, so a book of a hundred plays costs a hundred
 * reads the first time a device sees it and a handful after that. The team
 * document comes whole every time: it is one read, and it carries the purges.
 */
export async function pull(uid: string, since: number): Promise<Pull2> {
  try {
    const { fs, db } = await open();
    const team = fs.doc(db, 'teams', uid);
    const [meta, changed] = await Promise.all([
      fs.getDoc(team),
      fs.getDocs(fs.query(fs.collection(team, 'plays'), fs.where('updatedAt', '>', since))),
    ]);
    const data = (meta.data() ?? {}) as Partial<TeamMeta>;
    return {
      ok: true,
      team: typeof data.name === 'string' ? data.name : 'My team',
      purged: data.purged ?? {},
      book: {
        plays: changed.docs.map((d) => playIn(d.data())),
        sections: Array.isArray(data.sections) ? data.sections : [],
        books: Array.isArray(data.books) ? data.books : [],
      },
    };
  } catch (err) {
    return { ok: false, state: explain(err) };
  }
}

/** When a revision of each play was last kept, this session. */
const revisedAt = new Map<string, number>();
/** The team document as last written, so an unchanged one is not written again. */
let metaSent = '';

async function keepRevision(fs: Fs, ref: import('firebase/firestore').DocumentReference, old: unknown, id: string) {
  if (Date.now() - (revisedAt.get(id) ?? 0) < REVISION_EVERY_MS) return;
  revisedAt.set(id, Date.now());
  try {
    const revisions = fs.collection(ref, 'revisions');
    await fs.setDoc(fs.doc(revisions, String(Date.now())), { play: old, savedAt: Date.now() });
    const all = (await fs.getDocs(revisions)).docs.map((d) => d.id).sort((a, b) => Number(b) - Number(a));
    await Promise.all(all.slice(KEEP_REVISIONS).map((old) => fs.deleteDoc(fs.doc(revisions, old))));
  } catch (err) {
    // Insurance is not the policy: failing to keep history never stops a save.
    console.warn('Could not keep a revision:', err);
  }
}

/**
 * Send up what this device has changed.
 *
 * `known` is the stamp each play had when it was last seen in the cloud, so a
 * play is sent only when its stamp has moved since. A play the cloud holds a
 * newer copy of is left alone — that copy is on its way down on the next pull,
 * and writing over it is how a rename on the phone was once lost to the tablet.
 *
 * Returns the stamps that are now true of the cloud, to be remembered.
 */
export async function push(
  uid: string,
  book: Playbook,
  known: Record<string, number>,
): Promise<{ state: SyncState; known: Record<string, number> }> {
  const next = { ...known };
  try {
    const { fs, db } = await open();
    const team = fs.doc(db, 'teams', uid);
    const plays = fs.collection(team, 'plays');
    const dirty = book.plays.filter((p) => known[p.id] !== p.updatedAt);

    await inChunks(dirty, async (p) => {
      const ref = fs.doc(plays, p.id);
      const snap = await fs.getDoc(ref);
      if (snap.exists()) {
        const theirs = playIn(snap.data());
        if ((theirs.updatedAt ?? 0) > (p.updatedAt ?? 0)) return;
        await keepRevision(fs, ref, snap.data(), p.id);
      }
      await fs.setDoc(ref, playOut(p));
      next[p.id] = p.updatedAt;
    });

    const meta = { books: book.books ?? [], sections: book.sections };
    const text = uid + JSON.stringify(meta);
    if (text !== metaSent) {
      await fs.setDoc(team, { ...meta, updatedAt: Date.now() }, { merge: true });
      metaSent = text;
    }
    return { state: 'synced', known: next };
  } catch (err) {
    return { state: explain(err), known: next };
  }
}

/**
 * Take plays out of the cloud for good, keeping a last copy of each.
 *
 * The one thing here that removes anything, called only with plays a coach has
 * just emptied from the trash. The team document remembers that they went, so
 * a device still holding one does not hand it back on its next sync — which is
 * exactly what used to bring an emptied trash back.
 */
export async function purge(uid: string, plays: Play[]): Promise<SyncState> {
  if (!plays.length) return 'synced';
  try {
    const { fs, db } = await open();
    const team = fs.doc(db, 'teams', uid);
    const now = Date.now();
    await inChunks(plays, async (p) => {
      await fs.setDoc(fs.doc(fs.collection(team, 'purged'), p.id), { play: playOut(p), purgedAt: now });
      await fs.deleteDoc(fs.doc(fs.collection(team, 'plays'), p.id));
    });
    const snap = await fs.getDoc(team);
    const was = ((snap.data() ?? {}) as Partial<TeamMeta>).purged ?? {};
    const all = { ...was, ...Object.fromEntries(plays.map((p) => [p.id, now])) };
    // Newest kept. Past this many, a device would have to have been away for a
    // very long time to still be holding one of the oldest.
    const kept = Object.fromEntries(Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, KEEP_PURGES));
    await fs.setDoc(team, { purged: kept, updatedAt: now }, { merge: true });
    return 'synced';
  } catch (err) {
    return explain(err);
  }
}

/**
 * Make the cloud this book and nothing else — a restore from a backup file,
 * which the coach has just confirmed in as many words.
 */
export async function replaceAll(uid: string, book: Playbook): Promise<SyncState> {
  try {
    const { fs, db } = await open();
    const plays = fs.collection(fs.doc(db, 'teams', uid), 'plays');
    const keep = new Set(book.plays.map((p) => p.id));
    const extra = (await fs.getDocs(plays)).docs.filter((d) => !keep.has(d.id)).map((d) => playIn(d.data()));
    const gone = await purge(uid, extra);
    if (gone !== 'synced') return gone;
    return (await push(uid, book, {})).state;
  } catch (err) {
    return explain(err);
  }
}

export interface Revision {
  savedAt: number;
  play: Play;
}

/** Past copies of one play, newest first. */
export async function listRevisions(uid: string, playId: string): Promise<Revision[]> {
  try {
    const { fs, db } = await open();
    const ref = fs.doc(fs.collection(fs.doc(db, 'teams', uid), 'plays'), playId);
    const all = await fs.getDocs(fs.collection(ref, 'revisions'));
    return all.docs
      .map((d) => {
        const data = d.data() as { play?: unknown; savedAt?: number };
        return { savedAt: data.savedAt ?? Number(d.id), play: playIn(data.play) };
      })
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** Forget what this session remembers, between tests and between accounts. */
export function resetCloud2(): void {
  revisedAt.clear();
  metaSent = '';
}
