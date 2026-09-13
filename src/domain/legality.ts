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
