import { viewForPlays } from '../../src/export/view';
import type { BoardMark } from '../../src/domain/marks';
import { play } from '../fixtures/plays';

/** The window a sheet would give a play holding nothing but these marks. */
export const boundsView = (marks: BoardMark[]) => viewForPlays([play({ marks })], 22 / 30);
