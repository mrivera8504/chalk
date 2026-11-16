import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyOnLine } from '../domain/legality';
import {
  baseFrontId,
  foundationDefense,
  foundationOffense,
  readFoundationId,
} from '../domain/presets/formations';
import { surfaceOf } from '../sports';
import { variantKey } from '../sports/football';
import {
  MAIN_BOOK,
  UNFILED_SECTION,
  bookOf,
  liveBooks,
  type Book,
  type Play,
  type Section,
  type Side,
} from '../domain/types';
import { getSettings } from './settings';
import { makeBackup, readBackup } from './backup';
import * as cloud2 from './cloud2';
import { newId, sameBook, useBookEdits } from './bookEdits';
import { syncKit } from './kit';
import { onKitChange } from './kitMeta';
import { localBook, overflowing, persist, recover } from './deep';
import {
  EMPTY,
  mergeBooks,
  type Playbook,
  listVersions,
  pullFromCloud,
  pushToCloud,
  readLocal,
  type SyncState,
} from './sync';

const AUTOSAVE_MS = 800;

/**
 * How long after a successful pull the app will not pull again on being
 * brought to the front.
 *
 * A coach checking the roster app and coming straight back is one glance at the
 * board, not a reason to read the document twice. Long enough to swallow that,
 * short enough that the phone-then-tablet case a coach actually does — draw it
 * on one, pick up the other — is always a fresh read.
 */
const FOREGROUND_PULL_MS = 5000;

/**
 * When a backup file was last written.
 *
 * Its own key, not part of the playbook: it describes this device's habits
 * rather than the book, and it must survive a restore that replaces everything
 * else. You cannot nag a coach into discipline, but you can put the gap on
 * screen — the only backup that existed when this was written was nine days
 * old, and that was the good case.
 */
const BACKUP_AT_KEY = 'chalk.backup.at.v1';

const CURRENT_BOOK_KEY = 'chalk.book.current.v1';

/** Whether local storage holds a book at all, empty or not. */
function bookInStorage(): boolean {
  try {
    return localStorage.getItem('chalk.playbook.v1') !== null;
  } catch {
    return false;
  }
}

/**
 * What this device knows about one account's per-play cloud.
 *
 * `known` is each play's stamp as last seen up there, which is how a push tells
 * a play it has changed from one it has not. `legacySeen` is the stamp of the
 * old single document when it was last merged in: a device still on an old
 * build goes on writing that document, so it is read every time — but merged
 * only when it has moved, or every folder deleted since the migration would
 * come back out of it on every sync.
 */
interface Sync2 {
  known: Record<string, number>;
  legacySeen: number;
}

const sync2Key = (uid: string) => `chalk.sync2.${uid}`;

function readSync2(uid: string): Sync2 {
  try {
    const raw = JSON.parse(localStorage.getItem(sync2Key(uid)) ?? '{}') as Partial<Sync2>;
    return { known: raw.known ?? {}, legacySeen: raw.legacySeen ?? 0 };
  } catch {
    return { known: {}, legacySeen: 0 };
  }
}

function writeSync2(uid: string, st: Sync2): void {
  try {
    localStorage.setItem(sync2Key(uid), JSON.stringify(st));
  } catch {
    /* worst case a play is sent twice */
  }
}

/** A clock on another device can be behind. Ask for this much more than we need. */
const PULL_SLACK_MS = 5 * 60 * 1000;

function readCurrentBook(): string {
  try {
    return localStorage.getItem(CURRENT_BOOK_KEY) ?? MAIN_BOOK;
  } catch {
    return MAIN_BOOK;
  }
}

function readBackupAt(): number | null {
  try {
    const raw = localStorage.getItem(BACKUP_AT_KEY);
    return raw ? Number(raw) || null : null;
  } catch {
    return null;
  }
}

export { newId } from './bookEdits';

/**
 * A new play, on one side of the ball or the other.
 *
 * A defensive play opens with a look already across from it, and that is not a
 * convenience: the gap map is computed from whoever is on the offensive line,
 * so a front with nobody across from it has no gaps, nothing to aim a blitz at
 * and nobody to cover. The unit is written down at creation and never changed
 * afterwards — every line on the board was drawn for one of them.
 */
export function blankPlay(
  sectionId = UNFILED_SECTION,
  unit: Side = 'offense',
  bookId: string = MAIN_BOOK,
  variant?: string,
  /** An empty board, for a drill: nobody on it until the coach adds them. */
  drill = false,
): Play {
  const kind = variantKey(variant);
  const surface = surfaceOf(kind);
  const players = drill
    ? []
    : applyOnLine(
    unit === 'defense'
      ? [...foundationOffense(kind), ...foundationDefense(kind)]
      : foundationOffense(kind),
    getSettings(),
  );
  const now = Date.now();
  return {
    id: newId('p'),
    name: '',
    unit,
    /*
     * The front it opened in, so the sheet can say "5-2 Cover 3" from the
     * first tap rather than only after somebody has been through the picker.
     * The starred one if there is one, and the built-in base if not — which is
     * exactly what foundationDefense() just put on the board.
     */
    ...(unit === 'defense'
      ? { defenseFormationId: readFoundationId('defense', kind) ?? baseFrontId(kind) }
      : {}),
    // And the offense's set, when one is starred: the depth chart can then fill
    // this play from that set's substitutions.
    ...(readFoundationId('offense', kind) ? { formationId: readFoundationId('offense', kind)! } : {}),
    // Only said when it is not seven-man, for the same reason as the book.
    ...(kind ? { variant: kind } : {}),
    ...(drill ? { drill: true } : {}),
    sectionId,
    // Only said when it is not the main one, so a play in the main playbook is
    // stored exactly as a play has always been stored.
    ...(bookId === MAIN_BOOK ? {} : { bookId }),
    players,
    // Somebody has the ball when a set starts, and it is the point guard.
    ...(surface === 'court' ? { ballCarrierId: players.find((p) => p.label === '1')?.id } : {}),
    // On a pitch it starts in midfield: the last man of the middle row.
    ...(surface === 'pitch'
      ? { ballCarrierId: players.filter((p) => p.side === 'offense')[Math.ceil(players.length / 2)]?.id }
      : {}),
    assignments: [],
    annotations: [],
    notes: '',
    coachingPoint: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * One document holds the whole playbook.
 *
 * The spec sketches a document per play, which is right for a playbook shared
 * between coaches. This one has a single user and a few dozen plays, so a
 * single document is a smaller thing to keep consistent, costs one read and one
 * write, and makes export a matter of handing over what is already in memory.
 * Splitting it later does not change the Play shape.
 */
export function usePlaybook() {
  /*
   * Every play the book holds, thrown-away ones included. What leaves this hook
   * as `plays` is the live ones — so every screen, the exporter and the editor's
   * scout library all carry on seeing exactly what they saw before, and the
   * trash is one place's problem rather than fifteen.
   */
  const [allPlays, setPlays] = useState<Play[]>(() => readLocal().plays);
  const [allSections, setSections] = useState<Section[]>(() => readLocal().sections);
  /** Every playbook this account has had, tombstones included. */
  const [storedBooks, setBooks] = useState<Book[]>(() => readLocal().books ?? []);
  /**
   * Which playbook is on screen. Kept on the device and not in the book: it is
   * where this coach was looking, and the phone and the tablet can each be
   * looking somewhere else.
   */
  const [wantedBook, setWantedBook] = useState<string>(readCurrentBook);

  const books = useMemo(() => liveBooks(storedBooks), [storedBooks]);
  // The one asked for, if it is still there. A book deleted on another device
  // must not leave this one showing an empty screen with no name on it.
  const bookId = books.some((b) => b.id === wantedBook) ? wantedBook : books[0].id;

  /** Every live play in the account, whichever playbook it is in. */
  const everyPlay = useMemo(() => allPlays.filter((p) => !p.deletedAt), [allPlays]);
  const plays = useMemo(
    () => everyPlay.filter((p) => bookOf(p, books) === bookId),
    [everyPlay, books, bookId],
  );
  const sections = useMemo(
    () => allSections.filter((sec) => bookOf(sec, books) === bookId),
    [allSections, books, bookId],
  );
  const trashed = useMemo(
    () =>
      allPlays
        .filter((p) => p.deletedAt && bookOf(p, books) === bookId)
        .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [allPlays, books, bookId],
  );
  const [sync, setSync] = useState<SyncState>('local');
  const [uid, setUid] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(() => readBackupAt());
  const timer = useRef<number | null>(null);

  /**
   * The account whose book is genuinely on screen — not "a pull finished".
   *
   * These were one flag, and that is what emptied accounts: a pull that failed
   * still set it, the app read that as "the cloud has nothing", and pushed its
   * own empty book over a real one. Nothing is ever pushed for a uid this does
   * not name.
   */
  const loadedFor = useRef<string | null>(null);
  /**
   * Which cloud this account is on: the single document, or one per play.
   *
   * Decided on every reconcile by asking, never assumed — the new shape needs
   * rules the owner has to publish, and until they are live the answer is the
   * old one and the app behaves exactly as it always has.
   */
  const mode = useRef<'v1' | 'v2' | null>(null);
  const sync2 = useRef<Sync2>({ known: {}, legacySeen: 0 });
  /** When this session last asked the per-play cloud what had changed. */
  const pulledSince = useRef(0);
  /** Whose book local storage holds, for the stretch before auth answers. */
  const claim = useRef<string | null>(readLocal().uid);

  useEffect(() => {
    let alive = true;
    let stop = () => {};
    void import('../firebase').then(({ watchUid }) => {
      if (alive) stop = watchUid(setUid);
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  /** Which uid a pull is answering, so one that lands late can be dropped. */
  const uidNow = useRef<string | null>(null);
  /** A pull is in the air, so the foreground one can stand down. */
  const pulling = useRef(false);
  /**
   * The book as it is on screen this moment.
   *
   * A pull has to compare its result against what the coach is looking at, and
   * `allPlays` inside `reconcile` would be the copy captured when the callback
   * was made. Written by the autosave effect below, which already builds it.
   */
  const onScreen = useRef<Playbook>({ plays: allPlays, sections: allSections, books: storedBooks });
  /** When one last succeeded, for the throttle below. */
  const pulledAt = useRef(0);
  const mounted = useRef(true);
  /**
   * The book on screen is the one this device actually holds.
   *
   * True from the first render in the ordinary case, where local storage has
   * the whole book and the state was read from it. False only when it does
   * not — the book outgrew local storage, or the browser dropped it — until
   * `recover` has brought the real one back from IndexedDB.
   */
  const hydrated = useRef(!overflowing() && bookInStorage());

  useEffect(() => {
    if (hydrated.current) {
      // Nothing to bring back, but let deep.ts learn what IndexedDB holds.
      void recover();
      return;
    }
    let alive = true;
    void recover().then((book) => {
      if (!alive) return;
      hydrated.current = true;
      if (book) {
        claim.current = book.uid;
        setPlays(book.plays);
        setSections(book.sections);
        setBooks(book.books ?? []);
      } else {
        // Whatever was drawn while that was in the air gets written now.
        setPlays((prev) => prev.slice());
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    uidNow.current = uid;
  }, [uid]);

  /**
   * Take what the cloud holds for this account and reconcile it with what is on
   * screen.
   *
   * One function with two callers — the account changing, and the app coming
   * back to the foreground — because they are the same job and a second copy of
   * this reasoning is how the four sync bugs happened in the first place.
   */
  const reconcile = useCallback(async (forUid: string) => {
    pulling.current = true;
    setSync('syncing');
    try {
      const stale = () => !mounted.current || uidNow.current !== forUid;
      const asked = Date.now();

      const shape = await cloud2.probe(forUid);
      // Signed out, or signed in as somebody else, while this was in the air.
      if (stale()) return;
      if (typeof shape === 'object') {
        // Unreachable is not empty. Leave loadedFor unset so nothing is pushed.
        setSync(shape.failed);
        return;
      }

      const res = await pullFromCloud(forUid);
      if (stale()) return;
      if (!res.ok) {
        setSync(res.state);
        return;
      }

      const local = localBook(onScreen.current, claim.current);
      /*
       * Whatever is on this device merges into the account, play by play —
       * including a book drawn under another uid.
       *
       * This once meant to replace such a book, and never did: the autosave
       * below restamps storage with the new uid the moment auth changes, so by
       * the time a pull landed every book read as this account's own. That was
       * found by a test and then kept on purpose. Replacing would throw away
       * plays drawn anonymously the moment a coach signed into an existing
       * account, leaving the only copy under a uid nobody can sign into again —
       * which is the stranded playbook this file was rewritten to prevent.
       * Merging loses nothing; the worst it does is carry plays across.
       */
      const base: Playbook = { plays: local.plays, sections: local.sections, books: local.books ?? [] };
      let next: Playbook;

      if (shape === 'denied') {
        // The new rules are not live. The single document, as ever.
        mode.current = 'v1';
        next = res.book ? mergeBooks(base, res.book) : base;
      } else {
        const st = readSync2(forUid);
        let merged = base;
        // The old document, when it has something we have not already taken.
        if (res.book && (shape === 'fresh' || (res.stamp ?? 0) > st.legacySeen)) {
          merged = mergeBooks(merged, res.book);
        }
        st.legacySeen = Math.max(st.legacySeen, res.stamp ?? 0);

        if (shape === 'fresh') {
          const moved = await cloud2.migrate(forUid, merged);
          if (stale()) return;
          if (moved === 'synced') {
            st.known = Object.fromEntries(merged.plays.map((p) => [p.id, p.updatedAt]));
            mode.current = 'v2';
          } else {
            // It did not take. Nothing was switched over, the old document is
            // untouched, and this session carries on with it.
            mode.current = 'v1';
          }
        } else {
          const got = await cloud2.pull(forUid, pulledSince.current);
          if (stale()) return;
          if (!got.ok) {
            setSync(got.state);
            return;
          }
          merged = mergeBooks(merged, got.book);
          // Emptied from the trash on another device: gone here too, unless
          // this copy was touched after it went.
          merged = {
            ...merged,
            plays: merged.plays.filter((p) => !((got.purged[p.id] ?? -1) >= (p.updatedAt ?? 0))),
          };
          const now = new Map(merged.plays.map((p) => [p.id, p.updatedAt]));
          for (const p of got.book.plays) {
            if (now.get(p.id) === p.updatedAt) st.known[p.id] = p.updatedAt;
          }
          for (const id of Object.keys(got.purged)) delete st.known[id];
          pulledSince.current = asked - PULL_SLACK_MS;
          mode.current = 'v2';
        }
        sync2.current = st;
        writeSync2(forUid, st);
        next = merged;
      }

      loadedFor.current = forUid;
      claim.current = forUid;
      // Unconditional, because this is also where storage is stamped with whose
      // book it is: an unclaimed one has to be claimed even when its contents
      // did not move an inch.
      persist(next, forUid);
      /*
       * Only when the merge actually changed something. Every setPlays runs the
       * autosave effect, so a pull that found nothing new would push the whole
       * book straight back up — once per app start before, and now once per trip
       * to another app and back, which is not a thing to do to a coach's data
       * plan on a sideline.
       *
       * Against what is on screen rather than against what the merge started
       * from: those are the same book on one device, and storage is the one
       * that can have moved underneath — a second tab of the same app writes
       * it, and comparing the merge with itself would leave the stale screen up.
       */
      if (!sameBook(onScreen.current, next)) {
        setPlays(next.plays);
        setSections(next.sections);
        setBooks(next.books ?? []);
      }
      pulledAt.current = Date.now();
      setSync('synced');
      // The team's kit rides along with the plays, once the account is on the
      // per-play cloud that holds it.
      if (mode.current === 'v2') void syncKit(forUid);
    } finally {
      pulling.current = false;
    }
  }, []);

  /*
   * And goes up a moment after the coach changes it here — a roster typed in
   * is a dozen writes in a minute, and one sync covers them.
   */
  useEffect(() => {
    if (!uid) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = onKitChange(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        if (loadedFor.current === uid && mode.current === 'v2') void syncKit(uid);
      }, 1500);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [uid]);

  /*
   * Reconcile whenever the account changes, not once on mount.
   *
   * Reading auth a single time at boot meant signing in never downloaded the
   * account you signed into — the debounce simply pushed this device's book
   * over it 800ms later.
   */
  useEffect(() => {
    // Nobody signed in — before auth answers, or after a sign-out. The book is
    // on this device and going nowhere, and the label should say exactly that
    // rather than leaving "saved" on screen for a cloud nobody is talking to.
    if (!uid) {
      setSync('local');
      return;
    }
    void reconcile(uid);
  }, [uid, reconcile]);

  /**
   * And again when the app comes back to the front, or the signal comes back.
   *
   * There is no listener on the document — one read at boot was the whole of
   * coming down from the cloud, so a tablet left open on the playbook screen
   * never saw a play drawn on the phone, however long it sat there. Both
   * signals here are the ones `store/update.ts` already listens to in order to
   * ask whether there is a new build, and for the same reasons: a resumed
   * install does not remount, so `visibilitychange` is the only word the app
   * gets that a coach has come back to it, and `online` is the only word it
   * gets that the field has signal again.
   *
   * They share one predicate rather than being two handlers, because they are
   * asking one question — is this worth a read right now — and the answer has
   * four parts.
   */
  useEffect(() => {
    if (!uid) return;
    const maybePull = () => {
      /*
       * Nobody is looking. A signal that comes back while the tablet is in a
       * bag is not worth a read: the coach cannot see the screen, and coming
       * back to it fires the other half of this pair anyway.
       */
      if (document.visibilityState !== 'visible') return;
      /*
       * The device says there is no network. `navigator.onLine` lies in one
       * direction only — true is a guess, false is certain — so this skips
       * exactly the pulls that could not have worked, and stops a sideline with
       * no bars flashing the label through syncing and back to offline every
       * time a coach picks the tablet up. The `online` event is what undoes it.
       */
      if (!navigator.onLine) return;
      /*
       * Deliberately not a guard inside `reconcile` itself. A pull kicked off
       * by signing in has to run whatever else is in the air — bailing there
       * would leave the new account with `loadedFor` unset and its book
       * undownloaded until the next launch, which is the shape of the bug that
       * stranded a playbook in the first place.
       */
      if (pulling.current) return;
      /*
       * A coach flicking between this and the roster app is one glance, not a
       * reason to read the document five times, and a connection flapping at
       * the edge of a field is not five either. A pull that failed sets no
       * stamp, so this never throttles the retry that matters.
       */
      if (Date.now() - pulledAt.current < FOREGROUND_PULL_MS) return;
      void reconcile(uid);
    };
    document.addEventListener('visibilitychange', maybePull);
    window.addEventListener('online', maybePull);
    return () => {
      document.removeEventListener('visibilitychange', maybePull);
      window.removeEventListener('online', maybePull);
    };
  }, [uid, reconcile]);

  // Debounced autosave. Local first and synchronously, so a crash or a closed
  // tab between keystrokes costs nothing; the cloud follows when it can.
  useEffect(() => {
    const book = { plays: allPlays, sections: allSections, books: storedBooks };
    onScreen.current = book;
    // Not until the book that was really on this device is on screen: past an
    // overflow the first render is a stale copy, and saving that would be the
    // stale copy overwriting the journal that holds the newer one.
    if (!hydrated.current) return;
    // Always, and before anything can fail — local storage is the floor, and
    // work drawn while auth is still resolving has to survive on its own.
    persist(book, uid ?? claim.current);
    if (!uid || loadedFor.current !== uid) return;

    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSync('syncing');
      void sendUp(book, uid).then(setSync);
    }, AUTOSAVE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [allPlays, allSections, storedBooks, uid]);

  /** Push to whichever cloud this account is on. */
  const sendUp = useCallback(async (book: Playbook, toUid: string): Promise<SyncState> => {
    if (mode.current !== 'v2') return pushToCloud(book, toUid);
    const sent = await cloud2.push(toUid, book, sync2.current.known);
    sync2.current.known = sent.known;
    writeSync2(toUid, sync2.current);
    return sent.state;
  }, []);

  const selectBook = useCallback((id: string) => {
    setWantedBook(id);
    try {
      localStorage.setItem(CURRENT_BOOK_KEY, id);
    } catch {
      /* storage blocked; the session keeps working */
    }
  }, []);

  const edits = useBookEdits({ setPlays, setSections, setBooks, books, bookId, selectBook });

  const emptyTrash = useCallback(() => {
    // This playbook's trash, which is the one on screen being emptied.
    const going = allPlays.filter((p) => p.deletedAt && bookOf(p, books) === bookId);
    const ids = new Set(going.map((p) => p.id));
    setPlays((prev) => prev.filter((p) => !ids.has(p.id)));
    /*
     * And out of the cloud, by name. With one document per play nothing leaves
     * by being left out of a write, so this is said outright — and remembered
     * there, which is what stops another device handing the trash back.
     */
    if (uid && loadedFor.current === uid && mode.current === 'v2') {
      for (const id of ids) delete sync2.current.known[id];
      writeSync2(uid, sync2.current);
      void cloud2.purge(uid, going).then((state) => state !== 'synced' && setSync(state));
    }
  }, [allPlays, books, bookId, uid]);

  /** What the cloud remembers of the whole book: emptied plays, and earlier copies. */
  const bookHistory = useCallback(
    async () => ({
      purged: uid && mode.current === 'v2' ? await cloud2.listPurged(uid) : [],
      versions: uid ? await listVersions(uid) : [],
    }),
    [uid],
  );

  const saveNow = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    // Same rule as the debounce: a book nobody has reconciled for this account
    // is not a book to write over that account.
    if (!uid || loadedFor.current !== uid) return;
    setSync('syncing');
    setSync(await sendUp({ plays: allPlays, sections: allSections, books: storedBooks }, uid));
  }, [allPlays, allSections, storedBooks, uid, sendUp]);

  /**
   * The backup file. Covers everything in local storage, not just the plays —
   * see store/backup.ts for why that distinction matters here.
   */
  const exportJson = useCallback(
    // The trash goes into the file too: a backup that quietly dropped what the
    // coach had not finished deciding about would be the loss this prevents.
    () => {
      const json = JSON.stringify(
        makeBackup({ plays: allPlays, sections: allSections, books: storedBooks }),
        null,
        2,
      );
      const now = Date.now();
      try {
        localStorage.setItem(BACKUP_AT_KEY, String(now));
      } catch {
        /* storage blocked; the file still downloads, the nudge just will not clear */
      }
      setLastBackupAt(now);
      return json;
    },
    [allPlays, allSections, storedBooks],
  );

  /**
   * Put a backup back. Replaces rather than merges, because two copies of a
   * playbook with the same play ids is a worse place to be than either copy.
   * Returns what came back so the caller can say so out loud.
   */
  const importJson = useCallback(
    (text: string) => {
      const { book, counts } = readBackup(text);
      setPlays(book.plays);
      setSections(book.sections);
      setBooks(book.books ?? []);
      persist(book, uid ?? claim.current);
      /*
       * Pushed now rather than on the debounce, because the restore screen
       * reloads 600ms later and the debounce is 800. Left to the timer, the
       * restored book would still be local-only at reload, and the reconcile
       * that runs next would merge the copy the file was meant to replace back
       * into it. A restore replaces; this is what makes that true of the cloud
       * as well as the screen.
       */
      if (timer.current) window.clearTimeout(timer.current);
      // Forced past the shrink guard on purpose: restoring a small backup over
      // a large book is exactly the shape the guard refuses, and here it is
      // what the coach just confirmed in as many words. What it replaces is
      // kept as a version first, so this is still undoable.
      if (uid && loadedFor.current === uid) {
        if (mode.current === 'v2') {
          sync2.current.known = Object.fromEntries(book.plays.map((p) => [p.id, p.updatedAt]));
          writeSync2(uid, sync2.current);
          void cloud2.replaceAll(uid, book).then(setSync);
        } else {
          void pushToCloud(book, uid, { force: true }).then(setSync);
        }
      }
      return counts;
    },
    [uid],
  );

  return {
    plays,
    /** Every live play in the account, for finding one by its address. */
    everyPlay,
    trashed,
    sections,
    books,
    bookId,
    selectBook,
    ...edits,
    /** What the cloud remembers of the whole book: emptied plays, and earlier copies. */
    bookHistory,
    /** Past copies of one play. Empty until the account is on per-play documents. */
    revisions: (playId: string) =>
      uid && mode.current === 'v2' ? cloud2.listRevisions(uid, playId) : Promise.resolve([]),
    sync,
    /** Who is signed in, for the teams this account coaches on. */
    uid,
    lastBackupAt,
    emptyTrash,
    saveNow,
    exportJson,
    importJson,
    reset: () => {
      setPlays(EMPTY.plays);
      setSections(EMPTY.sections);
      setBooks([]);
    },
  };
}
