/**
 * The back gesture, given something to pop.
 *
 * On a Samsung tablet in gesture navigation, a swipe in from either edge is
 * Back, and in a standalone PWA Back is history navigation. This app navigates
 * with React state and never touched the history API, so the stack held exactly
 * one entry — the load. The first back gesture anywhere in the app popped it,
 * found nothing behind, and Android closed the whole thing: a coach in a play
 * swiping the way the `‹` button goes lost the app instead.
 *
 * So a spare entry is parked on the stack whenever something is open that back
 * ought to close, and the gesture spends that instead of the app. With nothing
 * open there is no spare, and a swipe leaves — which is what leaving should do.
 *
 * The one thing to hold onto when reading this: a layer closing and our spare
 * entry disappearing are two different events, and either can come first. A
 * button closes the layer and we then drop the entry ourselves; a gesture takes
 * the entry and we then close the layer. `sync` is written so both paths land
 * in the same state, and `removingOwn` is what keeps our own `back()` from
 * being read as the coach swiping again.
 */
import { useEffect, useRef } from 'react';

interface Layer {
  close: () => void;
}

/** Oldest first. The last one is what a back gesture closes. */
const layers: Layer[] = [];

/** Whether our spare entry is on the stack right now. */
let parked = false;

/** True between our own `history.back()` and the popstate it causes. */
let removingOwn = false;

function park() {
  if (parked) return;
  parked = true;
  history.pushState({ chalk: 'layer' }, '');
}

function unpark() {
  // Already gone — a gesture spent it. Calling back() here would eat a real
  // entry and close the app, which is the bug this file exists to fix.
  if (!parked) return;
  parked = false;
  removingOwn = true;
  history.back();
}

/** One spare entry while anything is open, none when nothing is. */
function sync() {
  if (layers.length > 0) park();
  else unpark();
}

function onPop() {
  if (removingOwn) {
    removingOwn = false;
    return;
  }

  // The gesture spent our spare entry.
  parked = false;

  const top = layers[layers.length - 1];
  // Nothing open: the entry that just went was the app's own, and letting it go
  // is correct. Android takes it from here.
  if (!top) return;

  /*
   * Closing is a React state change, so this layer takes itself off the list
   * from its own effect cleanup a render later, not here. That cleanup calls
   * `sync`, which parks a fresh entry if anything is still open — and does not
   * try to unpark the one the gesture already took, because `parked` is false.
   */
  top.close();
}

/**
 * Installed once from main, beside the pen shim, so the listener is up before
 * anything can open.
 */
export function installBackGesture(): void {
  window.addEventListener('popstate', onPop);
}

/**
 * Register something for the back gesture to close while `active`.
 *
 * Layers stack: the most recently opened is the first to go, so a dialog raised
 * over an open play is closed by the first swipe and the play by the second.
 *
 * In StrictMode the double-invoked effect leaves one unused forward entry in
 * development. It is harmless — nothing navigates to it — and does not happen
 * in a production build.
 */
export function useBackLayer(active: boolean, close: () => void): void {
  // Read at gesture time rather than captured, so a layer registered once still
  // closes through whatever the current render's handler is.
  const latest = useRef(close);
  latest.current = close;

  useEffect(() => {
    if (!active) return;

    const layer: Layer = { close: () => latest.current() };
    layers.push(layer);
    sync();

    return () => {
      const i = layers.indexOf(layer);
      if (i !== -1) layers.splice(i, 1);
      sync();
    };
  }, [active]);
}
