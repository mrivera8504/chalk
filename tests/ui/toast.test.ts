import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_MS, currentToast, dismissToast, subscribeToast, toast, undoToast } from '../../src/ui/toast';

beforeEach(() => {
  vi.useFakeTimers();
  dismissToast();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a toast', () => {
  it('says what happened and goes away by itself', () => {
    toast('Duplicated Jet Sweep');
    expect(currentToast()?.text).toBe('Duplicated Jet Sweep');
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(currentToast()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(currentToast()).toBeNull();
  });

  it('takes the thing back, once', () => {
    const undo = vi.fn();
    toast('Deleted Jet Sweep', { undo });
    undoToast();
    undoToast();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(currentToast()).toBeNull();
  });

  it('is one at a time: the newer replaces the older, and its clock starts over', () => {
    const first = vi.fn();
    toast('Deleted A', { undo: first });
    vi.advanceTimersByTime(TOAST_MS - 100);
    toast('Deleted B');
    vi.advanceTimersByTime(200);
    expect(currentToast()?.text).toBe('Deleted B');
    // Undo now belongs to B, which has none. A's is gone with A's line.
    undoToast();
    expect(first).not.toHaveBeenCalled();
  });

  it('cannot undo a line that has already left', () => {
    const undo = vi.fn();
    toast('Deleted A', { undo });
    vi.advanceTimersByTime(TOAST_MS);
    undoToast();
    expect(undo).not.toHaveBeenCalled();
  });

  it('tells whoever is listening, and stops when they stop', () => {
    const seen = vi.fn();
    const stop = subscribeToast(seen);
    toast('one');
    dismissToast();
    stop();
    toast('two');
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
