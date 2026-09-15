import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCOym0yxk8Nf_FCftDQ_8J41lB8x_evrnM',
  authDomain: 'chalk-66943.firebaseapp.com',
  projectId: 'chalk-66943',
  storageBucket: 'chalk-66943.firebasestorage.app',
  messagingSenderId: '206671626869',
  appId: '1:206671626869:web:67887facf7286714f02e3c',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Local cache is the source of truth for reads. The field has no signal.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});

/**
 * Silent sign-in. The app still works with no account at all: an anonymous
 * user owns the playbook until someone puts an email on it.
 *
 * The listener is unsubscribed the moment it answers, and concurrent callers
 * share one attempt. Both matter more than they look: this used to leave a
 * listener behind on every call, and every one of them called
 * signInAnonymously() again the next time auth went null. A project two days
 * old had 78 anonymous accounts, created in bursts of five within the same
 * second, and the app kept whichever one won the race — which is how a
 * playbook ends up stranded under a uid nobody can sign into again.
 */
let pending: Promise<string> | null = null;

export function ensureSignedIn(): Promise<string> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  if (pending) return pending;

  pending = new Promise<string>((resolve, reject) => {
    let asked = false;
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          stop();
          resolve(user.uid);
          return;
        }
        // Exactly one anonymous sign-in per attempt. The listener stays only
        // until it fires again with the user that sign-in creates.
        if (asked) return;
        asked = true;
        signInAnonymously(auth).catch((err) => {
          stop();
          reject(err);
        });
      },
      (err) => {
        stop();
        reject(err);
      },
    );
  });

  return pending.finally(() => {
    pending = null;
  });
}

/**
 * Who is signed in, as a uid, for as long as the caller keeps the subscription.
 *
 * The playbook has to follow this rather than read it once at boot: a uid
 * change is the moment a different account's book has to come down, and
 * reading it only on mount is what let a sign-in overwrite the account it had
 * just signed into.
 */
export function watchUid(fn: (uid: string | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => fn(user?.uid ?? null));
}

export interface Account {
  email: string | null;
  anonymous: boolean;
}

export function describeUser(user: User | null): Account | null {
  if (!user) return null;
  return { email: user.email, anonymous: user.isAnonymous };
}

export function watchAccount(fn: (a: Account | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => fn(describeUser(user)));
}

/**
 * Put an email and password on the account this device is already using.
 *
 * Links rather than registers, which keeps the same uid — and the playbook
 * lives at /users/{uid}, so everything drawn before signing up is still there
 * afterwards. Registering a fresh account instead would have stranded it under
 * an anonymous id nobody can ever sign back into.
 *
 * If that email is already an account, there is nothing to link: this device's
 * anonymous work belongs to a different uid, so we sign into the real one and
 * say plainly what happened to the local copy.
 */
export async function upgradeToEmail(email: string, password: string): Promise<Account> {
  const user = auth.currentUser;
  const credential = EmailAuthProvider.credential(email, password);

  if (user?.isAnonymous) {
    try {
      const result = await linkWithCredential(user, credential);
      return describeUser(result.user)!;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // Already taken: fall through to signing into it rather than failing.
      if (code !== 'auth/email-already-in-use' && code !== 'auth/credential-already-in-use') {
        throw err;
      }
      const signedIn = await signInWithEmailAndPassword(auth, email, password);
      return describeUser(signedIn.user)!;
    }
  }

  const created = await createUserWithEmailAndPassword(auth, email, password);
  return describeUser(created.user)!;
}

export async function signInExisting(email: string, password: string): Promise<Account> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return describeUser(result.user)!;
}

/**
 * Sign out, and mint nothing.
 *
 * This used to sign straight back in anonymously so there was never a moment
 * with nobody to save as. That cost an account every time — and since signing
 * out is almost always the first half of signing in as somebody else, it was an
 * account nobody would ever use again. Uid sprawl is not a cosmetic problem
 * here: an abandoned anonymous uid is one nobody can ever sign into, and a
 * playbook under one is a playbook that needs an admin key to reach.
 *
 * Nothing is lost in the gap. Local storage keeps the book and keeps the uid it
 * belongs to, so signing back into the same account merges, and the next launch
 * takes an anonymous account if one is genuinely needed.
 */
export async function signOutOfAccount(): Promise<void> {
  await signOut(auth);
}

/** Firebase's codes are not sentences. These are. */
export function explainAuth(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That does not look like an email address.';
    case 'auth/weak-password':
      return 'That password is too short. Six characters at least.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'That email and password do not match an account.';
    case 'auth/user-not-found':
      return 'No account with that email yet.';
    case 'auth/email-already-in-use':
      return 'That email already has an account. Try signing in instead.';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Your playbook is safe on this device either way.';
    case 'auth/operation-not-allowed':
      return 'Email sign-in is not switched on in the Firebase console yet.';
    default:
      return 'That did not work. Your playbook is safe on this device either way.';
  }
}
