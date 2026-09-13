export type Side = 'offense' | 'defense';

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'x';

/**
 * Positions are stored in yards, never pixels.
 *   x: yards from the middle of the field, positive to the offense's right
 *   y: yards from the line of scrimmage, positive behind the LOS
 */
export interface PlayerSlot {
  id: string;
  label: string;
  side: Side;
  x: number;
  y: number;
  /** Derived from y unless onLineLocked is set. */
  onLine: boolean;
  onLineLocked: boolean;
  /** 1 = QB, 2 = RB. Used for play name suggestions. */
  backNumber?: number;
  jersey?: number;
  shape: ShapeKind;
}

export interface Hole {
  number: number;
  x: number;
}

export type IssueLevel = 'error' | 'warn';

export interface Issue {
  level: IssueLevel;
  text: string;
}

export interface Settings {
  playersPerSide: number;
  minOnLine: number;
  evenHolesSide: 'right' | 'left';
  /** Not used by the play view, which only shows the yards around the LOS. */
  fieldLengthYards: number;
  /** A player within this many yards of the LOS counts as on the line. */
  onLineToleranceYards: number;
}

export const DEFAULT_SETTINGS: Settings = {
  playersPerSide: 7,
  minOnLine: 4,
  evenHolesSide: 'right',
  fieldLengthYards: 70,
  onLineToleranceYards: 1,
};
