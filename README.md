# Chalk

Play designer for 7-man youth tackle football. Pen-first, offline-first, installable.

## Stage 2 (current) — the blocking tool

Tap the blocker, tap the defender. The tool stays armed, so every man after the
first is two taps. Picking Block, Pull or Combo puts a front on the board if
there is not one already, because there is nobody to block otherwise.

- **Block** — straight line, T-cap on the defender.
- **Pull** — drops off the line, runs flat behind it, turns up into the defender.
- **Combo** — three taps: blocker, the down lineman he doubles, then the
  second-level defender he climbs to. Caps both.
- Tapping another offensive player mid-sequence restarts on him, which is how a
  mis-tap gets fixed. Escape clears. One block per man: re-tapping a blocker
  replaces his block rather than stacking a second one.
- In Select mode, tap a block to select it. The inspector names it, converts
  between base and pull, and deletes. Delete and Backspace work too.

Blocks are stored as who-blocks-whom, not as fixed geometry, so dragging either
the blocker or the defender redraws the line. Every waypoint scales to the
distance actually travelled — a short pull bends tighter instead of kinking
backwards past its own target.

## Stage 1

Field renderer, player placement, on-line detection, formation legality, computed hole numbering.

- Drag any player. Positions are stored in yards, not pixels.
- Cross the line of scrimmage and the on-line flag flips, the count badge updates, and the hole map redraws.
- Tap a player to select. Rename it, or override on-line by hand. Overridden players show a yellow dot and stop auto-detecting until you release the lock.
- Minimum four on the line. The badge turns red below that but never blocks you.
- New plays start with offense only. Tap Add defense to put a front on the board.

## Running it

```
npm install
npm run dev
```

## Previewing without a browser

`scripts/preview.tsx` server-renders the play SVG so it can be rasterized and
looked at directly. Useful for checking geometry without running the app.

```
npx esbuild scripts/preview.tsx --bundle --platform=node --format=cjs \
  --jsx=automatic --outfile=build/preview.cjs
node build/preview.cjs            # offense only
node build/preview.cjs --defense  # with a front
node build/preview.cjs --blocks   # one of every block shape
```

React has to be bundled in rather than left external, since the output lives
outside the project and would not resolve `node_modules` from there.

## Deploy

Netlify builds from this repo. `netlify.toml` has the build command and the SPA redirect.

## Firestore

Rules live in `firestore.rules`. Deploy them from the Firebase console or the CLI. The web API key in `src/firebase.ts` is public by design; the rules are what protect the data.

## Docs

- `docs/build-spec.md` — full spec, data model, and remaining stages
- `docs/spen-test.html` — stylus diagnostic. Open it on any target device to confirm latency, pressure and pen detection before trusting it.

## Measured on a Galaxy S-series Ultra with S Pen

| | |
|---|---|
| Event to paint | 9.4–13.0 ms |
| Pressure | works, peak 0.523 |
| Tilt, hover | work |
| Side button | not reported to the browser |
| Raw update, coalesced, predicted | all supported |
