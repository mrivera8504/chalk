import { useSyncExternalStore } from 'react';
import { currentToast, dismissToast, subscribeToast, undoToast } from './toast';
import { Icon } from './Icon';

/**
 * Mounted once, in `App`, beside the dialog host.
 *
 * `role="status"`, so a screen reader says it without taking the focus away
 * from wherever the coach was. The wrapper is inert: a tap beside the line
 * reaches whatever is under it.
 */
export function ToastHost() {
  const t = useSyncExternalStore(subscribeToast, currentToast, () => null);
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {t && (
        <div className="toast" key={t.id}>
          <span>{t.text}</span>
          {t.undo && (
            <button className="toast-undo" onClick={undoToast}>
              Undo
            </button>
          )}
          <button className="icon-button" aria-label="Dismiss" onClick={dismissToast}>
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
