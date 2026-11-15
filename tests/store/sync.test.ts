import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Play } from '../../src/domain/types';
import { play } from '../fixtures/plays';
import { current, mainPath, makeCloud, type FakeCloud } from './fakeFirestore';

let cloud: FakeCloud;
vi.mock('../../src/firebase', () => ({ db: {} }));
import { listVersions, mergeBooks, pullFromCloud, pushToCloud, readLocal, writeLocal } from '../../src/store/sync';

const p = (id: string, updatedAt = 1000, over: Partial<Play> = {}) => play({ id, updatedAt, ...over });
const book = (...plays: Play[]) => ({ plays, sections: [] });
const cloudPlays = (uid = 'u1') => (cloud.docs.get(mainPath(uid))?.plays as Play[] | undefined) ?? [];

beforeEach(() => {
  cloud = current.cloud = makeCloud();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('local storage', () => {
  it('records whose book it is', () => {
    writeLocal(book(p('a')), 'u1');
    expect(readLocal()).toMatchObject({ uid: 'u1', plays: [{ id: 'a' }] });
  });

  it('reads a book written before the uid was stored as unclaimed, not as a stranger', () => {
    localStorage.setItem('chalk.playbook.v1', JSON.stringify({ plays: [p('a')], sections: [] }));
    expect(readLocal().uid).toBeNull();
    expect(readLocal().plays).toHaveLength(1);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('chalk.playbook.v1', '{not json');
    expect(readLocal()).toEqual({ plays: [], sections: [], books: [], uid: null });
  });
});

describe('merging two copies of one account', () => {
  it('reconciles play by play, so one fresh local play does not discard forty from the cloud', () => {
    const forty = Array.from({ length: 40 }, (_, i) => p(`c${i}`, 1000));
    const merged = mergeBooks(book(p('mine', 9999)), book(...forty));
    expect(merged.plays).toHaveLength(41);
  });

  it('takes the newer copy of a play both sides hold', () => {
    const merged = mergeBooks(book(p('a', 1000, { name: 'old' })), book(p('a', 2000, { name: 'renamed' })));
    expect(merged.plays).toEqual([expect.objectContaining({ name: 'renamed' })]);
    const other = mergeBooks(book(p('a', 3000, { name: 'mine' })), book(p('a', 2000, { name: 'renamed' })));
    expect(other.plays[0].name).toBe('mine');
  });

  it('carries a delete across as the newer copy of that play', () => {
    const merged = mergeBooks(book(p('a', 1000)), book(p('a', 2000, { deletedAt: 2000 })));
    expect(merged.plays[0].deletedAt).toBe(2000);
  });
});

describe('pulling', () => {
  it('says the cloud is empty when it reached it and found nothing', async () => {
    expect(await pullFromCloud('u1')).toEqual({ ok: true, book: null });
  });

  it('says it could not reach the cloud, which is a different answer', async () => {
    cloud.failWith = { code: 'unavailable', message: 'offline' };
    expect(await pullFromCloud('u1')).toEqual({ ok: false, state: 'offline' });
  });

  it('tells denied from offline from simply failed', async () => {
    cloud.failWith = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
    expect(await pullFromCloud('u1')).toEqual({ ok: false, state: 'denied' });
    cloud.failWith = { code: 'internal', message: 'boom' };
    expect(await pullFromCloud('u1')).toEqual({ ok: false, state: 'failed' });
  });
});

describe('pushing', () => {
  it('writes under the uid it was handed', async () => {
    expect(await pushToCloud(book(p('a')), 'u1')).toBe('synced');
    expect(cloudPlays('u1')).toHaveLength(1);
    expect(cloud.docs.has(mainPath('u2'))).toBe(false);
  });

  it('gets freehand ink to the cloud and back in the shape it left in', async () => {
    const inked = p('a', 1000, { annotations: [[{ x: 0, y: 0 }, { x: 1, y: 1, cx: 0.5, cy: 0 }], [{ x: 2, y: 2 }, { x: 3, y: 3 }]] });
    expect(await pushToCloud(book(inked), 'u1')).toBe('synced');
    const res = await pullFromCloud('u1');
    expect(res.ok && res.book?.plays[0].annotations).toEqual(inked.annotations);
  });

  it('refuses a write that drops most of a book', async () => {
    await pushToCloud(book(p('a'), p('b'), p('c'), p('d')), 'u1');
    expect(await pushToCloud(book(p('a')), 'u1')).toBe('blocked');
    expect(cloudPlays()).toHaveLength(4);
  });

  it('refuses an empty book landing on a real one', async () => {
    await pushToCloud(book(p('a'), p('b'), p('c')), 'u1');
    expect(await pushToCloud(book(), 'u1')).toBe('blocked');
    expect(cloudPlays()).toHaveLength(3);
  });

  it('lets a restore through when it is forced', async () => {
    await pushToCloud(book(p('a'), p('b'), p('c'), p('d')), 'u1');
    expect(await pushToCloud(book(p('z')), 'u1', { force: true })).toBe('synced');
    expect(cloudPlays().map((x) => x.id)).toEqual(['z']);
  });

  it('keeps what a write replaces whenever that write loses plays', async () => {
    await pushToCloud(book(p('a'), p('b'), p('c'), p('d')), 'u1');
    await pushToCloud(book(p('a'), p('b'), p('c')), 'u1');
    const versions = await listVersions('u1');
    expect(versions[0]).toMatchObject({ plays: 4, why: 'replaced, losing 1' });
    expect(versions[0].book.plays.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the version before it writes over it', async () => {
    await pushToCloud(book(p('a'), p('b'), p('c'), p('d')), 'u1');
    cloud.writes.length = 0;
    await pushToCloud(book(p('a'), p('b'), p('c')), 'u1');
    expect(cloud.writes[0].path).toContain('/versions/');
    expect(cloud.writes[cloud.writes.length - 1].path).toBe(mainPath('u1'));
  });

  it('holds twenty versions and prunes the oldest', async () => {
    for (let t = 1; t <= 25; t++) {
      cloud.docs.set(`${mainPath('u1')}/versions/${t}`, { plays: [], sections: [], savedAt: t, why: 'old' });
    }
    await pushToCloud(book(p('a'), p('b'), p('c'), p('d')), 'u1');
    await pushToCloud(book(p('a'), p('b'), p('c')), 'u1');
    const left = [...cloud.docs.keys()].filter((k) => k.includes('/versions/'));
    expect(left).toHaveLength(20);
    expect(left).not.toContain(`${mainPath('u1')}/versions/1`);
  });

  it('refuses a book over the document cap before the round trip', async () => {
    const stroke = Array.from({ length: 400 }, (_, i) => ({ x: i * 1.0001, y: i * 1.0001, cx: i * 1.0001, cy: i * 1.0001 }));
    const heavy = Array.from({ length: 40 }, (_, i) => p(`h${i}`, 1000, { annotations: [stroke, stroke] }));
    expect(await pushToCloud(book(...heavy), 'u1')).toBe('toobig');
    expect(cloud.reads).toEqual([]);
    expect(cloud.writes).toEqual([]);
  });

  it('reports offline as offline, and writes nothing', async () => {
    cloud.failWith = { code: 'unavailable', message: 'offline' };
    expect(await pushToCloud(book(p('a')), 'u1')).toBe('offline');
  });
});
