/**
 * A line that says what just happened, and offers to take it back.
 *
 * A tiny external store shaped like `ui/dialog.ts`, and its opposite in use. A
 * dialog asks before; this tells after. Deleting a play used to ask "Delete
 * Jet Sweep?" every time, for an action that only moves the play to the trash
 * — a question before every one of the commonest tidy-ups in the app, to guard
 * against a mistake that was already recoverable. Now the play goes, and the
 * line that says so carries Undo for the few seconds it is on screen.
 *
 * One at a time. A second message replaces the first rather than stacking: two
 * Undos on screen at once is a puzzle about which one takes back what.
 */
export interface Toast {
  id: number;
  text: string;
  /** Take it back. Present only when the thing can be. */
  undo?: () => void;
}

/** Long enough to read and reach for, short enough not to be furniture. */
export const TOAST_MS = 6000;

let current: Toast | null = null;
let timer: number | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

const announce = () => listeners.forEach((l) => l());

export function currentToast(): Toast | null {
  return current;
}

export function subscribeToast(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function dismissToast(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  if (!current) return;
  current = null;
  announce();
}

export function toast(text: string, opts: { undo?: () => void } = {}): void {
  if (timer !== null) window.clearTimeout(timer);
  current = { id: nextId++, text, undo: opts.undo };
  timer = window.setTimeout(dismissToast, TOAST_MS);
  announce();
}

/** Run the undo, once, and take the line away. */
export function undoToast(): void {
  const undo = current?.undo;
  dismissToast();
  undo?.();
}
