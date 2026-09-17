import { DEFAULT_APP_SETTINGS, resetSettings, setSettings, type AppSettings } from '../store/settings';
import { askConfirm } from '../ui/dialog';
import { useScrollFade } from '../ui/useScrollFade';

interface Props {
  settings: AppSettings;
  /**
   * A way out, for the screen that has no drawer to supply one.
   *
   * In the editor this draws no header at all: the drawer owns the one title
   * and the one way back, and this used to bring its own, so opening Settings
   * stacked two titles and two dismiss buttons that did different things. On
   * the playbook there is no drawer, so it wears a head like the roster and
   * the export panel beside it.
   */
  onClose?: () => void;
}

const MAGNETS = [
  { v: 0, label: 'Off' },
  { v: 0.25, label: 'Light' },
  { v: 0.5, label: 'Normal' },
  { v: 1, label: 'Strong' },
];

const GRIDS = [
  { v: 0.25, label: '¼ yd' },
  { v: 0.5, label: '½ yd' },
  { v: 1, label: '1 yd' },
];

/** A labeled row of mutually exclusive choices. Every setting here is one. */
function Choice<T extends string | number>({
  label,
  hint,
  value,
  options,
  onPick,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { v: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="setting">
      <div className="setting-label">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div className="picker-row">
        {options.map((o) => (
          <button key={String(o.v)} aria-pressed={value === o.v} onClick={() => onPick(o.v)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A number a coach might actually change, with the units spelled out. */
function Num({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onSet,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onSet: (n: number) => void;
}) {
  return (
    <div className="setting">
      <div className="setting-label">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <input
        type="number"
        className="setting-num"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          // A half-typed number must not become the live rule and renumber the
          // holes under the user's hand.
          if (Number.isFinite(n) && n >= min && n <= max) onSet(n);
        }}
      />
    </div>
  );
}

/**
 * Settings.
 *
 * Grouped by what a change actually affects rather than by which module holds
 * the value: how the board behaves under the pen, what the lines look like,
 * and what counts as a legal formation. A coach looking for the color of a
 * corner route should not have to know it lives next to the hole numbering.
 */
export function SettingsPanel({ settings, onClose }: Props) {
  const s = settings;
  const scroller = useScrollFade<HTMLDivElement>();

  /*
   * In the drawer the panel runs its full length and the drawer scrolls. On the
   * playbook there is nothing around it to scroll, and settings is a long page:
   * left to run it pushed the plays a screen and a half down the view.
   */
  return (
    <div
      className={`picker settings-panel${onClose ? ' standalone' : ''}`}
      ref={onClose ? scroller : undefined}
    >
      {onClose && (
        <div className="picker-head">
          <strong>Settings</strong>
          <span>saved on this device, for every play</span>
          <button className="quiet" onClick={onClose}>
            Close
          </button>
        </div>
      )}

      <div className="picker-group">
        <h3>Route colors</h3>
        <p className="picker-note">
          Each receiver's route takes the next color, so routes that cross can
          be told apart. Tap a line on the board to give that one route a color
          of its own.
        </p>
        <div className="swatch-edit">
          {s.routeColors.map((c, i) => (
            <label key={i} className="swatch-slot">
              <input
                type="color"
                value={c}
                aria-label={`Receiver ${i + 1} color`}
                onChange={(e) => {
                  const next = s.routeColors.slice();
                  next[i] = e.target.value;
                  setSettings({ routeColors: next });
                }}
              />
              <span>{i + 1}</span>
            </label>
          ))}
        </div>

        <div className="swatch-edit">
          <label className="swatch-slot">
            <input
              type="color"
              value={s.carryColor}
              aria-label="Ball carrier color"
              onChange={(e) => setSettings({ carryColor: e.target.value })}
            />
            <span>Carry</span>
          </label>
          <label className="swatch-slot">
            <input
              type="color"
              value={s.blockColor}
              aria-label="Block color"
              onChange={(e) => setSettings({ blockColor: e.target.value })}
            />
            <span>Block</span>
          </label>
          <button
            className="quiet"
            onClick={() =>
              setSettings({
                routeColors: DEFAULT_APP_SETTINGS.routeColors,
                carryColor: DEFAULT_APP_SETTINGS.carryColor,
                blockColor: DEFAULT_APP_SETTINGS.blockColor,
              })
            }
          >
            Reset colors
          </button>
        </div>
      </div>

      <div className="picker-group">
        <h3>Route depths</h3>
        <p className="picker-note">
          How far a receiver runs before he breaks on a short, medium or deep in
          or out. Routes already on the board keep the depth they were drawn at.
        </p>
        <Num
          label="Short"
          hint="yards"
          value={s.routeDepths.short}
          min={1}
          max={25}
          step={0.5}
          onSet={(n) => setSettings({ routeDepths: { ...s.routeDepths, short: n } })}
        />
        <Num
          label="Medium"
          hint="yards"
          value={s.routeDepths.medium}
          min={1}
          max={25}
          step={0.5}
          onSet={(n) => setSettings({ routeDepths: { ...s.routeDepths, medium: n } })}
        />
        <Num
          label="Deep"
          hint="yards"
          value={s.routeDepths.deep}
          min={1}
          max={25}
          step={0.5}
          onSet={(n) => setSettings({ routeDepths: { ...s.routeDepths, deep: n } })}
        />
        <div className="picker-row">
          <button
            className="quiet"
            onClick={() => setSettings({ routeDepths: DEFAULT_APP_SETTINGS.routeDepths })}
          >
            Reset depths
          </button>
        </div>
      </div>

      <div className="picker-group">
        <h3>The field</h3>
        <p className="picker-note">
          White is the same field a call sheet prints on — your own colors,
          darkened just enough to read on white. Plays you share as pictures
          come out the way the board looks. A single play can be set the other
          way in the drawer, under This play, and then it keeps its own field
          whatever this says.
        </p>
        <Choice
          label="Drawn on"
          hint="every play except the ones you set by hand"
          value={s.fieldSurface}
          options={[
            { v: 'grass' as const, label: 'Grass' },
            { v: 'white' as const, label: 'White' },
          ]}
          onPick={(v) => setSettings({ fieldSurface: v })}
        />
      </div>

      <div className="picker-group">
        <h3>The pen</h3>
        <Choice
          label="Tools on the"
          hint="put them away from your writing hand"
          value={s.drawerSide}
          options={[
            { v: 'left' as const, label: 'Left' },
            { v: 'right' as const, label: 'Right' },
          ]}
          onPick={(v) => setSettings({ drawerSide: v })}
        />
        <Choice
          label="Snap to the line"
          hint="how near a mark clicks flush onto the LOS"
          value={s.losMagnetYards}
          options={MAGNETS}
          onPick={(v) => setSettings({ losMagnetYards: v })}
        />
        <Choice
          label="Grid"
          hint="how far a mark moves at a time"
          value={s.snapStepYards}
          options={GRIDS}
          onPick={(v) => setSettings({ snapStepYards: v })}
        />
        <Choice
          label="While drawing"
          hint="a resting hand cannot leave a mark in pen only"
          value={s.penOnly ? 'pen' : 'both'}
          options={[
            { v: 'both' as const, label: 'Pen or finger' },
            { v: 'pen' as const, label: 'Pen only' },
          ]}
          onPick={(v) => setSettings({ penOnly: v === 'pen' })}
        />
        <Choice
          label="Press harder for a thicker line"
          hint="this pen reports very little pressure; expect a small range"
          value={s.pressureWidth ? 'on' : 'off'}
          options={[
            { v: 'off' as const, label: 'One weight' },
            { v: 'on' as const, label: 'From pressure' },
          ]}
          onPick={(v) => setSettings({ pressureWidth: v === 'on' })}
        />
        <Choice
          label="Square up freehand"
          hint="nearly straight goes straight, and the end settles on a yard"
          value={s.squareUpStrokes ? 'on' : 'off'}
          options={[
            { v: 'off' as const, label: 'As drawn' },
            { v: 'on' as const, label: 'Squared up' },
          ]}
          onPick={(v) => setSettings({ squareUpStrokes: v === 'on' })}
        />
      </div>

      <div className="picker-group">
        <h3>A new play opens with</h3>
        <Choice
          label="Hole numbers"
          value={s.showHoles ? 'on' : 'off'}
          options={[
            { v: 'on' as const, label: 'Shown' },
            { v: 'off' as const, label: 'Hidden' },
          ]}
          onPick={(v) => setSettings({ showHoles: v === 'on' })}
        />
        <Choice
          label="Defense"
          value={s.showDefense ? 'on' : 'off'}
          options={[
            { v: 'off' as const, label: 'Offense only' },
            { v: 'on' as const, label: 'Both' },
          ]}
          onPick={(v) => setSettings({ showDefense: v === 'on' })}
        />
      </div>

      <div className="picker-group">
        <h3>Your league</h3>
        <p className="picker-note">
          These decide what the badge calls legal and how the holes are
          numbered. Changing them renumbers every play at once, because the hole
          map is worked out from the formation rather than stored.
        </p>
        <Num
          label="Players a side"
          value={s.playersPerSide}
          min={5}
          max={11}
          onSet={(n) => setSettings({ playersPerSide: n })}
        />
        <Num
          label="Must be on the line"
          value={s.minOnLine}
          min={3}
          max={8}
          onSet={(n) => setSettings({ minOnLine: n })}
        />
        <Num
          label="On-line tolerance"
          hint="yards from the LOS that still counts as on it"
          value={s.onLineToleranceYards}
          min={0.25}
          max={3}
          step={0.25}
          onSet={(n) => setSettings({ onLineToleranceYards: n })}
        />
        <Choice
          label="Even holes to the"
          hint="odd holes run the other way"
          value={s.evenHolesSide}
          options={[
            { v: 'left' as const, label: 'Left' },
            { v: 'right' as const, label: 'Right' },
          ]}
          onPick={(v) => setSettings({ evenHolesSide: v })}
        />
      </div>

      <div className="picker-group">
        <div className="picker-row">
          <button
            className="danger"
            onClick={() =>
              void askConfirm('Put every setting back the way it came?', {
                body:
                  'The colors, the pen, the board and your league rules. ' +
                  'Your plays, formations and roster are not touched.',
                confirmLabel: 'Reset settings',
                danger: true,
              }).then((ok) => ok && resetSettings())
            }
          >
            Reset all settings
          </button>
        </div>
      </div>

      {/*
        * Which build this device is on. Not a tip and not an instruction — it
        * is a fact you can read out over the phone, which is exactly what was
        * missing when two devices were running two different bundles and
        * nobody could tell.
        */}
      <p className="build-stamp">build {__BUILD__}</p>
    </div>
  );
}
