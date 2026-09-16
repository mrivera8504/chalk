import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { answerDialog, currentDialog, subscribeDialog } from './dialog';
import { useBackLayer } from './backstack';

/**
 * The one dialog, mounted once at the root.
 *
 * Deliberately modal and deliberately small: every question in this app is one
 * line of text or one yes-or-no, and a coach is holding a phone in one hand.
 *
 * Pointer handling matters here as much as anywhere. The scrim takes taps so
 * nothing behind it can be hit by accident, and `touch-action: manipulation`
 * because `.stage` sets `none` and anything mounted over the board inherits it
 * — the same thing that made the drawer tab and the quick bar unusable for a
 * pen until it was set.
 */
export function DialogHost() {
  const request = useSyncExternalStore(subscribeDialog, currentDialog, () => null);
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);

  // Each question starts from whatever it was given, and the field takes the
  // keyboard so a rename is one gesture rather than a tap and then a tap.
  useEffect(() => {
    if (!request) return;
    setText(request.input?.value ?? '');
    if (request.input) {
      const id = window.setTimeout(() => {
        field.current?.focus();
        field.current?.select();
      }, 30);
      return () => window.clearTimeout(id);
    }
  }, [request]);

  // The back gesture is a cancel too — the same answer as Escape, and as the
  // tap on the scrim. A question is the top layer while it is up, so it is the
  // first thing a swipe takes.
  useBackLayer(Boolean(request), () => answerDialog(null));

  // Escape is a cancel, wherever the focus happens to be.
  useEffect(() => {
    if (!request) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        answerDialog(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request]);

  if (!request) return null;

  const confirm = () => {
    if (!request.input) {
      answerDialog('');
      return;
    }
    const value = text.trim();
    // An empty name is a cancel: it is what the old prompt() did, and there is
    // nothing useful to do with a folder called nothing.
    answerDialog(value ? value : null);
  };

  return (
    <div className="dialog-scrim" onPointerDown={() => answerDialog(null)}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        /* The scrim dismisses; a tap inside the card must not reach it. */
        onPointerDown={(e) => e.stopPropagation()}
      >
        <strong>{request.title}</strong>
        {request.body && <p>{request.body}</p>}

        {request.input && (
          <input
            ref={field}
            value={text}
            placeholder={request.input.placeholder}
            aria-label={request.input.label ?? request.title}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirm();
              }
            }}
          />
        )}

        <div className="dialog-buttons">
          <button className="quiet" onClick={() => answerDialog(null)}>
            {request.cancelLabel}
          </button>
          <button
            className={request.danger ? 'danger' : 'primary'}
            disabled={Boolean(request.input) && !text.trim()}
            onClick={confirm}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
