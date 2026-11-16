import { PITCH } from '../sports/soccer/pitch';

interface Props {
  view: { x: number; y: number; w: number; h: number };
}

/**
 * A soccer pitch: touchlines, halfway, both boxes, both goals.
 *
 * In the field's two tokens, like the court, so the white board, the light
 * theme and the print palette reach it untold. The whole pitch is always laid
 * down and the window clips it: a card or a sheet that shows only the final
 * third still shows the box in the right place.
 */
export function Pitch({ view }: Props) {
  const { halfWidth: hw, halfLength: hl, box, six, spot, circle, goal } = PITCH;
  const line = { fill: 'none', stroke: 'var(--turf-line)', strokeWidth: 0.09 };

  /** One end, drawn for the top goal; the other is the same thing turned over. */
  const end = (
    <>
      <rect x={-box.half} y={-hl} width={box.half * 2} height={box.depth} {...line} />
      <rect x={-six.half} y={-hl} width={six.half * 2} height={six.depth} {...line} />
      <circle cx={0} cy={-hl + spot} r={0.1} fill="var(--turf-line)" />
      {/* The part of the ten-yard circle that is outside the box. */}
      <path
        d={(() => {
          const dy = box.depth - spot;
          const dx = Math.sqrt(circle * circle - dy * dy);
          return `M ${-dx} ${-hl + box.depth} A ${circle} ${circle} 0 0 0 ${dx} ${-hl + box.depth}`;
        })()}
        {...line}
      />
      <rect
        x={-goal.half}
        y={-hl - goal.depth}
        width={goal.half * 2}
        height={goal.depth}
        fill="none"
        stroke="var(--los)"
        strokeWidth={0.1}
      />
    </>
  );

  return (
    <g className="field pitch">
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="var(--turf)" />
      <rect x={-hw} y={-hl} width={hw * 2} height={hl * 2} {...line} strokeWidth={0.12} />
      <line x1={-hw} y1={0} x2={hw} y2={0} stroke="var(--turf-line)" strokeWidth={0.09} />
      <circle cx={0} cy={0} r={circle} {...line} />
      <circle cx={0} cy={0} r={0.1} fill="var(--turf-line)" />
      {end}
      <g transform="scale(1 -1)">{end}</g>
    </g>
  );
}
