# Chalk — working notes

Pen-first play designer for 7-man youth tackle football. One user, offline-first.
Full spec and stage list: `docs/build-spec.md`.

## Where it stands

Stages 1-7 done: field and players, blocking tool, route and run presets with
formations and auto play-naming, freehand ink, a playbook that saves, and
export, and an offline shell. The app installs to the home screen and opens
with no signal.

**The defense is a full unit now.** A play is offense or defense from the moment
it is made; a defensive play carries coverage zones, man-coverage ropes, blitzes
aimed at computed gaps, contain and spill, line-game stunts, saveable fronts,
one-tap coverages, and a look copied over from any offensive play in the book.

**The chrome has had a pass.** Every control is a pen-sized target, the drawer
behaves like a menu rather than a palette, the inspector takes a side in
landscape, and the twelve browser `prompt()` and `confirm()` boxes are gone. See
*Chrome, controls and dialogs*.

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

## Chrome, controls and dialogs

**One control size, and it is the pen's.** 40px is the floor, everywhere,
including the lists that used to take 44 — the drawer's tool rows and the route
picker came down to the floor when the panel had to fit in a third of the board.
This is the same fact as the drawer tab needing 52px: Chrome gives a finger touch
adjustment and hit-tests a stylus at the exact pixel. Every pill in the app was
33px, which was that bug spread across a hundred buttons, and **40 is the number
that is not 33** — do not go under it to win space. The genuinely secondary
controls — a card's Copy, a folder's Rename, the drawer's own head, the trace bar
— opt down to 32-34px by name.

**Space came out of the gaps, not the targets.** The panel that only gets a third
of the board got there by losing padding: the drawer is 264px wide rather than
300, group and row padding roughly halved, and in the route picker **the group
heading moved beside its row instead of above it** — six groups each spending a
whole line on a nine-character word in 10px grey was 140-odd pixels. Nothing
moved horizontally that was not already wrapping; a row of pills wraps at the
same count either way. `.route-picker .picker-group` is a flex row with a 44px
label column, which is why its buttons close up behind the label.

**The drawer is a menu, not a palette.** It covers 58% of the board on a phone,
so it opens closed in portrait and slides itself away after a one-shot action:
applying a formation or a coverage, setting the look, flipping sides, starting
over. Toggles and the mode row leave it open. The auto-close is deliberately
**not** written to storage — only the coach's own tap on the tab changes what the
drawer does next time, so a tablet left with the tools out keeps them out.
`drawerDefault()` decides the first answer from the screen; after that the
stored one wins.

**One header belongs to the drawer.** Every picker used to bring its own, so
opening Settings stacked two titles and two dismiss buttons that did different
things — one went back to the tools, the other slid the panel away. Those are
the back arrow and Hide. `SettingsPanel`, `NotesPanel`, `FormationPicker` and
`DefensePanel` draw no head at all now; their subtitles come through
`Drawer`'s `subtitle`. Switching panels resets the scroll, or Settings opened
halfway down itself.

**Settings and Notes widen the panel.** They are long forms with number fields
and paragraphs, read while not drawing, and 300px is a column not a page.

**Settings is reachable from the playbook too.** Every one of them — the
colours, the pen, the board, the league rules — is the same on every play in
the book, so reaching them meant opening a play you did not want to change.
`SettingsPanel` draws its own header only when it is given an `onClose`, which
is exactly the screen that has no drawer to supply one; there it is capped and
scrollable like the roster and export panels beside it.

**In landscape the inspector takes a side, not the top.** Turning the phone makes
the board height-constrained and leaves room at the edges — which is why the
drawer lives there. A strip across the top took 45% of a 360px-tall viewport. It
takes the edge the drawer is *not* on, and the quick bar steps across to the
board when it opens so it stops covering the route list.

**In portrait it takes the end the selected man is not at.** It always went
downfield, on the reasoning that the backfield is at the bottom so a panel there
covers the backs you just picked up. That was half the board's story: the
defense stands downfield, so the same fixed end laid the panel straight over the
men whose jobs it had been opened to set. `inspectorEnd()` gives it `at-top` for
an offensive player and `at-bottom` for a defender, and the quick bar swaps to
the top when the panel takes the bottom — the same step-aside it already does
sideways in landscape.

**At the bottom it gets a third of the board, and that number is the
backfield.** The board is 30 yards tall — 20 downfield, 10 behind — so the line
of scrimmage sits two thirds of the way *down* the screen and a defender stands
below the middle of it even though he is downfield of the ball. A panel given
the old 62% from the bottom cleared the deep zones and then covered the front,
which is the same bug one end along. The bottom ten yards are the one strip
nothing defensive is ever drawn in, so that is its share: it stops on the LOS,
and the list scrolls inside it instead of the box growing to fit. At the top it
still takes what it needs, because the offense has no equivalent clear strip —
its routes run into the space a top panel wants.

**No tips, anywhere in the editor.** The hint pill floated at the bottom of the
board naming the mode and narrating the gesture, which is where the quick bar
sits and where the inspector now goes for a defender — half of what it said was
under something. The grey lines under the tool rows and inside the route picker
went with it: a capped panel cuts its last row in half, and the row it was
cutting was always the explanation. What survives is what is *not* an
instruction — the selected man's coordinates, which play a defense is set
against, "Saved to the cloud.", errors, and the empty states that say a list is
empty rather than how to use it. The tap-move-tap grammar is still shown, but on
the board: the men in a half-finished block are drawn `pending`, and the aim ring
follows the pen. `drawing` state went too — the pill was the only thing reading
it, so it was a setState per stroke re-rendering the board for nobody.

**A capped panel says so at its edge.** Every one of them was cutting a row of
buttons exactly in half, which reads as a broken render rather than as "there is
more below". `useScrollFade` puts the mask on only when the box really does
overflow — a fade on a panel whose content fits just dims its last row, and CSS
alone cannot tell the two apart.

**One primary per screen, and destructive things look it.** `button.primary` is
filled; `button.danger` carries the bad colour. Start over moved out of the Undo
group, where it sat one button along from Step back in the same grey.

**Everything the app asks is asked in the app.** `ui/dialog.ts` is a tiny
external store shaped like `store/settings.ts` — `askText()` and `askConfirm()`
return promises, `DialogHost` is mounted once in `App` — because the twelve
`prompt()` and `confirm()` calls it replaced arrived as browser chrome in an
installed PWA: another typeface, mouse-sized buttons, the origin across the top,
and `prompt()` is the one browsers are least willing to show at all. Verified
that a five-pair contact-bounce burst on a button opens exactly one dialog, and
that a burst on Cancel closes it and changes nothing.

**A glyph on a button only when the same mark lands on the board.** ★ Ball keeps
its star because the carrier is drawn as one. Zone, Focus, Vision, Flip and Man
up lost theirs — a ▢ in front of two different buttons said they were the same
kind of thing.

**The header badge counts the unit the play belongs to.** It was reporting the
*offense's* legality on a defensive play — "4 on line, legal" — which is a fact
about the scout look, in the most prominent place on the screen, answering a
question nobody asked. A defense reports its shape instead: how many are up on
the ball, out of how many are on the field.

## The target device

A Galaxy S-series Ultra with an S Pen, measured from real traces:

- Contact lasts **3-5ms** unless pressed hard; one press arrives as up to five
  pointerdown/up pairs within 150ms, gaps of 10-25ms.
- `pressure` reads **0.00 on every pointerdown**, and small values (0.02-0.13)
  on moves while contact is held. Do not gate on it.
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

## Tools and the board

**The editor opens in Routes.** Opening a play is opening it to say what people
run, and the formation underneath is usually the one already wanted — a starred
foundation is what every new play is built on. Move is one tap away when a man
does need shifting.

**Move** drags players. **Routes** selects a man and leaves him exactly where he
is, so choosing what he runs never costs the spot a drag just put him on.
Freehand is not in the mode row at all — it is the pencil over the board,
because it is reached for mid-play rather than set out in.

Routes is also where a tap on a **line** lands: it used to be given no lines to
pick at all, so tapping a receiver's own route hit open grass and cleared him,
and his colour swatches with him. A line now resolves to the man who runs it,
which opens the picker those swatches are already in. There is still no line
inspector over the board in Routes.

The board inspector holds the route list and nothing else. Label, the on-line
toggle and the coordinates moved into the drawer: they are set once when a
formation is built and then never again, and they sat over the board every time
a man was picked up.

Zoom rewrites the `viewBox`, still in yards. Nothing else had to change:
`toYards()` reads the SVG's own matrix, which already accounts for whatever box
is set.

**The board slides, and that is the ✥ beside the zoom pair.** Magnifying a board
you cannot slide only buys a bigger view of the part that was already covered,
which is what zoom alone was once the route panel took the bottom third. It is a
toggle rather than a mode in the row: sliding the window is not a thing you draw,
and while it is out a tap on the field picks nothing up. Tap, move the pen, tap —
free, because it goes through `applyDrag` like every other grab, so the carry,
the contact-bounce resume and the finger drag all come with it. `Centre` puts
both back.

**A pan is not an edit.** No snapshot — a step back over one would undo nothing
anybody could see — and no grid or magnet, which tidy a man onto a yard line and
have nothing to say about a window. It is never saved and never exported: the
thumbnail and `export/render.tsx` both draw from the constant `VIEW_BOX`, so what
prints is the whole field however the editor happens to be looking at it.

**The one drag measured in pixels.** Every other one reads its target off the
live matrix — but a pan *is* a change to that matrix, so yards taken from it are
yards in a box that has already moved and the reading chases its own tail. Pen
travel across the glass is the quantity that stays still underneath the gesture,
and the scale is fixed for its whole length because zoom cannot change mid-drag.
The offset is set **absolutely** from where the grab began and never accumulated,
which is also what makes a bounce free: any fresh grab re-anchors on the current
state, so there is nothing to resume. Clamped so the middle of the view stays
over the field — a board you can slide off the screen is a board you can lose.

## Routes

Tapping a man opens his route list in the inspector — picking a player and
choosing what he runs is one thought, and it used to be two taps in two
corners of the screen.

**Every concept in the picker is an on/off button.** Tapping the one he is
already running takes it back off; tapping a different one still overrides,
because that is the same rule said once — the last thing said about him wins.
It covers routes, the defensive rush and drop rows, the zones and Man up, and
the active one is drawn pressed, or the rule is invisible. The toggle-off runs
*before* `remember()` where it delegates to something that snapshots for itself,
or one tap would cost two identical steps back.

Presets stay functions of where a player is standing, never stored shapes, so
one concept serves any position. Two things extend that:

- `hand` on a preset **forces** the direction. "All the way left" means left
  from wherever he is; every other concept means toward the wide side.
- A saved route (`chalk.routes.v1`) is stored relative to **its own first
  point**, not the player. Routes are not regenerated when their man is dragged
  — only blocks are — so anchoring on the player would bake the gap between
  them into the saved shape and apply it crooked to everyone afterwards.

`in`/`out` keep their ids as the medium pair, so plays saved before the depth
variants still name the preset they came from.

## Who gets the ball

`Play.ballCarrierId` stars one man on the board. It lives on the **play**, not on
the player, so it never travels inside a saved formation — how a team lines up
and who carries out of it are two different decisions. Applying a formation or
resetting clears it, because it would otherwise name a player who no longer
exists.

The star is what the namer trusts: a starred man's line is the run, even when it
was drawn as a plain route, so `22` comes out of a route that no preset would
have marked as a carry. With no star it falls back to the old rule, one carry
line and no more.

**The carrier is drawn as a star, in the ball colour** — not as a badge pinned
to the corner of his mark, which was a decoration on a player rather than a
player you could pick out, and picking him out of eleven marks at a glance is
the whole job. It is **derived, never stored**: `player.shape` is untouched
underneath, so handing the ball to somebody else gives him his own mark back
with nothing to undo. His label switches to `--ball-line`, which is dark on the
screen's yellow and white on the black that print swaps in. Drawn as a polygon
rather than typed as a glyph, because an exported SVG carries no fonts.

## The defense

A play knows which unit it is: `Play.unit`, written at creation and never
changed here, because every line already drawn on it was drawn for one of them.
Absent means offense — every play drawn before this existed is an offensive
play, and a migration rewriting a hundred documents to say what their absence
already says would be work for nothing.

A defensive play opens with **a look already across from it**. That is not a
convenience: the gap map is computed from whoever is on the offensive line, so a
front with nobody across the ball has no gaps, nothing to aim a blitz at and
nobody to cover.

**Gaps are computed, never stored** — `domain/gaps.ts`, the twin of
`domain/holes.ts` and the same walk over whoever is on the line. Letters out
from the ball on both sides, so shifting a tight end re-letters the front for
free and mirroring a play sends a C-gap blitz into the other C gap. Holes and
gaps cannot share one map: a hole is odd one way and even the other because the
offense calls the direction with the number, and a gap is lettered the same both
ways because the defense calls the direction separately. So the space between
the centre and the right guard is the 2 hole and the A gap, and both are right.
They draw on opposite sides of the LOS — numbers below, letters above — so each
unit reads its own map off its own side and the two can be up at once.

**A zone's corner grip is drawn, and set inside the corner.** It was invisible
— the cone and the square are their own handles, so the zone borrowed that and
gave its corner nothing to see — and on a preset deep zone it was unusable as
well: a deep third is a third of the field, so its far corner lands exactly on
the edge of the board, half the target off-screen and past the point a drag is
allowed to reach. Every zone a coverage laid down could not, in practice, be
resized. The grip is drawn on every zone, inset far enough to clear the edge,
and the drag still works from the true corner so taking hold of it does not jog
the box. `zone-size` is also the one drag allowed to reach the board edge: a man
is kept a yard inside so his mark and number stay on, but a zone's corner is not
a man. The label takes whichever top corner the grip did not.

**Zones are a patch of grass, not a focus square.** `Zone` keeps its own centre
and its own size, in yards on the field, and a leader line back to its defender.
The square hangs off its man and grows as it is aimed, which is right for "this
receiver works this patch" and wrong for a coverage: a deep third is a wide
shallow box sitting where it sits, a flat is beside its man, a hook is behind
him. Aiming and sizing had to come apart, so the body moves it and the far
corner sizes it — two `DragState` kinds, both through `applyDrag`, which is what
buys tap-move-tap, contact-bounce resume and one-gesture-one-undo for free.

Dragging the **defender** deliberately does not drag his zone. Where he lines up
and where he has to get to are two different facts, and the gap between them is
what a coach is reading.

Unlike the cone and the square, a zone **keeps an edge**. Those two fade out
because where a look ends is a soft question; a zone's boundary is the whole
point of a zone.

**Man coverage and stunts store who-does-what-to-whom**, exactly as blocks do,
and `refreshPaths` in `domain/regenerate.ts` rebuilds all three families every
render. One function because three places draw a play — the board, the thumbnail
and the exporter — and a fourth kind of regenerated line added to only two of
them would draw a play three different ways.

A stunt is **two assignments**, each naming the other, the roles kept in
`preset` (`stunt-crash`, `stunt-loop`). They are two men's jobs, either end can
be erased, and each has to follow its own player. Deleting or rubbing out one
takes the pair: half a line game is a man looping behind nobody.

**A rush and a zone are not both a man's job.** Sending a blitzer clears his
zone and giving a man grass clears his rush — the last thing said about him
wins, like his one route.

**A coverage is the one call about seven men at once**, so it is applied as a
call (`domain/presets/coverages.ts`) rather than as seven trips to the picker.
It splits the deep field by **what the call asks for, not by the head count**:
Cover 3 with two deep men is three thirds with one of them nobody's, and that
vacated third is exactly what a coach needs to see. Everything it lays down is
an ordinary zone and an ordinary rope afterwards.

Man coverage pairs with **eligible receivers only** (`eligibleReceivers` in
`domain/legality.ts`, computed off the board like everything else): pairing by
raw distance put a linebacker in man coverage on the centre.

**The look is copied, not referenced.** `Play.scoutPlayId` records which play a
defense was set against and nothing more. A live reference would leave the gap
map, every rope and every pick naming players in another document, and the gap
map is computed from whoever is on the line *here*. Ropes pointing at men who
just left are dropped explicitly rather than by `refreshPaths`, because player
ids are only unique within a play: an id that came back would silently point the
coverage at whoever inherited it.

**The defensive name is read off the board** — front, coverage, pressure:
`5-2 Cover 3 W A Fire`. The coverage comes from the zones' own presets rather
than only their count, and the blitz is named by **the gap its path crosses the
line in**, not the space the man lines up in: reading his alignment called an
A-gap blitz from a linebacker shaded outside the guard a B fire.

Fronts are real formations with `side: 'defense'`, saved in the same store and
starred independently of the offense's foundation. Applying a formation replaces
**its own side only**, so one front can be tried against three looks without
redrawing the half of the board you are not thinking about.

## The marks, and the two highlights

A player's shape is picked in his route list, beside the star and the
highlights: circle, square, star, triangle, ✕. The formation still sets it — linemen square, backs circle,
defense ✕ and triangle — and this only overrides the one man in hand. Triangle
and ✕ stay in the row because the defense is built out of them; drop them and a
defender changed once could never be given his own mark back. The star is a fat
one, nothing like the sharp badge the ball carrier wears: its waist has to hold
a label, and its points stop short of 0.9yd or two stars on adjacent 1.8yd line
splits would touch.

The mark lives on the **player**, unlike the ball star, so it travels inside a
saved formation — how a man is drawn is part of how the team lines up.

**Both highlights are a wash under the play, never over it.** They render
straight after the turf and before a single mark, and they are the only things
on the board drawn from a token at a fraction of its own alpha. A highlight that
competed with a route would be hiding the play it is meant to be pointing at.

- **The vision cone** stores only its focus. The apex is the quarterback,
  looked up by back number at render time, for the same reason a block stores
  who-blocks-whom: drag him and the cone follows, and a formation swapped
  underneath re-anchors on the new quarterback rather than pointing at a man who
  no longer exists. No quarterback, no cone. **The cone is its own grab
  handle** — `insideCone` in `VisionCone.tsx` — because a mark at the far end
  read as another player among the routes, and the wash is a far bigger target
  for a stylus Chrome hit-tests at the exact pixel.
- **The focus square** is the cone in square form, deliberately: one edge
  anchored on the player exactly as the apex is, only the far end stored, same
  wash, same fade running off him, same drag-the-body-to-move-it. **How far it
  reaches is also how wide it is**, so one offset (`Play.focuses`, a `dx`/`dy`
  per man) aims it and sizes it at once — drag it out and it opens up. The cone
  widens as it goes because a quarterback's read widens downfield; this one
  stays square, because a man working a spot works a patch of the same width all
  the way out. Being an offset, it travels with him, and mirroring the play does
  nothing to it — his square is wherever he is. Any number of men can wear one.
  It starts six yards in front, which is forward for his side. A formation swap
  clears the list; the cone survives one, because it is anchored by back number
  rather than by id.

`grabHighlight` tries the squares before the cone: a square is small and placed
deliberately, and the cone is a wide wash that would otherwise swallow it.

Both are switched on **from the man's own route list**, next to the star and
the mark row, not from the drawer: whether he is worth watching and whether the quarterback is
reading him are decisions about one player, and the route picker exists to stop
those being a trip to another corner of the screen. The cone can be swung in
Routes as well as Move — it is aimed where it was switched on, and nothing about
it moves a player, so the mode's own rule still holds.

Both sit on the **play** beside the ball carrier, so neither travels inside a
formation, and both go through the same `applyDrag` the players do —
`DragState.kind` is what tells them apart. That is not tidiness: it is what
gives it tap-move-tap, contact-bounce resume and one-gesture-one-undo for free.
Picking runs **after** players and lines, so the wash spread across the
backfield can never be what a tap on the quarterback picks up.

## Flipping one run

Two different things, deliberately:

- **Flip sides** (drawer) mirrors the whole play about the middle of the field.
- **Flip** (in the route picker) turns one man's run round and leaves everyone
  else alone.

Presets are **regenerated** with the other hand, never mirrored, so a sweep
flipped left is the sweep a left-handed pick would have drawn. `Assignment.hand`
remembers which way it was built; without it, reversing a run would have to
guess the current direction from the shape of the path. The two wide runs aim at
an absolute sideline and cannot be turned round that way, so they swap for their
twin through `flipId` — the concept name has to keep saying which way it goes.
`mirrorAssignments` flips the hand and swaps that twin too, or a play mirrored
and then flipped would go back the wrong way.

A hand-drawn route has no concept behind it, so that one is genuinely mirrored,
about its own first point — the same anchor a saved route uses.

## Colour, and why picking a swatch "did nothing"

A selected line used to be drawn in `var(--select)`, ahead of its own colour. So
recolouring the line you had selected stored the swatch and changed nothing you
could see. Selection is a **halo** now: a wider translucent stroke behind the
path, with the real colour left alone.

The swatches for a route live in the route picker, on the man — reaching them
used to mean leaving Routes for Move and finding the line under the player
standing on it. Routes mode never picks lines (`pickAt` is given an empty list),
which is exactly why the colour had to come to the player. Block lines still
recolour through the line inspector in Move mode.

## The roster

`domain/roster.ts` holds the team sheet, in local storage beside the formations
and saved routes — it describes this team, not any one play. A slot stores the
**shirt number**, not a roster id, which is the spec's model and also what is
drawn on the board and shouted on a sideline. A number nobody wears still
draws: the link is a lookup, never a requirement. Edited on the playbook screen;
the editor only reads it. Two kids in one shirt is refused out loud rather than
silently reassigned, because the number is what makes a slot unambiguous.

## Backup, and what a backup has to carry

`store/backup.ts`. The old JSON export wrote plays and sections only, and there
was no way back in. Both were wrong: the formations, the routes drawn by hand,
the roster and the league rules are all in local storage too, and a backup that
left them behind only looked like one until the day it was needed.

Restore **replaces** rather than merges — two copies of a playbook with the same
play ids is worse than either copy — so it sits behind a confirm, and reloads
afterwards. The reload is not laziness: every one of those stores is read into
React state when its screen mounts, and a restore that left half the app showing
the old copy would be its own kind of data loss. Bad files are refused with a
sentence a coach can act on, and the playbook is left alone.

## Finishing a freehand stroke

Order matters: simplify, then square up, then smooth. Squaring after smoothing
would be straightening the midpoints the smoother invented rather than the
corners the hand turned at. `squareUpStrokes` is off by default — freehand is
what you reach for when the presets do not have the shape you mean.

`snapEnd` settles the last point onto a whole yard of **depth** only. A route is
called by how deep it goes; where it finishes across the field is wherever the
receiver ran. It moves the previous point with it when that segment is already
flat, or it would put a kink back into the line `straighten` just cleaned up.

## Pressure

`pressureWidth`, off by default, gives a stroke **one** width taken from its
hardest sample — not a width that wanders down its length, which is what the
spec warns reads as sloppy on a printed sheet. Peak rather than mean, because
contact here is mostly hover at 0.00 and a mean would call every stroke
feather-light. The width rides on `PathPoint.w`, so nothing holding a path had
to change shape: the annotation layer is a bare array of point arrays and the
eraser splits those in place, which means an erased fragment keeps the weight of
the stroke it was cut from.

**Expect very little range on this device.** It reports 0.00 on every
pointerdown and 0.02-0.13 while moving, so the curve reaches usable width well
before the top of the nominal range.

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
palette is pastel for dark turf and vanishes on white. The rush ink stays red on
paper and the zone keeps a hue of its own, unlike the two washes that go grey:
a zone is drawn with an edge and a label rather than as a fade, and grey boxes
over grey routes would not be tellable apart on a photocopy. Verified in-browser that
custom properties do resolve inside a rasterized SVG.

`export/pdf.ts` composes the sheets with `pdf-lib`: single play, call sheet at
4/6/9 up, wristband strips (names only — a wristband is read in two seconds),
big-print player cards, and the whole playbook in folder order. Every play is
rasterized and embedded **once** per document.

## Why buttons needed a hard press

The board listens to `pointerdown`, which this digitizer fires reliably. A
`<button>` does not: it waits for the click the browser synthesizes from a
well-formed down/up pair, and a light pen tap here is 3-5ms of contact broken
into a burst of pairs, which often produces no click at all. A finger holds
contact and always worked, so this read as "the pen needs a hard press".

`ui/penTaps.ts` installs one global listener: a pen tap that starts and ends on
the same button gets 150ms for the browser to fire its own click, and only if
none arrives does it click the button itself. Guarded against contact bounce the
same way the board is, so one press stays one press. Verified all three cases —
no click at all, a real click (fires once, not twice), and a four-pair bounce
burst (once).

The other half was size: the drawer tab was 34px, and Chrome hit-tests a stylus
at the exact pixel while giving a finger touch adjustment. Anything floating
over the board also needs `touch-action: manipulation`, because `.stage` sets
`none` and it inherits.

## Picking, and why the pen "would not select"

`pickAt()` in `render/geometry.ts` is the one rule for what a tap is asking for.
**A tap inside a player's mark is that player, even when a line runs under
him.** Outside every mark, nearest wins, so a line stays pickable everywhere it
is not underneath somebody.

This was not a pen sensitivity problem at all. A device trace showed five taps
in a row landing 0.22 to 0.67 yards from a guard — every one of them inside his
0.72yd mark — and every one selecting the block line drawn beneath him. Nothing
appeared to happen, because selecting a line does not open the player. Pressing
hard "worked" only because it landed nearer his exact centre than the line was.

The old comment claimed a mark was safe "because the line stops at its edge".
It does stop at the *blocker's* edge; it then runs under everybody else.

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
