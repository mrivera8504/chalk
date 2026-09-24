import type { Assignment, PlayerSlot } from './types';

/**
 * One color per receiver, so three routes that cross can be told apart at a
 * glance without tracing any of them back to its man.
 *
 * Chosen to stay clear of the three colors already carrying meaning: the block
 * yellow, the carry orange, and the selection blue. The first entry is the old
 * single route blue, so a play drawn before this existed still looks the way it
 * did, and a one-receiver play is unchanged.
 *
 * Token names, not literals, so an export headed for paper can swap the set for
 * ink dark enough to read on white. The values live in ui/tokens.css.
 */
export const ROUTE_COLORS = [
  'var(--route-0)', // cyan
  'var(--route-1)', // green
  'var(--route-2)', // violet
  'var(--route-3)', // pink
  'var(--route-4)', // lime
  'var(--route-5)', // aqua
] as const;

/** The manual palette: every auto color, plus plain chalk for a neutral route. */
export const SWATCHES = [...ROUTE_COLORS, 'var(--chalk)'] as const;

/**
 * What a zone can be painted, which is the same palette without the chalk.
 *
 * A zone is a wash at a tenth of its alpha rather than a 3pt line, and the
 * neutral chalk laid down that faintly is a shape nobody can see on turf and
 * nothing at all on the white board. The six carry their own meaning anyway:
 * this is for telling the deep men from the underneath ones, and six is more
 * than a coverage has zones.
 */
export const ZONE_SWATCHES = ROUTE_COLORS;

/**
 * The color a route takes when nobody has picked one by hand.
 *
 * Keyed to the player's place in the offense rather than to the assignment, so
 * a receiver keeps his color when he is given a different route, and two
 * routes drawn for the same man can never disagree. Returns nothing for blocks
 * and carries: those read by line style and their own color already.
 */
export function autoRouteColor(a: Assignment, players: PlayerSlot[]): string | undefined {
  if (a.kind !== 'route') return undefined;
  const i = players.filter((p) => p.side === 'offense').findIndex((p) => p.id === a.playerId);
  if (i === -1) return undefined;
  return ROUTE_COLORS[i % ROUTE_COLORS.length];
}
