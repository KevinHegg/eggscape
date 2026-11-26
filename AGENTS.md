# The Great Eggscape: working rules

A mobile-first physics game. The player bolts three simple machines to the Egg King's cart
and rides it down a defended hill to the Empress Hen. Prototype stage.

## Core promises

- Only a jolt hurts the King: shell damage comes from a sharp change in the cart's velocity
  (`feelJolt`), plus the few fixed costs named in `game.ts` (arrows with no men left, a keg).
- The controls are the cart. Every button is a machine the player chose; there are no
  generic weapons. Three slots, six machines (`src/sim/parts.ts`).
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
- Trace a run: `npm run probe -- idle|right|left|hop [parts]`
