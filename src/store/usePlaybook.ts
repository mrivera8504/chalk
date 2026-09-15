import { useCallback, useEffect, useRef, useState } from 'react';
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
import { EMPTY, pullFromCloud, pushToCloud, readLocal, writeLocal, type SyncState } from './sync';

const AUTOSAVE_MS = 800;

let counter = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

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
  const [plays, setPlays] = useState<Play[]>(() => readLocal().plays);
  const [sections, setSections] = useState<Section[]>(() => readLocal().sections);
  const [sync, setSync] = useState<SyncState>('local');
  const timer = useRef<number | null>(null);
  const loaded = useRef(false);

  // Pull once on boot. The cloud copy wins only if it is genuinely newer, so a
  // stale device cannot quietly overwrite work done somewhere else.
  useEffect(() => {
    let alive = true;
    setSync('syncing');
    void pullFromCloud().then((remote) => {
      if (!alive) return;
      loaded.current = true;
      if (!remote) {
        setSync('local');
        return;
      }
      const local = readLocal();
      const localNewest = local.plays.reduce((n, p) => Math.max(n, p.updatedAt), 0);
      const remoteNewest = remote.plays.reduce((n, p) => Math.max(n, p.updatedAt), 0);
      if (remoteNewest > localNewest) {
        setPlays(remote.plays);
        setSections(remote.sections);
        writeLocal(remote);
      }
      setSync('synced');
    });
    return () => {
      alive = false;
    };
  }, []);

  // Debounced autosave. Local first and synchronously, so a crash or a closed
  // tab between keystrokes costs nothing; the cloud follows when it can.
  useEffect(() => {
    const book = { plays, sections };
    writeLocal(book);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!plays.length && !sections.length && !loaded.current) return;
      setSync('syncing');
      void pushToCloud(book).then(setSync);
    }, AUTOSAVE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [plays, sections]);

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

  const deletePlay = useCallback((id: string) => {
    setPlays((prev) => prev.filter((p) => p.id !== id));
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
      next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, moved);
      return next;
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
    setSync('syncing');
    setSync(await pushToCloud({ plays, sections }));
  }, [plays, sections]);

  /**
   * The backup file. Covers everything in local storage, not just the plays —
   * see store/backup.ts for why that distinction matters here.
   */
  const exportJson = useCallback(
    () => JSON.stringify(makeBackup({ plays, sections }), null, 2),
    [plays, sections],
  );

  /**
   * Put a backup back. Replaces rather than merges, because two copies of a
   * playbook with the same play ids is a worse place to be than either copy.
   * Returns what came back so the caller can say so out loud.
   */
  const importJson = useCallback((text: string) => {
    const { book, counts } = readBackup(text);
    setPlays(book.plays);
    setSections(book.sections);
    writeLocal(book);
    return counts;
  }, []);

  return {
    plays,
    sections,
    sync,
    savePlay,
    deletePlay,
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
