import { ROUTES, type RoutePreset } from '../domain/presets/routes';
import type { PlayerSlot } from '../domain/types';

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
  swatches,
  color,
  onColor,
}: Props) {
  return (
    <div className="route-picker">
      {/*
        * Everything about this man that is decided while looking at him: what
        * he runs, which way he runs it, and whether he is the one getting the
        * ball. All three are the same thought, and splitting them across the
        * board and the drawer made it two trips.
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
