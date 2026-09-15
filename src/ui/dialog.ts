/**
 * Asking the coach something, without leaving the app's skin.
 *
 * There were twelve `prompt()` and `confirm()` calls — naming a folder, naming
 * a front, deleting a play, replacing the whole playbook. In a PWA installed to
 * the home screen those arrive as browser chrome: a different typeface, a
 * different set of buttons, the origin printed across the top, and targets
 * sized for a mouse on a page whose every other control is sized for a pen.
 * `prompt()` is also the one browsers are least willing to show at all.
 *
 * Shaped like the settings store — a tiny external store plus plain functions
 * — so any module can ask a question without a provider being threaded through
 * it, which is what the call sites needed.
 */

export interface DialogRequest {
  title: string;
  /** A sentence under the title. Say what will happen, not how it works. */
  body?: string;
  /** Present for a question that wants typing; absent for a plain confirm. */
  input?: { value: string; placeholder?: string; label?: string };
  confirmLabel: string;
  cancelLabel: string;
  /** Paints the confirm button as the destructive one. */
  danger: boolean;
}

interface Live extends DialogRequest {
  resolve: (value: string | null) => void;
}

let current: Live | null = null;
const listeners = new Set<() => void>();

function announce() {
  for (const l of listeners) l();
}

export function subscribeDialog(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function currentDialog(): DialogRequest | null {
  return current;
}

/** Answer the open question. Null is a cancel, whatever the question was. */
export function answerDialog(value: string | null) {
  const open = current;
  current = null;
  announce();
  open?.resolve(value);
}

function ask(request: Omit<Live, 'resolve'>): Promise<string | null> {
  // A second question while one is open cancels the first rather than stacking:
  // two dialogs deep is a place nobody can reason about, and every caller here
  // treats a cancel as "nothing happened".
  answerDialog(null);
  return new Promise((resolve) => {
    current = { ...request, resolve };
    announce();
  });
}

/**
 * Ask for a line of text. Resolves with the trimmed text, or null if the coach
 * backed out — the same shape `prompt()` had, so the call sites read the same.
 */
export function askText(
  title: string,
  opts: {
    value?: string;
    placeholder?: string;
    label?: string;
    body?: string;
    confirmLabel?: string;
  } = {},
): Promise<string | null> {
  return ask({
    title,
    body: opts.body,
    input: { value: opts.value ?? '', placeholder: opts.placeholder, label: opts.label },
    confirmLabel: opts.confirmLabel ?? 'Save',
    cancelLabel: 'Cancel',
    danger: false,
  });
}

/** Ask a yes or no. Resolves true only on the confirm button. */
export async function askConfirm(
  title: string,
  opts: { body?: string; confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  const answer = await ask({
    title,
    body: opts.body,
    confirmLabel: opts.confirmLabel ?? 'Yes',
    cancelLabel: 'Cancel',
    danger: opts.danger ?? false,
  });
  return answer !== null;
}
