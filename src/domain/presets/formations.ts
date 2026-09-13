import type { Formation, PlayerSlot } from '../types';

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

const FORMATION_KEY = 'chalk.formations.v1';

/** Built-in, always present, never deletable. */
export function builtInFormations(): Formation[] {
  return [
    { id: 'builtin-balanced', name: 'Balanced', side: 'offense', players: defaultOffense(), builtIn: true },
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
 * The foundation is the set this team actually lines up in, and every new play
 * opens in it. Stored as an id rather than a copy of the players, so editing
 * and re-saving that formation carries forward; stored next to the formations
 * rather than in the playbook document, because it describes this team's base
 * rather than any one play, and a play already keeps its own players.
 */
export function readFoundationId(): string | null {
  try {
    return localStorage.getItem(FOUNDATION_KEY);
  } catch {
    return null;
  }
}

export function writeFoundationId(id: string | null): void {
  try {
    if (id) localStorage.setItem(FOUNDATION_KEY, id);
    else localStorage.removeItem(FOUNDATION_KEY);
  } catch {
    /* storage blocked; the session keeps working */
  }
}

/**
 * The offense a new play starts from. Falls back to the built-in set whenever
 * no foundation is set, or when the one that was set has since been deleted.
 */
export function foundationOffense(): PlayerSlot[] {
  const id = readFoundationId();
  if (!id) return defaultOffense();
  const found = readFormations().find((f) => f.id === id);
  return found ? structuredClone(found.players) : defaultOffense();
}
