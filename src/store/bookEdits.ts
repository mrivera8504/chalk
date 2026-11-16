import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { withSuggestion } from '../domain/naming';
import { rulesFor, variantKey } from '../sports/football';
import {
  MAIN_BOOK,
  MAIN_BOOK_NAME,
  UNFILED_SECTION,
  bookOf,
  type Book,
  type Play,
  type PlayStatus,
  type Section,
} from '../domain/types';
import { getSettings } from './settings';
import type { Playbook } from './sync';

let counter = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Live first, thrown-away last.
 *
 * Reordering is done by index against the list the coach can see, so the two
 * have to line up: keeping the trash at the end means a live index is an array
 * index and `movePlay` needs to know nothing about any of this.
 */
export const order = (list: Play[]): Play[] => [
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
export function sameBook(a: Playbook, b: Playbook): boolean {
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
  const ab = a.books ?? [];
  const bb = b.books ?? [];
  if (ab.length !== bb.length) return false;
  for (let i = 0; i < ab.length; i++) {
    if (ab[i].id !== bb[i].id || ab[i].updatedAt !== bb[i].updatedAt) return false;
  }
  return true;
}

interface Ctx {
  setPlays: Dispatch<SetStateAction<Play[]>>;
  setSections: Dispatch<SetStateAction<Section[]>>;
  setBooks: Dispatch<SetStateAction<Book[]>>;
  /** The live playbooks, and the one on screen. */
  books: Book[];
  bookId: string;
  selectBook: (id: string) => void;
}

/**
 * Everything a coach can do to a book, apart from where it is kept.
 *
 * The coach's own book (`usePlaybook`) and a team they coach on
 * (`useTeamBook`) are kept in different places and synced by different rules,
 * and are edited in exactly the same ways. One copy of the edits, so a fix to
 * how a delete is stamped cannot reach one book and not the other.
 */
export function useBookEdits({ setPlays, setSections, setBooks, books, bookId, selectBook }: Ctx) {
  const savePlay = useCallback((play: Play) => {
    const stamped = withSuggestion({ ...play, updatedAt: Date.now() }, rulesFor(play.variant, getSettings()));
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
      order(
        prev.map((p) =>
          // Stamped, because a delete is an edit. Two copies of a play merge by
          // the newer stamp, and a delete that left the stamp alone tied with
          // the live copy on every other device and lost.
          p.id === id ? { ...p, deletedAt: Date.now(), updatedAt: Date.now() } : p,
        ),
      ),
    );
  }, []);

  const restorePlay = useCallback((id: string) => {
    setPlays((prev) =>
      order(
        prev.map((p) => {
          if (p.id !== id) return p;
          const { deletedAt: _gone, ...live } = p;
          return { ...live, updatedAt: Date.now() };
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

  const addSection = useCallback(
    (name: string) => {
      const section: Section = {
        id: newId('s'),
        name,
        order: Date.now(),
        ...(bookId === MAIN_BOOK ? {} : { bookId }),
      };
      setSections((prev) => [...prev, section]);
      return section;
    },
    [bookId],
  );

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
  /**
   * Put one play in front of another, or at the end of the live ones.
   *
   * By the play it lands before, not by a number. An index was an index into
   * the whole book, and the screen now shows one playbook out of several, so
   * the third card on screen is not the third play in the array.
   */
  const movePlay = useCallback((id: string, beforeId: string | null) => {
    setPlays((prev) => {
      const from = prev.findIndex((p) => p.id === id);
      if (from === -1 || id === beforeId) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      const at = beforeId === null ? -1 : next.findIndex((p) => p.id === beforeId);
      // No such play, or none named: the end of the live run, ahead of the trash.
      const live = next.filter((p) => !p.deletedAt).length;
      next.splice(at === -1 ? live : at, 0, moved);
      return order(next);
    });
  }, []);

  const setPlayStatus = useCallback((id: string, status: PlayStatus | undefined) => {
    setPlays((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const { status: _was, ...rest } = p;
        return { ...rest, ...(status ? { status } : {}), updatedAt: Date.now() };
      }),
    );
  }, []);


  const addBook = useCallback(
    (name: string, variant?: string) => {
      const kind = variantKey(variant);
      const book: Book = {
        id: newId('b'),
        name,
        order: Date.now(),
        updatedAt: Date.now(),
        ...(kind ? { variant: kind } : {}),
      };
      setBooks((prev) => [...prev, book]);
      selectBook(book.id);
      return book;
    },
    [selectBook],
  );

  const renameBook = useCallback((id: string, name: string) => {
    setBooks((prev) => {
      const now = Date.now();
      // The main playbook is implied until something is said about it, and
      // naming it is saying something.
      if (!prev.some((b) => b.id === id)) {
        return id === MAIN_BOOK ? [...prev, { id, name, order: 0, updatedAt: now }] : prev;
      }
      return prev.map((b) => (b.id === id ? { ...b, name, updatedAt: now } : b));
    });
  }, []);

  /**
   * Say what kind of football a playbook's new plays are.
   *
   * Only the plays made from here on: a play carries its own kind, so nothing
   * already drawn changes how many men it is counted against.
   */
  const setBookVariant = useCallback((id: string, variant?: string) => {
    const kind = variantKey(variant);
    setBooks((prev) => {
      const now = Date.now();
      const set = (b: Book): Book => {
        const { variant: _was, ...rest } = b;
        return { ...rest, ...(kind ? { variant: kind } : {}), updatedAt: now };
      };
      if (!prev.some((b) => b.id === id)) {
        // The main playbook is implied until something is said about it.
        return id === MAIN_BOOK && kind
          ? [...prev, set({ id, name: MAIN_BOOK_NAME, order: 0, updatedAt: now })]
          : prev;
      }
      return prev.map((b) => (b.id === id ? set(b) : b));
    });
  }, []);

  /** Remember (or forget) the link a playbook is shared at. */
  const setBookShare = useCallback((id: string, token?: string) => {
    setBooks((prev) => {
      const now = Date.now();
      const set = (b: Book): Book => {
        const { shareToken: _was, ...rest } = b;
        return { ...rest, ...(token ? { shareToken: token } : {}), updatedAt: now };
      };
      if (!prev.some((b) => b.id === id)) {
        return id === MAIN_BOOK && token
          ? [...prev, set({ id, name: MAIN_BOOK_NAME, order: 0, updatedAt: now })]
          : prev;
      }
      return prev.map((b) => (b.id === id ? set(b) : b));
    });
  }, []);

  /**
   * Take a playbook away, and lose nothing that was in it.
   *
   * Its plays go to the trash of the playbook that is left to show — moved
   * there, because a trash belonging to a book nobody can open is a trash
   * nobody can empty or take a play back out of. Its folders go, as a folder's
   * do when it is deleted. The book itself stays behind as a tombstone, so the
   * tablet does not hand it back to the phone on the next sync.
   *
   * The last playbook cannot go: there has to be somewhere for a play to be.
   */
  const deleteBook = useCallback(
    (id: string) => {
      const rest = books.filter((b) => b.id !== id);
      if (!rest.length) return false;
      const home = rest[0].id;
      const now = Date.now();
      const rehome = home === MAIN_BOOK ? {} : { bookId: home };
      setPlays((prev) =>
        order(
          prev.map((p) => {
            if (bookOf(p, books) !== id) return p;
            const { bookId: _was, ...play } = p;
            return { ...play, ...rehome, sectionId: UNFILED_SECTION, deletedAt: p.deletedAt ?? now, updatedAt: now };
          }),
        ),
      );
      setSections((prev) => prev.filter((sec) => bookOf(sec, books) !== id));
      setBooks((prev) => {
        const known = prev.some((b) => b.id === id);
        const gone: Book = {
          ...(prev.find((b) => b.id === id) ?? { id, name: MAIN_BOOK_NAME, order: 0 }),
          updatedAt: now,
          deletedAt: now,
        };
        return known ? prev.map((b) => (b.id === id ? gone : b)) : [...prev, gone];
      });
      selectBook(home);
      return true;
    },
    [books, selectBook],
  );

  /**
   * Put plays back from the cloud's history: ones emptied from the trash, or
   * missing since an earlier copy of the book.
   *
   * Only ever adds. A play still in the book, live or in the trash, is left
   * exactly as it is, so bringing back an old copy can never roll a play back
   * over newer work — the one way a rescue has cost a coach plays before.
   * Stamped now, because a purge is remembered by its time and a copy older
   * than that would be taken straight back out by the next sync.
   */
  const bringBack = useCallback(
    (plays: Play[]) => {
      const now = Date.now();
      setPlays((prev) => {
        const have = new Set(prev.map((p) => p.id));
        const fresh = plays
          .filter((p) => p?.id && !have.has(p.id))
          .map((p) => {
            const { deletedAt: _gone, ...live } = p;
            return { ...live, updatedAt: now };
          });
        return order([...prev, ...fresh]);
      });
    },
    [setPlays],
  );

  return {
    bringBack,
    savePlay,
    deletePlay,
    restorePlay,
    duplicatePlay,
    setPlaySection,
    addSection,
    renameSection,
    deleteSection,
    movePlay,
    setPlayStatus,
    addBook,
    renameBook,
    setBookVariant,
    setBookShare,
    deleteBook,
  };
}
