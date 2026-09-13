import type { PlayerSlot } from './types';

/**
 * A kid on the team.
 *
 * The spec sketches this as a document per player under the account. It lives
 * in local storage beside the formations and the saved routes instead, for the
 * same reason they do: it describes this team rather than any one play, there
 * is one user, and the JSON backup carries it out whole. See store/backup.ts.
 */
export interface RosterEntry {
  id: string;
  name: string;
  /** The link to a player slot. Shirt numbers are unique on a team by rule. */
  jersey: number;
  /** 'QB', 'RB', 'C' — what he can play, not where he is standing today. */
  positions: string[];
}

const KEY = 'chalk.roster.v1';

let counter = 0;
const rosterId = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

function clean(entry: Partial<RosterEntry>): RosterEntry | null {
  const jersey = Number(entry.jersey);
  if (!Number.isFinite(jersey)) return null;
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : rosterId(),
    name: typeof entry.name === 'string' ? entry.name : '',
    jersey: Math.trunc(jersey),
    positions: Array.isArray(entry.positions)
      ? entry.positions.filter((p): p is string => typeof p === 'string')
      : [],
  };
}

export function readRoster(): RosterEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<RosterEntry>[]) : [];
    if (!Array.isArray(saved)) return [];
    return byJersey(saved.map(clean).filter((e): e is RosterEntry => e !== null));
  } catch {
    return [];
  }
}

export function writeRoster(all: RosterEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage blocked; the session keeps working */
  }
}

/** Shirt order, which is the order a coach reads a team sheet in. */
export function byJersey(roster: RosterEntry[]): RosterEntry[] {
  return [...roster].sort((a, b) => a.jersey - b.jersey);
}

export function newEntry(jersey: number): RosterEntry {
  return { id: rosterId(), name: '', jersey, positions: [] };
}

/** The lowest shirt nobody is wearing, so adding a kid needs no typing to start. */
export function nextJersey(roster: RosterEntry[]): number {
  const taken = new Set(roster.map((e) => e.jersey));
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

/** Two kids in one shirt is a mistake worth refusing rather than guessing at. */
export function jerseyTaken(roster: RosterEntry[], jersey: number, exceptId?: string): boolean {
  return roster.some((e) => e.jersey === jersey && e.id !== exceptId);
}

/**
 * Who is filling this slot, if anybody.
 *
 * A slot stores the shirt number rather than a roster id, which is what the
 * spec calls for and is also what is drawn on the board and shouted on a
 * sideline. An unrostered number still draws: the link is a lookup, never a
 * requirement.
 */
export function whoIs(roster: RosterEntry[], slot: PlayerSlot): RosterEntry | null {
  if (slot.jersey === undefined) return null;
  return roster.find((e) => e.jersey === slot.jersey) ?? null;
}

/** 'QB 7 Marcus', or 'QB 7' when the number is on nobody. For the install sheet. */
export function describePersonnel(players: PlayerSlot[], roster: RosterEntry[]): string {
  return players
    .filter((p) => p.side === 'offense' && p.jersey !== undefined)
    .map((p) => {
      const who = whoIs(roster, p);
      return `${p.label} ${p.jersey}${who?.name ? ` ${who.name}` : ''}`;
    })
    .join('   ');
}
