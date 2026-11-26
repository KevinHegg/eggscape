# The Great Eggscape: working rules

A mobile-first physics game. The player bolts three simple machines to the Egg King's cart
and rides it down a defended hill to the Empress Hen. Prototype stage.

## Core promises

- Only a jolt hurts the King: shell damage comes from a sharp change in the cart's velocity
  (`feelJolt`), plus the few fixed costs named in `game.ts` (arrows with no men left, a keg).
  The cart is sprung: coming down wheels first, the springs take the first of a landing.
- The controls are the cart. Three buttons are machines the player chose (three slots, six
  machines, `src/sim/parts.ts`). The fourth is the gun every cart carries.
- The gun is fed from the road. It fires only what the rack holds, at the one target the sim
  has laid it on (`Game.target`: the nearest tower or standing wall ahead). Shot comes from
  pickups; a keg goes to the front of the rack. No ammunition, no shot.
- The story is on the verges: the King's subjects stand by what they left him, the Queen's
  men camp round her towers. Roadside figures, stray bombard shots and rubble are spectacle
  and never touch the cart (rubble is in its own collision group).
- Jumps are cut to the flight of a rolling cart (`leap()` in `course.ts`). Change a jump's
  run-in or the drag and its landing hill must be re-cut; `npx tsx scripts/jumps.ts` shows
  air time and damage on a bare road.
- Every threat announces itself before it lands: a wind-up, and a marker on the road.
- Leaning is loose on purpose, and weaker with fewer King's men aboard.
- Portrait and one thumb per hand come first. Controls live in the bottom bar.

## Non-negotiable rules

- `src/sim` never imports PlayCanvas or touches the DOM. It must run headless in Node.
- `src/render` reads simulation state and events; it never moves bodies or changes rules.
- The simulation steps at a fixed `STEP` (1/60 s) and uses no wall clock and no
  `Math.random`, so a run replays exactly.
- After changing physics constants or the course, run `npm test` and
  `npx tsx scripts/builds.ts`: an idle cart must fail and a sensible driver must get home.

## Commands

- Development: `npm run dev` (port 5180); `?auto` lets the test pilot drive
- Tests: `npm test`; full acceptance: `npm run check`
- Trace a run: `npm run probe -- idle|right|left|hop [parts]`, or event by event with the
  test pilot: `npx tsx scripts/trace.ts lever,wedge,plane [idle]`
- Sound is `src/audio.ts`: synthesised, no files, presentation only.
