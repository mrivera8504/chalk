import { useSyncExternalStore } from 'react';
import { applyUpdate, dismissUpdate, subscribeUpdate, updateReady } from '../store/update';

/**
 * The one line that says this app is not the current one.
 *
 * Deliberately not a dialog. A dialog is for a question the coach just asked
 * for — this arrives unbidden, possibly with a pen already on the board, and
 * stopping everything to demand an answer would make a silent update the
 * kinder option. So: a strip at the foot, easy to ignore, easy to take.
 *
 * It does not claim `button.primary`. That is spoken for — one per view, or it
 * stops meaning anything — and the primary action on a play is the play.
 */
export function UpdateBar() {
  const ready = useSyncExternalStore(subscribeUpdate, updateReady, () => false);
  if (!ready) return null;

  return (
    <div className="update-bar" role="status">
      <span>A new version of Chalk is ready.</span>
      <button className="quiet" onClick={dismissUpdate}>
        Later
      </button>
      <button className="update-take" onClick={applyUpdate}>
        Reload
      </button>
    </div>
  );
}
