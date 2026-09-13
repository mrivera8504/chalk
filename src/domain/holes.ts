import type { Hole, PlayerSlot, Settings } from './types';

/**
 * Gaps between on-line offensive players, numbered outward from the center.
 * With even holes to the right:
 *
 *     ...  5   3   1  [C]  2   4   6  ...
 *
 * Nothing here is tied to a named position. Move a player onto or off the
 * line and the map is rebuilt from scratch, which is what a 7-man format
 * with a variable line needs.
 */
export function computeHoles(players: PlayerSlot[], settings: Settings): Hole[] {
  const line = players
    .filter((p) => p.side === 'offense' && p.onLine)
    .sort((a, b) => a.x - b.x);

  if (line.length < 2) return [];

  // The center is whoever on the line sits closest to the middle of the field.
  let centerIdx = 0;
  for (let i = 1; i < line.length; i++) {
    if (Math.abs(line[i].x) < Math.abs(line[centerIdx].x)) centerIdx = i;
  }

  const rightIsEven = settings.evenHolesSide === 'right';
  const holes: Hole[] = [];

  let leftNum = rightIsEven ? 1 : 2;
  let rightNum = rightIsEven ? 2 : 1;

  // Walk left from the center, one hole per gap.
  for (let i = centerIdx; i > 0; i--) {
    holes.push({ number: leftNum, x: (line[i].x + line[i - 1].x) / 2 });
    leftNum += 2;
  }
  // Off the left end.
  holes.push({ number: leftNum, x: line[0].x - 1.6 });

  // Walk right from the center.
  for (let i = centerIdx; i < line.length - 1; i++) {
    holes.push({ number: rightNum, x: (line[i].x + line[i + 1].x) / 2 });
    rightNum += 2;
  }
  // Off the right end.
  holes.push({ number: rightNum, x: line[line.length - 1].x + 1.6 });

  return holes.sort((a, b) => a.x - b.x);
}

/** The hole a ball carrier crossing the LOS at this x would be running through. */
export function nearestHole(holes: Hole[], x: number): Hole | null {
  if (!holes.length) return null;
  return holes.reduce((best, h) =>
    Math.abs(h.x - x) < Math.abs(best.x - x) ? h : best,
  );
}
