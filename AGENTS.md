# The Great Eggscape: working rules

A mobile-first physics game. The Egg King falls through the Queen's kitchen by himself, and the
player's only move is to tap a place and have a straw bale thrown there. Prototype stage: two
rooms, The Larder and The Scullery, built to find out whether that one verb is fun and how one
room hands him on to the next. The user's verdict on the Larder alone: "This is good."

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
- A wrong turn ends in a frying pan (`pits`; one may be `hung` under a gap in a shelf); the
  right way ends in the Empress Hen's nest.
- The house is one tall building, and it plays as a chain of short rooms. The user: "It would
  be harsh to play for a long time in a single long vertical scroller and then have to start
  over. We would need way points." So every room ends on a roost (`ends: "roost"`), which is
  the waypoint, and a failure never costs more than the room it happened in. Each room is a
  `Game` of its own with its own bales, and he arrives mended; nothing carries over but the
  stars. `LEVELS` is the house from the top down: a room is written as if it stood where the
  Larder does and then `lowered` a `STOREY`, so the view can show the house as one and pan
  down it. The room below starts on a hatch under the roost above (`hatch`), and waits for
  the player to let him go.
- Rooms get harder by asking for more in less time and with less to spare (`bales`, `spare`),
  not by new controls. The Scullery's first bale has to be thrown inside about a second.
- Each link is a simple, robust event, not a pile of free bodies doing whatever they like.
  The see-saw was first built as a jointed plank that really threw the egg, and the throw was
  different every time. Now the plank is a body that cannot move, only turn about its pivot,
  and the throw is a rule: when the seat end comes up against its stop, whoever is in the
  seat leaves in the direction `cast`, at `FLING_GAIN` times the speed the bale came down on
  the other end with. So the height a bale is dropped from is the strength of the throw, and
  it is the same every time. `npm test` checks that it rises with height and that the band of
  heights that work is wide. The seat's pad is flush with the plank: a pad that stood proud
  of it left a step by the pivot, and about one arrival in eight he stopped against that
  step instead of rolling down into the seat. A test samples arrivals for this.
- The egg is egg-shaped (`eggOutline`) and rolls end over end, which is most of his charm. He
  will lie still on a slope gentler than about twelve degrees, so floors he is meant to roll
  down fall at about twenty, and a floor he is meant to stop on is a seat (which holds him)
  or flat. Do not give him a flat side: a hull of two balls had one, and he parked on it.
- A place a bale is meant for is a socket (`sockets`): a tap near it is taken to mean exactly
  there, because a finger is not exact. A socket with a `seat` also sets the bale's height
  and tilt, so it drops in flush. Check with `game.aim()` that the seat reads as free. A
  floor a bale only just fits on, such as the one under a long drop beside a see-saw's seat,
  wants a socket too, or a bale put a little to one side ends up propped on the seat.
- A cook has him if he gets nowhere for `IDLE` seconds: measured by how far he has moved, not
  by speed, so rocking on the spot counts as stopped.
- A failed go restarts the room at once, and a whole room is about a quarter of a minute.
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
- Trace a run event by event: `npx tsx scripts/kitchen.ts [room=scullery] [time:x,y ...]`
  (heights as if the room stood where the Larder does)
- In a browser console, `__egg.step(seconds, { x, y })` drives the game where frames do not
  tick (a hidden tab); set `__egg.stage.app.timeScale = 0` first, `__egg.restart()` to begin,
  `__egg.enter(1)` to sit him in the second room, `__egg.descend()` to leave a roost. Here
  `y` is the house's own height: the second room is a `STOREY` (18) lower.
- Sound is `src/audio.ts`: synthesised, no files, presentation only.
- Pages: `.github/workflows/pages.yml` builds `main` to the site root, tag `streets-v1` to
  `/streets/` and tag `gauntlet-v1` to `/gauntlet/`.
