const DEPTH = 50;

/**
 * In-memory only, per editing session, as the spec calls for. Undo that
 * survived a reload would have to be reconciled with the autosaved document on
 * every load, which is a lot of machinery for something a coach never asks for.
 */
export class UndoStack<T> {
  private past: T[] = [];
  private future: T[] = [];

  push(state: T): void {
    this.past.push(state);
    if (this.past.length > DEPTH) this.past.shift();
    // A new edit abandons whatever was undone.
    this.future.length = 0;
  }

  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}
