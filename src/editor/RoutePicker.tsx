import { ROUTES, type RoutePreset } from '../domain/presets/routes';
import type { PlayerSlot, ShapeKind } from '../domain/types';

/**
 * The marks a man can be drawn as, in the order they are offered.
 *
 * Named in plain words rather than shown as the mark itself: these are pills in
 * a panel, and a 0.72-yard outline shrunk to that size is a smudge.
 *
 * Triangle and ✕ are here because the defense is built out of them. Leave them
 * out and a defender changed once could never be given his own mark back.
 */
const SHAPES: { kind: ShapeKind; name: string }[] = [
  { kind: 'circle', name: 'Circle' },
  { kind: 'square', name: 'Square' },
  { kind: 'star', name: 'Star' },
  { kind: 'triangle', name: 'Triangle' },
  { kind: 'x', name: '✕' },
];

interface Props {
  player: PlayerSlot;
  /** The user's own, already wearing the preset face. */
  custom: RoutePreset[];
  /** Set when this player has a drawn route there is any point saving. */
  onSaveDrawn: (() => void) | null;
  onPick: (preset: RoutePreset) => void;
  onDeleteCustom: (id: string) => void;
  onClear: (() => void) | null;
  /** Run the same thing to the other side. Only there once he has a route. */
  onFlip: (() => void) | null;
  /** Starred as the man getting the ball. */
  hasBall: boolean;
  onGiveBall: () => void;
  /** Wearing a focus square. Any man can, and any number of them at once. */
  hasFocus: boolean;
  onFocus: () => void;
  /** The cone is the quarterback's alone, so this is null for everybody else. */
  hasVision: boolean;
  onVision: (() => void) | null;
  /** What he is drawn as. The formation sets it; this overrides the one man. */
  onShape: (shape: ShapeKind) => void;
  /** The palette, and the colour his route is wearing. Undefined means auto. */
  swatches: readonly string[];
  color?: string;
  /** Null until he has a route: there is nothing to paint before that. */
  onColor: ((color: string | undefined) => void) | null;
}

function Group({
  title,
  routes,
  onPick,
  onDeleteCustom,
}: {
  title: string;
  routes: RoutePreset[];
  onPick: (p: RoutePreset) => void;
  onDeleteCustom?: (id: string) => void;
}) {
  if (!routes.length) return null;
  return (
    <div className="picker-group">
      <h3>{title}</h3>
      <div className="picker-row">
        {routes.map((r) =>
          onDeleteCustom ? (
            <span key={r.id} className="chip">
              <button onClick={() => onPick(r)}>{r.name}</button>
              <button
                className="chip-x"
                aria-label={`Delete ${r.name}`}
                onClick={() => onDeleteCustom(r.id)}
              >
                ×
              </button>
            </span>
          ) : (
            <button key={r.id} onClick={() => onPick(r)}>
              {r.name}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * The routes a player can be given.
 *
 * Lives on the player rather than behind a tool button: picking a man and
 * choosing what he runs is one thought, and it used to be two taps in two
 * different corners of the screen.
 *
 * Every concept is a function of where he is standing, so a short out from a
 * tight end and one from a wing read as the same route without anyone editing a
 * stored shape. That is also what makes a saved route re-usable by anybody.
 */
export function RoutePicker({
  player,
  custom,
  onSaveDrawn,
  onPick,
  onDeleteCustom,
  onClear,
  onFlip,
  hasBall,
  onGiveBall,
  hasFocus,
  onFocus,
  hasVision,
  onVision,
  onShape,
  swatches,
  color,
  onColor,
}: Props) {
  return (
    <div className="route-picker">
      {/*
        * Everything about this man that is decided while looking at him: what
        * he runs, which way he runs it, whether he is the one getting the ball
        * and whether he is worth a highlight. All of it is the same thought,
        * and splitting it across the board and the drawer made it two trips.
        */}
      <div className="picker-head">
        <strong>{player.label}</strong>
        <span>runs</span>
        <button
          className={hasBall ? 'ball on' : 'ball'}
          aria-pressed={hasBall}
          aria-label={hasBall ? `${player.label} is not getting the ball` : `${player.label} gets the ball`}
          onClick={onGiveBall}
        >
          ★ Ball
        </button>
        {/*
          * The two highlights, on the man rather than in the drawer. Both are
          * decisions about one player — this one is worth watching, and this
          * one is the quarterback reading him — so they belong where he is,
          * next to the star, and not three taps away behind a tab.
          */}
        <button
          className={hasFocus ? 'ball on' : 'ball'}
          aria-pressed={hasFocus}
          aria-label={
            hasFocus ? `Take the focus square off ${player.label}` : `Focus on ${player.label}`
          }
          onClick={onFocus}
        >
          ▢ Focus
        </button>
        {onVision && (
          <button
            className={hasVision ? 'ball on' : 'ball'}
            aria-pressed={hasVision}
            aria-label={hasVision ? 'Hide where he is looking' : 'Show where he is looking'}
            onClick={onVision}
          >
            ◭ Vision
          </button>
        )}
        {onFlip && (
          <button onClick={onFlip} aria-label="Run it to the other side">
            ⇄ Flip
          </button>
        )}
        {onClear && (
          <button className="quiet" onClick={onClear}>
            No route
          </button>
        )}
      </div>

      {/*
        * His mark, beside what he runs and who he is. It used to be in the
        * drawer, which meant leaving the man to change how the man is drawn.
        */}
      <div className="picker-group">
        <h3>Mark</h3>
        <div className="picker-row">
          {SHAPES.map((s) => (
            <button
              key={s.kind}
              aria-pressed={player.shape === s.kind}
              onClick={() => onShape(s.kind)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/*
        * His route's colour, here rather than behind the Move tool.
        *
        * Recolouring used to mean leaving Routes, switching to Move, and
        * finding the line itself under the man standing on it — three steps
        * away from the man whose route it is, when picking a receiver and
        * saying what he runs is one thought.
        */}
      {onColor && (
        <div className="picker-group">
          <div className="picker-row swatches">
            {swatches.map((c) => (
              <button
                key={c}
                className="swatch"
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                onClick={() => onColor(c)}
              />
            ))}
            {color !== undefined && (
              <button className="quiet" onClick={() => onColor(undefined)}>
                Auto
              </button>
            )}
          </div>
        </div>
      )}

      {hasVision && onVision && (
        <p className="picker-note">Drag the cone on the board to swing where he looks.</p>
      )}

      <Group title="Pass" routes={ROUTES.filter((r) => r.group === 'pass')} onPick={onPick} />
      <Group title="Run" routes={ROUTES.filter((r) => r.group === 'run')} onPick={onPick} />
      <Group title="Yours" routes={custom} onPick={onPick} onDeleteCustom={onDeleteCustom} />

      {onSaveDrawn ? (
        <div className="picker-group">
          <div className="picker-row">
            <button onClick={onSaveDrawn}>Save {player.label}'s route</button>
          </div>
          <p className="picker-note">
            Keeps the shape, not the spot, so you can give it to anyone.
          </p>
        </div>
      ) : (
        !custom.length && (
          <p className="picker-note">
            Draw a route with the pen, pick that man again, and you can save it
            here as one of your own.
          </p>
        )
      )}
    </div>
  );
}
