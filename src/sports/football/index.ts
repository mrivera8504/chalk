import { classicFormations, defaultOffense } from '../../domain/presets/formations';
import { DEFAULT_SETTINGS, PLAYER_R, type Settings } from '../../domain/types';
import { VIEW } from '../../render/geometry';
import type { SportModule, Variant } from '../types';
import { OTHER_VARIANTS } from './variants';

/**
 * Seven-man tackle: the game this app was built for.
 *
 * It is the variant a play belongs to when it does not say, for the reason a
 * play with no `unit` is an offensive one — every play drawn before there was a
 * choice was a seven-man play, and writing that onto each of them would be work
 * to record what their silence already says. So choosing it stores nothing.
 *
 * It is also the only one whose numbers are the coach's own. The league rules
 * in Settings were always there to be changed, and a book that has run for two
 * seasons on a house rule of five on the line keeps it.
 */
export const SEVEN = 'seven';

const seven: Variant = {
  id: SEVEN,
  name: '7-man',
  blurb: 'Four on the line. Your own league rules, from Settings.',
  playersPerSide: DEFAULT_SETTINGS.playersPerSide,
  minOnLine: DEFAULT_SETTINGS.minOnLine,
  blocking: true,
  offense: defaultOffense,
  formations: classicFormations,
};

export const football: SportModule = {
  id: 'football',
  name: 'Football',
  unit: 'yd',
  view: VIEW,
  markRadius: PLAYER_R,
  // Smallest to biggest, which is also youngest to oldest.
  variants: [OTHER_VARIANTS[0], OTHER_VARIANTS[1], seven, ...OTHER_VARIANTS.slice(2)],
  defaultVariant: SEVEN,
};

/** What is stored for a choice: nothing at all for seven-man. */
export function variantKey(id: string | undefined): string | undefined {
  return id && id !== SEVEN ? id : undefined;
}

/**
 * The variant a play, a book or a formation belongs to.
 *
 * One nobody has heard of — written by a newer build, on another device — is
 * read as seven-man rather than refused: the play still opens, with every man
 * where he was put, and only the badge is counting to the wrong number.
 */
export function variantOf(id: string | undefined): Variant {
  return football.variants.find((v) => v.id === id) ?? seven;
}

/**
 * The rules a play is held to.
 *
 * Seven-man is held to the coach's settings, exactly as before. Every other
 * kind brings its own two numbers and leaves the rest — which way the even
 * holes run, how close to the line counts as on it — as the coach has them.
 */
export function rulesFor(variant: string | undefined, settings: Settings): Settings {
  const key = variantKey(variant);
  if (!key) return settings;
  const v = variantOf(key);
  return v.id === SEVEN
    ? settings
    : { ...settings, playersPerSide: v.playersPerSide, minOnLine: v.minOnLine };
}
