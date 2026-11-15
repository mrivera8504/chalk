import type { RefObject } from 'react';
import { autoRouteColor } from '../domain/colors';
import type { Gap } from '../domain/gaps';
import type { Assignment, Focus, Hole, PathPoint, PlayerSlot, Vision, Zone } from '../domain/types';
import { AssignmentPath } from '../render/AssignmentPath';
import { Field } from '../render/Field';
import { FocusSquare } from '../render/FocusSquare';
import { PlayerShape } from '../render/PlayerShape';
import { VisionCone } from '../render/VisionCone';
import { ZoneArea } from '../render/Zone';
import { toPathD } from '../render/geometry';
import type { Pending } from './BlockTool';
import type { Selection } from './gesture';

interface Props {
  holes: Hole[];
  showHoles: boolean;
  occupied: number[];
  gaps: Gap[];
  showGaps: boolean;
  /** Every man on the play, drawn or not: a line's color is worked out from all of them. */
  players: PlayerSlot[];
  /** The men actually drawn, after the play's own answer on which sides show. */
  visible: PlayerSlot[];
  /** The lines actually drawn, already regenerated from the players. */
  shown: Assignment[];
  byId: (id: string | undefined) => PlayerSlot | null;
  zones: Zone[];
  focuses: Focus[];
  vision: Vision | null;
  qb: PlayerSlot | null;
  hideOffense: boolean;
  annotations: PathPoint[][];
  sel: Selection;
  hoverId: string | null;
  ballCarrierId: string | null;
  pending: Pending | null;
  /** The id of whatever is following the pen, if anything is. */
  carrying: string | null;
  routeHandles: { id: string; pt: number; x: number; y: number }[];
  /** The aim ring. Moved by hand, off the render path, on every hover sample. */
  aimRef: RefObject<SVGGElement>;
  ringRef: RefObject<SVGCircleElement>;
}

/**
 * Everything drawn on the board, back to front.
 *
 * The order is the design: turf, then the washes, then ink, then lines, then
 * men, then the handles and the aim ring that have to stay findable on top of
 * all of it. Nothing here listens for a pointer — the stage does, and finds
 * what was meant by distance — so this is a picture and only a picture.
 */
export function BoardLayers({
  holes,
  showHoles,
  occupied,
  gaps,
  showGaps,
  players,
  visible,
  shown,
  byId,
  zones,
  focuses,
  vision,
  qb,
  hideOffense,
  annotations,
  sel,
  hoverId,
  ballCarrierId,
  pending,
  carrying,
  routeHandles,
  aimRef,
  ringRef,
}: Props) {
  return (
    <>
      <Field
        holes={holes}
        showHoles={showHoles}
        occupied={occupied}
        gaps={gaps}
        showGaps={showGaps}
      />

      {/*
        * Both highlights, immediately after the turf and before a single
        * mark. They are a wash under the play, not over it: the routes, the
        * blocks and the men all have to stay exactly as readable with one
        * switched on as without.
        */}
      {/*
        * Zones first of the three, because a coverage is the widest wash on
        * the board and the other two have to stay legible on top of it.
        */}
      {zones.map((z) => (
        <ZoneArea
          key={`zone${z.playerId}`}
          zone={z}
          player={byId(z.playerId)}
          selected={sel?.kind === 'player' && sel.id === z.playerId}
        />
      ))}
      {/*
        * The two washes go with the man they hang off. A focus square is an
        * offset from a player and the cone's apex is the quarterback
        * himself, so either one left up over a hidden offense would be a
        * patch of light coming off nobody.
        */}
      {focuses.map((f) => {
        const man = visible.find((p) => p.id === f.playerId) ?? null;
        return man ? <FocusSquare key={`focus${f.playerId}`} player={man} focus={f} /> : null;
      })}
      {vision && qb && !hideOffense && <VisionCone qb={qb} vision={vision} />}

      {annotations.map((path, i) => (
        <path
          key={`ann${i}`}
          d={toPathD(path)}
          fill="none"
          stroke="var(--board-chalk)"
          strokeWidth={path[0]?.w ?? 0.14}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.75}
        />
      ))}

      {shown.map((a) => (
        <AssignmentPath
          key={a.id}
          assignment={a}
          autoColor={autoRouteColor(a, players)}
          selected={sel?.kind === 'assignment' && sel.id === a.id}
        />
      ))}

      {visible.map((p) => (
        <PlayerShape
          key={p.id}
          player={p}
          selected={sel?.kind === 'player' && sel.id === p.id}
          hovered={p.id === hoverId}
          ball={p.id === ballCarrierId}
          pending={
            p.id === pending?.blockerId || p.id === pending?.targetId || p.id === carrying
          }
        />
      ))}

      {/*
        * The selected man's route handles, over the players: the end of a
        * route often stops on somebody's mark, and a handle under it is a
        * handle nobody finds.
        */}
      {routeHandles.map((h) => (
        <circle
          key={`rh${h.pt}`}
          cx={h.x}
          cy={h.y}
          r={0.42}
          fill="var(--board-chalk)"
          fillOpacity={carrying === h.id ? 0.7 : 0.22}
          stroke="var(--board-chalk)"
          strokeWidth={0.09}
          pointerEvents="none"
        />
      ))}

      {/* Above the players, so the tip is never hidden under a mark. */}
      <g ref={aimRef} opacity="0" pointerEvents="none">
        <circle
          ref={ringRef}
          r={1.8}
          fill="none"
          stroke="var(--hover)"
          strokeWidth={0.07}
          strokeDasharray="0.34 0.3"
          opacity={0.45}
        />
        <g stroke="var(--hover)" strokeWidth={0.1} strokeLinecap="round">
          <line x1={-0.55} x2={-0.16} y1={0} y2={0} />
          <line x1={0.16} x2={0.55} y1={0} y2={0} />
          <line x1={0} x2={0} y1={-0.55} y2={-0.16} />
          <line x1={0} x2={0} y1={0.16} y2={0.55} />
        </g>
      </g>
    </>
  );
}
