import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
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

/** Silent sign-in. There is no login screen; this app has one user. */
export function ensureSignedIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) return resolve(user.uid);
      signInAnonymously(auth).catch(reject);
    });
  });
}
