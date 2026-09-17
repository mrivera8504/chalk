import type { PathPoint, Play, Section } from '../domain/types';

/**
 * Local storage is the floor, not the cache.
 *
 * Firestore's own offline persistence is the real store once auth resolves, but
 * anonymous sign-in can be switched off in the console, the tablet can be on a
 * field with no signal on first run, and neither is a reason to lose a
 * playbook. Everything is written here first and pushed up when a connection
 * and an account both exist.
 */
const KEY = 'chalk.playbook.v1';

export interface Playbook {
  plays: Play[];
  sections: Section[];
}

export const EMPTY: Playbook = { plays: [], sections: [] };

/**
 * What is in storage, and whose it is.
 *
 * The uid is the part that was missing. One key held one book no matter who was
 * signed in, so an anonymous device's plays were still sitting there when
 * somebody signed into a real account — and the autosave pushed them straight
 * over it. Storage now says which account it belongs to, and a book from
 * another uid is never treated as this one's.
 */
export interface StoredBook extends Playbook {
  uid: string | null;
}

export function readLocal(): StoredBook {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, uid: null };
    const parsed = JSON.parse(raw) as Partial<StoredBook>;
    return {
      plays: Array.isArray(parsed.plays) ? parsed.plays : [],
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      // Absent on anything written before this existed. Treated as "unclaimed"
      // rather than as a mismatch, or every upgrade would look like a stranger.
      uid: typeof parsed.uid === 'string' ? parsed.uid : null,
    };
  } catch {
    // Corrupt or blocked storage must not take the app down with it.
    return { ...EMPTY, uid: null };
  }
}

export function writeLocal(book: Playbook, uid: string | null): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ plays: book.plays, sections: book.sections, uid }));
  } catch {
    /* quota or private mode; the session still works, it just will not persist */
  }
}

/**
 * Two copies of one account's book, reconciled play by play.
 *
 * The old rule compared the single newest `updatedAt` on each side and took the
 * whole winner, so one play touched locally five minutes ago discarded forty
 * plays from the cloud. Nothing about a playbook makes it atomic: a play is the
 * unit that changes, so a play is the unit that reconciles. Ids are generated
 * per device from the clock, so a collision across two real devices would need
 * the same millisecond and the same counter.
 */
export function mergeBooks(mine: Playbook, theirs: Playbook): Playbook {
  const plays = new Map<string, Play>();
  for (const p of [...mine.plays, ...theirs.plays]) {
    if (!p?.id) continue;
    const seen = plays.get(p.id);
    if (!seen || (p.updatedAt ?? 0) > (seen.updatedAt ?? 0)) plays.set(p.id, p);
  }

  const sections = new Map<string, Section>();
  for (const s of [...mine.sections, ...theirs.sections]) if (s?.id) sections.set(s.id, s);

  return { plays: [...plays.values()], sections: [...sections.values()] };
}

/**
 * The book as Firestore will hold it, and back.
 *
 * Firestore refuses an array directly inside an array, and `annotations` is
 * exactly that — a list of strokes, each a list of points. So every play with
 * freehand ink failed its write with `invalid-argument`, which read as "too
 * big", and no inked play ever reached the cloud: signing in on a second device
 * merged the ink into the book and jammed the sync for good. Each stroke is
 * wrapped in an object on the way up and unwrapped on the way down. Local
 * storage and backup files keep the plain shape; only the cloud sees this one.
 */
type CloudStroke = { points: PathPoint[] };

function toCloud(plays: Play[]): unknown[] {
  return plays.map((p) =>
    Array.isArray(p.annotations)
      ? { ...p, annotations: p.annotations.map((points): CloudStroke => ({ points })) }
      : p,
  );
}

function fromCloud(plays: unknown): Play[] {
  if (!Array.isArray(plays)) return [];
  return plays.map((p: Play) =>
    Array.isArray(p?.annotations)
      ? {
          ...p,
          // Accepts a bare array too, which is what a hand-written document or
          // the rescue script would put there.
          annotations: (p.annotations as unknown[]).map((s) =>
            Array.isArray(s) ? s : Array.isArray((s as CloudStroke)?.points) ? (s as CloudStroke).points : [],
          ),
        }
      : p,
  );
}

export type SyncState =
  | 'local'
  | 'syncing'
  | 'synced'
  | 'large'
  | 'offline'
  | 'denied'
  | 'blocked'
  | 'toobig'
  | 'failed';

/**
 * Firestore caps one document at 1 MiB, and this app puts the whole playbook in
 * one — which is the right trade for a few dozen plays and the wrong one
 * forever. Measured: a play with no freehand is about 1.3KB, and one covered in
 * it about 10KB, because `smooth` gives every point a control point and that is
 * four numbers a point. So the ceiling is somewhere near a hundred heavily drawn
 * plays, which is far off but not imaginary.
 *
 * The refusal sits under the real cap so the app says so itself rather than
 * finding out from a rejected write, and the warning sits far enough under that
 * to be a warning rather than an obituary.
 */
const DOC_WARN = 700_000;
const DOC_REFUSE = 1_000_000;

/**
 * JSON length as the proxy for Firestore's own accounting. They are not the
 * same — Firestore pays per field name and a flat eight bytes a number, JSON
 * pays per digit — but for arrays of `{x, y, cx, cy}` the two land within a few
 * percent of each other, and the gap between the warning and the cap covers it.
 */
function measure(book: Playbook): number {
  try {
    return new TextEncoder().encode(
      JSON.stringify({ plays: book.plays, sections: book.sections }),
    ).length;
  } catch {
    return 0;
  }
}

/**
 * How many past copies to keep, and how often to bother.
 *
 * The whole of this evening's forensics existed because one document was
 * overwritten in place and the only copy went with it. Twenty copies of a book
 * this size is a rounding error in storage and turns that from a recovery
 * project into a read.
 */
const KEEP_VERSIONS = 20;
const VERSION_EVERY_MS = 10 * 60 * 1000;

/** A book has to be at least this big before losing half of it is suspicious. */
const SHRINK_FLOOR = 3;

/** Session-local, so a quiet editing run writes one version rather than fifty. */
let lastVersionAt = 0;

/**
 * Reaching the cloud and finding nothing there are different answers, and
 * collapsing them is what emptied accounts: a pull that failed came back as
 * null, the app read that as "no cloud copy yet", and pushed its own empty
 * book over a real one.
 */
export type PullResult =
  | { ok: true; book: Playbook | null }
  | { ok: false; state: SyncState };

/** Reported once per session; repeating it every 800ms helps nobody. */
let warned = false;

/**
 * What actually went wrong, rather than "offline" for everything.
 *
 * Anything that was not a permission error used to be reported as offline, so a
 * document over the size cap — or a bad value, or a quota stop — showed the
 * coach a connectivity message for a write that was never going to succeed no
 * matter how good the signal got. That is the same silent degradation the sync
 * label exists to prevent, one layer further down.
 */
function explain(err: unknown): SyncState {
  const code = (err as { code?: string })?.code ?? '';
  const text = String((err as { message?: string })?.message ?? err);

  // Only a size complaint is 'toobig'. `invalid-argument` alone also covers a
  // malformed value, and calling that "too big, empty the trash" sent a coach
  // after a fix that could never work.
  const state: SyncState =
    code === 'permission-denied' || /permission/i.test(text)
      ? 'denied'
      : !/invalid data/i.test(text) && /maximum allowed size|too large|exceeds the maximum/i.test(text)
        ? 'toobig'
        : code === 'unavailable' || code === 'deadline-exceeded' || code === 'cancelled'
          ? 'offline'
          : 'failed';

  if (!warned) {
    warned = true;
    const why: Record<string, string> = {
      denied:
        'Firestore refused the write. The rules in firestore.rules have to be ' +
        'published to the project.',
      toobig:
        'The playbook is too large for one Firestore document (1 MiB). Freehand ' +
        'ink is the usual weight — and emptying the trash is the quickest relief.',
      offline: 'The cloud is unreachable.',
      failed: 'The write failed for a reason this app does not recognize.',
    };
    console.warn(`Playbook is saving locally only. ${why[state] ?? ''}`, err);
  }
  return state;
}

async function bookDoc(uid: string) {
  const [{ db }, { doc }] = await Promise.all([
    import('../firebase'),
    import('firebase/firestore'),
  ]);
  return doc(db, 'users', uid, 'playbook', 'main');
}

type Fs = typeof import('firebase/firestore');
type BookRef = Awaited<ReturnType<typeof bookDoc>>;

/**
 * Keep a copy of what is about to be replaced, and prune the oldest.
 *
 * Under `main` rather than beside it, so the existing rule — which already
 * matches everything below a uid — covers it with nothing to publish.
 */
async function keepVersion(ref: BookRef, fs: Fs, book: Playbook, why: string): Promise<void> {
  const { collection, doc, setDoc, getDocs, deleteDoc } = fs;
  const versions = collection(ref, 'versions');
  const id = String(Date.now());

  await setDoc(doc(versions, id), {
    plays: toCloud(book.plays),
    sections: book.sections,
    savedAt: Date.now(),
    why,
  });
  lastVersionAt = Date.now();

  try {
    // Small enough to sort in memory — this collection is capped by design.
    const all = await getDocs(versions);
    const ids = all.docs.map((d) => d.id).sort((a, b) => Number(b) - Number(a));
    await Promise.all(ids.slice(KEEP_VERSIONS).map((old) => deleteDoc(doc(versions, old))));
  } catch {
    // Failing to tidy up is not a reason to fail the save. Worst case the
    // collection runs long, which is the harmless direction for this to break.
  }
}

export interface PushOptions {
  /** Write even when the shrink guard objects. Only ever a deliberate answer. */
  force?: boolean;
}

/**
 * Push to Firestore if it is reachable. Failure is expected and survivable:
 * the local copy is already written by the time this runs.
 *
 * The uid is passed in rather than resolved here, so what gets written and who
 * it is written for are decided in the same breath. Resolving it inside meant a
 * push begun under one account could land under whichever one auth had moved
 * to by the time it ran.
 *
 * Two things stand between a bug and a lost playbook here. The guard refuses a
 * write that drops most of a book on the floor — every failure this app has
 * actually had wore that shape, a small or empty copy landing on a large one,
 * so the shape is worth refusing even when the cause is one nobody has found
 * yet. And anything a push is about to replace is kept first, so "refused" is
 * not the only line of defense.
 */
export async function pushToCloud(
  book: Playbook,
  uid: string,
  { force = false }: PushOptions = {},
): Promise<SyncState> {
  try {
    const [ref, fs] = await Promise.all([bookDoc(uid), import('firebase/firestore')]);
    const { getDoc, setDoc } = fs;

    /*
     * Checked before the round trip, not after a rejection: the app knows the
     * cap as well as the server does, and saying so itself is the difference
     * between a sentence a coach can act on and a write that quietly never
     * lands. Local storage already has the work either way.
     */
    const size = measure(book);
    if (size > DOC_REFUSE) {
      console.warn(
        `Not saved to the cloud: the playbook is ${Math.round(size / 1024)}KB and one ` +
          `Firestore document holds 1024KB. Empty the trash, or export a backup and split ` +
          `the book. Everything is still on this device.`,
      );
      return 'toobig';
    }

    const snap = await getDoc(ref);
    const remote = snap.exists() ? (snap.data() as Partial<Playbook>) : null;
    const before: Playbook = {
      plays: fromCloud(remote?.plays),
      sections: Array.isArray(remote?.sections) ? remote.sections : [],
    };

    const losing = before.plays.length - book.plays.length;
    const suspicious = before.plays.length >= SHRINK_FLOOR && book.plays.length < before.plays.length / 2;

    if (suspicious && !force) {
      console.warn(
        `Refused to save: this would take the cloud copy from ${before.plays.length} plays ` +
          `down to ${book.plays.length}. Nothing has been overwritten. Your work is on this ` +
          `device either way.`,
      );
      return 'blocked';
    }

    // Always keep what is being replaced when a write loses plays; otherwise
    // keep one on a timer, so a book that only ever grows still has history.
    if (before.plays.length && (losing > 0 || Date.now() - lastVersionAt > VERSION_EVERY_MS)) {
      try {
        await keepVersion(ref, fs, before, losing > 0 ? `replaced, losing ${losing}` : 'periodic');
      } catch (err) {
        // Keeping history is insurance, not the policy. A push that cannot
        // archive still has to save — refusing would turn a secondary write
        // failing into the coach's work not being saved at all.
        console.warn('Could not keep a version of the previous playbook:', err);
      }
    }

    await setDoc(ref, {
      plays: toCloud(book.plays),
      sections: book.sections,
      updatedAt: Date.now(),
    });
    // Saved, and worth saying when the room left is running out.
    return size > DOC_WARN ? 'large' : 'synced';
  } catch (err) {
    return explain(err);
  }
}

export interface Version {
  id: string;
  savedAt: number;
  why: string;
  plays: number;
  book: Playbook;
}

/** Past copies, newest first. */
export async function listVersions(uid: string): Promise<Version[]> {
  try {
    const [ref, { collection, getDocs }] = await Promise.all([
      bookDoc(uid),
      import('firebase/firestore'),
    ]);
    const all = await getDocs(collection(ref, 'versions'));
    return all.docs
      .map((d) => {
        const data = d.data() as Partial<Playbook> & { savedAt?: number; why?: string };
        const book: Playbook = {
          plays: fromCloud(data.plays),
          sections: Array.isArray(data.sections) ? data.sections : [],
        };
        return {
          id: d.id,
          savedAt: data.savedAt ?? Number(d.id),
          why: data.why ?? '',
          plays: book.plays.length,
          book,
        };
      })
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function pullFromCloud(uid: string): Promise<PullResult> {
  try {
    const [ref, { getDoc }] = await Promise.all([bookDoc(uid), import('firebase/firestore')]);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: true, book: null };
    const data = snap.data() as Partial<Playbook>;
    return {
      ok: true,
      book: {
        plays: fromCloud(data.plays),
        sections: Array.isArray(data.sections) ? data.sections : [],
      },
    };
  } catch (err) {
    return { ok: false, state: explain(err) };
  }
}
