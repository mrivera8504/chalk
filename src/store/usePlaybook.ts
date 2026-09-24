import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyOnLine } from '../domain/legality';
import { withSuggestion } from '../domain/naming';
import {
  foundationDefense,
  foundationOffense,
  readFoundationId,
} from '../domain/presets/formations';
import { UNFILED_SECTION, type Play, type Section, type Side } from '../domain/types';
import { getSettings } from './settings';
import { makeBackup, readBackup } from './backup';
import {
  EMPTY,
  mergeBooks,
  type Playbook,
  pullFromCloud,
  pushToCloud,
  readLocal,
  writeLocal,
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

function readBackupAt(): number | null {
  try {
    const raw = localStorage.getItem(BACKUP_AT_KEY);
    return raw ? Number(raw) || null : null;
  } catch {
    return null;
  }
}

let counter = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Live first, thrown-away last.
 *
 * Reordering is done by index against the list the coach can see, so the two
 * have to line up: keeping the trash at the end means a live index is an array
 * index and `movePlay` needs to know nothing about any of this.
 */
const order = (list: Play[]): Play[] => [
  ...list.filter((p) => !p.deletedAt),
  ...list.filter((p) => p.deletedAt),
];

/**
 * Do these two books say the same thing?
 *
 * Every save stamps `updatedAt`, so an id, that stamp and whether the play is
 * in the trash is the whole of what a merge can have changed about it — no need
 * to walk a hundred plays' worth of paths and ink to find out. Order counts,
 * because the order of the array is the order of the cards.
 */
function sameBook(a: Playbook, b: Playbook): boolean {
  if (a.plays.length !== b.plays.length || a.sections.length !== b.sections.length) return false;
  for (let i = 0; i < a.plays.length; i++) {
    const x = a.plays[i];
    const y = b.plays[i];
    if (x.id !== y.id || x.updatedAt !== y.updatedAt || x.deletedAt !== y.deletedAt) return false;
  }
  for (let i = 0; i < a.sections.length; i++) {
    const x = a.sections[i];
    const y = b.sections[i];
    if (x.id !== y.id || x.name !== y.name || x.order !== y.order) return false;
  }
  return true;
}

/**
 * A new play, on one side of the ball or the other.
 *
 * A defensive play opens with a look already across from it, and that is not a
 * convenience: the gap map is computed from whoever is on the offensive line,
 * so a front with nobody across from it has no gaps, nothing to aim a blitz at
 * and nobody to cover. The unit is written down at creation and never changed
 * afterwards — every line on the board was drawn for one of them.
 */
export function blankPlay(sectionId = UNFILED_SECTION, unit: Side = 'offense'): Play {
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
      ? { defenseFormationId: readFoundationId('defense') ?? 'builtin-5-2' }
      : {}),
    sectionId,
    players: applyOnLine(
      unit === 'defense' ? [...foundationOffense(), ...foundationDefense()] : foundationOffense(),
      getSettings(),
    ),
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
  const [sections, setSections] = useState<Section[]>(() => readLocal().sections);
  const plays = useMemo(() => allPlays.filter((p) => !p.deletedAt), [allPlays]);
  const trashed = useMemo(
    () => allPlays.filter((p) => p.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [allPlays],
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
  const onScreen = useRef<Playbook>({ plays: allPlays, sections });
  /** When one last succeeded, for the throttle below. */
  const pulledAt = useRef(0);
  const mounted = useRef(true);

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
      const res = await pullFromCloud(forUid);
      // Signed out, or signed in as somebody else, while this was in the air.
      if (!mounted.current || uidNow.current !== forUid) return;
      if (!res.ok) {
        // Unreachable is not empty. Leave loadedFor unset so nothing is pushed.
        setSync(res.state);
        return;
      }

      const local = readLocal();
      /*
       * A book carrying another uid belongs to the account that was signed in
       * before this one, and the account screen promises signing in replaces
       * what is on screen. Only an unclaimed book — one drawn before auth
       * answered, or written by a build that predates the uid being stored —
       * merges into the account that picks it up.
       */
      const ours = local.uid === null || local.uid === forUid;
      const base = ours ? { plays: local.plays, sections: local.sections } : EMPTY;
      const next = res.book ? mergeBooks(base, res.book) : base;

      loadedFor.current = forUid;
      claim.current = forUid;
      // Unconditional, because this is also where storage is stamped with whose
      // book it is: an unclaimed one has to be claimed even when its contents
      // did not move an inch.
      writeLocal(next, forUid);
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
      }
      pulledAt.current = Date.now();
      setSync('synced');
    } finally {
      pulling.current = false;
    }
  }, []);

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
   * And again every time the app comes back to the front.
   *
   * There is no listener on the document — one read at boot was the whole of
   * coming down from the cloud, so a tablet left open on the playbook screen
   * never saw a play drawn on the phone, however long it sat there. The fix is
   * the one `store/update.ts` already uses to ask whether there is a new build:
   * the moment a coach returns to the app is the moment they are about to read
   * what is on it. A resumed install does not remount, so this is the only
   * signal there is.
   *
   * It also retries a pull that failed. A tablet booted on a field with no
   * signal has `loadedFor` unset and cannot push at all; coming back to the app
   * in range is what finally reconciles it.
   */
  useEffect(() => {
    if (!uid) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // A coach flicking between this and the roster app is one glance, not a
      // reason to read the document five times. A failed pull sets no stamp, so
      // this never throttles a retry.
      if (Date.now() - pulledAt.current < FOREGROUND_PULL_MS) return;
      /*
       * Deliberately not a guard inside `reconcile` itself. A pull kicked off
       * by signing in has to run whatever else is in the air — bailing there
       * would leave the new account with `loadedFor` unset and its book
       * undownloaded until the next launch, which is the shape of the bug that
       * stranded a playbook in the first place.
       */
      if (pulling.current) return;
      void reconcile(uid);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [uid, reconcile]);

  // Debounced autosave. Local first and synchronously, so a crash or a closed
  // tab between keystrokes costs nothing; the cloud follows when it can.
  useEffect(() => {
    const book = { plays: allPlays, sections };
    onScreen.current = book;
    // Always, and before anything can fail — local storage is the floor, and
    // work drawn while auth is still resolving has to survive on its own.
    writeLocal(book, uid ?? claim.current);
    if (!uid || loadedFor.current !== uid) return;

    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSync('syncing');
      void pushToCloud(book, uid).then(setSync);
    }, AUTOSAVE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [allPlays, sections, uid]);

  const savePlay = useCallback((play: Play) => {
    const stamped = withSuggestion({ ...play, updatedAt: Date.now() }, getSettings());
    setPlays((prev) => {
      const i = prev.findIndex((p) => p.id === stamped.id);
      if (i === -1) return [...prev, stamped];
      const next = prev.slice();
      next[i] = stamped;
      return next;
    });
  }, []);

  /**
   * Throw a play away without losing it.
   *
   * It leaves every list immediately, which is the whole of what a delete has
   * to feel like, and it is still in the book underneath until the trash is
   * emptied on purpose. The one loss this app could cause with nobody's bug
   * involved was a mis-tap on the wrong card.
   */
  const deletePlay = useCallback((id: string) => {
    setPlays((prev) =>
      order(prev.map((p) => (p.id === id ? { ...p, deletedAt: Date.now() } : p))),
    );
  }, []);

  const restorePlay = useCallback((id: string) => {
    setPlays((prev) =>
      order(
        prev.map((p) => {
          if (p.id !== id) return p;
          const { deletedAt: _gone, ...live } = p;
          return live;
        }),
      ),
    );
  }, []);

  /**
   * Empty the trash for good.
   *
   * Not swept on a timer. A sweep large enough to matter is indistinguishable
   * from the bug the shrink guard exists to catch, so it would either trip the
   * guard and jam the sync or have to be exempted from it — and an exemption
   * that deletes plays on a schedule is exactly the thing not to build. The
   * coach says when.
   */
  const emptyTrash = useCallback(() => {
    setPlays((prev) => prev.filter((p) => !p.deletedAt));
  }, []);

  const duplicatePlay = useCallback((id: string) => {
    setPlays((prev) => {
      const src = prev.find((p) => p.id === id);
      if (!src) return prev;
      const now = Date.now();
      const copy: Play = {
        ...structuredClone(src),
        id: newId('p'),
        name: src.name ? `${src.name} copy` : '',
        createdAt: now,
        updatedAt: now,
      };
      const at = prev.findIndex((p) => p.id === id);
      return [...prev.slice(0, at + 1), copy, ...prev.slice(at + 1)];
    });
  }, []);

  /** Move a play into a folder, or out to Unfiled. */
  const setPlaySection = useCallback((id: string, sectionId: string) => {
    setPlays((prev) =>
      prev.map((p) => (p.id === id ? { ...p, sectionId, updatedAt: Date.now() } : p)),
    );
  }, []);

  const addSection = useCallback((name: string) => {
    const section: Section = { id: newId('s'), name, order: Date.now() };
    setSections((prev) => [...prev, section]);
    return section;
  }, []);

  const renameSection = useCallback((id: string, name: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }, []);

  const deleteSection = useCallback((id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    setPlays((prev) =>
      prev.map((p) => (p.sectionId === id ? { ...p, sectionId: UNFILED_SECTION } : p)),
    );
  }, []);

  /** Drag to reorder within the flat list; sections read their own order off it. */
  const movePlay = useCallback((id: string, toIndex: number) => {
    setPlays((prev) => {
      const from = prev.findIndex((p) => p.id === id);
      if (from === -1) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      // Clamped to the live run rather than the whole array, or a card dragged
      // to the end would land among the thrown-away ones and come back deleted.
      const live = next.filter((p) => !p.deletedAt).length;
      next.splice(Math.max(0, Math.min(live, toIndex)), 0, moved);
      return order(next);
    });
  }, []);

  /**
   * Push now instead of waiting out the debounce.
   *
   * The local copy is already written synchronously on every change, so this is
   * only ever about the cloud. Cancels the pending timer first, or the debounce
   * fires again a moment later and pushes the very same document twice.
   */
  const saveNow = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    // Same rule as the debounce: a book nobody has reconciled for this account
    // is not a book to write over that account.
    if (!uid || loadedFor.current !== uid) return;
    setSync('syncing');
    setSync(await pushToCloud({ plays: allPlays, sections }, uid));
  }, [allPlays, sections, uid]);

  /**
   * The backup file. Covers everything in local storage, not just the plays —
   * see store/backup.ts for why that distinction matters here.
   */
  const exportJson = useCallback(
    // The trash goes into the file too: a backup that quietly dropped what the
    // coach had not finished deciding about would be the loss this prevents.
    () => {
      const json = JSON.stringify(makeBackup({ plays: allPlays, sections }), null, 2);
      const now = Date.now();
      try {
        localStorage.setItem(BACKUP_AT_KEY, String(now));
      } catch {
        /* storage blocked; the file still downloads, the nudge just will not clear */
      }
      setLastBackupAt(now);
      return json;
    },
    [allPlays, sections],
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
      writeLocal(book, uid ?? claim.current);
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
        void pushToCloud(book, uid, { force: true }).then(setSync);
      }
      return counts;
    },
    [uid],
  );

  return {
    plays,
    trashed,
    sections,
    sync,
    lastBackupAt,
    savePlay,
    deletePlay,
    restorePlay,
    emptyTrash,
    duplicatePlay,
    setPlaySection,
    saveNow,
    addSection,
    renameSection,
    deleteSection,
    movePlay,
    exportJson,
    importJson,
    reset: () => {
      setPlays(EMPTY.plays);
      setSections(EMPTY.sections);
    },
  };
}
