# The Great Eggscape: working rules

A mobile-first physics game. A hill village is one Rube Goldberg machine: the player sets it
off, then has to ride the Egg King's cart through what follows, down to the Empress Hen.
Prototype stage: six streets ridden one after the other: Bell Tower Street, Powder Row,
Pudding Lane, Cauldron Gate, Rolling Pin Hill and Miller's Leap. Each asks something different
of the brake: wait for the tower, keep back from the powder, choose fire or water, come up to
the see-saw slowly enough to be on it when the cauldron lands, never touch it with the rolling
pin behind her unless she is out of its road, and on the last keep up with the stone and have
the brake off when the charge on the quay throws her over the gorge.

The first game (pick three machines, ride the Queen's gauntlet) is frozen on branch
`gauntlet` (tag `gauntlet-v1`) and published beside this one at `/gauntlet/`. Do not merge
it back or change it in passing; it is kept as it was on purpose.

## Core promises

- A street is one contraption: something to set off, a chain that follows, and a moment to
  arrive. Start, shot, chain, crossing and verdict fit in about twenty seconds, and a failed
  go restarts at once.
- Streets are stitched by a town gate (`STREETS` in `course.ts`). A street whose `roost` is
  null ends in phase `"through"`; the page draws a curtain, and the next street begins with
  the `Carry` of the last: shell, hay, rounds, eggs, knocks and speed. Nothing is topped up at
  a gate. A street must be playable from a fresh cart too (`?street=2`), and anything a street
  needs (a tower, a wain, a barricade) is optional in `CourseDef`, so the sim and the view
  build only what a street has.
- Setting off the chain is easy. Arriving at the right moment is the game. The bell tower
  takes about three seconds to fall; a cart that never brakes reaches the bank before it is
  down, and a cart that brakes arrives as it lands. `npx tsx scripts/window.ts` prints the
  outcome for every shot delay and brake setting; keep that window neither trivial nor a
  needle's eye.
- Each link is a simple, robust event, not a pile of free bodies. The tower is a kinematic
  body turned about its foot by a rod-pendulum rule and frozen where it lands; the bell is one
  dynamic ball; the wain is one body on a locked line; the mob, the pans and the whacks are
  state, not colliders. Loose rubble and flung cooks are spectacle in their own collision
  group and never touch the cart.
- The fallen tower must lie flush from bank to bank (`height` and `rest` in `course.ts` are
  derived from the canal, not typed in). `npx tsx scripts/lip.ts` measures the jolt of
  crossing it; it should stay under half a metre a second.
- Only a jolt hurts the King: shell damage comes from a sharp change in the cart's velocity
  (`feelJolt`), plus the fixed costs named in `game.ts` (a pan that lands, a whack from a
  cook he runs into). Hay takes every knock before the shell does, and the bales visibly go.
- Three verbs, two thumbs. One finger drags like a stick: sideways and the cart goes that way
  and keeps going until the finger lifts or comes back (`leanAt`). Dragging only steers. The
  brake is a toggle button, bottom left, the twin of Fire bottom right: tap it on, tap it off
  (the user found braking on the drag "muddled" with steering; do not put it back there). The
  brake is the only speed control: it is for slowing things down when the action is hot, and
  there is nothing faster than letting her run, except powder. A tap on a gold ring or the one
  Fire button shoots the gun; a tap or a second finger anywhere else throws an egg at what is
  under it (`View.pickAt`).
- The brake slows her and never stops her (`BRAKE_FLOOR`). There is no accelerator.
- One cart, three rounds to start with, no build screen. The gun reaches only what is lit (`GUN_RANGE`);
  every target wears a ring, faint out of range and gold within it.
- Two kinds of shot, and they must stay distinct. The rounds are for the rings: they work
  the machine, flatten a rank of cooks and breach a barricade. Eggs (`START_EGGS`) are for
  everything else: a tap on anything without a ring throws one at it, and it bursts over
  everything within `EGG_SPLASH`. An egg does less than a round on purpose: it knocks a thrown
  pan out of the air, puts cooks' heads down for a moment (`DUCK`) but never bowls them,
  sets off the village's clutter (`clutter` in `course.ts`: baskets, barrels, hen coops, the
  Queen's crown) and bursts a powder keg. Clutter is state plus spectacle props, like the
  mob; add more freely, but give each piece an effect a player can see.
- Both run out and both can be found again: a basket of eggs (`EGG_BASKET`, up to `MAX_EGGS`)
  or a pyramid of shot (`SHOT_PILE`, up to `MAX_AMMO`) in the road, each in a gold ring,
  taken by driving over it.
- Powder is the Queen's and it cuts both ways (`kegs` in `course.ts`). A keg in the road is a
  trap with a slow match: it wears a red ring as wide as its temper (`KEG_TRIP`) and goes off
  under a cart that comes inside it. A keg on the kerb is a link in a powder train. Any keg
  bursts when an egg, a round or another keg goes off beside it, and lights its neighbours a
  moment later (`KEG_FUSE`), so one egg can walk a whole row down the hill. A blast hurts the
  cart only inside `hurt`; kerb kegs are out of reach of a cart that keeps to the road. The
  powder wagon is the big one, and the only thing besides a round that shifts a barricade
  (`walls`). Kegs are state, not bodies.
- Powder behind her is a push (`KEG_KICK` in `game.ts`). A cart that is further down the
  street than a keg when it goes, and not far to one side, is thrown forward, up to
  `KICK_TOP`; inside the blast's `hurt` it is thrown and hurt both. With the brake on at that
  moment only `KICK_BRAKED` of the push gets through. A trap the cart tripped itself is only
  ever a blow. A keg with a `fuse` is a charge with a long match: an egg lights it instead of
  bursting it, a red ring closes on it as it burns, and gold arrows on the road past it mark
  where to be. This is the game's one way of going faster than the hill allows, and at
  `RAM_SPEED`, which only a kick reaches (`npm test` checks), she goes through cooks like
  skittles and the rest of their rank dive.
- Puzzles should have more than one way through, at different prices (the user asked for
  this). Pudding Lane is the pattern: the cistern (`cistern` in `course.ts`) costs a round and
  floods the lane, soaking every keg and sweeping every cook as far as it runs, including the
  charge that would have been useful; kept dry, the kegs must be woven through or burst with
  eggs, and the charge sends her through the shield wall. A shield wall (`shield` on a rank)
  throws nothing and is a wall: a slow cart is thrown back off it until a round opens it, an
  egg apiece ducks the cooks in the way, or she comes through on a blast.
  `npx tsx scripts/lane.ts` prints every way down it.
- The see-saw (`seesaw` in `course.ts`) is a lever and a rule, not a simulation of one. The
  plank is a kinematic slab over a trestle with its long arm down in the road; the cauldron is
  state that falls under gravity once its rope is shot (`crane` target). When it lands
  (`wham`), whatever is on the long arm is thrown: a keg goes `toss` metres down the street and
  bursts where it lands, taking a gate with it if it lands behind one; a cart is given
  `FLING_UP` and `FLING_ALONG` outright, which carries her over the kitchen wall into straw
  laid `deep`. A cart past the trestle tips the plank and is under the cauldron instead
  (`POT_DAMAGE`). After that the plank is firewood, either way. The gold bar across the road
  is drawn where cutting the rope works at any speed; on the brake the window is about 1.3 s,
  off it about 0.7 s. `npx tsx scripts/gate.ts` prints where she was when it landed for every
  way of going at it: keep the three ways (fly, send the keg, knock) all winnable, and keep
  flying the cheapest in rounds.
- A wall with a `gate` is stone: only the gate is a target and only the gate gives.
- The rolling pin (`pin` in `course.ts`) is state, not a body: it hangs on a gantry, is let go
  once the cart is `PIN_LEAD` past it, falls, and rolls down the street speeding up to
  `PIN_PACE`, which is faster than a cart runs and slower than one thrown by powder. It has the
  whole width of the street and stops for nothing: cooks are bowled, kegs in the road burst,
  barricades are breached, and a cart in its road is done (`rolled`). It never catches a cart
  that neither brakes nor is stopped, so what kills on this hill is the brake and whatever is
  standing in the road. A `square` is the one place out of its road: more street off to one
  side along one piece, its bottom corner cut off by woolsacks (`edgeAt` gives the drivable
  edge; `leanAt` lets the player steer out to it, and `hem` in `game.ts` has the men bring her
  back in along the sacks whatever the lean, so nobody is steered into a corner). Wheels do
  not take the square's walls for ground (`WALL_GROUPS`). `npx tsx scripts/pin.ts` prints
  every way down: keep both ways winnable (wait in the square on the brake and follow the pin
  down for nothing; or stay in front, a round for each rank and the barricade, thrown on by
  the powder it bursts behind her), and keep braking in the street fatal.
- The millstone (`mill` in `course.ts`) is driven, not left to roll: one ball, locked to its
  lane, held by the hill to `STONE_PACE`, which is a little more than the cart can make, so it
  always leads and what it will hit can be read from the top of the street. It bowls whoever
  is in its lane, bursts the kegs it passes, goes through a barricade, and falls where its
  lane runs out. Following in its wake costs one round for the whole hill.
- A piece of street may be broken off short of a kerb (`x0`/`x1` on a `Piece`): the collider,
  the kerbs and the drawing all stop where it does, and a cart that leaves it falls. The
  leap at the bottom of Miller's Leap is plain ballistics off such a stump, and the gorge is
  wider than the hill alone will carry her (about 11.5 m/s off the end is needed, and she
  makes about 9): it takes the charge on the quay going off behind her, with the brake off,
  and the right lane. `straw` marks where the landing is soft (`STRAW_TRAVEL`): there the
  springs take a drop that would crack him on cobbles. `npx tsx scripts/leap.ts` prints speed
  off the bridge, air and cost for every way of driving it, and for lighting the fuse early
  and late; keep that window forgiving (about a second and a half between too soon and too
  late) and keep "no charge" and "brake on at the blast" falling short.
- A street must be winnable from a fresh cart, so anything it cannot be won without is on it:
  Miller's Leap has a pile of shot at the top because the hoist needs one round.
- No cart may play itself, and no street may need a shot the player cannot see: `npm test`
  checks that an idle cart never gets home and that a sensible driver gets three stars.
- The village is the Queen's and the story is on the street: her kitchen mob with pans,
  rolling pins and egg beaters, the Queen on her balcony, the King's own people at the roost.
- Portrait and thumbs come first. The bottom of the screen is for dragging; Fire sits under
  the right thumb.

## Non-negotiable rules

- `src/sim` never imports PlayCanvas or touches the DOM. It must run headless in Node.
- `src/render` reads simulation state and events; it never moves bodies or changes rules.
- The simulation steps at a fixed `STEP` (1/60 s) and uses no wall clock and no
  `Math.random`, so a run replays exactly. Physics is the deterministic Rapier build
  (`@dimforge/rapier3d-deterministic-compat`).
- After changing physics constants or a street, run `npm test`, `npx tsx scripts/window.ts`
  and `npx tsx scripts/window.ts wain`; for Powder Row, `npx tsx scripts/trace.ts wagon`
  (also `train`, `rush`, `blind`); for Pudding Lane, `npx tsx scripts/lane.ts`; for Cauldron
  Gate, `npx tsx scripts/gate.ts`; for Rolling Pin Hill, `npx tsx scripts/pin.ts`; for
  Miller's Leap, `npx tsx scripts/leap.ts`.

## Commands

- Development: `npm run dev` (port 5180); `?auto` lets the test pilot drive
- Tests: `npm test`; full acceptance: `npm run check`
- Trace a run event by event: `npx tsx scripts/trace.ts [steady|idle|nowain|late|dawdle]`
- The timing window: `npx tsx scripts/window.ts [wain]`; the crossing: `npx tsx scripts/lip.ts`
- In a browser console, `__egg.step(seconds, { goal, brake, shoot })` drives the game where
  frames do not tick (a hidden tab); set `__egg.view.app.timeScale = 0` first.
- Sound is `src/audio.ts`: synthesised, no files, presentation only.
- Pages: `.github/workflows/pages.yml` builds `main` to the site root and tag `gauntlet-v1`
  to `/gauntlet/`.
