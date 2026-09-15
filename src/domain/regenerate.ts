import { refreshBlocks } from './presets/blocks';
import { refreshLinks } from './presets/links';
import type { Assignment, PlayerSlot } from './types';

/**
 * Every line that is stored as a relationship rather than as geometry, rebuilt
 * from the players it names.
 *
 * One function because there are three places that draw a play — the board, the
 * playbook thumbnail and the exporter — and a fourth family of regenerated line
 * added to only two of them would draw a play three different ways. The board
 * is the one that gets noticed; the printed sheet is the one that matters.
 */
export function refreshPaths(assignments: Assignment[], players: PlayerSlot[]): Assignment[] {
  return refreshLinks(refreshBlocks(assignments, players), players);
}
