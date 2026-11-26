# The Great Eggscape: working rules

A mobile-first physics game. The player bolts three simple machines to the Egg King's cart
and rides it down a defended hill to the Empress Hen. Prototype stage.

## Core promises

- Only a jolt hurts the King: shell damage comes from a sharp change in the cart's velocity
  (`feelJolt`), plus the few fixed costs named in `game.ts` (arrows with no men left, a keg).
  The cart is sprung: coming down wheels first, the springs take the first of a landing.
- Hay is the cushion. The King rides packed in bales (two to start, four at most); every
  knock comes out of the hay before it reaches the shell, and the bales visibly go.
- Three verbs, two thumbs. One finger drags: the cart follows it across the road
  (`leanToward`), and pulling down puts the brake on. A tap, a second finger, or the one Fire
  button shoots. There are no other buttons in a run.
- The brake slows her and never stops her (`BRAKE_FLOOR`). There is no accelerator: a cart
  has a brake, not an engine.
- The machines are the build, not buttons. Three of six (`src/sim/parts.ts`), each working by
  itself and each showing its state on the cart: the roof loses a plank per blow, the batting
  arm hangs slack until it is cocked again.
- No build may play itself. Each bridge has lost a side, so every cart must be steered onto
  what is left of it; `npm test` checks that an idle cart never gets home.
- The gun is fed from the road. It fires only what the rack holds, at the one target the sim
  has laid it on (`Game.target`: the nearest tower ahead, or a standing wall unless the cart
  has a plough). Shot comes from pickups; a keg goes to the front of the rack.
- One threat to read at a time: after one tower starts, the next waits (`LULL`). Every threat
  is the same thing to the player, a red ring on the road that fills: stones a small one,
  arrows a wide one. Be out of it, or brake and let it land ahead.
- The story is on the verges: the King's subjects stand by what they left him, the Queen's
  men camp round her towers. Roadside figures, stray shots and rubble are spectacle and never
  touch the cart (rubble is in its own collision group).
- Jumps are cut to the flight of a free-rolling cart (`leap()` in `course.ts`), with the hill
  starting close under the lip, so a slower, braked cart drops onto it early and softly.
  Nothing makes a cart faster than free-rolling. Change a run-in or the drag and the hills
  must be re-cut; `npx tsx scripts/jumps.ts` shows air time and damage at three brake settings.
- Portrait and thumbs come first. The bottom of the screen is for dragging; Fire sits under
  the right thumb.

## Non-negotiable rules

- `src/sim` never imports PlayCanvas or touches the DOM. It must run headless in Node.
- `src/render` reads simulation state and events; it never moves bodies or changes rules.
- The simulation steps at a fixed `STEP` (1/60 s) and uses no wall clock and no
  `Math.random`, so a run replays exactly. Physics is the deterministic Rapier build
  (`@dimforge/rapier3d-deterministic-compat`): the ordinary build gives a different pile-up
  for the first world made in a process.
- After changing physics constants or the course, run `npm test` and
  `npx tsx scripts/builds.ts`: an idle cart must fail and a sensible driver must get home.

## Commands

- Development: `npm run dev` (port 5180); `?auto` lets the test pilot drive
- Tests: `npm test`; full acceptance: `npm run check`
- Trace a run event by event with the test pilot: `npx tsx scripts/trace.ts lever,wedge,plane [idle]`
- Speed down the bare road: `npm run probe -- [brake 0..1]`; steering response:
  `npx tsx scripts/steer.ts`; the jumps: `npx tsx scripts/jumps.ts`
- Sound is `src/audio.ts`: synthesised, no files, presentation only.
