# The Great Eggscape: working rules

A mobile-first physics game. The Egg King falls through the Queen's kitchen by himself, and the
player's only move is to tap a place and have a straw bale thrown there. Prototype stage: one
room, The Larder, built to find out whether that one verb is fun.

Two earlier games are frozen and published beside this one. Do not merge them back or change
them in passing; they are kept as they were on purpose.

- `gauntlet` (tag `gauntlet-v1`), at `/gauntlet/`: pick three machines, ride the Queen's gauntlet.
- `streets` (tag `streets-v1`), at `/streets/`: six streets ridden in a cart with a gun, eggs
  and a brake. The user's verdict on it: "like so many different games". That is the thing
  not to do again.

## Core promises

- One input, one rule. The input is a tap that throws a bale; the rule is that only a sharp
  knock against something hard hurts him. Do not add a second control, a second kind of shot
  or a second way of being hurt without the user asking for it.
- He is never steered. He moves by gravity and by what the machine does to him.
- A bale takes `BALE_FLIGHT` to arrive. That delay is where the skill is: lead him.
- One bale, three jobs, and a room should ask for all three: a cushion (soft things waive the
  knock; a landing of `BURST` or more bursts the bale), a weight (a see-saw), and a stopper (a
  hole to the pan). Bales are few (`bales` in `LevelDef`), so one spent on safety is one not
  there later.
- A wrong turn ends in a frying pan (`pits`); the right way ends in the Empress Hen's nest.
- Each link is a simple, robust event, not a pile of free bodies doing whatever they like.
  The see-saw was first built as a jointed plank that really threw the egg, and the throw was
  different every time. Now the plank is a body that cannot move, only turn about its pivot,
  and the throw is a rule: when the seat end comes up against its stop, whoever is in the
  seat leaves in the direction `cast`, at `FLING_GAIN` times the speed the bale came down on
  the other end with. So the height a bale is dropped from is the strength of the throw, and
  it is the same every time. `npm test` checks that it rises with height and that the band of
  heights that work is wide.
- The egg is egg-shaped (`eggOutline`) and rolls end over end, which is most of his charm. He
  will lie still on a slope gentler than about twelve degrees, so floors he is meant to roll
  down fall at about twenty, and a floor he is meant to stop on is a seat (which holds him)
  or flat. Do not give him a flat side: a hull of two balls had one, and he parked on it.
- A place a bale is meant for is a socket (`sockets`): a tap near it is taken to mean exactly
  there, because a finger is not exact. A socket with a `seat` also sets the bale's height
  and tilt, so it drops in flush. Check with `game.aim()` that the seat reads as free.
- A cook has him if he gets nowhere for `IDLE` seconds: measured by how far he has moved, not
  by speed, so rocking on the spot counts as stopped.
- A failed go restarts at once, and a whole room is about a quarter of a minute.
- Puzzles should have more than one way through, at different prices (the user asked for
  this of the last game, and it still holds).
- Portrait and one thumb come first. The whole room should fit on a phone without scrolling
  where it can; a taller machine scrolls with him.
- The look is the toy theatre: chunky shapes, warm light, a medieval kitchen, the Egg King with
  his crown and sash, the Queen's cooks, the Empress Hen.

## Non-negotiable rules

- `src/sim` never imports PlayCanvas or touches the DOM. It must run headless in Node.
- `src/render` reads simulation state and events; it never moves bodies or changes rules.
- The simulation steps at a fixed `STEP` (1/60 s) and uses no wall clock and no
  `Math.random`, so a run replays exactly. Physics is the deterministic Rapier build
  (`@dimforge/rapier3d-deterministic-compat`), with every body held to the plane z = 0.
- After changing physics constants or a room, run `npm test` and trace a run or two with
  `npx tsx scripts/kitchen.ts`.

## Commands

- Development: `npm run dev` (port 5180); `?auto` lets the scripted player play
- Tests: `npm test`; full acceptance: `npm run check`
- Trace a run event by event: `npx tsx scripts/kitchen.ts [time:x,y ...]`
- In a browser console, `__egg.step(seconds, { x, y })` drives the game where frames do not
  tick (a hidden tab); set `__egg.stage.app.timeScale = 0` first, `__egg.restart()` to begin.
- Sound is `src/audio.ts`: synthesised, no files, presentation only.
- Pages: `.github/workflows/pages.yml` builds `main` to the site root, tag `streets-v1` to
  `/streets/` and tag `gauntlet-v1` to `/gauntlet/`.
