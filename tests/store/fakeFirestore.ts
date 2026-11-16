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
  /** Paths the rules refuse, for a project whose new rules are not published. */
  deny?: (path: string) => boolean;
}

export function makeCloud(): FakeCloud {
  return { docs: new Map(), writes: [], reads: [], failWith: null };
}

function nestedArray(value: unknown, inArray = false): boolean {
  if (Array.isArray(value)) return inArray || value.some((v) => nestedArray(v, true));
  if (value && typeof value === 'object') return Object.values(value).some((v) => nestedArray(v, false));
  return false;
}

const DELETE = Symbol('deleteField');

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
      if (cloud.deny?.(r.path)) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      cloud.reads.push(r.path);
      const data = cloud.docs.get(r.path);
      return { exists: () => data !== undefined, data: () => structuredClone(data) };
    },
    setDoc: async (r: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      fail();
      if (cloud.deny?.(r.path)) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      if (opts?.merge) data = { ...(cloud.docs.get(r.path) ?? {}), ...data };
      if (nestedArray(data)) {
        throw Object.assign(new Error('Function setDoc() called with invalid data. Nested arrays are not supported'), {
          code: 'invalid-argument',
        });
      }
      cloud.docs.set(r.path, structuredClone(data));
      cloud.writes.push({ op: 'set', path: r.path });
    },
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    query: (c: { path: string }, w?: { field: string; value: number }) => ({ path: c.path, w }),
    getDocs: async (c: { path: string; w?: { field: string; value: number } }) => {
      fail();
      if (cloud.deny?.(c.path)) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      cloud.reads.push(c.path);
      const docs = [...cloud.docs.entries()]
        .filter(([p]) => p.startsWith(`${c.path}/`) && !p.slice(c.path.length + 1).includes('/'))
        .filter(([, d]) => !c.w || (d[c.w.field] as number) > c.w.value)
        .map(([p, data]) => ({ id: p.slice(c.path.length + 1), data: () => structuredClone(data) }));
      return { docs };
    },
    /** Dotted field paths, as Firestore takes them, and `deleteField()` to remove one. */
    updateDoc: async (r: { path: string }, fields: Record<string, unknown>) => {
      fail();
      if (cloud.deny?.(r.path)) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      const was = cloud.docs.get(r.path);
      if (!was) throw Object.assign(new Error(`No document to update: ${r.path}`), { code: 'not-found' });
      const data = structuredClone(was);
      for (const [path, value] of Object.entries(fields)) {
        const keys = path.split('.');
        let at = data as Record<string, unknown>;
        for (const k of keys.slice(0, -1)) {
          if (!at[k] || typeof at[k] !== 'object') at[k] = {};
          at = at[k] as Record<string, unknown>;
        }
        const last = keys[keys.length - 1];
        if (value === DELETE) delete at[last];
        else at[last] = value;
      }
      cloud.docs.set(r.path, data);
      cloud.writes.push({ op: 'set', path: r.path });
    },
    deleteField: () => DELETE,
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
export const teamPath = (uid: string) => `teams/${uid}`;
/** The rules as they stand before the owner publishes the new ones. */
export const oldRules = (path: string) => !path.startsWith('users/');
