import { useState } from 'react';
import { useScrollFade } from '../ui/useScrollFade';
import { byJersey, whoIs, type RosterEntry } from '../domain/roster';
import { DEFENSE_PRESETS, type DefensePreset } from '../domain/presets/defense';
import { ROUTES, type RoutePreset } from '../domain/presets/routes';
import { ZONE_PRESETS, type ZonePreset } from '../domain/presets/zones';
import type { PlayerSlot, ShapeKind } from '../domain/types';

/*
 * One rule for symbols in this panel: a button wears one only when the same
 * mark is what lands on the board. The star does — it is drawn on the carrier —
 * so ★ Ball keeps it. Zone, Focus, Vision, Flip and Man up draw no glyph
 * anywhere, and the ▢ in front of two different buttons was saying they were
 * the same kind of thing when they are not.
 */

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

/**
 * Everything the picker offers a defender, which is a different list and not a
 * relabeled one.
 *
 * Present only for a man on the defensive side, so one panel serves both units
 * without either of them being shown a row that does nothing. A defender has no
 * star — nobody hands him the ball — and no focus square: the zone is the same
 * idea done properly for coverage, and offering both would be two washes saying
 * almost the same thing off one man.
 */
export interface DefenseTools {
  onPick: (preset: DefensePreset) => void;
  onZone: (preset: ZonePreset) => void;
  /** A zone with no concept behind it, to be dragged into shape. */
  hasZone: boolean;
  onToggleZone: () => void;
  /** The rush or drop he is already doing, so its own button reads as on. */
  activeJob?: string;
  /** The zone concept he is already playing, for the same reason. */
  activeZone?: string;
  /** He already has somebody, so Man up is the button that takes it off. */
  hasCover: boolean;
  /** Man up on the nearest receiver, without a trip through the Man tool. */
  onCoverNearest: (() => void) | null;
}

interface Props {
  player: PlayerSlot;
  /** Set for a defender, and that is what switches the panel to his side. */
  defense?: DefenseTools;
  /** The user's own, already wearing the preset face. */
  custom: RoutePreset[];
  /**
   * The concept he is already running.
   *
   * Every row in this panel is an on/off button — tapping the lit one takes it
   * back off — and that is only usable if the lit one is visibly lit.
   */
  activeRoute?: string;
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
  /** The palette, and the color his route is wearing. Undefined means auto. */
  swatches: readonly string[];
  color?: string;
  /** Null until he has a route: there is nothing to paint before that. */
  onColor: ((color: string | undefined) => void) | null;

  /*
   * The rest of him — what he is called, who is in the slot, whether he is on
   * the ball, where he is standing. These lived in the drawer on the reasoning
   * that a formation is built once and then never touched again. True of a
   * formation; not true of a man, who gets renamed and handed to a different
   * kid all season. They are folded behind Details so the route list is still
   * the first thing the panel shows.
   */
  onRename: (label: string) => void;
  /** The team sheet, for the Who row. Empty means no dropdown at all. */
  roster: RosterEntry[];
  onAssignJersey: (jersey: number | undefined) => void;
  /** Null for a defender: only the offense has a line to be on. */
  onToggleOnLine: (() => void) | null;
  /** Set only while he is pinned by hand, which is the only time it can undo. */
  onReleaseLock: (() => void) | null;
}

/**
 * A row of named concepts. Typed on the name and the id alone, so the same row
 * serves routes, defensive jobs and zones: they are three libraries of the same
 * shape — a name a coach says, and a function that draws it.
 */
function Group<T extends { id: string; name: string }>({
  title,
  routes,
  activeId,
  onPick,
  onDeleteCustom,
}: {
  title: string;
  routes: T[];
  /** The one in this row he is already doing, drawn pressed. */
  activeId?: string;
  onPick: (p: T) => void;
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
              <button aria-pressed={r.id === activeId} onClick={() => onPick(r)}>
                {r.name}
              </button>
              <button
                className="chip-x"
                aria-label={`Delete ${r.name}`}
                onClick={() => onDeleteCustom(r.id)}
              >
                ×
              </button>
            </span>
          ) : (
            <button key={r.id} aria-pressed={r.id === activeId} onClick={() => onPick(r)}>
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
  defense,
  custom,
  activeRoute,
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
  onRename,
  roster,
  onAssignJersey,
  onToggleOnLine,
  onReleaseLock,
}: Props) {
  const scroller = useScrollFade<HTMLDivElement>();
  /*
   * Deliberately not reset when the selection changes. Naming a formation is
   * done one man after another, and a panel that folded itself shut between
   * each of them would be a tap per player for nothing.
   */
  const [details, setDetails] = useState(false);
  const who = whoIs(roster, player);

  return (
    <div className="route-picker" ref={scroller}>
      {/*
        * Everything about this man that is decided while looking at him: what
        * he runs, which way he runs it, whether he is the one getting the ball
        * and whether he is worth a highlight. All of it is the same thought,
        * and splitting it across the board and the drawer made it two trips.
        */}
      <div className="picker-head">
        <strong>{player.label}</strong>
        <span>{defense ? 'plays' : 'runs'}</span>
        {!defense && (
          <button
            className={hasBall ? 'ball on' : 'ball'}
            aria-pressed={hasBall}
            aria-label={
              hasBall ? `${player.label} is not getting the ball` : `${player.label} gets the ball`
            }
            onClick={onGiveBall}
          >
            ★ Ball
          </button>
        )}
        {/*
          * The two highlights, on the man rather than in the drawer. Both are
          * decisions about one player — this one is worth watching, and this
          * one is the quarterback reading him — so they belong where he is,
          * next to the star, and not three taps away behind a tab.
          */}
        {defense ? (
          <>
            <button
              className={defense.hasZone ? 'zone-toggle on' : 'zone-toggle'}
              aria-pressed={defense.hasZone}
              aria-label={
                defense.hasZone
                  ? `Take ${player.label}'s zone off`
                  : `Give ${player.label} a zone`
              }
              onClick={defense.onToggleZone}
            >
              Zone
            </button>
            {/* Pressed in the plain style rather than the zone's color: the
                rope he draws is not a patch of grass. */}
            {defense.onCoverNearest && (
              <button
                aria-pressed={defense.hasCover}
                onClick={defense.onCoverNearest}
                aria-label={
                  defense.hasCover
                    ? `${player.label} takes nobody`
                    : `${player.label} takes a man`
                }
              >
                Man up
              </button>
            )}
          </>
        ) : (
          <button
            className={hasFocus ? 'ball on' : 'ball'}
            aria-pressed={hasFocus}
            aria-label={
              hasFocus ? `Take the focus square off ${player.label}` : `Focus on ${player.label}`
            }
            onClick={onFocus}
          >
            Focus
          </button>
        )}
        {onVision && (
          <button
            className={hasVision ? 'ball on' : 'ball'}
            aria-pressed={hasVision}
            aria-label={hasVision ? 'Hide where he is looking' : 'Show where he is looking'}
            onClick={onVision}
          >
            Vision
          </button>
        )}
        {onFlip && (
          <button onClick={onFlip} aria-label="Run it to the other side">
            Flip
          </button>
        )}
        {onClear && (
          <button className="quiet" onClick={onClear}>
            No route
          </button>
        )}
        <button
          className="quiet details-toggle"
          aria-pressed={details}
          aria-expanded={details}
          onClick={() => setDetails((d) => !d)}
        >
          Details {details ? '▴' : '▾'}
        </button>
      </div>

      {/*
        * Who he is, as against what he runs. Folded away because it is the
        * rarer of the two by a long way — but on the board rather than in the
        * drawer, because renaming a man while looking at him should not mean
        * leaving him.
        */}
      {details && (
        <div className="picker-group details">
          <div className="player-row">
            <label>
              <span>Label</span>
              <input
                value={player.label}
                onChange={(e) => onRename(e.target.value)}
                maxLength={3}
                spellCheck={false}
              />
            </label>
          </div>

          {/*
            * Only once there is a team sheet to pick from. An empty dropdown
            * asking a question the app has given you no way to answer is worse
            * than no dropdown.
            */}
          {roster.length > 0 && (
            <div className="player-row">
              <label>
                <span>Who</span>
                <select
                  value={player.jersey ?? ''}
                  onChange={(e) =>
                    onAssignJersey(e.target.value === '' ? undefined : Number(e.target.value))
                  }
                >
                  <option value="">Nobody yet</option>
                  {byJersey(roster).map((entry) => (
                    <option key={entry.id} value={entry.jersey}>
                      {entry.jersey} {entry.name || '—'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {onToggleOnLine && (
            <div className="picker-row">
              <button aria-pressed={player.onLine} onClick={onToggleOnLine}>
                {player.onLine ? 'On the line' : 'In the backfield'}
              </button>
              {onReleaseLock && (
                <button className="quiet" onClick={onReleaseLock}>
                  Back to auto
                </button>
              )}
            </div>
          )}

          {/* Not an instruction, so it survives the no-tips rule: it is where
              this man is standing, which is a fact about the play. */}
          <p className="player-where">
            {player.x.toFixed(2)} yd across, {player.y.toFixed(2)} yd from the line
            {player.backNumber ? ` · back ${player.backNumber}` : ''}
            {who?.name ? ` · ${who.name}` : ''}
          </p>
        </div>
      )}

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
        * His route's color, here rather than behind the Move tool.
        *
        * Recoloring used to mean leaving Routes, switching to Move, and
        * finding the line itself under the man standing on it — three steps
        * away from the man whose route it is, when picking a receiver and
        * saying what he runs is one thought.
        */}
      {onColor && (
        <div className="picker-group">
          {/* Labeled like every other row in here. It was the one group with no
              heading, which left a line of colored circles under the marks
              with nothing saying what they would paint. */}
          <h3>Line color</h3>
          <div className="picker-row swatches">
            {swatches.map((c) => (
              <button
                key={c}
                className="swatch"
                style={{ background: c }}
                aria-label={`Color ${c}`}
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

      {defense ? (
        <>
          {/*
            * Rush before drop, because that is the order a defensive call is
            * made in: you decide who is coming first, and everybody else is
            * covering behind it.
            */}
          <Group
            title="Rush"
            routes={DEFENSE_PRESETS.filter((d) => d.group === 'rush')}
            activeId={defense.activeJob}
            onPick={(p) => defense.onPick(p as DefensePreset)}
          />
          {/*
            * Hook and Flat appear here and again below, and that is not a
            * duplicate: this row draws the arrow he runs, and the rows below
            * hand him the grass he owns. The headings carry that on their own —
            * Drop is a drop and Zone is a patch of grass — and the lines that
            * used to spell it out were the first thing a capped panel cut in
            * half.
            */}
          <Group
            title="Drop"
            routes={DEFENSE_PRESETS.filter((d) => d.group === 'drop')}
            activeId={defense.activeJob}
            onPick={(p) => defense.onPick(p as DefensePreset)}
          />
          {/*
            * The spaces themselves, beside the drops rather than in the drawer.
            * Which man has the flat is a decision about this man, and the whole
            * reason the route picker exists is that those were two trips.
            */}
          <Group
            title="Zone"
            routes={ZONE_PRESETS.filter((z) => z.group === 'under')}
            activeId={defense.activeZone}
            onPick={(p) => defense.onZone(p as ZonePreset)}
          />
          <Group
            title="Deep zone"
            routes={ZONE_PRESETS.filter((z) => z.group === 'deep')}
            activeId={defense.activeZone}
            onPick={(p) => defense.onZone(p as ZonePreset)}
          />
        </>
      ) : (
        <>
          <Group
            title="Pass"
            routes={ROUTES.filter((r) => r.group === 'pass')}
            activeId={activeRoute}
            onPick={onPick}
          />
          <Group
            title="Run"
            routes={ROUTES.filter((r) => r.group === 'run')}
            activeId={activeRoute}
            onPick={onPick}
          />
          <Group
            title="Yours"
            routes={custom}
            activeId={activeRoute}
            onPick={onPick}
            onDeleteCustom={onDeleteCustom}
          />
        </>
      )}

      {/*
        * No line under it saying what saving does. The panel is capped and
        * scrolls, so the explanatory lines were the rows getting sliced in half
        * at its edge — and the dialog the button opens says it anyway.
        */}
      {!defense && onSaveDrawn && (
        <div className="picker-group">
          <div className="picker-row">
            <button onClick={onSaveDrawn}>Save {player.label}'s route</button>
          </div>
        </div>
      )}
    </div>
  );
}
