/*
 * Whether the drawer is open, remembered across plays and sessions. The editor
 * remounts for every play, and a coach who slid the tools away to see the board
 * wants them to stay away. Defaults to open, so the tools are not hidden behind
 * a tab from someone who has never seen one.
 */
export const DRAWER_KEY = 'chalk.drawer.v1';

/**
 * Open on a screen with room for it, shut on one without.
 *
 * Only ever the *first* answer: the coach's own tap on the tab is written down
 * and wins from then on. A phone in portrait gives the panel 58% of the board,
 * so starting there means the first thing anybody sees is a wall of buttons
 * over the play they just opened.
 */
export function drawerDefault(): boolean {
  try {
    return window.matchMedia('(orientation: landscape), (min-width: 700px)').matches;
  } catch {
    return true;
  }
}

export function readDrawerOpen(): boolean {
  try {
    const saved = localStorage.getItem(DRAWER_KEY);
    if (saved === 'closed') return false;
    if (saved === 'open') return true;
    return drawerDefault();
  } catch {
    return drawerDefault();
  }
}

export function writeDrawerOpen(open: boolean): void {
  try {
    localStorage.setItem(DRAWER_KEY, open ? 'open' : 'closed');
  } catch {
    /* storage blocked; the session keeps working */
  }
}
