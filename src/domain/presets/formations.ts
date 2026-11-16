import type { Formation, PlayerSlot, Side } from '../types';
import { basketball } from '../../sports/basketball';
import { OTHER_VARIANTS as FOOTBALL_VARIANTS } from '../../sports/football/variants';
import { back, front, lineman } from './slots';

/** Every variant that is not seven-man football, of every sport. */
const OTHER_VARIANTS = [...FOOTBALL_VARIANTS, ...basketball.variants];

/**
 * One balanced 7-man set, sitting at the legal minimum of four on the line so
 * the count badge has something to react to. The real library gets built from
 * your own playbook rather than invented here.
 */
export function defaultOffense(): PlayerSlot[] {
  return [
    lineman('LG', -1.8),
    lineman('C', 0),
    lineman('RG', 1.8),
    lineman('TE', 3.6),
    back('WB', -5, 1.8),
    back('QB', 0, 1.6, 1),
    back('RB', 0, 5, 2),
  ];
}

export function defaultDefense(): PlayerSlot[] {
  return front421();
}

/** Five across and two behind: the base front for most 7-man youth teams. */
export function front52(): PlayerSlot[] {
  return front(
    [-3.6, -1.8, 0, 1.8, 3.6],
    [
      { label: 'W', x: -2.4, y: -4.6 },
      { label: 'M', x: 2.4, y: -4.6 },
    ],
  );
}

/** Four down, two backers and a safety. What the board has always dropped in. */
export function front421(): PlayerSlot[] {
  return front(
    [-3.4, -1.2, 1.2, 3.4],
    [
      { label: 'W', x: -2.6, y: -4.5 },
      { label: 'M', x: 2.6, y: -4.5 },
      { label: 'S', x: 0, y: -9 },
    ],
  );
}

/** Three down, three across and one over the top: the pass-first look. */
export function front331(): PlayerSlot[] {
  return front(
    [-2.2, 0, 2.2],
    [
      { label: 'W', x: -4.8, y: -4.4 },
      { label: 'M', x: 0, y: -4.4 },
      { label: 'S', x: 4.8, y: -4.4 },
      { label: 'F', x: 0, y: -10 },
    ],
  );
}

/** Everybody on the ball but one. Goal line, and short yardage. */
export function front61(): PlayerSlot[] {
  return front([-4.6, -2.8, -1.0, 1.0, 2.8, 4.6], [{ label: 'M', x: 0, y: -4.2 }]);
}

const FORMATION_KEY = 'chalk.formations.v1';

/**
 * Built-in, always present, never deletable.
 *
 * Both sides live in the one list and are told apart by `side`, rather than in
 * two lists: a formation is a formation, the picker already knows which unit it
 * is showing, and saving a front had to go somewhere that backup already
 * carries.
 */
export function classicFormations(): Formation[] {
  return [
    { id: 'builtin-balanced', name: 'Balanced', side: 'offense', players: defaultOffense(), builtIn: true },
    { id: 'builtin-5-2', name: '5-2', side: 'defense', players: front52(), builtIn: true },
    { id: 'builtin-4-2-1', name: '4-2-1', side: 'defense', players: front421(), builtIn: true },
    { id: 'builtin-3-3-1', name: '3-3-1', side: 'defense', players: front331(), builtIn: true },
    { id: 'builtin-6-1', name: '6-1', side: 'defense', players: front61(), builtIn: true },
  ];
}

/**
 * Every built-in set, for every kind of football.
 *
 * One list, told apart by `variant` the way the two units are told apart by
 * `side`. A formation with no variant is a seven-man one, which is every
 * formation saved before there was any other kind.
 */
export function builtInFormations(): Formation[] {
  return [...classicFormations(), ...OTHER_VARIANTS.flatMap((v) => v.formations())];
}

/** The formations that belong on a play of this kind. */
export function formationsFor(all: Formation[], variant?: string): Formation[] {
  const key = variant && variant !== 'seven' ? variant : undefined;
  return all.filter((f) => f.variant === key);
}

/** The built-in base front of a kind of football: what a new defense opens in. */
export function baseFrontId(variant?: string): string {
  const v = OTHER_VARIANTS.find((o) => o.id === variant);
  return v?.formations().find((f) => f.side === 'defense')?.id ?? 'builtin-5-2';
}

export function readFormations(): Formation[] {
  try {
    const raw = localStorage.getItem(FORMATION_KEY);
    const saved = raw ? (JSON.parse(raw) as Formation[]) : [];
    return [...builtInFormations(), ...(Array.isArray(saved) ? saved : [])];
  } catch {
    return builtInFormations();
  }
}

export function writeFormations(all: Formation[]): void {
  try {
    localStorage.setItem(FORMATION_KEY, JSON.stringify(all.filter((f) => !f.builtIn)));
  } catch {
    /* storage blocked; the session keeps working */
  }
}

const FOUNDATION_KEY = 'chalk.foundation.v1';
/*
 * The front a new defensive play opens in. Its own key rather than a second
 * field beside the offense's: they are two independent stars, a coach who has
 * set one has said nothing about the other, and the offensive key was already
 * written by a version of the app that had never heard of a front.
 */
const DEF_FOUNDATION_KEY = 'chalk.foundation.def.v1';

/*
 * The foundation is the set this team actually lines up in, and every new play
 * opens in it. Stored as an id rather than a copy of the players, so editing
 * and re-saving that formation carries forward; stored next to the formations
 * rather than in the playbook document, because it describes this team's base
 * rather than any one play, and a play already keeps its own players.
 */
/*
 * Each kind of football stars its own. A starred seven-man set is seven men,
 * and opening an eleven-man play in it would be a play four short — so the key
 * carries the variant, and the seven-man key is the one it has always been.
 */
function foundationKey(side: Side, variant?: string): string {
  const base = side === 'defense' ? DEF_FOUNDATION_KEY : FOUNDATION_KEY;
  return variant && variant !== 'seven' ? `${base}.${variant}` : base;
}

export function readFoundationId(side: Side = 'offense', variant?: string): string | null {
  try {
    return localStorage.getItem(foundationKey(side, variant));
  } catch {
    return null;
  }
}

export function writeFoundationId(id: string | null, side: Side = 'offense', variant?: string): void {
  const key = foundationKey(side, variant);
  try {
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch {
    /* storage blocked; the session keeps working */
  }
}

/**
 * The offense a new play starts from. Falls back to the built-in set whenever
 * no foundation is set, or when the one that was set has since been deleted.
 */
export function foundationOffense(variant?: string): PlayerSlot[] {
  return foundationFor('offense', variant);
}

/** The front a new defensive play starts from, on the same terms. */
export function foundationDefense(variant?: string): PlayerSlot[] {
  return foundationFor('defense', variant);
}

function foundationFor(side: Side, variant?: string): PlayerSlot[] {
  const all = formationsFor(readFormations(), variant);
  const id = readFoundationId(side, variant);
  const found = id ? all.find((f) => f.id === id && f.side === side) : undefined;
  if (found) return structuredClone(found.players);
  const other = OTHER_VARIANTS.find((o) => o.id === variant);
  if (!other) return side === 'defense' ? front52() : defaultOffense();
  // Built fresh rather than cloned, so the men get ids of their own.
  const base = other.formations().find((f) => f.side === side);
  return base ? base.players : [];
}
