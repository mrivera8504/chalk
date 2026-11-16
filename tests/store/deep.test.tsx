import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Play } from '../../src/domain/types';
import { play } from '../fixtures/plays';
import { current, makeCloud, oldRules } from './fakeFirestore';

vi.mock('../../src/firebase', () => ({ db: {}, watchUid: () => () => {} }));

import { flushDeep, loadDeep, overflowing, persist, recover, resetDeep } from '../../src/store/deep';
import { readLocal } from '../../src/store/sync';
import { usePlaybook } from '../../src/store/usePlaybook';

const KEY = 'chalk.playbook.v1';
const p = (id: string, updatedAt = 1000, over: Partial<Play> = {}) => play({ id, updatedAt, ...over });
const book = (...plays: Play[]) => ({ plays, sections: [{ id: 's1', name: 'Run', order: 1 }], books: [] });
const ids = (plays: Play[]) => plays.map((x) => x.id).sort();

/** Local storage that will not take the whole book, as a full one will not. */
function fillStorage() {
  const real = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (k === KEY) throw new DOMException('full', 'QuotaExceededError');
    real.call(this, k, v);
  });
}

/** Closing the tab and opening the app again: memory gone, storage kept. */
const reopen = () => {
  cleanup();
  resetDeep();
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDeep();
  current.cloud = makeCloud();
  current.cloud.deny = oldRules;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the second copy', () => {
  it('follows local storage, a moment later', async () => {
    persist(book(p('a'), p('b')), 'u1');
    expect(ids(readLocal().plays)).toEqual(['a', 'b']);
    await flushDeep();
    expect(await loadDeep()).toMatchObject({ uid: 'u1', plays: [{ id: 'a' }, { id: 'b' }] });
  });

  it('has nothing to say while local storage holds the book', async () => {
    persist(book(p('a')), null);
    await flushDeep();
    expect(await recover()).toBeNull();
  });
});

describe('when the browser drops local storage', () => {
  it('puts the book back from the second copy', async () => {
    persist(book(p('a'), p('b', 1000, { deletedAt: 5 })), 'u1');
    await flushDeep();
    localStorage.clear();
    reopen();
    const { result } = renderHook(() => usePlaybook());
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(ids(result.current.plays)).toEqual(['a']);
    expect(ids(result.current.trashed)).toEqual(['b']);
    expect(readLocal()).toMatchObject({ uid: 'u1' });
  });

  it('does not bring back a book that was emptied on purpose', async () => {
    persist(book(p('a')), null);
    await flushDeep();
    // Emptied, and the tab closed before the second copy heard about it.
    localStorage.setItem(KEY, JSON.stringify({ plays: [], sections: [], uid: null }));
    reopen();
    expect(await recover()).toBeNull();
  });
});

describe('when local storage is full', () => {
  it('keeps what does not fit in a journal, written in the same breath', async () => {
    persist(book(p('a'), p('b')), 'u1');
    await flushDeep();
    fillStorage();
    persist(book(p('a'), p('b'), p('new', 2000)), 'u1');
    // Synchronously: no await between the save and this line.
    expect(overflowing()).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    const journal = JSON.parse(localStorage.getItem('chalk.journal.v1')!);
    // Only what the second copy does not have yet.
    expect(ids(journal.plays)).toEqual(['new']);
  });

  it('loses nothing when the tab closes before the second copy catches up', async () => {
    persist(book(p('a'), p('b')), 'u1');
    await flushDeep();
    fillStorage();
    persist(book(p('a'), p('b', 3000, { name: 'Renamed' }), p('new', 2000)), 'u1');
    // No flush: the tab is closed with IndexedDB still holding the older book.
    reopen();
    const back = await recover();
    expect(ids(back!.plays)).toEqual(['a', 'b', 'new']);
    expect(back!.plays.find((x) => x.id === 'b')!.name).toBe('Renamed');
    expect(back!.uid).toBe('u1');
  });

  it('keeps a play emptied from the trash gone across a reload', async () => {
    persist(book(p('a'), p('gone', 1000, { deletedAt: 5 })), null);
    await flushDeep();
    fillStorage();
    persist(book(p('a')), null);
    reopen();
    expect(ids((await recover())!.plays)).toEqual(['a']);
  });

  it('shrinks the journal once the second copy has what it held', async () => {
    fillStorage();
    persist(book(p('a'), p('b')), null);
    expect(JSON.parse(localStorage.getItem('chalk.journal.v1')!).plays).toHaveLength(2);
    await flushDeep();
    expect(JSON.parse(localStorage.getItem('chalk.journal.v1')!).plays).toHaveLength(0);
  });

  it('opens on the whole book afterwards, and goes on saving', async () => {
    persist(book(p('a'), p('b')), null);
    await flushDeep();
    fillStorage();
    persist(book(p('a'), p('b'), p('c', 2000)), null);
    reopen();
    const { result } = renderHook(() => usePlaybook());
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(ids(result.current.plays)).toEqual(['a', 'b', 'c']);
    act(() => result.current.savePlay(p('d')));
    reopen();
    expect(ids((await recover())!.plays)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('goes back to plain local storage when there is room again', async () => {
    const full = fillStorage();
    persist(book(p('a')), null);
    expect(overflowing()).toBe(true);
    full.mockRestore();
    persist(book(p('a'), p('b')), null);
    expect(overflowing()).toBe(false);
    expect(localStorage.getItem('chalk.journal.v1')).toBeNull();
    expect(ids(readLocal().plays)).toEqual(['a', 'b']);
  });
});
