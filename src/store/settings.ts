import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../domain/types';

/**
 * Everything adjustable, in one place.
 *
 * Extends the domain Settings rather than sitting beside them, because the
 * league rules (how many a side, how many on the line, which way the even holes
 * run) are settings in exactly the same sense as the colours are — they were
 * simply frozen as a constant until there was a screen to change them on.
 */
export interface AppSettings extends Settings {
  /** One per receiver, in order. Written onto the root as --route-0..5. */
  routeColors: string[];
  carryColor: string;
  blockColor: string;
  /**
   * Which edge the tool drawer lives on. A pen is held in one hand and the
   * drawer should not be under it, so this is handedness, not decoration.
   */
  drawerSide: 'left' | 'right';
  /** How near the line a mark clicks flush onto it. Zero turns the magnet off. */
  losMagnetYards: number;
  /** The grid everything else snaps to. */
  snapStepYards: number;
  /** What a freshly opened play shows. */
  showHoles: boolean;
  showDefense: boolean;
  /**
   * Ignore a finger while drawing freehand. Palm rejection already drops touch
   * that lands within 800ms of a pen event; this is the stronger rule, for a
   * coach who rests a hand on the glass for longer than that. It covers the ink
   * tools only — dragging a player with a finger keeps working either way,
   * which the device notes are explicit about.
   */
  penOnly: boolean;
  /**
   * Let how hard the pen is pressed set how thick the stroke comes out.
   *
   * Off by default for the reason the spec gives — a line that changes width
   * down its length reads as sloppy on a printed call sheet — and because this
   * digitizer reports 0.00 on every pointerdown and 0.02 to 0.13 while moving,
   * so the range to work with is almost nothing. One width per stroke, taken
   * from the hardest part of it, rather than a width that wanders.
   */
  pressureWidth: boolean;
  /**
   * Square up a freehand stroke when it is finished: segments within eight
   * degrees of straight go straight, and the last point settles onto a whole
   * yard. Off by default, because freehand is the tool you reach for when the
   * presets do not have the shape you mean.
   */
  squareUpStrokes: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  ...DEFAULT_SETTINGS,
  routeColors: ['#7fd4ff', '#86e5a0', '#c4a7ff', '#ff9ecb', '#d6e86b', '#79e0d8'],
  carryColor: '#ffb37a',
  blockColor: '#f2dfa0',
  drawerSide: 'right',
  losMagnetYards: 0.5,
  snapStepYards: 0.25,
  showHoles: true,
  showDefense: false,
  penOnly: false,
  pressureWidth: false,
  squareUpStrokes: false,
};

const KEY = 'chalk.settings.v1';

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    // Merged over the defaults, so a settings file written by an older build
    // gains new keys instead of leaving them undefined halfway down the app.
    const saved = JSON.parse(raw) as Partial<AppSettings>;
    const merged = { ...DEFAULT_APP_SETTINGS, ...saved };
    if (!Array.isArray(merged.routeColors) || merged.routeColors.length !== 6) {
      merged.routeColors = DEFAULT_APP_SETTINGS.routeColors;
    }
    return merged;
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

let current = load();
const listeners = new Set<() => void>();

/**
 * Push the colours onto the document root.
 *
 * The renderers ask for `var(--route-2)`, never a literal, so overriding the
 * token here reaches the board, the playbook thumbnails and the exporter at
 * once — the exporter copies whatever the root computes into the SVG it writes.
 * One assignment, and every surface agrees.
 */
function applyColors(s: AppSettings): void {
  const root = document.documentElement;
  s.routeColors.forEach((c, i) => root.style.setProperty(`--route-${i}`, c));
  root.style.setProperty('--ink-carry', s.carryColor);
  root.style.setProperty('--ink-block', s.blockColor);
}

applyColors(current);

/** For code outside a component, where a stale read is harmless. */
export function getSettings(): AppSettings {
  return current;
}

export function setSettings(patch: Partial<AppSettings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage blocked; the session keeps working */
  }
  applyColors(current);
  listeners.forEach((l) => l());
}

export function resetSettings(): void {
  setSettings(DEFAULT_APP_SETTINGS);
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
