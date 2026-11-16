import { basketball } from './basketball';
import { football } from './football';
import type { SportModule, Variant } from './types';

/** Every sport the app can draw, in the order a coach is offered them. */
export const SPORTS: SportModule[] = [football, basketball];

/**
 * The sport a play, a book or a formation belongs to, read off its variant.
 *
 * Not stored beside it: a variant belongs to exactly one sport, so a second
 * field could only ever agree with the first or be wrong. Nothing, and
 * anything nobody has heard of, is football — which is every play there was
 * before there was a second sport.
 */
export function sportOf(variant: string | undefined): SportModule {
  return SPORTS.find((s) => s.variants.some((v) => v.id === variant)) ?? football;
}

/** True for a play drawn on a court. The seam most of the editor branches at. */
export function isHoops(variant: string | undefined): boolean {
  return sportOf(variant) === basketball;
}

/** Any sport's variant; football's seven-man when it is not one anybody knows. */
export function anyVariant(id: string | undefined): Variant {
  const sport = sportOf(id);
  return sport.variants.find((v) => v.id === id) ?? football.variants.find((v) => v.id === football.defaultVariant)!;
}

/** The board's window for a play of this kind. */
export function viewOf(variant: string | undefined): SportModule['view'] {
  return sportOf(variant).view;
}

export { basketball, football };
export type { SportModule, Variant } from './types';
