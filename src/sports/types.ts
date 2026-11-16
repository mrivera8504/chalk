import type { Formation, PlayerSlot, Settings } from '../domain/types';

/**
 * What a sport has to supply for the app to draw plays in it.
 *
 * Football is the only one there is, and this is written from what football
 * turned out to need rather than from a guess at what basketball will: a unit,
 * a window, the size of a mark, and the kinds of the game it comes in. The
 * rules that are only football's — holes, gaps, legality, the namer — stay
 * football's, behind `rules`, which a sport is allowed not to have.
 */
export interface SportModule {
  id: string;
  name: string;
  /** What every position and path is measured in. Never pixels. */
  unit: 'yd' | 'ft' | 'm';
  /**
   * Real yards to one unit on the board, where the surface is drawn smaller
   * than life so the men on it are big enough to read. Absent means one.
   */
  yardsPerUnit?: number;
  /** The board's window, in that unit, around the sport's own origin. */
  view: { halfWidth: number; downfield: number; behind: number };
  /** Radius of a player's mark, in that unit. */
  markRadius: number;
  variants: Variant[];
  /** The variant a play belongs to when it does not say. */
  defaultVariant: string;
  /** What its plays are drawn on. Absent is a football field. */
  surface?: 'field' | 'court' | 'pitch' | 'volley' | 'lax' | 'rink' | 'blank';
  /** The position label of whoever has the ball when a play starts, in a pack. */
  ballAt?: string;
  /** Where a shot goes, for a game with a goal up the board. */
  goal?: { x: number; y: number };
}

/**
 * One kind of a sport: seven-man tackle, five-a-side flag.
 *
 * It answers the three things that differ between them — how many are on the
 * field, what the rules ask of the line, and where everybody stands before a
 * coach has moved anyone.
 */
export interface Variant {
  id: string;
  name: string;
  /** One line under the name where a coach is choosing. */
  blurb: string;
  playersPerSide: number;
  minOnLine: number;
  /** False where nobody may block: the block tools are not offered at all. */
  blocking: boolean;
  /** The set a new play opens in until a coach stars one of their own. */
  offense: () => PlayerSlot[];
  /** The built-in formations and fronts. The first front is the base. */
  formations: () => Formation[];
}

/** The league rules a play is held to: the coach's own, or its variant's. */
export type Rules = Settings;
