import type { PlayerSlot } from './types';

/**
 * Who plays where: for each position, the shirts in order — starter first.
 *
 * Keyed by the position's label, the same word that is written in the man's
 * mark on the board, because that is the only name a position has here: a
 * slot labelled `RB` in every formation is the running back whichever set the
 * team is in. Shirts, not roster ids, for the reason a slot stores a shirt.
 */
export type DepthChart = Record<string, number[]>;

const KEY = 'chalk.depth.v1';

export function readDepth(): DepthChart {
  try {
    const raw = localStorage.getItem(KEY);
    const chart = raw ? (JSON.parse(raw) as DepthChart) : {};
    return chart && typeof chart === 'object' && !Array.isArray(chart) ? chart : {};
  } catch {
    return {};
  }
}

export function writeDepth(chart: DepthChart): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(chart));
  } catch {
    /* storage blocked; the session keeps working */
  }
}

/**
 * Put the chart's kids into a board's slots: the starters, or a string below.
 *
 * Nobody is put in two slots on one board. Where the man the chart names for a
 * slot is already in another one — a kid who starts at TE and backs up at RB —
 * the next name down that position's list is taken instead, and a slot whose
 * list runs out keeps whoever it had. Positions the chart says nothing about
 * are left exactly as they were, and so is the other side of the ball.
 */
export function fillFromDepth(
  players: PlayerSlot[],
  chart: DepthChart,
  side: PlayerSlot['side'],
  string = 0,
): PlayerSlot[] {
  const used = new Set<number>();
  const filled = new Map<string, number>();
  // Starters claim their shirts before anybody's backup can take them.
  for (const p of players) {
    if (p.side !== side) continue;
    const list = chart[p.label] ?? [];
    const pick = list.slice(string).find((j) => !used.has(j));
    if (pick === undefined) continue;
    used.add(pick);
    filled.set(p.id, pick);
  }
  return players.map((p) => (filled.has(p.id) ? { ...p, jersey: filled.get(p.id) } : p));
}

/** Every position worth a row: the board's labels, then anything charted. */
export function positionsFor(labels: string[], chart: DepthChart): string[] {
  const seen = new Set<string>();
  return [...labels, ...Object.keys(chart)].filter((l) => {
    if (!l || seen.has(l)) return false;
    seen.add(l);
    return true;
  });
}
