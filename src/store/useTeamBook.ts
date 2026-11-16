import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAIN_BOOK, bookOf, liveBooks, type Book, type Play, type Section } from '../domain/types';
import { makeBackup } from './backup';
import { sameBook, useBookEdits } from './bookEdits';
import * as cloud2 from './cloud2';
import { mergeBooks, type Playbook, type SyncState, type Version } from './sync';

/**
 * A team this coach was invited onto: somebody else's playbook, kept apart
 * from their own.
 *
 * Apart in every place a book is kept. Its own local storage key, its own
 * stamps of what the cloud holds, its own choice of which playbook is open —
 * and nothing here ever reads or writes the coach's own book. That is the whole
 * of why team members waited for this: the coach's own book merges whatever is
 * on the device into whoever signs in, by decision, so a second team pushed
 * through the same storage would have been merged straight into it.
 *
 * What it does not need, because the owner's book has already been through it:
 * the single document, the migration, the shrink guard. A team somebody joins
 * is in the per-play shape by definition — an invite cannot be made for one
 * that is not — and in that shape nothing leaves the cloud except by `purge`.
 *
 * The same rules as the coach's own book otherwise, and for the same reasons:
 * local storage is written first and synchronously, nothing is pushed for a
 * team whose cloud copy has not been read this session, a pull that changes
 * nothing does not push, and the book comes down again when the app comes back
 * to the front or the signal returns.
 */

const AUTOSAVE_MS = 800;
const FOREGROUND_PULL_MS = 5000;
const PULL_SLACK_MS = 5 * 60 * 1000;

const localKey = (teamId: string) => `chalk.team.${teamId}.v1`;
const knownKey = (uid: string, teamId: string) => `chalk.sync2.${uid}.team.${teamId}`;
const currentKey = (teamId: string) => `chalk.book.current.${teamId}`;

interface State extends Playbook {
  teamId: string | null;
  books: Book[];
}

const NONE: State = { teamId: null, plays: [], sections: [], books: [] };

function load(teamId: string | null): State {
  if (!teamId) return NONE;
  try {
    const raw = JSON.parse(localStorage.getItem(localKey(teamId)) ?? '{}') as Partial<Playbook>;
    return {
      teamId,
      plays: Array.isArray(raw.plays) ? raw.plays : [],
      sections: Array.isArray(raw.sections) ? raw.sections : [],
      books: Array.isArray(raw.books) ? raw.books : [],
    };
  } catch {
    return { ...NONE, teamId };
  }
}

/** False when the device has no room; the cloud copy still holds it. */
function save(teamId: string, book: Playbook): boolean {
  try {
    localStorage.setItem(
      localKey(teamId),
      JSON.stringify({ plays: book.plays, sections: book.sections, books: book.books ?? [] }),
    );
    return true;
  } catch {
    return false;
  }
}

function readKnown(uid: string, teamId: string): Record<string, number> {
  try {
    return (JSON.parse(localStorage.getItem(knownKey(uid, teamId)) ?? '{}') as { known?: Record<string, number> }).known ?? {};
  } catch {
    return {};
  }
}

function writeKnown(uid: string, teamId: string, known: Record<string, number>): void {
  try {
    localStorage.setItem(knownKey(uid, teamId), JSON.stringify({ known }));
  } catch {
    /* worst case a play is sent twice */
  }
}

function readCurrent(teamId: string | null): string {
  if (!teamId) return MAIN_BOOK;
  try {
    return localStorage.getItem(currentKey(teamId)) ?? MAIN_BOOK;
  } catch {
    return MAIN_BOOK;
  }
}

/** Forget everything this device kept for a team, once the coach has left it. */
export function dropTeamCopy(uid: string | null, teamId: string): void {
  try {
    localStorage.removeItem(localKey(teamId));
    localStorage.removeItem(currentKey(teamId));
    if (uid) localStorage.removeItem(knownKey(uid, teamId));
  } catch {
    /* harmless: a stale copy is only read if the coach joins again */
  }
}

export function useTeamBook(
  teamId: string | null,
  uid: string | null,
  /** The cloud refused: the owner took this coach off, or the team is gone. */
  onRemoved?: (teamId: string) => void,
) {
  const [st, setSt] = useState<State>(() => load(teamId));
  const [wanted, setWanted] = useState(() => readCurrent(teamId));
  const [sync, setSync] = useState<SyncState>('local');

  // A different team: its own book, read from its own key, in this render.
  if (st.teamId !== teamId) {
    setSt(load(teamId));
    setWanted(readCurrent(teamId));
  }

  const setPlays = useCallback(
    (next: Play[] | ((prev: Play[]) => Play[])) =>
      setSt((s) => ({ ...s, plays: typeof next === 'function' ? next(s.plays) : next })),
    [],
  );
  const setSections = useCallback(
    (next: Section[] | ((prev: Section[]) => Section[])) =>
      setSt((s) => ({ ...s, sections: typeof next === 'function' ? next(s.sections) : next })),
    [],
  );
  const setBooks = useCallback(
    (next: Book[] | ((prev: Book[]) => Book[])) =>
      setSt((s) => ({ ...s, books: typeof next === 'function' ? next(s.books) : next })),
    [],
  );

  const books = useMemo(() => liveBooks(st.books), [st.books]);
  const bookId = books.some((b) => b.id === wanted) ? wanted : books[0].id;
  const everyPlay = useMemo(() => st.plays.filter((p) => !p.deletedAt), [st.plays]);
  const plays = useMemo(() => everyPlay.filter((p) => bookOf(p, books) === bookId), [everyPlay, books, bookId]);
  const sections = useMemo(() => st.sections.filter((s) => bookOf(s, books) === bookId), [st.sections, books, bookId]);
  const trashed = useMemo(
    () =>
      st.plays
        .filter((p) => p.deletedAt && bookOf(p, books) === bookId)
        .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [st.plays, books, bookId],
  );

  const selectBook = useCallback(
    (id: string) => {
      setWanted(id);
      if (!teamId) return;
      try {
        localStorage.setItem(currentKey(teamId), id);
      } catch {
        /* storage blocked; the session keeps working */
      }
    },
    [teamId],
  );

  const edits = useBookEdits({ setPlays, setSections, setBooks, books, bookId, selectBook });

  /** Which team and account the book on screen was reconciled for, as `team/uid`. */
  const loadedFor = useRef<string | null>(null);
  const known = useRef<Record<string, number>>({});
  const pulledSince = useRef(0);
  const pulledAt = useRef(0);
  const pulling = useRef(false);
  const onScreen = useRef<State>(st);
  onScreen.current = st;
  const scope = teamId && uid ? `${teamId}/${uid}` : null;
  const scopeNow = useRef(scope);
  scopeNow.current = scope;
  const removed = useRef(onRemoved);
  removed.current = onRemoved;
  const timer = useRef<number | null>(null);

  // A new team or a new account starts from nothing known.
  useEffect(() => {
    loadedFor.current = null;
    pulledSince.current = 0;
    pulledAt.current = 0;
    known.current = teamId && uid ? readKnown(uid, teamId) : {};
    setSync('local');
  }, [teamId, uid]);

  const reconcile = useCallback(async (forTeam: string, forUid: string) => {
    const want = `${forTeam}/${forUid}`;
    const stale = () => scopeNow.current !== want;
    pulling.current = true;
    setSync('syncing');
    try {
      const asked = Date.now();
      const shape = await cloud2.probe(forTeam);
      if (stale()) return;
      if (shape === 'denied' || shape === 'fresh') {
        // Taken off the team, or the team is gone. Nothing is pushed, ever.
        setSync('denied');
        removed.current?.(forTeam);
        return;
      }
      if (typeof shape === 'object') {
        setSync(shape.failed);
        return;
      }
      const got = await cloud2.pull(forTeam, pulledSince.current);
      if (stale()) return;
      if (!got.ok) {
        setSync(got.state);
        return;
      }
      const here = onScreen.current;
      let merged = mergeBooks(here, got.book);
      merged = {
        ...merged,
        plays: merged.plays.filter((p) => !((got.purged[p.id] ?? -1) >= (p.updatedAt ?? 0))),
      };
      const stamps = new Map(merged.plays.map((p) => [p.id, p.updatedAt]));
      for (const p of got.book.plays) if (stamps.get(p.id) === p.updatedAt) known.current[p.id] = p.updatedAt;
      for (const id of Object.keys(got.purged)) delete known.current[id];
      writeKnown(forUid, forTeam, known.current);
      pulledSince.current = asked - PULL_SLACK_MS;
      loadedFor.current = want;
      save(forTeam, merged);
      if (!sameBook(here, merged)) {
        setSt({ teamId: forTeam, plays: merged.plays, sections: merged.sections, books: merged.books ?? [] });
      }
      pulledAt.current = Date.now();
      setSync('synced');
    } finally {
      pulling.current = false;
    }
  }, []);

  useEffect(() => {
    if (!teamId || !uid) return;
    void reconcile(teamId, uid);
  }, [teamId, uid, reconcile]);

  useEffect(() => {
    if (!teamId || !uid) return;
    const maybePull = () => {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) return;
      if (pulling.current) return;
      if (Date.now() - pulledAt.current < FOREGROUND_PULL_MS) return;
      void reconcile(teamId, uid);
    };
    document.addEventListener('visibilitychange', maybePull);
    window.addEventListener('online', maybePull);
    return () => {
      document.removeEventListener('visibilitychange', maybePull);
      window.removeEventListener('online', maybePull);
    };
  }, [teamId, uid, reconcile]);

  const sendUp = useCallback(async (book: Playbook, forTeam: string, forUid: string): Promise<SyncState> => {
    const sent = await cloud2.push(forTeam, book, known.current);
    known.current = sent.known;
    writeKnown(forUid, forTeam, sent.known);
    return sent.state;
  }, []);

  // Local first and synchronously; the cloud on the debounce, once it has been read.
  useEffect(() => {
    if (!st.teamId || st.teamId !== teamId) return;
    const book: Playbook = { plays: st.plays, sections: st.sections, books: st.books };
    if (!save(st.teamId, book) && !uid) setSync('failed');
    if (!scope || loadedFor.current !== scope || !uid) return;
    const forTeam = st.teamId;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSync('syncing');
      void sendUp(book, forTeam, uid).then((state) => {
        setSync(state);
        if (state === 'denied') removed.current?.(forTeam);
      });
    }, AUTOSAVE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [st, teamId, uid, scope, sendUp]);

  const saveNow = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!teamId || !uid || loadedFor.current !== scope) return;
    setSync('syncing');
    setSync(await sendUp(onScreen.current, teamId, uid));
  }, [teamId, uid, scope, sendUp]);

  const emptyTrash = useCallback(() => {
    const going = st.plays.filter((p) => p.deletedAt && bookOf(p, books) === bookId);
    const ids = new Set(going.map((p) => p.id));
    setPlays((prev) => prev.filter((p) => !ids.has(p.id)));
    if (teamId && uid && loadedFor.current === scope) {
      for (const id of ids) delete known.current[id];
      writeKnown(uid, teamId, known.current);
      void cloud2.purge(teamId, going).then((state) => state !== 'synced' && setSync(state));
    }
  }, [st.plays, books, bookId, setPlays, teamId, uid, scope]);

  const bookHistory = useCallback(
    async () => ({
      purged: teamId && uid ? await cloud2.listPurged(teamId) : [],
      versions: [] as Version[],
    }),
    [teamId, uid],
  );

  const exportJson = useCallback(
    () => JSON.stringify(makeBackup({ plays: st.plays, sections: st.sections, books: st.books }), null, 2),
    [st],
  );

  return {
    plays,
    everyPlay,
    trashed,
    sections,
    books,
    bookId,
    selectBook,
    ...edits,
    bookHistory,
    revisions: (playId: string) => (teamId && uid ? cloud2.listRevisions(teamId, playId) : Promise.resolve([])),
    sync,
    uid,
    /** Nobody is nagged about backing up somebody else's playbook. */
    lastBackupAt: null as number | null,
    emptyTrash,
    saveNow,
    exportJson,
    /**
     * A restore replaces a whole book. That is the owner's call to make about
     * their own team, not an assistant's, so it is refused here in words.
     */
    importJson: (_text: string): never => {
      throw new Error('A backup can only be restored into your own playbook. Switch back to it first.');
    },
    reset: () => setSt((s) => ({ ...s, plays: [], sections: [], books: [] })),
  };
}
