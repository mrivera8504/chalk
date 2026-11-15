import { readFileSync } from 'node:fs';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIN_BOOK, bookOf, liveBooks, type Book, type Play } from '../../src/domain/types';
import { play } from '../fixtures/plays';
import { current, mainPath, makeCloud, type FakeCloud } from './fakeFirestore';

const auth = { listener: null as ((uid: string | null) => void) | null };
vi.mock('../../src/firebase', () => ({
  db: {},
  watchUid: (fn: (uid: string | null) => void) => {
    auth.listener = fn;
    return () => {
      auth.listener = null;
    };
  },
}));

import { readBackup } from '../../src/store/backup';
import { mergeBooks, readLocal, writeLocal } from '../../src/store/sync';
import { usePlaybook } from '../../src/store/usePlaybook';

let cloud: FakeCloud;
const p = (id: string, over: Partial<Play> = {}) => play({ id, updatedAt: 1000, ...over });
const b = (id: string, name: string, over: Partial<Book> = {}): Book => ({ id, name, order: 1, updatedAt: 1000, ...over });
const stored = () => JSON.parse(localStorage.getItem('chalk.playbook.v1') ?? '{}') as { plays: Play[]; books?: Book[] };
const ids = (plays: Play[]) => plays.map((x) => x.id);
const settle = () =>
  act(async () => {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(5);
    }
  });

beforeAll(async () => {
  await import('firebase/firestore');
  await import('../../src/firebase');
});
beforeEach(() => {
  cloud = current.cloud = makeCloud();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('which playbooks there are', () => {
  it('is one, unnamed until somebody names it, for a book that has never heard of them', () => {
    expect(liveBooks([])).toEqual([{ id: MAIN_BOOK, name: 'Playbook', order: 0, updatedAt: 0 }]);
  });

  it('keeps the main one beside any that were added', () => {
    expect(liveBooks([b('b2', 'JV')]).map((x) => x.id)).toEqual([MAIN_BOOK, 'b2']);
  });

  it('lets the main one be renamed, and be deleted on purpose', () => {
    expect(liveBooks([b(MAIN_BOOK, 'Varsity', { order: 0 })])[0].name).toBe('Varsity');
    expect(liveBooks([b(MAIN_BOOK, 'x', { deletedAt: 5 }), b('b2', 'JV')]).map((x) => x.id)).toEqual(['b2']);
  });

  it('is never none: with every book deleted the main one comes back', () => {
    expect(liveBooks([b(MAIN_BOOK, 'x', { deletedAt: 5 }), b('b2', 'JV', { deletedAt: 5 })]).map((x) => x.id)).toEqual([MAIN_BOOK]);
  });
});

describe('which playbook a play is in', () => {
  const books = liveBooks([b('b2', 'JV')]);

  it('is the main one when it does not say, which is every play ever saved', () => {
    expect(bookOf(p('a'), books)).toBe(MAIN_BOOK);
  });

  it('is its own when that book is there', () => {
    expect(bookOf(p('a', { bookId: 'b2' }), books)).toBe('b2');
  });

  it('is the first one left when its own is gone, so it is never hidden', () => {
    expect(bookOf(p('a', { bookId: 'deleted-elsewhere' }), books)).toBe(MAIN_BOOK);
    const mainGone = liveBooks([b(MAIN_BOOK, 'x', { deletedAt: 5 }), b('b2', 'JV')]);
    expect(bookOf(p('a'), mainGone)).toBe('b2');
  });
});

describe('merging the book list', () => {
  it('takes the newer copy of each, so a rename and a delete both travel', () => {
    const merged = mergeBooks(
      { plays: [], sections: [], books: [b('b2', 'JV', { updatedAt: 1000 }), b('b3', 'Old', { updatedAt: 1000 })] },
      { plays: [], sections: [], books: [b('b2', 'Junior varsity', { updatedAt: 2000 }), b('b3', 'Old', { updatedAt: 3000, deletedAt: 3000 })] },
    );
    expect(merged.books!.find((x) => x.id === 'b2')!.name).toBe('Junior varsity');
    expect(merged.books!.find((x) => x.id === 'b3')!.deletedAt).toBe(3000);
  });

  it('keeps this device\'s list when the other side is a build with no list at all', () => {
    const merged = mergeBooks({ plays: [], sections: [], books: [b('b2', 'JV')] }, { plays: [p('a', { bookId: 'b2' })], sections: [] });
    expect(merged.books).toEqual([b('b2', 'JV')]);
    expect(merged.plays[0].bookId).toBe('b2');
  });
});

describe('a book saved before there were playbooks', () => {
  const v1 = () => JSON.parse(readFileSync('tests/fixtures/backup-v1.json', 'utf8'));

  it('opens with every play in the one playbook, and rewrites none of them', async () => {
    const before = v1().plays as Play[];
    // Exactly as version 1 wrote it: no books key at all.
    localStorage.setItem('chalk.playbook.v1', JSON.stringify({ plays: before, sections: v1().sections, uid: null }));
    const { result } = renderHook(() => usePlaybook());
    await settle();
    expect(result.current.books.map((x) => x.name)).toEqual(['Playbook']);
    expect(ids(result.current.plays)).toEqual(['sweep', 'cover3']);
    expect(ids(result.current.trashed)).toEqual(['oldest']);
    expect(result.current.sections.map((x) => x.id)).toEqual(['s1']);
    // Byte for byte what was there: no bookId written, no stamp moved.
    expect(stored().plays).toEqual(before);
  });

  it('restores from a version 1 backup file the same way', () => {
    const { book } = readBackup(readFileSync('tests/fixtures/backup-v1.json', 'utf8'));
    expect(book.books).toEqual([]);
    expect(book.plays.every((x) => x.bookId === undefined)).toBe(true);
  });
});

describe('several playbooks', () => {
  const start = async (plays: Play[] = [p('a'), p('b')]) => {
    writeLocal({ plays, sections: [{ id: 's1', name: 'Run', order: 1 }] }, null);
    const hook = renderHook(() => usePlaybook());
    await settle();
    return hook.result;
  };

  it('adds one, opens it empty, and leaves the first exactly as it was', async () => {
    const r = await start();
    act(() => { r.current.addBook('JV'); });
    expect(r.current.books.map((x) => x.name)).toEqual(['Playbook', 'JV']);
    expect(r.current.plays).toEqual([]);
    expect(r.current.sections).toEqual([]);
    act(() => r.current.selectBook(MAIN_BOOK));
    expect(ids(r.current.plays)).toEqual(['a', 'b']);
    expect(stored().plays.every((x) => x.bookId === undefined)).toBe(true);
  });

  it('puts a folder made in a playbook in that playbook', async () => {
    const r = await start();
    act(() => { r.current.addBook('JV'); });
    act(() => { r.current.addSection('Goal line'); });
    expect(r.current.sections.map((x) => x.name)).toEqual(['Goal line']);
    act(() => r.current.selectBook(MAIN_BOOK));
    expect(r.current.sections.map((x) => x.name)).toEqual(['Run']);
  });

  it('remembers on this device which one was open', async () => {
    const r = await start();
    let id = '';
    act(() => { id = r.current.addBook('JV').id; });
    cleanup();
    const again = renderHook(() => usePlaybook());
    await settle();
    expect(again.result.current.bookId).toBe(id);
  });

  it('names the main one by storing it, and not before', async () => {
    const r = await start();
    expect(stored().books).toEqual([]);
    act(() => r.current.renameBook(MAIN_BOOK, 'Varsity'));
    expect(r.current.books[0].name).toBe('Varsity');
    expect(stored().books!.map((x) => x.id)).toEqual([MAIN_BOOK]);
  });

  it('deletes one without losing a play: they go to the trash of the book that is left', async () => {
    const r = await start();
    let jv = '';
    act(() => { jv = r.current.addBook('JV').id; });
    act(() => r.current.savePlay(p('j1', { bookId: jv })));
    act(() => r.current.savePlay(p('j2', { bookId: jv })));
    act(() => { r.current.deleteBook(jv); });

    expect(r.current.books.map((x) => x.name)).toEqual(['Playbook']);
    expect(r.current.bookId).toBe(MAIN_BOOK);
    expect(ids(r.current.plays)).toEqual(['a', 'b']);
    expect(ids(r.current.trashed).sort()).toEqual(['j1', 'j2']);
    // Still in the book, and one tap from back.
    act(() => r.current.restorePlay('j1'));
    expect(ids(r.current.plays)).toEqual(['a', 'b', 'j1']);
    // A tombstone, so another device does not hand the book back.
    expect(stored().books!.find((x) => x.id === jv)!.deletedAt).toBeGreaterThan(0);
  });

  it('will not delete the last one', async () => {
    const r = await start();
    let ok = true;
    act(() => { ok = r.current.deleteBook(MAIN_BOOK); });
    expect(ok).toBe(false);
    expect(ids(r.current.plays)).toEqual(['a', 'b']);
  });

  it('can delete the main one once there is another, and its plays survive', async () => {
    const r = await start();
    let jv = '';
    act(() => { jv = r.current.addBook('JV').id; });
    act(() => { r.current.deleteBook(MAIN_BOOK); });
    expect(r.current.books.map((x) => x.id)).toEqual([jv]);
    expect(ids(r.current.trashed).sort()).toEqual(['a', 'b']);
  });

  it('empties only the trash of the playbook on screen', async () => {
    const r = await start([p('a'), p('gone', { deletedAt: 5 })]);
    let jv = '';
    act(() => { jv = r.current.addBook('JV').id; });
    act(() => r.current.savePlay(p('j1', { bookId: jv, deletedAt: 6 })));
    act(() => r.current.emptyTrash());
    expect(ids(stored().plays)).toEqual(['a', 'gone']);
  });

  it('moves a play in front of another by naming it, whatever else is in the account', async () => {
    const r = await start([p('other', { bookId: 'nope' }), p('a'), p('b'), p('c')]);
    act(() => r.current.movePlay('c', 'a'));
    expect(ids(r.current.plays)).toEqual(['other', 'c', 'a', 'b']);
  });

  it('sends the book list to the cloud and brings it back on another device', async () => {
    const r = await start();
    await act(async () => { auth.listener?.('u1'); });
    await settle();
    act(() => { r.current.addBook('JV'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect((cloud.docs.get(mainPath('u1'))!.books as Book[]).map((x) => x.name)).toEqual(['JV']);

    cleanup();
    localStorage.clear();
    const other = renderHook(() => usePlaybook());
    await settle();
    await act(async () => { auth.listener?.('u1'); });
    await settle();
    expect(other.result.current.books.map((x) => x.name)).toEqual(['Playbook', 'JV']);
    expect(readLocal().books!.map((x) => x.name)).toEqual(['JV']);
  });
});

describe('where the team is with a play', () => {
  it('is set, changed and cleared, and counts as an edit of that play', async () => {
    writeLocal({ plays: [p('a')], sections: [] }, null);
    const { result: r } = renderHook(() => usePlaybook());
    await settle();
    act(() => r.current.setPlayStatus('a', 'installing'));
    expect(r.current.plays[0]).toMatchObject({ status: 'installing', updatedAt: Date.now() });
    act(() => r.current.setPlayStatus('a', undefined));
    expect(r.current.plays[0]).not.toHaveProperty('status');
  });
});
