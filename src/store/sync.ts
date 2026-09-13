import type { Play, Section } from '../domain/types';

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

export function readLocal(): Playbook {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Playbook>;
    return {
      plays: Array.isArray(parsed.plays) ? parsed.plays : [],
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    };
  } catch {
    // Corrupt or blocked storage must not take the app down with it.
    return EMPTY;
  }
}

export function writeLocal(book: Playbook): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    /* quota or private mode; the session still works, it just will not persist */
  }
}

export type SyncState = 'local' | 'syncing' | 'synced' | 'offline' | 'denied';

/** Reported once per session; repeating it every 800ms helps nobody. */
let warned = false;

function explain(err: unknown): SyncState {
  const code = (err as { code?: string })?.code ?? '';
  const denied = code === 'permission-denied' || String(err).includes('permission');
  if (!warned) {
    warned = true;
    console.warn(
      denied
        ? 'Playbook is saving locally only: Firestore refused the write. ' +
            'The rules in firestore.rules have to be published to the project.'
        : 'Playbook is saving locally only, cloud unreachable:',
      err,
    );
  }
  return denied ? 'denied' : 'offline';
}

/**
 * Push to Firestore if it is reachable. Failure is expected and survivable:
 * the local copy is already written by the time this runs.
 */
export async function pushToCloud(book: Playbook): Promise<SyncState> {
  try {
    const [{ db, ensureSignedIn }, { doc, setDoc }] = await Promise.all([
      import('../firebase'),
      import('firebase/firestore'),
    ]);
    const uid = await ensureSignedIn();

    await setDoc(doc(db, 'users', uid, 'playbook', 'main'), {
      plays: book.plays,
      sections: book.sections,
      updatedAt: Date.now(),
    });
    return 'synced';
  } catch (err) {
    return explain(err);
  }
}

export async function pullFromCloud(): Promise<Playbook | null> {
  try {
    const [{ db, ensureSignedIn }, { doc, getDoc }] = await Promise.all([
      import('../firebase'),
      import('firebase/firestore'),
    ]);
    const uid = await ensureSignedIn();

    const snap = await getDoc(doc(db, 'users', uid, 'playbook', 'main'));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<Playbook>;
    return {
      plays: Array.isArray(data.plays) ? data.plays : [],
      sections: Array.isArray(data.sections) ? data.sections : [],
    };
  } catch (err) {
    // A failed pull is not worth a second warning; the push will report it.
    void err;
    return null;
  }
}
