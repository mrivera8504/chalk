import type { Hand, PlayerSlot, Zone } from '../types';

/**
 * The spaces a zone defender can be given, as functions of where he is standing
 * and how wide the field is — never as stored rectangles.
 *
 * The same rule the route presets follow, and for the same reason: a flat from
 * a linebacker and a flat from an end have to start in different places and
 * still read as the same call. What differs here is that half of these are
 * functions of the *field* rather than of the man. A hook is his hook, five
 * yards behind wherever he is; a deep third is a third of the field, and it sits
 * where it sits no matter who is asked to get there. That distance — between a
 * defender and the space he owes — is the thing a coverage drawing is for.
 */
export interface FieldSize {
  /** Yards from the middle of the field to the sideline, as the board draws it. */
  halfWidth: number;
}

export interface ZonePreset {
  id: string;
  name: string;
  /** Underneath or over the top. The picker groups by this. */
  group: 'under' | 'deep';
  shape: (player: PlayerSlot, hand: Hand, field: FieldSize) => Omit<Zone, 'playerId'>;
}

const dir = (hand: Hand) => (hand === 'right' ? 1 : -1);

/** Keep the whole box on the board, however far out the man it belongs to is. */
function onField(zone: Omit<Zone, 'playerId'>, field: FieldSize): Omit<Zone, 'playerId'> {
  const limit = field.halfWidth - zone.w / 2;
  return { ...zone, x: Math.max(-limit, Math.min(limit, zone.x)) };
}

/** Which third of the field this man is nearest, as a centre line. */
function thirdCentre(x: number, field: FieldSize): number {
  const w = (field.halfWidth * 2) / 3;
  const centres = [-field.halfWidth + w / 2, 0, field.halfWidth - w / 2];
  return centres.reduce((best, c) => (Math.abs(c - x) < Math.abs(best - x) ? c : best));
}

export const ZONE_PRESETS: ZonePreset[] = [
  {
    id: 'flat',
    name: 'Flat',
    group: 'under',
    shape: (p, h, f) =>
      onField({ x: p.x + dir(h) * 4.5, y: -4, w: 9, h: 8, preset: 'flat', label: 'Flat' }, f),
  },
  {
    id: 'curl',
    name: 'Curl',
    group: 'under',
    shape: (p, h, f) =>
      onField({ x: p.x + dir(h) * 3, y: -9, w: 8, h: 8, preset: 'curl', label: 'Curl' }, f),
  },
  {
    id: 'hook',
    name: 'Hook',
    group: 'under',
    shape: (p, _h, f) =>
      onField({ x: p.x, y: -8, w: 8, h: 8, preset: 'hook', label: 'Hook' }, f),
  },
  {
    /*
     * The one place an underneath defender is told to sit still. A spot zone is
     * small on purpose: it is the difference between "get to that grass" and
     * "have that area", and at this age the first one is teachable and the
     * second one is not.
     */
    id: 'spot',
    name: 'Spot',
    group: 'under',
    shape: (p, _h, f) =>
      onField({ x: p.x, y: -5, w: 5, h: 5, preset: 'spot', label: 'Spot' }, f),
  },
  {
    id: 'third',
    name: 'Deep 1/3',
    group: 'deep',
    shape: (p, _h, f) => {
      const w = (f.halfWidth * 2) / 3;
      return { x: thirdCentre(p.x, f), y: -14, w, h: 12, preset: 'third', label: 'Deep 1/3' };
    },
  },
  {
    id: 'half',
    name: 'Deep 1/2',
    group: 'deep',
    shape: (p, _h, f) => ({
      x: (p.x >= 0 ? 1 : -1) * (f.halfWidth / 2),
      y: -14,
      w: f.halfWidth,
      h: 12,
      preset: 'half',
      label: 'Deep 1/2',
    }),
  },
  {
    id: 'middle',
    name: 'Middle',
    group: 'deep',
    shape: (_p, _h, f) =>
      onField({ x: 0, y: -13, w: 9, h: 12, preset: 'middle', label: 'Middle' }, f),
  },
];

export const zonePresetById = (id: string | undefined) =>
  ZONE_PRESETS.find((z) => z.id === id) ?? null;

/**
 * Where a zone lands when it is switched on with no concept behind it.
 *
 * Out in front of him and a useful size, for the reason the cone starts eight
 * yards downfield and the focus square six: a box with no area, or one sitting
 * under his own mark, reads as the feature having failed rather than as
 * something waiting to be dragged.
 */
export function freeZone(player: PlayerSlot): Omit<Zone, 'playerId'> {
  return { x: player.x, y: player.y - 6, w: 6, h: 6 };
}

/** Deep zones are what a coverage is counted by: three of them is Cover 3. */
export function isDeepZone(zone: Zone): boolean {
  const preset = zonePresetById(zone.preset);
  if (preset) return preset.group === 'deep';
  // Drawn by hand: over ten yards off the ball is deep by anyone's reckoning.
  return zone.y < -10;
}
