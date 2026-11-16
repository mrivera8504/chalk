import { football } from './football';
import type { SportModule } from './types';

/** Every sport the app can draw. One, until the next is written. */
export const SPORTS: SportModule[] = [football];

export { football };
export type { SportModule, Variant } from './types';
