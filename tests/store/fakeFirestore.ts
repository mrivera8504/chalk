/**
 * Firestore, as much of it as the sync touches, held in a Map.
 *
 * Not the emulator: that needs Java and a download, and nothing here is about
 * Firestore's own behavior — it is about what this app decides to read and
 * write, and in what order. The one server rule the app has been bitten by is
 * reproduced on purpose: an array directly inside an array is refused, which
 * is what jammed the sync for every play with freehand ink on it.
 */
export interface FakeCloud {
  docs: Map<string, Record<string, unknown>>;
  /** Every write, in order, so a test can assert what was sent and when. */
  writes: { op: 'set' | 'delete'; path: string }[];
  reads: string[];
  /** Set to make the next calls fail the way an unreachable cloud does. */
  failWith: { code: string; message: string } | null;
}

export function makeCloud(): FakeCloud {
  return { docs: new Map(), writes: [], reads: [], failWith: null };
}

function nestedArray(value: unknown, inArray = false): boolean {
  if (Array.isArray(value)) return inArray || value.some((v) => nestedArray(v, true));
  if (value && typeof value === 'object') return Object.values(value).some((v) => nestedArray(v, false));
  return false;
}

export function fakeFirestore(cloud: FakeCloud) {
  const fail = () => {
    if (cloud.failWith) throw Object.assign(new Error(cloud.failWith.message), { code: cloud.failWith.code });
  };
  const ref = (path: string) => ({ path });
  return {
    doc: (parent: { path?: string }, ...segments: string[]) =>
      ref([parent.path, ...segments].filter(Boolean).join('/')),
    collection: (parent: { path: string }, name: string) => ref(`${parent.path}/${name}`),
    getDoc: async (r: { path: string }) => {
      fail();
      cloud.reads.push(r.path);
      const data = cloud.docs.get(r.path);
      return { exists: () => data !== undefined, data: () => structuredClone(data) };
    },
    setDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      fail();
      if (nestedArray(data)) {
        throw Object.assign(new Error('Function setDoc() called with invalid data. Nested arrays are not supported'), {
          code: 'invalid-argument',
        });
      }
      cloud.docs.set(r.path, structuredClone(data));
      cloud.writes.push({ op: 'set', path: r.path });
    },
    getDocs: async (c: { path: string }) => {
      fail();
      const docs = [...cloud.docs.entries()]
        .filter(([p]) => p.startsWith(`${c.path}/`) && !p.slice(c.path.length + 1).includes('/'))
        .map(([p, data]) => ({ id: p.slice(c.path.length + 1), data: () => structuredClone(data) }));
      return { docs };
    },
    deleteDoc: async (r: { path: string }) => {
      fail();
      cloud.docs.delete(r.path);
      cloud.writes.push({ op: 'delete', path: r.path });
    },
  };
}

/**
 * The cloud the shim below talks to. A test replaces it in `beforeEach`.
 */
export const current: { cloud: FakeCloud } = { cloud: makeCloud() };

export const mainPath = (uid: string) => `users/${uid}/playbook/main`;
