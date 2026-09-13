import { ROUTES, type RoutePreset } from '../domain/presets/routes';
import type { PlayerSlot } from '../domain/types';

interface Props {
  player: PlayerSlot;
  onPick: (preset: RoutePreset) => void;
  onClose: () => void;
}

/**
 * A flat list of concepts, grouped run and pass. Every one is applied to the
 * player already selected, so choosing is one tap and there is nothing to aim
 * at, which matters on a device where aiming is the expensive part.
 */
export function RoutePicker({ player, onPick, onClose }: Props) {
  const runs = ROUTES.filter((r) => r.group === 'run');
  const passes = ROUTES.filter((r) => r.group === 'pass');

  return (
    <div className="picker">
      <div className="picker-head">
        <strong>{player.label}</strong>
        <span>runs</span>
        <button className="quiet" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="picker-group">
        <h3>Run</h3>
        <div className="picker-row">
          {runs.map((r) => (
            <button key={r.id} onClick={() => onPick(r)}>
              {r.name}
            </button>
          ))}
        </div>
      </div>

      <div className="picker-group">
        <h3>Pass</h3>
        <div className="picker-row">
          {passes.map((r) => (
            <button key={r.id} onClick={() => onPick(r)}>
              {r.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
