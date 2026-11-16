import type { Play } from '../domain/types';
import { readLocal, writeLocal, type Playbook, type StoredBook } from './sync';

/**
 * A second copy of the book on the device, somewhere with room.
 *
 * Local storage is the floor: written synchronously on every change, before
 * anything that can fail. It is also about five megabytes for the whole origin,
 * and several playbooks of heavily drawn plays can reach that. When they do,
 * `setItem` throws, and the floor used to give way silently — the session
 * carried on and nothing drawn after that point was on the device at all.
 *
 * So the book is also kept in IndexedDB, which has room, and three things
 * follow from having it:
 *
 * - **Local storage filling up loses nothing.** IndexedDB is asynchronous, so
 *   it cannot be the floor by itself — a write that has not landed when the
 *   tab closes is a write that did not happen. When the whole book no longer
 *   fits in local storage, what goes there instead is a *journal*: just the
 *   plays changed since IndexedDB last confirmed a save. That is small, it is
 *   synchronous, and with the copy in IndexedDB it is the whole book.
 * - **Local storage being cleared loses nothing.** Android evicts it under
 *   storage pressure and a browser can drop it. A missing key with a book
 *   still in IndexedDB is that, and the book is put back.
 * - Until either happens nothing changes: the app boots from local storage,
 *   synchronously, exactly as it always has.
 */

const DB = 'chalk';
const STORE = 'kv';
const BOOK = 'book';
const KEY = 'chalk.playbook.v1';
const OVERFLOW_KEY = 'chalk.playbook.overflow.v1';
const JOURNAL_KEY = 'chalk.journal.v1';
const FLUSH_MS = 400;

interface Journal extends Playbook {
  uid: string | null;
  /** Every play id the book holds, so one emptied from the trash stays gone. */
  ids: string[];
}

const has = () => typeof indexedDB !== 'undefined';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDeep(): Promise<StoredBook | null> {
  if (!has()) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(BOOK);
      req.onsuccess = () => resolve((req.result as StoredBook | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function saveDeep(book: StoredBook): Promise<boolean> {
  if (!has()) return false;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(book, BOOK);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

const flag = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Whether local storage has stopped holding the whole book. */
export const overflowing = () => flag(OVERFLOW_KEY) === '1';

/** Each play's stamp as IndexedDB last confirmed it. */
let flushed = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: StoredBook | null = null;

async function flush(): Promise<void> {
  timer = null;
  const book = pending;
  if (!book) return;
  if (!(await saveDeep(book))) return;
  flushed = new Map(book.plays.map((p) => [p.id, p.updatedAt]));
  // Everything the journal was holding is in IndexedDB now.
  if (pending === book && overflowing()) writeJournal(book);
}

function writeJournal(book: StoredBook): void {
  const changed = book.plays.filter((p) => flushed.get(p.id) !== p.updatedAt);
  const journal: Journal = {
    uid: book.uid,
    plays: changed,
    sections: book.sections,
    books: book.books ?? [],
    ids: book.plays.map((p) => p.id),
  };
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  } catch {
    /* The journal does not fit either. There is nowhere synchronous left. */
  }
}

/**
 * Write the book to the device. Synchronous where it counts.
 *
 * Local storage first, whole, as ever. If that no longer fits, the old whole
 * copy is taken out — it is stale from this moment and it is what is using the
 * room — and the journal goes in its place, in the same synchronous breath.
 * IndexedDB follows a moment later either way.
 */
export function persist(book: Playbook, uid: string | null): void {
  const stored: StoredBook = { ...book, uid };
  if (writeLocal(book, uid)) {
    if (overflowing()) {
      try {
        localStorage.removeItem(OVERFLOW_KEY);
        localStorage.removeItem(JOURNAL_KEY);
      } catch {
        /* harmless: a stale flag only costs a slower boot */
      }
    }
  } else if (has()) {
    try {
      localStorage.removeItem(KEY);
      localStorage.setItem(OVERFLOW_KEY, '1');
    } catch {
      /* fall through to the journal regardless */
    }
    writeJournal(stored);
  }
  if (!has()) return;
  pending = stored;
  if (timer === null) timer = setTimeout(() => void flush(), FLUSH_MS);
}

/**
 * The book to open with, when local storage alone cannot say.
 *
 * Null in the ordinary case, which is the whole book sitting in local storage:
 * there is nothing to recover and the app has already booted from it.
 */
export async function recover(): Promise<StoredBook | null> {
  if (!has()) return null;
  const deep = await loadDeep();

  if (overflowing()) {
    let journal: Partial<Journal> = {};
    try {
      journal = JSON.parse(flag(JOURNAL_KEY) ?? '{}') as Partial<Journal>;
    } catch {
      /* an unreadable journal leaves the IndexedDB copy, which is the bulk */
    }
    const plays = new Map<string, Play>((deep?.plays ?? []).map((p) => [p.id, p]));
    for (const p of journal.plays ?? []) plays.set(p.id, p);
    const keep = journal.ids ? new Set(journal.ids) : null;
    const merged = [...plays.values()].filter((p) => !keep || keep.has(p.id));
    flushed = new Map((deep?.plays ?? []).map((p) => [p.id, p.updatedAt]));
    return {
      plays: merged,
      sections: journal.sections ?? deep?.sections ?? [],
      books: journal.books ?? deep?.books ?? [],
      uid: journal.uid ?? deep?.uid ?? null,
    };
  }

  // The key is gone, not empty: the browser dropped it. An emptied book is
  // still a key with no plays in it, and that is not this.
  if (flag(KEY) === null && deep && (deep.plays.length || deep.sections.length)) return deep;

  if (deep) flushed = new Map(deep.plays.map((p) => [p.id, p.updatedAt]));
  return null;
}

/** The local book as it stands, wherever it is being kept. */
export function localBook(onScreen: Playbook, owner: string | null): StoredBook {
  // Past the overflow, storage holds a journal and not a book; the screen is
  // the only whole copy in reach of a synchronous read.
  return overflowing() ? { ...onScreen, uid: owner } : readLocal();
}

/** Between tests. */
export function resetDeep(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  pending = null;
  flushed = new Map();
}

/** For a test that needs IndexedDB to have caught up. */
export async function flushDeep(): Promise<void> {
  if (timer !== null) clearTimeout(timer);
  await flush();
}
