import type { PlayerSlot, Zone } from '../domain/types';

interface Props {
  zone: Zone;
  /** The man it belongs to, for the leader line. Gone means no line, still a zone. */
  player: PlayerSlot | null;
  selected?: boolean;
}

/** Never a sliver and never the whole field, however far a corner is dragged. */
export const MIN_SIDE = 2;
export const MAX_SIDE = 30;

export function clampSide(v: number): number {
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, v));
}

/**
 * The color this patch of grass is drawn in.
 *
 * `--zone` is the board's own answer and the one every zone took until a coach
 * wanted the deep men told apart from the underneath ones at a glance. Picked
 * by hand it is a token, never a literal, for the reason the route colors are:
 * the exporter copies whatever the root computes into the sheet, so one choice
 * reaches the board, the thumbnails and paper at once.
 */
export function zoneInk(zone: Zone): string {
  return zone.color ?? 'var(--zone)';
}

/**
 * Is this tap inside the zone? The wash is its own grab handle, as the cone is.
 *
 * The ellipse itself and not the box around it: the corners of that box are
 * empty grass now, and picking up a zone from a spot where nothing is drawn is
 * how a coach loses a tap he meant for the man standing there.
 */
export function insideZone(zone: Zone, at: { x: number; y: number }): boolean {
  const dx = (at.x - zone.x) / (zone.w / 2);
  const dy = (at.y - zone.y) / (zone.h / 2);
  return dx * dx + dy * dy <= 1;
}

/**
 * The far corner of the zone's box, which is the one that sizes it.
 *
 * Downfield and outside: the corner a defender is running at, and the one
 * furthest from his own mark, so grabbing it can never be confused with
 * grabbing him. Everything else about the zone is moved by dragging its middle.
 *
 * Still the corner of the box rather than a point on the rim, because the box
 * is what the size is stored as — width and height, as it always was. The rim
 * is where the grip is *drawn*; this is what the drag resolves to.
 */
export function zoneCorner(zone: Zone): { x: number; y: number } {
  return { x: zone.x + (zone.x >= 0 ? zone.w / 2 : -zone.w / 2), y: zone.y - zone.h / 2 };
}

/** Halfway round the quarter, which is the corner direction on a round shape. */
const RIM = Math.SQRT1_2;

/**
 * Where the grip is drawn, and where a tap has to land to take hold of it.
 *
 * On the rim in the corner's direction rather than at the corner itself. On a
 * rectangle those were the same point, and the grip had to be pulled a yard
 * inside it by hand so that a deep third — whose box corner lands exactly on
 * the edge of the board — did not put half its target off-screen. A round zone
 * gives that back for nothing: the rim at 45° is already three tenths of each
 * half-axis inside the corner, it is always over the wash it belongs to, and it
 * sits on the line a coach would actually take hold of.
 *
 * The drag itself still works from the true corner — `grabHighlight` takes its
 * offset from `zoneCorner` — so taking hold of the grip does not jog the zone.
 */
export function zoneGrip(zone: Zone): { x: number; y: number } {
  const corner = zoneCorner(zone);
  return {
    x: zone.x + (corner.x > zone.x ? 1 : -1) * (zone.w / 2) * RIM,
    y: zone.y - (zone.h / 2) * RIM,
  };
}

/** How close a tap has to land to count as the grip rather than the body. */
export const CORNER_GRAB = 1.3;

export function onCorner(zone: Zone, at: { x: number; y: number }): boolean {
  const g = zoneGrip(zone);
  return Math.hypot(at.x - g.x, at.y - g.y) <= CORNER_GRAB;
}

/**
 * Size a zone from a dragged corner: the opposite corner is pinned and the
 * shape grows out of it, which is what dragging a corner has always meant.
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
 * Where a line drawn from `at` toward the middle of the zone first touches it.
 *
 * The leader line has to stop on the rim, and a rim is no longer four straight
 * edges to clamp against. Null when he is already standing in his own zone:
 * a line from a man to a shape he is inside is a scribble on his own mark.
 */
function rimToward(zone: Zone, at: { x: number; y: number }): { x: number; y: number } | null {
  const dx = (at.x - zone.x) / (zone.w / 2);
  const dy = (at.y - zone.y) / (zone.h / 2);
  const d = Math.hypot(dx, dy);
  if (d <= 1) return null;
  return { x: zone.x + (zone.w / 2) * (dx / d), y: zone.y + (zone.h / 2) * (dy / d) };
}

/**
 * A patch of grass with a man's name on it.
 *
 * A wash under the play like the other two highlights — a coverage that
 * competed with the routes it is drawn against would be hiding the thing it
 * exists to explain — but unlike them it keeps an edge. The cone and the focus
 * square fade out because where a look ends is a soft question; a zone's edge is
 * the whole point of a zone, and a shape with no boundary is just a smudge over
 * the field.
 *
 * Round rather than square, and the size it is stored at is still a width and a
 * height: a hook is a circle because it is as deep as it is wide, and a deep
 * third is an oval because a third of the field is wider than it is deep. The
 * two are one shape asked the same question, which is what keeps every coverage
 * this app already draws drawing the same grass it always did.
 *
 * The leader line matters more than it looks. Seven washes with nothing joining
 * them to anybody is a picture of some colored shapes; the line is what makes
 * it "he has that". It runs to the rim rather than to the middle so it never
 * disappears under the label.
 */
export function ZoneArea({ zone, player, selected = false }: Props) {
  const ink = zoneInk(zone);
  const rx = zone.w / 2;
  const ry = zone.h / 2;
  // Which side the grip has taken, so the label can have the other one.
  const gripIsLeft = zoneCorner(zone).x < zone.x;
  const edge = player ? rimToward(zone, player) : null;

  /*
   * The label sits on the rim's own chord rather than in a corner of a box that
   * is no longer drawn. A yard down from the top of the shape, then in as far
   * as the curve is at that height, so it lands on the wash and not beside it.
   * Never below the middle: on a zone dragged down to the minimum, a yard down
   * from the top is most of the way through it.
   */
  const labelY = Math.min(zone.y, zone.y - ry + 1.05);
  /*
   * Measured at the top of the letters rather than at their middle, because
   * that is the narrowest part of the rim the word has to fit under: taken at
   * the middle, the cap of the last letter pokes out through the curve.
   */
  const chordAt = (y: number) => rx * Math.sqrt(Math.max(0, 1 - ((y - zone.y) / ry) ** 2));
  const chord = chordAt(Math.min(zone.y, labelY - 0.36));

  return (
    <g pointerEvents="none">
      {player && edge && (
        <line
          x1={player.x}
          y1={player.y}
          x2={edge.x}
          y2={edge.y}
          stroke={ink}
          strokeWidth={0.08}
          strokeDasharray="0.3 0.34"
          opacity={0.5}
        />
      )}
      <ellipse
        cx={zone.x}
        cy={zone.y}
        rx={rx}
        ry={ry}
        fill={ink}
        fillOpacity={selected ? 0.2 : 0.12}
        stroke={ink}
        strokeWidth={selected ? 0.14 : 0.09}
        strokeDasharray="0.62 0.4"
        strokeOpacity={selected ? 0.95 : 0.6}
      />
      {/*
        * On the side the grip is not on. Both sat left on a zone out to the
        * left of the ball, so the handle covered the name of the zone it
        * belonged to.
        */}
      {zone.label && (
        <text
          x={gripIsLeft ? zone.x + chord - 0.36 : zone.x - chord + 0.36}
          y={labelY + 0.26}
          textAnchor={gripIsLeft ? 'end' : 'start'}
          fontSize={0.72}
          fontWeight={600}
          fill={ink}
          opacity={0.85}
        >
          {zone.label}
        </text>
      )}

      <Grip zone={zone} selected={selected} />
    </g>
  );
}

/**
 * The corner grip, drawn.
 *
 * It was invisible: the cone and the focus square are their own handles, so the
 * zone borrowed that idea and gave its corner nothing to see. But those two are
 * aimed and sized by one gesture, where a zone has a second thing to do — and a
 * gesture nobody can see is a gesture nobody uses. Drawn quietly on every zone
 * rather than only on the selected one, because the way you find out a zone can
 * be resized is by seeing the grip that resizes it.
 *
 * Two strokes making a bracket that points the way it grows, over a disc big
 * enough to say where to put the pen.
 */
function Grip({ zone, selected }: { zone: Zone; selected: boolean }) {
  const ink = zoneInk(zone);
  const g = zoneGrip(zone);
  const corner = zoneCorner(zone);
  // Out toward the corner it drags, whichever side of the field that is.
  const dx = corner.x > zone.x ? 1 : -1;
  const arm = 0.52;

  return (
    <g opacity={selected ? 1 : 0.72}>
      <circle
        cx={g.x}
        cy={g.y}
        r={0.72}
        fill={ink}
        fillOpacity={selected ? 0.3 : 0.18}
        stroke={ink}
        strokeWidth={0.07}
        strokeOpacity={selected ? 0.9 : 0.5}
      />
      <g stroke={ink} strokeWidth={0.15} strokeLinecap="round" fill="none" opacity={0.95}>
        <line x1={g.x - dx * arm} y1={g.y - arm} x2={g.x + dx * arm} y2={g.y - arm} />
        <line x1={g.x + dx * arm} y1={g.y - arm} x2={g.x + dx * arm} y2={g.y + arm} />
      </g>
    </g>
  );
}
