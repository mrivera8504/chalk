import type { Assignment, AssignmentKind, PlayerSlot } from './types';

/*
 * Where a man goes, as opposed to what else is drawn off him.
 *
 * Three things need the same answer: a shot starts from where the shooter ends
 * up, the next step of a play starts with everybody where this one left them,
 * and playback moves each man along one line. So it is asked once, here.
 */

/** Lines that are not the man moving: a rope, the ball leaving his hands. */
const NOT_MOVES: AssignmentKind[] = ['cover', 'pass', 'shot', 'stay'];

/** The line a man travels along, if he has one. */
export function movementOf(assignments: Assignment[], playerId: string): Assignment | null {
  return (
    assignments.find(
      (a) => a.playerId === playerId && !NOT_MOVES.includes(a.kind) && a.path.length >= 2,
    ) ?? null
  );
}

/** Where a man is when everything drawn for him has been run. */
export function endOf(player: PlayerSlot, assignments: Assignment[]): { x: number; y: number } {
  const move = movementOf(assignments, player.id);
  if (!move) return { x: player.x, y: player.y };
  const last = move.path[move.path.length - 1];
  return { x: last.x, y: last.y };
}
