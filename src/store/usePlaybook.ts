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
  pullFromCloud,
  pushToCloud,
  readLocal,
  writeLocal,
  type SyncState,
} from './sync';

const AUTOSAVE_MS = 800;

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
    let alive = true;
    setSync('syncing');
    void pullFromCloud(uid).then((res) => {
      if (!alive) return;
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
      const ours = local.uid === null || local.uid === uid;
      const base = ours ? { plays: local.plays, sections: local.sections } : EMPTY;
      const next = res.book ? mergeBooks(base, res.book) : base;

      loadedFor.current = uid;
      claim.current = uid;
      setPlays(next.plays);
      setSections(next.sections);
      writeLocal(next, uid);
      setSync('synced');
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  // Debounced autosave. Local first and synchronously, so a crash or a closed
  // tab between keystrokes costs nothing; the cloud follows when it can.
  useEffect(() => {
    const book = { plays: allPlays, sections };
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
