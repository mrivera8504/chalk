/**
 * What `firebase/firestore` resolves to under test; see vitest.config.ts.
 *
 * An alias rather than `vi.mock`, because the sync loads Firestore lazily and
 * twice at once, and under a module mock one of those two loads is handed the
 * real library. A test that quietly reached for the real Firestore is worse
 * than no test, so the real one is simply not reachable from here.
 */
import { current, fakeFirestore } from './fakeFirestore';

type Fn = (...args: never[]) => unknown;
const call = <K extends keyof ReturnType<typeof fakeFirestore>>(name: K) =>
  ((...args: never[]) => (fakeFirestore(current.cloud)[name] as Fn)(...args)) as ReturnType<typeof fakeFirestore>[K];

export const doc = call('doc');
export const collection = call('collection');
export const getDoc = call('getDoc');
export const setDoc = call('setDoc');
export const getDocs = call('getDocs');
export const deleteDoc = call('deleteDoc');
export const query = call('query');
export const where = call('where');
