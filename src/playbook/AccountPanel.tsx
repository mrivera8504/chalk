import { useEffect, useState } from 'react';
import { askConfirm } from '../ui/dialog';
import {
  explainAuth,
  signInExisting,
  signOutToAnonymous,
  upgradeToEmail,
  watchAccount,
  type Account,
} from '../firebase';

interface Props {
  /** Push the local playbook up under whichever account ends up signed in. */
  onSaveNow: () => Promise<void>;
  onClose: () => void;
}

/**
 * The account screen.
 *
 * The app has always worked without one — an anonymous user owns the playbook
 * from the first launch — so this is about making that account reachable from
 * a second device, and surviving the browser's storage being cleared.
 *
 * Signing up *links* the email to the anonymous account rather than making a
 * new one, so the uid does not change and every play drawn beforehand is still
 * there. That is the whole reason this screen can exist safely.
 */
export function AccountPanel({ onSaveNow, onClose }: Props) {
  const [account, setAccount] = useState<Account | null>(null);
  const [mode, setMode] = useState<'up' | 'in'>('up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => watchAccount(setAccount), []);

  async function submit() {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const next =
        mode === 'up'
          ? await upgradeToEmail(email.trim(), password)
          : await signInExisting(email.trim(), password);
      setAccount(next);
      setPassword('');
      /*
       * Creating an account links the email to the uid this device already has,
       * so the plays on screen stay and go up. Signing into an existing one
       * changes uid, and the playbook that comes down is that account's — which
       * is the opposite direction, and used to be the bug: this pushed the
       * device's book over the account it had just signed into.
       */
      await onSaveNow();
      setNote(
        mode === 'up'
          ? 'Signed in. Your playbook is saved to this account.'
          : 'Signed in. Loading that account’s playbook…',
      );
    } catch (err) {
      setError(explainAuth(err));
    } finally {
      setBusy(false);
    }
  }

  const signedIn = account && !account.anonymous;

  return (
    <div className="picker account-panel">
      <div className="picker-head">
        <strong>Account</strong>
        <span>{signedIn ? account.email : 'not signed in'}</span>
        <button className="quiet" onClick={onClose}>
          Close
        </button>
      </div>

      {signedIn ? (
        <div className="picker-group">
          <p className="picker-note">
            Your playbook is tied to <strong>{account.email}</strong>. Sign in
            with it on another device and everything comes down.
          </p>
          <div className="picker-row">
            <button
              className="quiet"
              disabled={busy}
              onClick={() =>
                void askConfirm('Sign out?', {
                  body:
                    'The playbook stays on this device, and will be saved to ' +
                    'whichever account signs in next.',
                  confirmLabel: 'Sign out',
                }).then((ok) => {
                  if (!ok) return;
                  setBusy(true);
                  void signOutToAnonymous().finally(() => setBusy(false));
                })
              }
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <div className="picker-group">
          <p className="picker-note">
            Chalk works without an account — everything is already saved on this
            phone. Adding an email means you can get the playbook back if you
            lose the phone, and open it on a second one.
          </p>

          <div className="picker-row seg">
            <button aria-pressed={mode === 'up'} onClick={() => setMode('up')}>
              Create account
            </button>
            <button aria-pressed={mode === 'in'} onClick={() => setMode('in')}>
              I have one
            </button>
          </div>

          <div className="setting">
            <input
              className="notes-line"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email"
              spellCheck={false}
            />
          </div>
          <div className="setting">
            <input
              className="notes-line"
              type="password"
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
              placeholder="Password"
              aria-label="Password"
            />
          </div>

          <div className="picker-row">
            <button disabled={busy || !email.trim() || !password} onClick={() => void submit()}>
              {busy ? 'Working…' : mode === 'up' ? 'Create account' : 'Sign in'}
            </button>
          </div>

          {mode === 'up' && (
            <p className="picker-note">
              This keeps the plays you have already drawn — it puts an email on
              the account this phone is using rather than starting a new one.
            </p>
          )}
          {mode === 'in' && (
            <p className="picker-note">
              Signing into an existing account replaces what is on screen with
              that account's playbook. Export a JSON backup first if this device
              has work the account does not.
            </p>
          )}
        </div>
      )}

      {error && <p className="picker-note bad">{error}</p>}
      {note && <p className="picker-note good">{note}</p>}
    </div>
  );
}
