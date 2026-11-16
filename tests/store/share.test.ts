import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { framesOf, nextFrame, withFrames } from '../../src/domain/frames';
import { play } from '../fixtures/plays';
import { current, makeCloud, type FakeCloud } from './fakeFirestore';

vi.mock('../../src/firebase', () => ({ db: {}, ensureSignedIn: async () => 'coach' }));

import {
  asToken,
  forSharing,
  handOver,
  newToken,
  publishShare,
  readShare,
  revokeShare,
  takeHandOver,
} from '../../src/store/share';

let cloud: FakeCloud;
beforeEach(() => {
  cloud = makeCloud();
  current.cloud = cloud;
});
afterEach(() => sessionStorage.clear());

describe('share links', () => {
  it('makes long, URL-safe, unguessable tokens, and recognizes only those', () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newToken()).not.toBe(a);
    expect(asToken(a)).toBe(a);
    expect(asToken('short')).toBeNull();
    expect(asToken('../../users')).toBeNull();
  });

  it('round-trips a play, steps and ink included, and says whose it is', async () => {
    const p = play({ id: 'p1', name: 'Jet', annotations: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]] });
    const stepped = withFrames(p, [framesOf(p)[0], { ...nextFrame(framesOf(p)[0]), annotations: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]] }]);
    const made = await publishShare('play', 'Jet', [stepped]);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(cloud.docs.get(`shares/${made.token}`)?.ownerUid).toBe('coach');

    const back = await readShare(made.token);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.shared).toMatchObject({ kind: 'play', title: 'Jet' });
    expect(back.shared.plays[0].annotations).toEqual(stepped.annotations);
    expect(back.shared.plays[0].frames).toEqual(stepped.frames);
  });

  it('keeps the coach’s own filing out of what is shared', () => {
    const p = forSharing(play({ bookId: 'jv', status: 'idea', shareToken: 'x'.repeat(22), deletedAt: 5 }));
    for (const k of ['bookId', 'status', 'shareToken', 'deletedAt']) expect(k in p).toBe(false);
  });

  it('updates the same link when it is shared again', async () => {
    const first = await publishShare('play', 'Jet', [play({ id: 'p1', name: 'Jet' })]);
    if (!first.ok) throw new Error('not shared');
    const again = await publishShare('play', 'Jet 2', [play({ id: 'p1', name: 'Jet 2' })], first.token);
    expect(again).toEqual({ ok: true, token: first.token });
    const back = await readShare(first.token);
    expect(back.ok && back.shared.title).toBe('Jet 2');
  });

  it('says a link that was taken down is gone, and one it cannot reach is offline', async () => {
    const made = await publishShare('play', 'Jet', [play()]);
    if (!made.ok) throw new Error('not shared');
    expect(await revokeShare(made.token)).toBe(true);
    expect(await readShare(made.token)).toEqual({ ok: false, reason: 'gone' });
    cloud.failWith = { code: 'unavailable', message: 'offline' };
    expect(await readShare(made.token)).toEqual({ ok: false, reason: 'offline' });
  });

  it('says so in words when the rules are not published', async () => {
    cloud.deny = (path) => path.startsWith('shares/');
    const made = await publishShare('play', 'Jet', [play()]);
    expect(made.ok).toBe(false);
    if (!made.ok) expect(made.reason).toMatch(/rules/);
  });

  it('refuses a book too big for one document before sending it', async () => {
    const huge = Array.from({ length: 120 }, (_, i) =>
      play({ id: `p${i}`, annotations: [Array.from({ length: 900 }, (_, j) => ({ x: j, y: j, cx: j, cy: j }))] }),
    );
    const made = await publishShare('book', 'All', huge);
    expect(made.ok).toBe(false);
    expect(cloud.writes).toEqual([]);
  });

  it('hands plays over to the app once, and only once', () => {
    handOver([play({ id: 'a' }), play({ id: 'b' })]);
    expect(takeHandOver().map((p) => p.id)).toEqual(['a', 'b']);
    expect(takeHandOver()).toEqual([]);
  });
});
