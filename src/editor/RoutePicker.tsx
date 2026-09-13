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
}: Props) {
  return (
    <div className="route-picker">
      <div className="picker-head">
        <strong>{player.label}</strong>
        <span>runs</span>
        {onClear && (
          <button className="quiet" onClick={onClear}>
            No route
          </button>
        )}
      </div>

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
