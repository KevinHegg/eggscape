# The Great Eggscape: working rules

A mobile-first physics game. A hill village is one Rube Goldberg machine: the player sets it
off, then has to ride the Egg King's cart through what follows, down to the Empress Hen.
Prototype stage: one street, Bell Tower Street.

The first game (pick three machines, ride the Queen's gauntlet) is frozen on branch
`gauntlet` (tag `gauntlet-v1`) and published beside this one at `/gauntlet/`. Do not merge
it back or change it in passing; it is kept as it was on purpose.

## Core promises

- A street is one contraption: something to set off, a chain that follows, and a moment to
  arrive. Start, shot, chain, crossing and verdict fit in about twenty seconds, and a failed
  go restarts at once.
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
  and keeps going until the finger lifts or comes back (`leanAt`); pulling down puts the
  brake on. A tap on a gold ring or the one Fire button shoots the gun; a tap or a second finger
  anywhere else slings a stone at what is under it (`View.pickAt`).
- The brake slows her and never stops her (`BRAKE_FLOOR`). There is no accelerator.
- One cart, three rounds, no build screen. The gun reaches only what is lit (`GUN_RANGE`);
  every target wears a ring, faint out of range and gold within it.
- Two kinds of shot, and they must stay distinct. The three rounds are for the rings: they
  work the machine. The sling's stones (`START_STONES`) are for everything else and are never
  needed to get home: a tap on anything without a ring slings one at it. A stone knocks a
  thrown pan out of the air, puts a cook's head down for a moment (`DUCK`), and sets off the
  village's clutter (`clutter` in `course.ts`: baskets, barrels, hen coops, the Queen's
  crown). Clutter is state plus spectacle props, like the mob; add more freely, but give each
  piece an effect a player can see.
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
- After changing physics constants or the street, run `npm test`, `npx tsx scripts/window.ts`
  and `npx tsx scripts/window.ts wain`.

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
