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
 */
export function ensureSignedIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) return resolve(user.uid);
      signInAnonymously(auth).catch(reject);
    });
  });
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
 * Sign out and fall straight back to an anonymous account, so the app is never
 * in a state where there is nobody to save as. The local playbook is untouched
 * and will be pushed up under whatever account signs in next, which is why the
 * account screen warns before signing out.
 */
export async function signOutToAnonymous(): Promise<void> {
  await signOut(auth);
  await signInAnonymously(auth);
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
