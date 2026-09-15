import type { PlayerSlot, Zone } from '../domain/types';

interface Props {
  zone: Zone;
  /** The man it belongs to, for the leader line. Gone means no line, still a box. */
  player: PlayerSlot | null;
  selected?: boolean;
}

/** Never a sliver and never the whole field, however far a corner is dragged. */
export const MIN_SIDE = 2;
export const MAX_SIDE = 30;

export function clampSide(v: number): number {
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, v));
}

/** Is this tap inside the box? The zone is its own grab handle, as the cone is. */
export function insideZone(zone: Zone, at: { x: number; y: number }): boolean {
  return (
    Math.abs(at.x - zone.x) <= zone.w / 2 && Math.abs(at.y - zone.y) <= zone.h / 2
  );
}

/**
 * The far corner, which is the one that sizes it.
 *
 * Downfield and outside: the corner a defender is running at, and the one
 * furthest from his own mark, so grabbing it can never be confused with
 * grabbing him. Everything else about the box is moved by dragging its middle.
 */
export function zoneCorner(zone: Zone): { x: number; y: number } {
  return { x: zone.x + (zone.x >= 0 ? zone.w / 2 : -zone.w / 2), y: zone.y - zone.h / 2 };
}

/** How close a tap has to land to count as the corner rather than the body. */
export const CORNER_GRAB = 1.1;

export function onCorner(zone: Zone, at: { x: number; y: number }): boolean {
  const c = zoneCorner(zone);
  return Math.hypot(at.x - c.x, at.y - c.y) <= CORNER_GRAB;
}

/**
 * Size a zone from a dragged corner: the opposite corner is pinned and the box
 * grows out of it, which is what dragging a corner has always meant.
 */
export function resizeFrom(zone: Zone, to: { x: number; y: number }): Zone {
  const anchorX = zone.x - (zone.x >= 0 ? zone.w / 2 : -zone.w / 2);
  const anchorY = zone.y + zone.h / 2;
  const w = clampSide(Math.abs(to.x - anchorX));
  const h = clampSide(Math.abs(anchorY - to.y));
  return {
    ...zone,
    w,
    h,
    x: anchorX + Math.sign(to.x - anchorX || 1) * (w / 2),
    y: anchorY - h / 2,
  };
}

/**
 * A patch of grass with a man's name on it.
 *
 * A wash under the play like the other two highlights — a coverage that
 * competed with the routes it is drawn against would be hiding the thing it
 * exists to explain — but unlike them it keeps an edge. The cone and the focus
 * square fade out because where a look ends is a soft question; a zone's edge is
 * the whole point of a zone, and a box with no boundary is just a smudge over
 * the field.
 *
 * The leader line matters more than it looks. Seven washes with nothing joining
 * them to anybody is a picture of some coloured rectangles; the line is what
 * makes it "he has that". It runs to the near edge rather than to the middle so
 * it never disappears under the label.
 */
export function ZoneArea({ zone, player, selected = false }: Props) {
  const left = zone.x - zone.w / 2;
  const top = zone.y - zone.h / 2;

  // The near edge, in the direction of the man it belongs to.
  const edge = player
    ? {
        x: Math.max(left, Math.min(zone.x + zone.w / 2, player.x)),
        y: Math.max(top, Math.min(zone.y + zone.h / 2, player.y)),
      }
    : null;

  return (
    <g pointerEvents="none">
      {player && edge && (
        <line
          x1={player.x}
          y1={player.y}
          x2={edge.x}
          y2={edge.y}
          stroke="var(--zone)"
          strokeWidth={0.08}
          strokeDasharray="0.3 0.34"
          opacity={0.5}
        />
      )}
      <rect
        x={left}
        y={top}
        width={zone.w}
        height={zone.h}
        rx={0.4}
        fill="var(--zone)"
        fillOpacity={selected ? 0.2 : 0.12}
        stroke="var(--zone)"
        strokeWidth={selected ? 0.14 : 0.09}
        strokeDasharray="0.62 0.4"
        strokeOpacity={selected ? 0.95 : 0.6}
      />
      {zone.label && (
        <text
          x={left + 0.36}
          y={top + 1.05}
          fontSize={0.72}
          fontWeight={600}
          fill="var(--zone)"
          opacity={0.85}
        >
          {zone.label}
        </text>
      )}
    </g>
  );
}
