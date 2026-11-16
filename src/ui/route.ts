import { useSyncExternalStore } from 'react';

/**
 * Where in the app the coach is, and the address that says so.
 *
 * The app navigated with React state alone, so every screen was `/` and there
 * was nothing to link to. Each screen has an address now, which is what a
 * shared play will need, and what lets a reload come back to the play that was
 * open rather than to the playbook.
 *
 * The address is **written, never navigated to**. Back is not handled here: in
 * an installed PWA the back gesture is history navigation, and `ui/backstack.ts`
 * already owns that — it parks one history entry while anything is open and
 * closes the top layer when the gesture spends it. A router pushing entries of
 * its own would be a second owner of the same stack, and the bug that file
 * exists to fix was the app closing on a back gesture. So this only ever
 * *replaces* the address of whichever entry is current, and the screens go on
 * registering themselves as layers.
 */
export type Screen = 'home' | 'book' | 'team' | 'print' | 'settings' | 'gameday';

export type Route = { screen: Screen } | { screen: 'play'; id: string };

const PATHS: Record<Screen, string> = {
  home: '/home',
  book: '/',
  team: '/team',
  print: '/print',
  settings: '/settings',
  gameday: '/gameday',
};

export function toPath(route: Route): string {
  return route.screen === 'play' ? `/play/${encodeURIComponent(route.id)}` : PATHS[route.screen];
}

/** Anything unrecognized is the playbook: a stale link should land somewhere. */
export function parsePath(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  const play = /^\/play\/([^/]+)$/.exec(path);
  if (play) {
    try {
      return { screen: 'play', id: decodeURIComponent(play[1]) };
    } catch {
      return { screen: 'book' };
    }
  }
  const screen = (Object.keys(PATHS) as Screen[]).find((s) => PATHS[s] === path);
  return { screen: screen ?? 'book' };
}

const same = (a: Route, b: Route) =>
  a.screen === b.screen && (a.screen !== 'play' || a.id === (b as { id: string }).id);

let current: Route = typeof location === 'undefined' ? { screen: 'book' } : parsePath(location.pathname);
const listeners = new Set<() => void>();

/**
 * Put the current route in the address bar, on the entry that is current.
 *
 * The query string is kept: `?trace` opens the pointer trace, and losing it on
 * the first tap would make the one debugging tool this app has unusable.
 */
function writeAddress(): void {
  if (typeof history === 'undefined') return;
  const path = toPath(current);
  if (location.pathname === path) return;
  try {
    history.replaceState(history.state, '', path + location.search);
  } catch {
    /* a sandboxed frame may refuse; the app works without an address */
  }
}

export function getRoute(): Route {
  return current;
}

export function go(route: Route): void {
  if (same(current, route)) return;
  current = route;
  writeAddress();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute, getRoute);
}

/**
 * After a back gesture, the entry underneath is showing its own old address.
 *
 * Deferred a tick, because the layer the gesture closes changes the route from
 * inside the same `popstate`, and the address has to be written after that has
 * settled rather than before.
 */
export function installRoute(): void {
  window.addEventListener('popstate', () => {
    window.setTimeout(writeAddress, 0);
  });
}
