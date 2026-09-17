import type { Formation, PlayerSlot, Side } from '../types';

let counter = 0;
const id = (prefix: string) => `${prefix}-${++counter}`;

/**
 * One balanced 7-man set, sitting at the legal minimum of four on the line so
 * the count badge has something to react to. The real library gets built from
 * your own playbook rather than invented here.
 */
export function defaultOffense(): PlayerSlot[] {
  const line = (label: string, x: number): PlayerSlot => ({
    id: id('o'),
    label,
    side: 'offense',
    x,
    y: 0,
    onLine: true,
    onLineLocked: false,
    shape: 'square',
  });

  const back = (label: string, x: number, y: number, backNumber?: number): PlayerSlot => ({
    id: id('o'),
    label,
    side: 'offense',
    x,
    y,
    onLine: false,
    onLineLocked: false,
    backNumber,
    shape: 'circle',
  });

  return [
    line('LG', -1.8),
    line('C', 0),
    line('RG', 1.8),
    line('TE', 3.6),
    back('WB', -5, 1.8),
    back('QB', 0, 1.6, 1),
    back('RB', 0, 5, 2),
  ];
}

export function defaultDefense(): PlayerSlot[] {
  const front = (label: string, x: number): PlayerSlot => ({
    id: id('d'),
    label,
    side: 'defense',
    x,
    y: -1.7,
    onLine: false,
    onLineLocked: false,
    shape: 'x',
  });

  const off = (label: string, x: number, y: number): PlayerSlot => ({
    id: id('d'),
    label,
    side: 'defense',
    x,
    y,
    onLine: false,
    onLineLocked: false,
    shape: 'triangle',
  });

  return [
    front('E', -3.4),
    front('T', -1.2),
    front('T', 1.2),
    front('E', 3.4),
    off('W', -2.6, -4.5),
    off('M', 2.6, -4.5),
    off('S', 0, -9),
  ];
}

/**
 * A front, built from two rows of numbers.
 *
 * Fronts are named by how many men are in each row — 5-2, 6-1 — so that is what
 * they are written as here, and the marks follow the same convention the default
 * defense set: ✕ on the line, triangle off it. Nothing is anchored to an
 * offensive player, deliberately. A front is where these seven stand; who they
 * end up shaded on is the coach's next drag, and the gap map re-letters itself
 * around wherever they finish.
 */
function front(down: number[], off: { label: string; x: number; y: number }[]): PlayerSlot[] {
  const middle = (down.length - 1) / 2;
  const onBall = down.map((x, i) => ({
    id: id('d'),
    // A man head-up on the center is the nose; everyone inside the ends is a tackle.
    label: i === middle ? 'N' : 'T',
    side: 'defense' as const,
    x,
    // Off the ball by more than two marks' worth, so a nose head-up on the
    // center draws as two players rather than as one smudge.
    y: -1.7,
    onLine: false,
    onLineLocked: false,
    shape: 'x' as const,
  }));

  // The outside men on the line are ends, whatever the count is.
  if (onBall.length > 1) {
    onBall[0].label = 'E';
    onBall[onBall.length - 1].label = 'E';
  }

  return [
    ...onBall,
    ...off.map((o) => ({
      id: id('d'),
      label: o.label,
      side: 'defense' as const,
      x: o.x,
      y: o.y,
      onLine: false,
      onLineLocked: false,
      shape: 'triangle' as const,
    })),
  ];
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
export function builtInFormations(): Formation[] {
  return [
    { id: 'builtin-balanced', name: 'Balanced', side: 'offense', players: defaultOffense(), builtIn: true },
    { id: 'builtin-5-2', name: '5-2', side: 'defense', players: front52(), builtIn: true },
    { id: 'builtin-4-2-1', name: '4-2-1', side: 'defense', players: front421(), builtIn: true },
    { id: 'builtin-3-3-1', name: '3-3-1', side: 'defense', players: front331(), builtIn: true },
    { id: 'builtin-6-1', name: '6-1', side: 'defense', players: front61(), builtIn: true },
  ];
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
export function readFoundationId(side: Side = 'offense'): string | null {
  try {
    return localStorage.getItem(side === 'defense' ? DEF_FOUNDATION_KEY : FOUNDATION_KEY);
  } catch {
    return null;
  }
}

export function writeFoundationId(id: string | null, side: Side = 'offense'): void {
  const key = side === 'defense' ? DEF_FOUNDATION_KEY : FOUNDATION_KEY;
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
export function foundationOffense(): PlayerSlot[] {
  return foundationFor('offense');
}

/** The front a new defensive play starts from, on the same terms. */
export function foundationDefense(): PlayerSlot[] {
  return foundationFor('defense');
}

function foundationFor(side: Side): PlayerSlot[] {
  const fallback = () => (side === 'defense' ? front52() : defaultOffense());
  const id = readFoundationId(side);
  if (!id) return fallback();
  const found = readFormations().find((f) => f.id === id && f.side === side);
  return found ? structuredClone(found.players) : fallback();
}
