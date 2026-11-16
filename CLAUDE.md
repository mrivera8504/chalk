# Chalk — working notes

Pen-first play designer for 7-man youth tackle football. One user, offline-first.
Full spec and stage list: `docs/build-spec.md`.

## Where it stands

**An overhaul is under way** — multi-sport, a new look, teams and sharing — in
eight stages. Stages 0 to 2 (tests and the editor split up; the design system
and the new shell; the data layer) are deployed, and the `/teams` rules are
published. Stage 3 (the sport module, and flag, 6-, 8-, 9- and 11-man beside
7-man) is done in code. See *Tests*, *The editor, in pieces*, *The shell* and
*Kinds of football* below.

Stages 1-7 done: field and players, blocking tool, route and run presets with
formations and auto play-naming, freehand ink, a playbook that saves, and
export, and an offline shell. The app installs to the home screen and opens
with no signal.

**The defense is a full unit now.** A play is offense or defense from the moment
it is made; a defensive play carries coverage zones, man-coverage ropes, blitzes
aimed at computed gaps, contain and spill, line-game stunts, saveable fronts,
one-tap coverages, and a look copied over from any offensive play in the book.

**Printing is a screen now, not seven buttons.** Orientation, one to nine plays
a page, fill-the-page, name size and what to show, with the sheet drawn
underneath while the options change and a full-screen proof. The field window is
worked out from the plays rather than fixed, so landscape gives back the depth
nobody runs into instead of padding the margins, and the ink is derived from the
coach's own swatches rather than replaced by a print palette — which is what had
a yellow printing green, then gold. Read *Export* before touching anything under
`src/export/`: most of the rules in it are a sheet that came out wrong.

**The chrome has had a pass.** Every control is a pen-sized target, the drawer
behaves like a menu rather than a palette, the inspector takes a side in
landscape, and the twelve browser `prompt()` and `confirm()` boxes are gone. See
*Chrome, controls and dialogs*.

**The sync lost a playbook, and has been rebuilt.** A coach's book went missing
and turned up stranded under an abandoned anonymous uid. Four separate bugs put
it there; all four are fixed, and the cloud now keeps twenty past copies, refuses
a write that drops most of a book, and holds deleted plays in a trash rather than
dropping them. Read *The playbook, and how it syncs* before touching
`store/sync.ts`, `store/usePlaybook.ts` or `firebase.ts` — every rule in it is
one way a playbook was actually lost.

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

## The shell: screens, addresses and themes

The overhaul's stage 1. The editor is the same editor; what changed is the app
around it.

**Four places, always on screen.** Playbook, Team, Print and Settings are tabs
in `shell/AppShell.tsx` — along the bottom on a phone, down the side once the
screen is wide or turned over. The roster, the sheets, the account and the
settings used to open as panels stacked on the playbook behind a ⋯, each
pushing the plays down the page. They are the same panels: handed no `onClose`
they draw no header, the bargain `SettingsPanel` already struck with the drawer,
and `shell/pages.tsx` gives each a page. The editor is **not** inside the shell.
A bar under the board would be a sibling of `.stage` that could change its
height.

**Every screen has an address, and the address is written, never navigated
to.** `ui/route.ts` holds the route and `replaceState`s the path of whichever
history entry is current. It never pushes one. Back belongs to
`ui/backstack.ts`, which parks a single spare entry while anything is open; a
router pushing entries of its own would be a second owner of the same stack, and
the bug that file exists to fix was the app closing on a back gesture. So a tab
other than the playbook, an open play, a menu and a dialog are all back *layers*,
and the address follows along. `?trace` survives a route change, because losing
it on the first tap would make the trace unusable.

**A layer closing and another opening in the same breath must not push.** Our
own `history.back()` is asynchronous, and a `pushState` made while it is in the
air does not survive it: the traversal was aimed before the push, so it lands
one entry lower and the new spare is gone while `parked` says it is there. The
next close then calls `back()` on nothing and leaves the app. It took a card's
menu raising a confirm to do it — tap Delete, the menu shuts, the dialog opens.
`park()` waits while `removingOwn` is set and `onPop` parks again afterwards.

**Links answer a light pen tap too.** `ui/penTaps.ts` covered buttons because
the app had no links. The navigation is made of them — a tab is a place with an
address — and a link waits for the same synthesized click a button does.

**A card is the play, at the size it deserves.** `PlayCard` draws the window
`export/view.ts` would give the play on paper — everything it draws, padded,
never cropped — rather than the whole 22-by-30 board, which was two thirds empty
grass and tall enough that a phone showed three plays a screen. The folder
select, Copy and Delete came off the card's face into one `ui/Menu.tsx`; the
folder picker in it is still a native select, for the reason it always was.

**The chrome has a light theme; the board does not.** `styles/themes.css` swaps
the chrome's tokens and nothing a play is drawn with, so a play on grass is on
grass in both. Chosen under Settings, The app; `dark` is the default rather than
`system`, because the app has only ever been dark and nobody asked for that to
change. A few controls wear the color of the mark they put on the board — the
star on the carrier button, the zone toggle, the lit pencil — and pale yellow is
not text on white, so the chrome reads them through `--ui-ball`, `--ui-zone`
and the rest, which the light theme darkens. **Never darken the board's own
token to fix a control**: that changes what is drawn on the field.

**The stylesheet is in layers, in cascade order.** `ui/styles/index.css` imports
them; `tokens.css` holds the board's tokens in its first `:root` block — the
test setup reads that block whole for the golden renders, so keep it first and
keep chrome-only tokens out of it. Inter and Space Grotesk are two woff2 files
in `ui/fonts/`, bundled because the app opens with no signal. Neither is used on
the board: an exported SVG carries no fonts.

**Deleting a play does not ask; it says, and offers Undo.** `ui/toast.ts` is the
dialog store's opposite: a dialog asks before, a toast tells after. A delete only
moves a play to the trash, so "Delete Jet Sweep?" every time was a question
guarding a mistake that was already recoverable. Duplicate, move to a folder and
put-back say what they did the same way. One toast at a time — two Undos on
screen is a puzzle about which takes back what. Deleting a *folder*, emptying
the trash and restoring a backup still ask, because those are not one tap from
undone.

**`styles/skin.css` is last in the cascade and changes no size.** It is the
editor's chrome in the new look — fills, corners, weights, shadows — and every
dimension the editor arrived at the hard way is left where it was. The quick
bar's ↶ ✎ ✥ became drawn icons, because a typed character is drawn by whatever
font the device falls back to. That put `<svg>`s inside `.stage`, so the board
is `.stage > svg` in the stylesheet and in the tests: `.stage svg` would size
every icon as a board.

**`SHOT_DIR=/some/dir npm run test:e2e -- shots`** writes a picture of every
screen at phone and tablet size; add `SHOT_THEME=light` for the other theme.
Look at them after any change to the chrome.

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

**Every gesture that finishes something must arm `tapGuard`** — a ref the
editor owns and every module under `editor/pointer/` is handed. Otherwise the bounce after the finishing tap starts the next
gesture. That bug appeared three times before it was fixed in one place.

**One gesture is one step of undo.** A drag arrives as dozens of moves and, on
this device, as several separate contacts. `gestureRemembered`, in
`editor/pointer/drag.ts`, takes the snapshot at the first real movement and not again, so
stepping back undoes the whole drag rather than the last few pixels of it. It is
reset when a fresh grab starts, and deliberately *not* reset when a contact
bounce resumes one.

## The eraser

`domain/erase.ts` is pure, and tested in `tests/domain/erase.test.ts`. It rubs out the points within a radius
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

**Everything about the man in hand is on the board with him.** The label, who is
in the slot, the on-line toggle and the coordinates went to the drawer once, on
the reasoning that they are set when a formation is built and then never again.
That is true of a formation and not true of a man: he gets renamed, and handed
to a different kid, all season — and doing either meant leaving him to do it.
They are back in the route picker, **folded behind `Details`**, which is the
part that makes both answers true at once: the route list is still the first
thing the panel shows, and nothing about a player is a trip to another corner
of the screen. The drawer has no player section at all now.

`Details` is deliberately **not** reset when the selection changes. Labelling a
formation is done one man after another, and a panel that folded itself shut
between each of them would be a tap per player for nothing.

`.picker-group.details` opts out of the flex row with the 44px label column that
every other group in the panel uses — it has no heading and stacks a form, so it
rules itself off instead.

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

**A zone is round, and it is still stored as a width and a height.** Grass has
no corners, and a rectangle over a field draws a filing cabinet rather than the
space a man has to cover. `ZoneArea` draws an ellipse in the box the zone has
always been kept in, so a hook is a circle because it is as deep as it is wide
and a deep third is an oval because a third of the field is wider than it is
deep. Nothing else moved: every preset, `resizeFrom`, `mirrorZones` and the
coverages all go on speaking in `x`, `y`, `w`, `h`. What did have to follow the
shape is everything that used to clamp against four straight edges — `insideZone`
is the ellipse test and not its box, because the corners of that box are empty
grass and a tap there belongs to whoever is standing in it; the leader line
stops on the rim; and the label sits on the rim's own chord, measured at the top
of the letters, which is the narrowest part of the curve the word has to fit
under.

**The corner grip sits on the rim.** It was invisible once — the cone and the
square are their own handles, so the zone borrowed that and gave its corner
nothing to see — and on a preset deep zone it was unusable as well: a deep third
is a third of the field, so its far corner lands exactly on the edge of the
board, half the target off-screen and past the point a drag is allowed to reach.
On a rectangle that took an inset measured by hand. A round zone gives it back
for nothing, because the rim at 45° is already three tenths of each half-axis
inside the corner: always over its own wash, always reachable, and on the line a
coach would take hold of. The drag still resolves to the true corner of the box
— that is what the size is stored as — so taking hold of the grip does not jog
the zone. `zone-size` is also the one drag allowed to reach the board edge: a man
is kept a yard inside so his mark and number stay on, but a zone's corner is not
a man. The label takes whichever side the grip did not.

**Zones are a patch of grass, not a focus square.** `Zone` keeps its own centre
and its own size, in yards on the field, and a leader line back to its defender.
The square hangs off its man and grows as it is aimed, which is right for "this
receiver works this patch" and wrong for a coverage: a deep third is a wide
shallow patch sitting where it sits, a flat is beside its man, a hook is behind
him. Aiming and sizing had to come apart, so the body moves it and the far
corner sizes it — two `DragState` kinds, both through `applyDrag`, which is what
buys tap-move-tap, contact-bounce resume and one-gesture-one-undo for free.

**A zone can be painted, one man at a time.** Seven washes in one blue is a
coverage that has to be read by tracing leader lines; painting the deep men
apart from the underneath ones is what the row is for. `Zone.color`, picked from
the six receiver colours in the defender's own picker beside his zone list, for
the same reason his route's colour is there — it is a decision about this man,
and the drawer is another corner of the screen. Undefined means `--zone`, which
Settings now sets alongside the route, carry and block colours. Tokens, never
literals, so `export/printInk.ts` derives the paper ink from whatever the coach
chose rather than printing a hex nobody picked. Plain chalk is deliberately not
offered: a wash at a tenth of its alpha in the neutral is invisible on turf and
nothing at all on the white board. A hand-picked colour survives a change of
concept — the colour is a fact about his grass, not about which preset drew
it.

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

## The playbook, and how it syncs

`store/sync.ts` and `store/usePlaybook.ts`. One document holds the whole book at
`/users/{uid}/playbook/main`, and local storage holds it too. **Local storage is
the floor, not the cache** — written synchronously on every change, before
anything that can fail, because the tablet is on a field with no signal and an
account is the one thing this app has always worked without.

Every rule below was written after a coach's playbook went missing and four
plays were found stranded under an abandoned anonymous uid. Each one is a way
that happened.

**Local storage records whose book it is.** One key held one book no matter who
was signed in, so an anonymous device's plays were still sitting there when
somebody signed into a real account — and the autosave pushed them straight over
it. The uid is what lets a signed-out device say which email its book will come
back under, and what stops a push landing under an account the book on screen
was never loaded for.

**The book follows the account; auth is watched, not read once.** The pull ran
on mount, which meant signing in never downloaded the account you signed into —
the debounce pushed this device's copy over it 800ms later. It reconciles on
every uid change now, through `watchUid` in `firebase.ts`.

**Reaching the cloud and finding nothing there are different answers.**
`pullFromCloud` returns `{ ok }` rather than a nullable book. Collapsing the two
into `null` is what emptied accounts: a pull that failed read as "no cloud copy
yet", and the app pushed its own empty book over a real one. A boot with no
signal now pushes nothing at all.

**`loadedFor` names the account whose book is on screen** — not "a pull
finished". Those were one flag, and the gap between them is the bug above.
Nothing is ever pushed for a uid it does not name.

**Two copies of one account's book merge play by play.** The old rule compared
the single newest `updatedAt` on each side and took the whole winner, so one
play touched locally five minutes ago discarded forty from the cloud. Nothing
about a playbook is atomic: a play is the unit that changes, so it is the unit
that reconciles.

**A book from a different uid merges too, and that is a decision.** It was meant
to be replaced, and for a long while these notes said it was. It never was: the
autosave effect has `uid` in its dependencies, so it restamps storage with the
new uid the moment auth changes, and by the time the pull lands every book reads
as this account's own. A test found that, and the owner chose to keep it
(2026-11-15). Replacing would discard plays drawn anonymously the moment a coach
signed into an existing account, leaving the only copy under a uid nobody can
sign into again — the stranded playbook all over again. Merging loses nothing.
The account screen says so in words now.

**One anonymous sign-in per attempt, and the listener goes away.**
`ensureSignedIn` left an `onAuthStateChanged` listener behind on every call, and
every one of them called `signInAnonymously` again the next time auth went null.
Two days of use produced **78 anonymous accounts, created in bursts of five
inside the same second**, and the app kept whichever won the race — which is how
a playbook ends up under a uid nobody can sign into again. Concurrent callers
share one attempt now.

**A write that drops most of a book is refused.** Every failure this app has
actually had wore one shape: a small or empty copy landing on a large one. The
guard refuses that shape even when the cause is a bug nobody has found yet, and
says so on the playbook screen rather than in the console. `force` exists for
the one place it is a deliberate answer — a restore, which the coach has just
confirmed in as many words.

**Anything a push replaces is kept first.** Twenty copies at
`/users/{uid}/playbook/main/versions/{timestamp}` — always when the write loses
plays, otherwise on a ten-minute throttle so a book that only grows still has
history. Under `main` rather than beside it, so the existing recursive rule
covers it with nothing to publish. Archiving is wrapped in its own try: failing
to keep history can never stop the save, because insurance is not the policy.
There is no rollback screen yet; `listVersions()` is the API waiting for one.

**Deleting is recoverable.** `Play.deletedAt` — the play leaves every list
immediately, which is all a delete has to feel like, and stays in the book,
sorted to the end, until the trash is emptied on purpose. The hook holds every
play and hands out only the live ones, so the board, the exporter and the
editor's scout library never had to learn about any of this. `movePlay` clamps
to the live run for the same reason: the trash sits at the end so a visible
index is an array index.

There is **no timed sweep**. A sweep big enough to matter is indistinguishable
from the bug the shrink guard exists to catch, so it would either jam the sync
or need an exemption — and an exemption that deletes plays on a schedule is the
one thing not to build here.

**The book comes down again when the app comes back to the front, or the signal
comes back.** There is no listener on the document — `pullFromCloud` is a
`getDoc`, and one read as auth resolved was the whole of coming down from the
cloud, so a tablet left open on the playbook screen never saw a play drawn on
the phone however long it sat there. Both signals are the ones
`store/update.ts` already listens to in order to ask whether there is a new
build, and for the same reasons: a resumed install does not remount, so
`visibilitychange` is the only word the app gets that a coach has come back to
it, and `online` is the only word it gets that the field has signal again.
`reconcile()` is the same function the account change calls, deliberately — a
second copy of that reasoning is how four of these bugs happened. Both listeners
share one predicate, because they are asking one question, and its answer has
four parts:

- **Nobody is looking, nothing is read.** Signal returning while the tablet is
  in a bag is not worth a read; coming back to it fires the other half of the
  pair anyway.
- **The device says there is no network.** `navigator.onLine` lies in one
  direction only — true is a guess, false is certain — so this skips exactly the
  pulls that could not have worked, and stops a sideline with no bars flashing
  the label through syncing and back to offline every time the tablet is picked
  up. The `online` event is what undoes it.

- **A pull that changes nothing must not push.** Every `setPlays` runs the
  autosave, so a pull that found nothing new would send the whole book straight
  back up — once per app start before this, and now once per trip to another app
  and back. `sameBook` compares ids, `updatedAt` and `deletedAt`, which is all a
  merge can have changed, against **what is on screen** rather than against what
  the merge started from: those are the same book on one device, and storage is
  the one that can have moved underneath.
- **The claim is still written every time.** `writeLocal` is outside that check,
  because it is also where storage is stamped with whose book it is.
- **The throttle skips only a successful pull.** A coach flicking to another app
  and back is one glance, not five reads of the document, and a connection
  flapping at the edge of a field is not five either. A pull that *failed* sets
  no stamp, so coming back in range always retries. That retry is how a tablet
  booted with no signal — `loadedFor` unset, unable to push at all — finally
  reconciles without being restarted.

Verified through the app's own label, which is the only honest witness here:
Firestore's SDK reopens its own channel on both of these events, so counting
network calls says nothing about whether the app pulled. A foreground with the
throttle expired reads `saved → saving → saved`; a second one inside the window
does not move at all; one with `navigator.onLine` forced false does not move
either; and an `online` event after it pulls.

**The playbook screen says how old the last backup is**, past a week, in the bad
colour past two. Silent under that: a line which is always there is a line
nobody reads.

**One Firestore document holds 1 MiB, and the whole book is one document.**
Measured: a play with no freehand is about 1.3KB, one covered in it about 10KB —
`smooth` gives every point a control point, so a drawn point is four numbers.
That puts the ceiling near a hundred heavily drawn plays, which is far off but
not imaginary, and the trash only pushes toward it. The size is checked *before*
the round trip, because the app knows the cap as well as the server does, and
saying so itself beats a write that quietly never lands.

**"Offline" used to mean "something went wrong".** Anything that was not a
permission error was reported as offline, so a document over the cap showed a
connectivity message for a write no amount of signal would ever complete.
`explain()` now separates denied, too big, offline and simply failed, and the
label is red only for the states a coach has to act on — **offline is not one of
them**, because a field with no signal is the condition this app was built for
and colouring it red teaches everybody to ignore the colour by the second
practice.

**Signing out mints nothing.** It used to sign straight back in anonymously so
there was never a moment with nobody to save as — an account every time, and
since signing out is nearly always the first half of signing in as somebody
else, an account nobody would ever use again. Nothing is lost in the gap:
storage keeps the book and the uid it belongs to, and the next launch takes an
anonymous account only if one is genuinely needed.

**Every build says which build it is.** `__BUILD__` — short sha and build time,
substituted by Vite, logged as the first line in the console and printed at the
foot of Settings. A service worker means two devices can be running two
different bundles at the same moment, and with no stamp the only way to answer
"is this phone on the new code?" was an MD5 of the deployed asset against a
local build. An evening went into that question once.

**Recovering a stranded playbook.** The Admin SDK authenticates as the project
rather than as a user, so a document under an abandoned anonymous uid can be
read without signing in as anybody — which matters because nobody ever can. Every
uid is reachable through `listDocuments()` on `users`: it returns refs for uid
documents that do not themselves exist but carry a subcollection, which is
exactly the shape this app writes. Firestore's console has no per-document JSON
export, and `gcloud firestore export` writes LevelDB to a bucket, so a script is
the way out.

And **a rescue file is a snapshot, not the truth.** The device on the other end
keeps working while one is being assembled: pushing a union built ten minutes
earlier cost a coach two plays he drew in between and rolled a third back to an
older copy. Anything writing a book back has to merge against what is live at
the moment it writes, per play, exactly as the app does. The same goes for
nudging timestamps to win a comparison — doing that made a stale copy of a play
beat a real rename of it. Do not shift stamps; fix the merge.

## Several playbooks, and why nothing was migrated

The overhaul's stage 2, first slice. An account can hold more than one playbook
— `Book` in `domain/types.ts` — and the way that was added is the way
`Play.unit` was: **absence keeps its meaning.** A play with no `bookId` is in the
main playbook, which is every play saved before this existed. So there is no
migration: an existing book opens with every play where it was and not one of
them rewritten, and `tests/store/books.test.tsx` holds it to that byte for byte.

**The main playbook is implied.** It is on the list without being stored, until
it is renamed or deleted on purpose; `liveBooks()` is the one place that says
which books there are, and it never says none. `bookOf()` is the one place that
says which book a play or a folder is shown in: its own if that book is there,
otherwise the first one. A play whose book was deleted on another device, or
written by a build that has never heard of books, is **never hidden for want of
somewhere to put it**.

**A deleted book is a tombstone, and its plays go to a trash somebody can
open.** Two copies of an account merge by union, so a book missing from one side
is indistinguishable from one the other side has not heard of; `deletedAt` is
what says gone on purpose. Its plays are moved into the trash of the playbook
that is left, because a trash belonging to a book nobody can open is one nobody
can take a play back out of. The last playbook cannot be deleted.

**The list rides in the same document and the same storage key as the plays.**
`Playbook.books` in `store/sync.ts` — optional, merged newest-wins per book like
a play. A build from before this drops the list when it saves, and those builds
go on existing for as long as a service worker serves them. The plays keep their
`bookId` through it, so the worst an old build can do is lose a book's *name* on
a device that had no copy of its own. This is still one Firestore document with
its 1 MiB cap; per-play documents are the next slice.

**Which playbook is open is the device's business.** `chalk.book.current.v1`,
not in the book: the phone and the tablet can each be looking somewhere else.

**A play is moved by naming the play it lands before**, not by an index. An
index was an index into the whole array, and the screen shows one playbook of
several.

`Play.status` — idea, installing, game-ready — is set from the card's menu and
filtered on the playbook screen, which offers the filter only once some play has
one. Backups are version 2 and carry the book list; a version 1 file restores
exactly as it always did.

## One cloud document per play

Stage 2, second slice: `store/cloud2.ts`. The book was one Firestore document —
a megabyte for every playbook together, rewritten whole on every stroke. A play
is now its own document under a team:

    /teams/{teamId}                              books, folders, members, purges
    /teams/{teamId}/plays/{playId}
    /teams/{teamId}/plays/{playId}/revisions/{stamp}     the last ten
    /teams/{teamId}/purged/{playId}              last copy of an emptied play

A coach's own team has their **uid for its id**: no lookup to find it, and two
devices migrating at once write the same documents to the same place.

**It switches itself on, and nothing changes until the rules are published.**
Every reconcile calls `probe()`. `denied` means the `/teams` rules are not live:
the app stays on the single document exactly as before, and asks again next
time. The rules to publish are in `firestore.rules`; they have **not** been run
against a real Firestore or the emulator, only reasoned about. Publish them in
the console, then watch the sync label on one device before trusting it.

**Migration copies, verifies, and marks last.** Every play goes up with its id
and stamp untouched; the collection is read back and compared; only then is the
team document written, and that document is the marker. Cut short, there is no
marker and the next attempt writes the same plays again. If a play fails to
arrive nothing is switched over and the session carries on with the old sync.

**The old document is never written to again, and still read.** It stays as the
copy to go back to. A device on an old build goes on writing it, so it is read
on every reconcile — but merged only when its own `updatedAt` has moved past
`legacySeen`, or every folder deleted since the migration would come back out
of it on every sync.

**A push sends what changed, and never writes over a newer copy.** `known` is
each play's stamp as last seen in the cloud, kept per account in
`chalk.sync2.{uid}`. A play is sent when its stamp differs. Before writing, the
copy up there is read: if it is newer it is left alone, and it comes down on the
next pull. Otherwise it is kept as a revision first, at most one per play per
ten minutes.

**Nothing leaves the cloud by being left out of a save.** That was the shape of
every loss this app has had, and with one document per play it cannot happen:
the only thing that deletes a play document is `purge()`, which is handed the
plays a coach has just emptied from the trash, keeps a last copy of each, and
records them on the team document. That record is what stops another device
handing the trash back — which is the `it.fails` in the hook's tests, still
failing on the single document and passing here. So the shrink guard has no
equivalent in this file, on purpose.

**A delete and a put-back stamp the play.** They did not. Two copies merge by
the newer stamp, so a delete tied with the live copy on every other device and
lost, on both clouds.

**A pull asks for what changed since the last one**, less five minutes for a
clock that is behind. The first pull of a session asks for everything.

**Each play has its earlier versions on its card.** `HistoryDialog`, from the
card's menu. Restoring is a save, so what was on screen becomes the newest
revision and the toast's Undo takes it back. The list is empty on the single
document, which never kept revisions per play.

**Not done:** the roster, saved formations, hand-drawn routes and league rules
are still device-only. Moving them to the team needs a merge rule per item, or
an empty roster on a new tablet overwrites a full one.

## The second local copy

Stage 2, third slice: `store/deep.ts`. Local storage is still the floor and the
app still boots from it synchronously. It is also about five megabytes for the
whole origin, and when the book outgrew it `setItem` threw into an empty
`catch`: the session carried on and nothing drawn after that was on the device.

So the book is also written to IndexedDB, a moment after every save, and:

- **A full local storage loses nothing.** IndexedDB is asynchronous, so it
  cannot be the floor alone. When the whole book no longer fits, the stale
  whole copy is removed and a **journal** goes in its place, synchronously: the
  plays changed since IndexedDB last confirmed a save, the folders and books,
  and every play id so an emptied play stays gone. Journal plus IndexedDB is the
  book. The journal shrinks each time IndexedDB catches up.
- **A dropped local storage loses nothing.** The key *missing* with a book still
  in IndexedDB is the browser evicting it, and the book is put back. The key
  *present and empty* is a book emptied on purpose, and is left alone.
- **The first render past an overflow is stale, and must not be saved.**
  `hydrated` in the hook holds the autosave until `recover()` has brought the
  real book back, or the stale copy would overwrite the journal holding the
  newer one. Past an overflow `reconcile` reads the screen and not storage, for
  the same reason.

Anything that writes the book locally goes through `persist()`, not `writeLocal`.

## Kinds of football, and the sport module

The overhaul's stage 3. `src/sports/` is the boundary the next sport plugs into:
`SportModule` in `sports/types.ts` says what a sport supplies — a unit, a window,
a mark radius, and its variants — and `sports/football/` is the only one. The
rules that are only football's (holes, gaps, legality, the namer, every preset)
**stayed where they were under `domain/`**. Moving forty files to change no
behavior was not worth the churn; the module is what the app asks, not where
the files live. Basketball will be the test of whether the interface is right.

**Seven-man is the variant a play has when it says nothing.** `Play.variant`,
`Book.variant` and `Formation.variant` are all optional and absent means
seven-man — the same bargain as `Play.unit` and `Play.bookId`. Choosing 7-man
stores nothing (`variantKey`), so no play, book or saved formation from before
this was rewritten. A variant nobody has heard of reads as seven-man rather than
being refused.

**Seven-man is held to Settings; every other kind brings its own two numbers.**
`rulesFor(play.variant, settings)` is the one place that decides, and the editor,
the namer and the exporter all go through it. Players a side and the line
minimum come from the variant; which way the even holes run and the on-line
tolerance stay the coach's. A book that has run for two seasons on a house rule
keeps it.

**The play carries its kind, the book only says what the next play will be.**
Written at creation like the unit. Changing a playbook's kind changes nothing
already drawn — the men on a board were set out for one count.

**Formations and stars are per kind.** One list in one storage key, filtered by
`formationsFor()`; the editor holds `allFormations` and writes that back whole.
**Delete from `allFormations`, never from the filtered list** — writing the
filtered list back would erase every other kind's saved sets. The foundation key
carries the variant (`chalk.foundation.v1.eleven`); seven-man's key is the one
it always was.

**Every kind is drawn in the same 22-yard window.** An eleven-man set's wide men
stand at ±9.5 rather than ±20, and its line splits are 1.6 rather than 1.8 so a
tight end fits. That is how a playbook page draws them. A per-sport window is
stage 4's problem, where a court makes it unavoidable. `tests/sports/` holds
every built-in set to: the right head count, legal, nobody standing on anybody,
everybody a yard inside the board.

**Flag has no block tools and no stunt** (`Variant.blocking`), and its rush row
is three things: Pull flag, Contain, Spy. Pull flag is a `blitz` whose `preset`
is `pull-flag`; `AssignmentPath` caps that one with a drawn pennant instead of an
arrowhead. A preset rather than a new `AssignmentKind`, so the eraser, the
swatches and the exporter needed no teaching.

**The welcome screen is asked of a device with nothing on it, once.**
`shell/Welcome.tsx`, keyed on `chalk.welcomed.v1`. Any play, live or in the
trash, marks the device as welcomed without showing it. Its hooks sit above the
editor's early return in `App` — below it they are skipped when a play opens,
and React throws.

**`askChoice()`** in `ui/dialog.ts` is the third question the dialog can ask: a
few buttons, each with a line under it, and the tap is the answer.

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

**A restore writes only what the file actually carries.** The four local stores
were written unconditionally, so a file with no formations in it did not leave
them alone — it emptied them. That turned every partial file, and every book
rebuilt from the cloud (which holds plays and sections and nothing else), into a
quiet way to lose the saved fronts, the hand-drawn routes and the team sheet. A
restore replaces what the backup contains and has nothing to say about what it
does not.

**Both foundations go in the file.** `readFoundationId()` defaults to offense,
so the starred *front* was never in a backup at all — they are two independent
stars and carrying one of them looked exactly like carrying both.

The trash goes in too. A backup that quietly dropped what the coach had not
finished deciding about would be the loss this exists to prevent.

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

Signing out leaves nobody signed in rather than falling back to a fresh
anonymous account — see *The playbook, and how it syncs*. The playbook stays on
the device either way, but it is tagged with the account it belongs to, so the
confirm says which email it will come back under rather than promising it to
whoever signs in next.

Signing into an account that already exists is the other direction entirely: the
uid changes, and that account's playbook comes *down* and is merged, play by
play, with what is on this device. For a while the code pushed the device's book
over the account instead — see *The playbook, and how it syncs*, which is also where the
`ensureSignedIn` listener leak that minted 78 anonymous accounts is written up.

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
step with what the renderers reference. `PAPER_STRUCTURE` then overrides the
field itself for paper — white turf, black marks, grey yard lines — and the two
highlight washes go grey with it, because they are laid down at a tenth of their
alpha and a yellow wash prints as either nothing at all or a stain across the
routes drawn over it. Verified in-browser that custom properties do resolve
inside a rasterized SVG.

**Confirmed on paper, 2026-09-17.** A sheet off a real printer was the one
thing none of this could be checked against from here, and the whole ink
derivation was screen-measured until then. It came out right. Treat the numbers
in this section as load-bearing rather than provisional — if they are changed,
print another sheet, because a screenshot will not tell you.

**The ink is derived, not chosen — and why the yellow printed green.** There
used to be a second hand-picked palette beside the structural one, a fixed hex
per token. It had two faults. It ignored the swatches in Settings, so a coach's
own colours never reached paper at all; and the values did not hold their hue.
The block gold went from 46° to 36°, which is the hue of a paper bag, and the
lime route from 69° to 86°, which is the hue of grass — a coach printed a play
and asked why the yellow had come out green. `export/printInk.ts` derives each
ink from whatever is on the root instead, in OKLCH. The hue never moves. Then:

**Reach for saturation before reaching for darkness.** Both make a mark stand
out on white, and for a pale ink saturation is very nearly free — a fully
saturated yellow is *darker* than a washed-out one, so turning the chroma up
buys real contrast while the colour stays where it was. Darkening buys the same
contrast by walking the colour toward black, which for a yellow means olive and
then brown. So an ink that already reads on white is left exactly as chosen
(which is what keeps the soft violet and the soft pink soft); one that does not
gets the smallest chroma that does the job, at the lightness it had; and only a
hue with no strong ink at that lightness is allowed to come down.

The floor is **2:1, not 3:1**, and that is what lets a yellow stay yellow. 3:1
is the WCAG floor for a *user-interface* mark, where the thing being identified
might be a hairline and colour may not carry meaning. A route is a 3pt stroke of
strongly coloured ink read at arm's length. The extra stop is bought by
darkening, and darkening is the whole problem. The block gold prints `#d7b42e`
at 3:1 it printed `#ab9343`, which a coach called gold and did not want.

Two earlier attempts are worth not repeating. Pushing every ink to the gamut
edge turned the deliberately-muted option ink into a vivid cyan. Putting each
ink at its hue's most colourful lightness fixed the yellows but left the quiet
ones pale — hue 230 is a cyan-blue that peaks *light*, so it never darkened.

**Landscape widens the field, it does not just turn the paper.** The board on
screen is a fixed window, 22 yards across and 30 deep, because a phone is taller
than it is wide. Turning the page sideways left that window alone and put all
the extra room into white margins. Widening the window alone would not have
helped either: a board limited by its height is drawn at the same yards-per-inch
however much empty sideline is added, so you get a wider picture of the same
size play. `export/view.ts` computes the window from the plays themselves —
everything they draw, padded, floored at 24 by 20 so a goal-line play is not
blown up, then stretched (never cropped) to the proportions of the cell. Almost
no play uses all thirty yards of depth, and giving back the depth nobody runs
into is what actually makes the play bigger. `Field` takes the window as a prop
so the turf, the five yard lines and the hash marks reach the edge of it.

**The window leans toward the paper, it does not stretch all the way to it.**
Matching the cell's proportions exactly put a thirteen-yard play in the middle
of a thirty-seven-yard field: the yard lines ran to both edges of the sheet and
the play sat small in the middle of them, which is what a coach saw and called
too small. `STRETCH` caps the added grass at a quarter more than the play needs;
whatever shape is left over, `centreIn` centres in the cell and leaves white.
On paper that costs nothing — the turf is white too, so an unfilled margin reads
as no margin at all, where empty grass reads as a small play. That change alone
made a landscape sheet about a quarter bigger, and the floor came down with it
(`MIN`, 18 by 15) because every yard of floor past what the play uses is a yard
the play is shrunk to make room for.

A play is deeper than it is wide, so on landscape paper the **height** is what
limits it and the leftover width is unavoidable — it only fills when the play
itself is wide, which a spread formation is. The chrome subtracted from that
height is therefore the expensive part: margins are half an inch and a quarter
(`MARGIN`), and the name's band is 1.28× the letters rather than 1.5×. `Fill the
page` with Notes off gets a single play to within an inch of the paper on every
side, which is about the limit.

Putting the notes in the side gutter instead of a band beneath — buying the
height back — was tried and taken out. The gutter is about an inch and a
quarter, and notes are set one line each and ellipsized rather than wrapped, so
a column that narrow just cut them off. It needs a wrapping text setter first.

One window **per page**, shared by the plays on it: laid out side by side they
get compared, and a coach reading a split off two cells needs a yard to be a
yard in both. Per page rather than per document, because that is as far as the
comparison goes — sharing across the whole book meant one cover-3 with a deep
zone set the scale for every other page and drew the entire call sheet small.

`export/paper.ts` holds the page arithmetic and nothing else — no pdf-lib, no
React — because two things have to agree about it: the PDF, and the preview.
`layout()` resolves the paper, the margin, the running head, the grid and a box
per play, in **top-left** coordinates; `pdf.ts` flips to PDF space at the point
of drawing. `centreIn()` is the single place that decides where a board of a
given shape sits inside a cell, and `bestGrid` scores its candidates through the
same `fitAspect` — because the grid chooser and the layout both need that answer
and they must not disagree. They did: a landscape 4-up was scored with the old
fixed board shape, came out as four tall slivers, and was laid out four across
where 2×2 draws a play nearly twice the size.
The grid is worked out rather than written down: every exact
factorisation of the plays-per-page is tried and the one that draws the biggest
play wins, which puts two-up side by side on landscape and stacked on portrait
without either case being special. Whatever height a cell does not need is split
above and below it — four across a landscape page otherwise collects half the
paper at the foot and reads as though the printing was cut off.

`export/pdf.ts` composes with `pdf-lib`. There is **one** play composer,
`playSheetPdf`, and it is the only one. The install sheet, the call sheet, the
big-print cards and the playbook were the same page with different numbers in
it, and each carried its own copy of the arithmetic, which is why none of them
could be turned sideways and only one of them centred anything. They collapsed
into options. `singlePlayPdf` and `playbookPdf` survived a while as thin
wrappers and were deleted once nothing called them: the panel builds the folder
order itself, since it is the thing that knows what the coach filtered to.
Wristband strips and the team sheet are still their own functions — they are
lists, not plays, and have no orientation to choose. Every play is rasterized and
embedded **once** per document, at a resolution taken from the box it is
actually going into.

`export/PrintPanel.tsx` is the one screen for all of it: orientation, one to
nine a page, edge-to-edge, name size, with the page drawn underneath while the
options are changed and a full-screen proof. It reads the same `layout()` the
PDF does, so it cannot drift from the sheet. The editor's own Print opens the
same panel pointed at the one play — it used to be a button that wrote a
portrait sheet and gave no say in it, which was the printing complaint arrived
at from the other direction. Inside the drawer it takes no `onClose` and draws
no header of its own, the same bargain `SettingsPanel` strikes, and it hides
Per page and Folder order because one play has no grid and no folders.

**A sheet is named after what is on it.** `sheetName()` in `export/render.tsx`:
one play is called after the play, a run of plays after the folder they all came
out of, or after the book when they came from several, and a grid carries how
many are to a page. Every sheet used to be `chalk-plays-<date>.pdf`, so three
prints in an evening gave that name and two more of it with numbers in brackets
after it. The `Nup` matters — a call sheet and an install sheet of the same
plays on the same day are two different sheets and would otherwise collide. The
`slug()` beside it is shared with the editor's Save image rather than copied,
and caps the length, because a play named after the whole call was producing a
paragraph with an extension on the end. Same-day repeats of the *same* sheet
collide and Chrome appends a number, and that is **settled, not outstanding**: a
timestamp would fix it and make every name uglier, and the coach was asked and
said the numbers were fine. Do not add one.

**The preview must draw each board as an `<img>`, never as inline SVG.** An
exported board carries its own `<style>` block setting the print palette on
`:root`, which the moment it is inlined into the app is *the app's* root:
dropping three of them into the playbook turned every thumbnail on the page
white, turf and all. A data URL is its own document, and it is the same path
`svgToPng` already takes to the PDF.

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
    npm test                     # the unit suite, about three seconds
    npm run test:e2e             # the pen, in a real Chromium
    npm run typecheck            # src and tests together

## Tests

There were none until the overhaul began, and these notes said `erase.ts` was
tested when it was not. Run both suites before every deploy; `.github/workflows/test.yml`
runs them on every push.

**`tests/export/golden/*.svg` are what a play looks like, written down.** The
exporter draws with the same components as the board and the card, so six files
stand for all three. A diff in one is either a bug or a deliberate change to
what a coach sees — read it as one or the other before accepting it with
`npx vitest run -u`. The print ink snapshot is the palette a real printer
confirmed; if it moves, print a sheet.

**The fixtures have fixed ids.** The formation presets number their men from a
module counter, so a fixture built from them changes with the order tests run
in. `tests/fixtures/plays.ts` writes the board out by hand for that reason.

**`tests/fixtures/backup-v1.json` is never regenerated.** It is the promise the
new backup format has to keep. A fixture rebuilt from current code only proves
the code agrees with itself.

**No test can reach a real cloud.** `vitest.config.ts` aliases
`firebase/firestore` to an in-memory shim. An alias and not `vi.mock`, because
`sync.ts` loads Firestore lazily and twice at once, and under a module mock one
of those two loads was handed the real library. The browser tests abort every
request that is not to localhost, so a run mints no anonymous account.

**The pen is synthetic, and timed inside the page.** `tests/e2e/pen.ts` builds
pointer events to the shape the traces recorded. A whole burst goes in one
`page.evaluate`, because a bounce is a bounce by landing 14ms after the last
lift and a round trip to the runner takes longer than that. After any button
click a test waits 200ms before touching the board, or `tapGuard` rightly reads
it as that click's bounce. These prove the editor's decisions given that input;
the tablet is still the only witness to what the pen actually sends.

**`it.fails` marks a defect the suite found and nobody has decided about.** It
goes red the day the behavior changes, which is the prompt to make it an
ordinary test. One stands in `tests/store/usePlaybook.test.tsx`: emptying a
trash that holds more than half the book is the exact shape the shrink guard
refuses, so the push is blocked and the next pull merges the trash back in. Left
for the per-play documents of stage 2, which remove the cause.

The other thing that suite found — a book from another uid merging on sign-in —
was decided rather than fixed; see *The playbook, and how it syncs*.

**The bounce window and the device notes overlap.** `CHATTER_MS` is 120 and one
press is recorded as arriving within 150. A press whose last pair lands in that
30ms tail reads as the second tap and sets the man straight back down — pinned
on both sides in `tests/e2e/pen.test.ts`. Whether the pen really produces that
tail needs a trace before the number is touched, and the owner has parked that:
pen tracing has been finicky before and is not worth the time right now.

## The editor, in pieces

`PlayEditor.tsx` was 3,182 lines and is under 2,000. It still owns every piece
of state and everything the panels do; what it no longer holds is how a pointer
is read. Nothing a coach can see changed in the split, and the golden boards and
both test suites are what say so.

- `editor/gesture.ts` — the constants every pointer decision is made with, the
  shape of a thing in hand, and the decisions that need no board: is this
  contact a bounce, is the pen past the slop, where does a drag land, how far
  has the board slid, how does a route run deeper.
- `editor/pointer/` — everything the stage does with a pointer. `index.ts` is
  the dispatcher that `handleStageDown` and `handleMove` used to be; each tool
  keeps its own rules beside it: `pan.ts`, `erase.ts`, `ink.ts`, and `board.ts`
  for every tool that picks things up. `drag.ts` is where the thing in hand
  goes, shared by all of them — which is still what gives a zone, the cone and
  the board itself tap-move-tap, bounce-resume and one step of undo for free.
  `grab.ts` finds route handles and the washes, `pairs.ts` is the two-tap
  tools, `aim.ts` is the ring under a hovering pen.
- `editor/BoardLayers.tsx` — everything drawn on the board, back to front.
- `editor/LineInspector.tsx`, `editor/QuickBar.tsx`, `editor/drawerPrefs.ts`.

**The pointer modules are rebuilt on every render, from `EditorCtx`.**
`createPointer(ed)` is called at the foot of the component with the state, the
setters and the refs, so a handler sees exactly the board on screen. That is the
same thing the handlers were when they were closures inside the component; it is
written down now, in `pointer/context.ts`, as three kinds of thing: state, which
is a snapshot; refs, which are live; and the setters, which are the only way
anything changes the play.

**Anything that fires later than its event goes through `ed.live()`.** A timer
or a natively bound listener that calls a handler captured from an older render
acts on an older board. That was a real bug and not a theoretical one: the raw
pointer listener is bound once when the pencil comes out, the timer that ends a
stroke was set from it, and so a stroke ended by the pen going quiet was
committed — and its undo snapshot taken — against the board from before the
previous stroke. One step back removed two strokes. It only happened where
`pointerrawupdate` fires, which is a secure origin: the deployed app and never
the LAN. `pointerRef` in the editor holds the latest handlers for exactly this.

**Netlify credits are nearly out.** Test over the LAN, which costs nothing and
hot-reloads. Deploy **once per stage**, not per fix. A push to `main` triggers a
build.

**Firebase Hosting is set up but not switched on.** `firebase.json` and
`.firebaserc` describe the same site Netlify serves: `dist`, every path rewritten
to `index.html` so an address like `/play/abc` loads the app, hashed assets
cached for a year, and the service worker and the page itself never cached. It
covers hosting only — the Firestore rules are deliberately not in it, so a
deploy cannot publish rules by accident. Nothing has been deployed there. To try
it: `npm run build && npx firebase-tools deploy --only hosting`, signed in as
the project's owner. Netlify stays live until that has been checked on the
tablet.

`public/spen-test.html` deploys with the app at `/spen-test.html` — the stylus
diagnostic, and the reference for what this device will accept.
