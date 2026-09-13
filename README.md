# Chalk

Play designer for 7-man youth tackle football. Pen-first, offline-first, installable.

## Stage 1 (current)

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
npm install --no-save sharp
npx esbuild scripts/preview.tsx --bundle --platform=node --format=cjs \
  --jsx=automatic --outfile=/tmp/preview.cjs --external:react --external:react-dom
node /tmp/preview.cjs            # offense only
node /tmp/preview.cjs --defense  # with a front
```

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
