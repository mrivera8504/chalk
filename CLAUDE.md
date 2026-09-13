# Chalk — working notes

Pen-first play designer for 7-man youth tackle football. One user, offline-first.
Full spec and stage list: `docs/build-spec.md`.

## Where it stands

Stages 1-7 done: field and players, blocking tool, route and run presets with
formations and auto play-naming, freehand ink, a playbook that saves, and
export, and an offline shell. The app installs to the home screen and opens
with no signal.

**Service workers need HTTPS.** The LAN dev server cannot register one, so
offline and the install prompt are only testable on the deployed site.

Since stage 5: marks magnetise to the LOS, folders hold plays and empty ones
show, routes colour per receiver with a manual override, undo covers a drag,
a starred formation is the foundation every new play opens in, and every
control slides away into the side drawer, which is grouped and labelled and can
sit on either hand.

The S Pen is still inconsistent in the app. Read the device section below
before touching input code.

## Invariants

**Yards, never pixels.** Every position and path is in yards, origin at the
middle of the line of scrimmage, `+y` behind the LOS. The SVG `viewBox` is in
yards and CSS scales it, so one geometry serves a phone, a tablet and a 300 DPI
PDF. `toYards()` in `render/geometry.ts` converts through the SVG's own matrix.

**Holes are computed, never stored.** `domain/holes.ts` rebuilds the map from
whoever is on the line. This is why mirroring a play renumbers `26 Sweep` to
`25 Sweep` for free.

**Blocks store who-blocks-whom, not geometry.** `refreshBlocks()` regenerates
the path from current positions every render, so dragging either man redraws
the line.

**The board is inert.** `.stage` (an HTML div) is the only element that sees a
pointer; the SVG and ink canvas are `pointer-events: none`. Nothing uses DOM
hit-testing — players and lines are found by distance, nearest wins.

**Nothing below the board may change height.** `.stage` is `flex: 1 1 auto`, so
a sibling that mounts or grows rescales the whole field and moves every
coordinate under the user's hand. Panels overlay the stage absolutely; the
inspector is pinned to the downfield end because the backfield is at the bottom.

**Every control lives in the drawer, and the drawer overlays the board.**
`Drawer.tsx` holds the tool rows and both pickers, slides off the right edge on
a tap of its tab, and remembers that it was closed. It is `position: absolute`
inside `.stage` for the reason above: as a flex sibling, sliding the tools away
would have resized the board and moved every player. Measured both states: the
board's box is identical open and closed.

It leaves from the **side**, not the bottom — the bottom of the view is the
backfield, so a panel there covers the carrier and the quarterback, which is
what a bottom dock got wrong. Closed, the panel is off-canvas entirely and only
the tab is over the field. The drawer's wrapper is `pointer-events: none` so
taps fall through to the board everywhere the panel is not, and
`handleStageDown` ignores anything inside `.inspector, .drawer`. The hint lives
on `.hint-pill`, floating over the board and inert, so the line telling you
whose block you are halfway through outlives the drawer being shut.

## The target device

A Galaxy S-series Ultra with an S Pen, measured from real traces:

- Contact lasts **3-5ms** unless pressed hard; one press arrives as up to five
  pointerdown/up pairs within 150ms, gaps of 10-25ms.
- `pressure` reads **0.00 always**. Do not gate on it.
- **Hover is flawless** — hundreds of clean samples at `buttons=0`.
- A finger works seamlessly and holds contact throughout.

So: **never require sustained contact.** Every gesture is tap to start, move the
pen (hovering counts), tap to finish. Finger drags still work and must stay
working.

**Every gesture that finishes something must arm `tapGuard`** in
`PlayEditor.tsx`. Otherwise the bounce after the finishing tap starts the next
gesture. That bug appeared three times before it was fixed in one place.

**One gesture is one step of undo.** A drag arrives as dozens of moves and, on
this device, as several separate contacts. `gestureRemembered` in
`PlayEditor.tsx` takes the snapshot at the first real movement and not again, so
stepping back undoes the whole drag rather than the last few pixels of it. It is
reset when a fresh grab starts, and deliberately *not* reset when a contact
bounce resumes one.

## The eraser

`domain/erase.ts` is pure and tested. It rubs out the points within a radius
and **splits** the stroke, which is why the annotation layer is a list of paths
rather than one. A run that starts partway through a stroke has its control
point stripped: a control point describes the curve arriving from the point
before it, and if that point was just erased the curve swings off across the
field. It returns null when nothing was touched, because it runs on every
pointer move and a fresh array each time would re-render the board and push an
identical annotation set into the play on every sample.

Freehand erases in parts; a route or a block goes whole, matching what Delete
in the inspector does. Same tap-move-tap grammar as drawing, and hovering
counts.

## Accounts

Anonymous sign-in still happens on first launch and the app works with no
account at all. Adding an email **links** the credential to the anonymous user
rather than creating a second one, so the uid never changes and the playbook at
`/users/{uid}` survives the upgrade. Registering fresh would have stranded
everything drawn beforehand under an id nobody could sign back into.

Email/password has to be enabled in the Firebase console; `explainAuth` says so
in words when it is not.

## Settings

`store/settings.ts` is the one adjustable surface: colours, pen behaviour, board
defaults and the league rules. It is a tiny external store read through
`useSettings()`, plus `getSettings()` for code outside a component.

The colours work by writing onto the document root — `--route-0..5`,
`--ink-carry`, `--ink-block`. Because every renderer asks for the token and
never a literal, one assignment reaches the board, the playbook thumbnails and
the exporter at once; the exporter copies whatever the root computes into the
SVG it writes.

**`DEFAULT_SETTINGS` is no longer the live value.** The league rules are real
settings now, so anything deriving from them must take `settings` as a
dependency — `computeHoles` and `checkFormation` in `PlayEditor.tsx` had stale
`useMemo` arrays and silently ignored a changed rule until it was fixed.

## Export

`export/render.tsx` turns a play into a standalone SVG using the *same*
components the editor draws with, then rasterizes it through an `<img>` and a
canvas. A serialized SVG carries no stylesheet, so every custom property is
written into the file's own `<style>`; `TOKENS` lists them and must be kept in
step with what the renderers reference. `PRINT_TOKENS` then overrides the lot
for paper — white turf, black marks, and saturated ink, because the screen
palette is pastel for dark turf and vanishes on white. Verified in-browser that
custom properties do resolve inside a rasterized SVG.

`export/pdf.ts` composes the sheets with `pdf-lib`: single play, call sheet at
4/6/9 up, wristband strips (names only — a wristband is read in two seconds),
big-print player cards, and the whole playbook in folder order. Every play is
rasterized and embedded **once** per document.

## Debugging input

`?trace` on any URL opens a pointer trace: every event plus the decision the
editor made from it, with Copy and Text buttons to get it off the device. Get a
capture before changing input code.

Ask what the user physically *feels*, not only what they see. Both breakthroughs
in the S Pen work came from a sentence they wrote, never from a trace alone.

## Running it

    npm run dev                  # localhost
    npm run dev -- --host        # reachable from the phone on the same wifi
    npm run build                # tsc -b && vite build

**Netlify credits are nearly out.** Test over the LAN, which costs nothing and
hot-reloads. Deploy **once per stage**, not per fix. A push to `main` triggers a
build.

`public/spen-test.html` deploys with the app at `/spen-test.html` — the stylus
diagnostic, and the reference for what this device will accept.
