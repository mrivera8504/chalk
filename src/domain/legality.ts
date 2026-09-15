import type { Issue, PlayerSlot, Settings } from './types';

/**
 * A player is on the line if they are within tolerance of the LOS, unless the
 * user has overridden it by hand. Dragging across the threshold flips the flag
 * and the hole map redraws.
 */
export function autoOnLine(p: PlayerSlot, settings: Settings): boolean {
  if (p.onLineLocked) return p.onLine;
  if (p.side === 'defense') return false;
  return p.y <= settings.onLineToleranceYards;
}

export function applyOnLine(players: PlayerSlot[], settings: Settings): PlayerSlot[] {
  return players.map((p) => {
    const onLine = autoOnLine(p, settings);
    return onLine === p.onLine ? p : { ...p, onLine };
  });
}

export function countOnLine(players: PlayerSlot[]): number {
  return players.filter((p) => p.side === 'offense' && p.onLine).length;
}

/**
 * Who can catch a pass, and so who a defender can be given in man coverage.
 *
 * Computed off the board rather than stored on the player, for the same reason
 * the holes are: it is a fact about where everybody is standing, and it changes
 * the moment a tight end walks off the line. The rule is the real one — the two
 * men on the ends of the line, plus everybody behind it — which means a wing
 * who steps up onto the line covers the end beside him and both facts fall out
 * of the same walk.
 *
 * The quarterback is left out. He is the man being read, not a man being
 * covered, and a coverage rope drawn to him would be the one line on a
 * defensive board that means something else entirely.
 */
export function eligibleReceivers(players: PlayerSlot[]): PlayerSlot[] {
  const offense = players.filter((p) => p.side === 'offense' && p.backNumber !== 1);
  const line = offense.filter((p) => p.onLine).sort((a, b) => a.x - b.x);
  const ends = line.length > 1 ? [line[0], line[line.length - 1]] : line;
  return offense.filter((p) => !p.onLine || ends.some((e) => e.id === p.id));
}

/**
 * Never blocks saving. Coaches draw illegal formations on purpose, to show a
 * team what not to do or to sketch something mid-thought.
 */
export function checkFormation(players: PlayerSlot[], settings: Settings): Issue[] {
  const offense = players.filter((p) => p.side === 'offense');
  const onLine = countOnLine(players);
  const issues: Issue[] = [];

  if (offense.length !== settings.playersPerSide) {
    issues.push({
      level: 'error',
      text: `${offense.length} on offense, need ${settings.playersPerSide}`,
    });
  }

  if (onLine < settings.minOnLine) {
    issues.push({
      level: 'error',
      text: `${onLine} on the line, need ${settings.minOnLine}`,
    });
  }

  if (!offense.some((p) => p.label.toUpperCase() === 'C')) {
    issues.push({ level: 'warn', text: 'No center marked' });
  }

  return issues;
}
