# Chalk — build spec

A play designer for 7-man youth tackle football. Single user. Pen-first, offline-first, installable.

---

## 1. Constraints that shaped this

**Target device.** Samsung tablet with S Pen. Development testing on a Galaxy S-series Ultra. Chrome and Samsung Internet.

**Measured on device, not assumed:**

| Capability | Result | Consequence |
|---|---|---|
| Event to paint latency | 9.4–13.0 ms | Web is viable, no native needed |
| `pointerType: 'pen'` | works | Pen-only mode, palm rejection |
| Pressure | peak 0.523 | Available, default off |
| Tilt | works | Unused |
| Hover | works | Crosshair preview |
| Side button | **not reported** | Select-and-delete instead of erase |
| `pointerrawupdate` | yes | One event per pen sample |
| `getCoalescedEvents` | yes | Kept as a fallback path |
| `getPredictedEvents` | yes, 2–3 points | On by default |

**Format.** 7-man tackle. Minimum 4 players on the line of scrimmage. Even holes right, odd left. QB is back 1, RB is back 2.

**Scope.** One user. No auth screen, no sharing, no collaboration.

---

## 2. Coordinate system

Everything is stored in **yards**, not pixels. The origin is the center of the line of scrimmage.

- `x`: yards from the middle of the field. Positive is offense's right.
- `y`: yards from the LOS. Positive is behind the LOS for the offense.

The SVG `viewBox` is expressed in yards and scaled by CSS. This means one geometry works for a phone screen, a tablet, and a 300 DPI PDF with no rescaling logic anywhere.

Default visible window: 20 yards behind the LOS, 30 in front, 30 yards wide. Adjustable per play.

---

## 3. Data model

```ts
// domain/types.ts

export type Side = 'offense' | 'defense';

export interface PlayerSlot {
  id: string;
  label: string;           // drawn inside the shape: 'C', 'QB', 'X', 'M'
  side: Side;
  x: number;               // yards, + = offense right
  y: number;               // yards, + = behind LOS
  onLine: boolean;         // auto from y, manually overridable
  onLineLocked: boolean;   // true once the user overrides
  backNumber?: number;     // 1 = QB, 2 = RB
  jersey?: number;         // links to roster
  shape: 'circle' | 'square' | 'triangle' | 'x';
}

export type AssignmentKind =
  | 'route'      // solid line, arrowhead
  | 'block'      // solid line, T-cap
  | 'combo'      // T-cap then climb to a second defender
  | 'pull'       // curved path behind the line, T-cap
  | 'carry'      // wavy line, ball carrier
  | 'motion'     // dashed, pre-snap
  | 'option'     // dotted
  | 'stay';      // no line drawn

export interface PathPoint {
  x: number;
  y: number;
  cx?: number;   // optional quadratic control point
  cy?: number;
}

export interface Assignment {
  id: string;
  playerId: string;
  kind: AssignmentKind;
  path: PathPoint[];
  targetPlayerId?: string;    // block / combo: who to block
  climbToPlayerId?: string;   // combo: second-level target
  preset?: string;            // 'sweep', 'slant', null if freehand
  color?: string;             // null = derive from color rule
}

export interface Play {
  id: string;
  name: string;               // user-editable
  suggestedName?: string;     // '26 Sweep', computed
  backNumber?: number;
  hole?: number;
  sectionId: string;
  formationId?: string;
  players: PlayerSlot[];
  assignments: Assignment[];
  annotations: PathPoint[][]; // freehand scratch layer
  notes: string;
  coachingPoint: string;
  tags: string[];
  colorRule: 'byGroup' | 'byKind' | 'manual';
  createdAt: number;
  updatedAt: number;
}

export interface Formation {
  id: string;
  name: string;
  side: Side;
  players: PlayerSlot[];
  builtIn: boolean;
}

export interface RosterEntry {
  id: string;
  name: string;
  jersey: number;
  positions: string[];
}

export interface Settings {
  playersPerSide: 7;
  minOnLine: 4;
  evenHolesSide: 'right';
  fieldLengthYards: 80 | 100;
  defaultBackNumbers: Record<string, number>; // { QB: 1, RB: 2 }
}
```

---

## 4. Hole numbering

Computed on every formation change. No hardcoded position-to-hole map.

```ts
// domain/holes.ts

/**
 * Gaps between on-line players, numbered outward from the center.
 * Even to the right, odd to the left.
 *
 *   ... 5   3   1  [C]  2   4   6 ...
 */
export function computeHoles(players: PlayerSlot[]): Hole[] {
  const line = players
    .filter(p => p.side === 'offense' && p.onLine)
    .sort((a, b) => a.x - b.x);

  if (line.length < 2) return [];

  // Center = on-line player closest to x = 0
  const centerIdx = line.reduce(
    (best, p, i) => Math.abs(p.x) < Math.abs(line[best].x) ? i : best,
    0
  );

  const holes: Hole[] = [];
  let odd = 1, even = 2;

  // walk left from the center
  for (let i = centerIdx; i > 0; i--) {
    holes.push({ number: odd, x: (line[i].x + line[i - 1].x) / 2 });
    odd += 2;
  }
  // off the left end
  holes.push({ number: odd, x: line[0].x - 1.5 });

  // walk right from the center
  for (let i = centerIdx; i < line.length - 1; i++) {
    holes.push({ number: even, x: (line[i].x + line[i + 1].x) / 2 });
    even += 2;
  }
  // off the right end
  holes.push({ number: even, x: line[line.length - 1].x + 1.5 });

  return holes.sort((a, b) => a.x - b.x);
}
```

**Play name suggestion.** If a play has exactly one `carry` assignment, take that player's `backNumber`, find the hole nearest where the path crosses the LOS, and combine: back 2 through hole 6 gives `26`. Append the preset name if there is one: `26 Sweep`. Always a suggestion, never forced. The user can overwrite it.

---

## 5. Formation legality

```ts
// domain/legality.ts

export function checkFormation(players, settings): Issue[] {
  const offense = players.filter(p => p.side === 'offense');
  const onLine  = offense.filter(p => p.onLine);
  const issues  = [];

  if (offense.length !== settings.playersPerSide)
    issues.push({ level: 'error', text: `${offense.length} on offense, need ${settings.playersPerSide}` });

  if (onLine.length < settings.minOnLine)
    issues.push({ level: 'error', text: `${onLine.length} on the line, need ${settings.minOnLine}` });

  if (!offense.some(p => p.label === 'C'))
    issues.push({ level: 'warn', text: 'No center marked' });

  return issues;
}
```

`onLine` is derived automatically: a player within 1 yard of the LOS is on the line. Dragging a player across that threshold flips the flag and the hole map redraws live. Once the user taps the on-line toggle manually, `onLineLocked` is set and auto-detection stops for that player.

The editor shows a persistent count badge, for example `4 on line`, colored red when the formation is illegal. Never blocks saving. Coaches draw illegal things on purpose sometimes.

---

## 6. Rendering

Four layers, stacked:

```
┌────────────────────────────────┐
│ 4. live ink        <canvas>    │  current pen stroke + prediction ghost
│ 3. players         <svg>       │  shapes, labels, drag handles
│ 2. assignments     <svg>       │  routes, blocks, pulls, motion
│ 1. field           <svg>       │  yard lines, hashes, LOS, hole numbers
└────────────────────────────────┘
```

**Why SVG for 1 through 3.** Elements stay hit-testable for tap-to-select, and PDF export is vector, so print output is crisp at any size. Canvas would force a hit-test implementation and rasterize the exports.

**Why canvas for layer 4.** During a stroke, React reconciliation is too slow to keep up with 240 Hz pen input. The in-progress stroke is drawn imperatively on canvas at `requestAnimationFrame` rate. On `pointerup`, the stroke is simplified and committed to the SVG assignment layer, and the canvas clears. This is exactly what the device test validated.

### Stylus handling

```ts
// render/useStylus.ts
```

- `touch-action: none` on the stage.
- Listen to `pointerrawupdate` when present, falling back to `pointermove`. Do not double-handle: register one or the other.
- Use `getCoalescedEvents()` only on the `pointermove` fallback path. With raw updates, each event is already one sample.
- `getPredictedEvents()` draws a translucent tail beyond the last real point. Never committed to the stroke.
- **Palm rejection:** record `lastPenAt` on every pen event. Ignore `touch` pointers within 800 ms of it.
- **Pen-only mode:** ignore `touch` for drawing entirely; touch still pans and pinch-zooms.
- **Hover:** pen events with `buttons === 0` and no active stroke render a crosshair at the tip position.
- Pressure maps to line width only when the user turns it on. Default off, because variable-width lines read as sloppy on a printed call sheet.

### Stroke processing

1. Collect raw points during the stroke.
2. On release, run Ramer–Douglas–Peucker simplification (tolerance ~0.15 yards) to cut point count by roughly an order of magnitude.
3. Convert to a quadratic path using midpoint smoothing.
4. If snap is on, quantize the endpoint to the nearest yard line and straighten segments within 8 degrees of vertical or horizontal.

### Erase and delete

No hardware eraser is available, so:

- Tap an assignment path to select it. Selected path highlights, inspector opens.
- Delete removes the entire assignment. The player shape stays, now unassigned.
- The freehand annotation layer gets a separate on-screen eraser toggle. That layer alone supports partial erase.

---

## 7. Presets

**Run concepts** (`domain/presets/routes.ts`): dive, off-tackle, sweep, counter, trap, power, toss.

**Pass routes**: go, slant, out, in, hitch, corner, post, wheel, screen.

Each preset is a function of the player's start position, so it adapts to where the player actually lines up rather than being a fixed shape:

```ts
export const sweep: RoutePreset = (start, holes, side) => [
  { x: start.x, y: start.y },
  { x: side === 'right' ? start.x + 4 : start.x - 4, y: start.y - 1 },
  { x: side === 'right' ? start.x + 7 : start.x - 7, y: -3 },
];
```

**Blocking presets** (`domain/presets/blocks.ts`): the block tool takes a blocker and a defender and generates the path. Straight for a base block, curved behind the line for a pull, two-stage for a combo.

**Formations** (`domain/presets/formations.ts`): ships empty except for a single balanced default (C, two guards, two ends on the line; QB and RB behind). Real formations get added from your actual playbook. Building a generic 7-man library would be guesswork.

---

## 8. Storage

Local-first. IndexedDB via Firestore's offline persistence is the source of truth for reads. Writes go to Firestore and sync when a connection exists.

```
users/{uid}
  settings/main                 Settings
  roster/{playerId}             RosterEntry
  sections/{sectionId}          { name, order }
  formations/{formationId}      Formation
  plays/{playId}                Play
```

Anonymous auth. No login screen; the app signs in silently on first load and persists the uid.

**Security rules:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

**Note on the anonymous uid.** It lives in the browser's local storage. Clearing site data on the tablet orphans the playbook. Mitigations, in order of effort: an export-everything-to-JSON button in settings (stage 6), and optionally upgrading the anonymous account to an email link later. Not V1, but the data model doesn't need to change for it.

**Undo.** In-memory stack of the last 50 play states, held per editing session. Not persisted. Autosave debounced at 800 ms after the last change.

---

## 9. File layout

```
src/
  main.tsx
  App.tsx
  firebase.ts

  domain/
    types.ts
    holes.ts
    legality.ts
    naming.ts
    presets/
      routes.ts
      blocks.ts
      formations.ts

  render/
    Field.tsx              yard lines, hashes, LOS, hole numbers
    PlayerShape.tsx
    AssignmentPath.tsx     line style per AssignmentKind
    LiveInkCanvas.tsx
    useStylus.ts
    smooth.ts              RDP + midpoint smoothing
    geometry.ts            yards <-> screen

  editor/
    PlayEditor.tsx
    Toolbar.tsx
    FormationPicker.tsx
    RoutePicker.tsx
    BlockTool.tsx
    Inspector.tsx          selected element properties
    LegalityBadge.tsx

  playbook/
    PlaybookList.tsx
    SectionList.tsx
    PlayCard.tsx

  export/
    renderToSvg.ts         a play -> standalone SVG string
    toPng.ts
    toPdf.ts
    CallSheet.tsx
    Wristband.tsx

  store/
    usePlays.ts
    useSettings.ts
    undo.ts
    sync.ts

  ui/
    tokens.css
    components/
```

**Dependencies:** react, react-dom, vite, typescript, firebase, pdf-lib, zustand, vite-plugin-pwa. Deliberately small. No canvas library, no drawing library, no component kit.

---

## 10. Build stages

Each stage is deployable and testable on the tablet on its own.

**Stage 1 — Field and players**
Field renderer with yard lines and LOS. Drop 7 offensive and 7 defensive players. Drag to move. On-line auto-detection, live count badge, legality check. Hole numbers computed and displayed.
*Done when:* you can drag a player across the LOS and watch the hole map and the count badge update.

**Stage 2 — Blocking tool** *(moved ahead of formations)*
Tap blocker, tap defender, block line draws with a T-cap. Pull paths. Combo blocks. Tap to select, delete to remove.
*Done when:* you can assign every lineman a block in under 20 seconds.

**Stage 3 — Route presets and formations**
Run and pass preset library. Formation save and recall. Mirror left/right. Auto play-name suggestion.

**Stage 4 — Freehand pen**
Live ink canvas, prediction, palm rejection, pen-only mode, hover crosshair, smoothing, snap. Annotation layer with eraser.

**Stage 5 — Playbook**
Sections, list view, search, tags, duplicate, drag to reorder. Firestore sync and autosave.

**Stage 6 — Export**
Single play PNG and PDF. Call sheet at 4, 6, or 9 per page. Wristband strips. Big-print player cards. Full playbook PDF. Export-all-to-JSON backup.

**Stage 7 — Polish**
Service worker and offline shell. Install prompt. Portrait and landscape layouts. Undo depth. Dark mode.

---

## 11. Deferred

Play animation. Defensive scheme library. Film integration. Stat and play-call tracking. Sharing with other coaches or players. Multi-team support.

---

## 12. Settled since drafting

- Defense is opt-in. A new play opens with offense only.
- Field length is stored as 70 but unused. The play view shows roughly 40 yards around the LOS regardless, so length only matters if a full-field or red zone view gets added later.

## 13. Still open

- Real formations from your playbook, to seed the library in stage 3
