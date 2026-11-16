import { BLANK, LAX, RINK, VOLLEY } from '../sports/packs';

interface Props {
  kind: 'volley' | 'lax' | 'rink' | 'blank';
  view: { x: number; y: number; w: number; h: number };
}

const line = { fill: 'none', stroke: 'var(--turf-line)', strokeWidth: 0.09 };

/**
 * The surfaces of the sport packs: a volleyball court, a lacrosse field, a
 * rink, a blank board.
 *
 * In the field's two tokens, as the court and the pitch are, so the white
 * board, the light theme and the print palette reach them unasked. Lines only
 * where a coach reads a play against them; a net or a goal is drawn in the
 * line-of-scrimmage token, the one mark on each that is the thing being
 * attacked.
 */
export function PackSurface({ kind, view }: Props) {
  return (
    <g className={`field pack ${kind}`}>
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="var(--turf)" />
      {kind === 'volley' && <Volley />}
      {kind === 'lax' && <Lax />}
      {kind === 'rink' && <Rink />}
      {kind === 'blank' && (
        <rect
          x={-BLANK.halfWidth}
          y={-BLANK.halfLength}
          width={BLANK.halfWidth * 2}
          height={BLANK.halfLength * 2}
          {...line}
          strokeDasharray="0.4 0.4"
        />
      )}
    </g>
  );
}

function Volley() {
  const { halfWidth: hw, halfLength: hl, attack } = VOLLEY;
  return (
    <>
      <rect x={-hw} y={-hl} width={hw * 2} height={hl * 2} {...line} strokeWidth={0.12} />
      <line x1={-hw} y1={-attack} x2={hw} y2={-attack} {...line} />
      <line x1={-hw} y1={attack} x2={hw} y2={attack} {...line} />
      {/* the net, a little past the sidelines where its posts stand */}
      <line x1={-hw - 0.8} y1={0} x2={hw + 0.8} y2={0} stroke="var(--los)" strokeWidth={0.2} />
    </>
  );
}

function Lax() {
  const { halfWidth: hw, halfLength: hl, goal, restrain, crease, wing } = LAX;
  const goalMouth = (y: number) => (
    <>
      <circle cx={0} cy={y} r={crease} {...line} />
      <line x1={-0.7} y1={y} x2={0.7} y2={y} stroke="var(--los)" strokeWidth={0.2} />
    </>
  );
  return (
    <>
      <rect x={-hw} y={-hl} width={hw * 2} height={hl * 2} {...line} strokeWidth={0.12} />
      <line x1={-hw} y1={0} x2={hw} y2={0} {...line} />
      <line x1={-hw} y1={-restrain} x2={hw} y2={-restrain} {...line} />
      <line x1={-hw} y1={restrain} x2={hw} y2={restrain} {...line} />
      {/* the wing lines either side of the faceoff */}
      <line x1={-wing * 2} y1={-wing / 2} x2={-wing * 2} y2={wing / 2} {...line} />
      <line x1={wing * 2} y1={-wing / 2} x2={wing * 2} y2={wing / 2} {...line} />
      {goalMouth(-goal)}
      {goalMouth(goal)}
    </>
  );
}

function Rink() {
  const { halfWidth: hw, halfLength: hl, corner, goal, blue, circle, dot, crease } = RINK;
  const end = (s: 1 | -1) => (
    <>
      <line x1={-hw + 0.6} y1={s * goal} x2={hw - 0.6} y2={s * goal} stroke="var(--los)" strokeWidth={0.08} />
      <path d={`M ${-crease} ${s * goal} A ${crease} ${crease} 0 0 ${s === 1 ? 1 : 0} ${crease} ${s * goal}`} {...line} />
      <circle cx={-dot.x} cy={s * dot.y} r={circle} {...line} />
      <circle cx={dot.x} cy={s * dot.y} r={circle} {...line} />
      <rect x={-0.8} y={s === 1 ? goal : -goal - 0.6} width={1.6} height={0.6} fill="none" stroke="var(--los)" strokeWidth={0.12} />
    </>
  );
  return (
    <>
      <rect x={-hw} y={-hl} width={hw * 2} height={hl * 2} rx={corner} {...line} strokeWidth={0.14} />
      <line x1={-hw} y1={0} x2={hw} y2={0} stroke="var(--los)" strokeWidth={0.12} />
      <line x1={-hw} y1={-blue} x2={hw} y2={-blue} {...line} strokeWidth={0.2} />
      <line x1={-hw} y1={blue} x2={hw} y2={blue} {...line} strokeWidth={0.2} />
      <circle cx={0} cy={0} r={circle} {...line} />
      {end(-1)}
      {end(1)}
    </>
  );
}
