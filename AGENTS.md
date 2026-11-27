# The Great Eggscape: working rules

A mobile-first physics game. The Egg King falls through the Queen's kitchen by himself, and the
player's only move is to tap a place and have a straw bale thrown there. Prototype stage: five
rooms, The Larder, The Scullery, The Mill, The Buttery and The Cistern, built to find out whether that one verb is fun,
how one room hands him on to the next, and whether a room can bring a new contraption without
a new control. The user's verdict on the Larder alone: "This is good."; on the first two
rooms: "These are playing well."

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
  not by new controls. But a thing the player has to do must be seen and must be possible.
  The user, of the Scullery's first gap: "There's very little time to plug the hole,
  especially because you can't see what's going on." It now gives about two seconds, not one.
- Each new room brings a new contraption that the same bale works. The user: "ultimately
  we're gonna need more than just levers that toss the egg through the air", and suggested a
  water wheel that is stuck and a bale that releases the water. The Mill is that: a bale on
  the pan of a sluice lever (`WheelDef.pan`) lets the water in, `RACE` seconds later it is on
  the wheel, and the wheel then turns at `WHEEL_TURN` and carries him over. Dry, the wheel is
  loose on its axle and his own weight turns it the wrong way, into a pan. What building it
  taught:
  - Nothing he could come to rest on may be within reach of a paddle. A shelf beside the
    wheel caught him, and the next paddle came down and pinned him there for good. Now the
    wheel drops him, on to a bed of straw well below it.
  - Paddles are slippery (`setFriction(0.2)`, combined by the lesser). Between two rough ones
    he wedged like a cork and went all the way round into the pan.
  - A paddle sometimes meets him at the lip and carries him clean over the top, so a splash
    board hangs beside the wheel to bring him down on the straw anyway.
  - A wheel with the water on it counts as soft, like straw. He lands in it hard enough to
    crack otherwise, and nobody thinks of water as a knock.
  - The time the wheel has him is time for the player to get ready for what follows. A room
    can use a contraption's own slowness that way.
- When he is caught, it is by the Queen's hook: a wooden claw on a rope that comes down from
  the top of the house, closes on him and hauls him out through the top. The user, of the
  cook that used to walk on: "it takes too long for the cook to come along and the visuals
  are not that compelling", and asked for "those metal hooks that you find at grocery stores
  that children use to try to capture a toy". `game.hook` is how far down it is (0 to 1) and
  the view only draws that, so the player sees it coming. It comes for him after `IDLE`
  seconds of going nowhere (`SEAT_IDLE` in a see-saw's seat, where waiting is the game), or
  `CAGE` seconds in a cage (`cages`), which is a place that means he has been had.
- Timing can be the puzzle. The user: "you need to time the dropping of the bail, so if you
  wait until the egg comes to rest, the egg will run A different direction and end up
  trapped." The Scullery's second see-saw is that (`pass: true`): its cushion has no lip, he
  crosses it at a fixed `CRAWL` and goes off the end into a cage, and a bale on the gold end
  while he is on the cushion throws him clear. What building it taught:
  - Everything about it is a rule, or the window moves about: the crawl is a set speed while
    he is over the cushion (damping gave a different dwell every time), the plank goes over
    at once when a bale touches it (`SNAP`, set once: setting it every step batted him), and
    the throw is one speed (`throw`), not the bale's.
  - The gold arm is longer than a bale, or the bale props itself on the floor beside it.
  - Tap to throw is about 1.2 s, so the window has to open before he is on the cushion and
    still be open a second after: it is two seconds and more, and `npm test` holds it there.
  - Test it with him arriving in more than one way (a cushion bale that burst, one that did
    not): he comes on a fifth of a second apart.
- A hole he must not jump is cut level, with upright sides (`DRAIN`). On a sloping floor he
  cleared an open hole about two times in five after a long fall.
- The Buttery's contraption is a revolving door (`DoorDef`), from the user: "a revolving door
  that lets the egg out in different places depending on some action the user takes". A
  drum, open at the top, with shutters right, bottom and left (`SHUTTER`). It turns at
  `DOOR_TURN` once he is in it; a bale on the brake's pan stops it at the next quarter and
  opens that quarter's shutter. So when the bale lands is where he comes out. The first
  version let him out on the left for one well-timed bale, and the user said: "room four is
  too easy. We need the spinning wheel to be more puzzling." Now the left-hand shutter, the
  way to the roost, is barred (`DoorDef.bar`), and the bar is roped to a red board outside
  the right-hand shutter that only his own weight works. So he goes out on the right, into
  the seat of a see-saw in the corner, is thrown back up through a one-way flap (`FlapDef`)
  on to a shelf that runs down into the top of the door, goes round again, and is let out
  on the left. Three bales (brake, see-saw, brake) and one loop; nothing shorter gets him
  home, and `npm test` holds that. What building it taught:
  - Where the door stops is counted from where the leaves stood when he came in
    (`gate.wound`), not from where they began: the second time round they have already
    been a quarter.
  - Coming back in at the top starts it again: the shutter comes down, the brake comes
    off, and the bale that was on its pan is thrown away (`release`).
  - A see-saw with `throw` set always throws alike, from the middle of its seat, and its
    lip is taken out of his way while it does: coming round behind him it batted him off
    line every time. Switch a collider on a moving body off with its collision groups;
    `setEnabled(false)` left its contacts in place for a step.
  - The plank's weight (a ball on the pivot that touches nothing) still answered shape
    queries, so `free` called every seat beside a pivot taken. They are skipped now.
  - The door is moved, not pushed: a kinematic body turned a set angle each step, stopped
    exactly on a quarter. A free one never stopped where it was meant to.
  - Its leaves are quilted (soft). He drops into it hard enough to crack otherwise.
  - A brake put on before he is in still has to let him out: it stops at the first quarter.
  - With no brake he would ride for ever, so the clockwork runs down after `DOOR_LAPS` with
    him at the top, which is shut below him, and the hook has him.
  - No bale may be thrown into the drum (`free` refuses it).
- The Cistern's contraption is water (`TankDef`). The sluice lets it in and it rises at
  `RISE` to the lowest way out: a spout low in one wall, which runs to a pan, or, with a
  bale stood on end in the spout, the top of the other wall, which is the way to the nest.
  A bale in it floats, by rule: it is held in the middle, carried up with the water, and
  at a way out it leans so that he rolls off. An egg does not float. So: a bale in the dry
  cistern before he drops in (cushion, then raft), a bale in the spout (stopper), and a
  bale on the sluice pan (weight). The catch is the order: a raft with nobody on it does
  not wait at a way out, the water takes it (`WASH`), so the water has to be kept back
  until he is aboard. That stops all three being thrown at once. Three shelves bring him
  to it, which is the time there is to set up. Bales in a cistern do not burst.
- A bale that bursts under him goes on breaking his fall for `STRAW_GRACE`: without that, he
  dropped through the place where it had been and cracked on the floor he had just been
  saved from.
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
- Getting nowhere is measured by how far he has moved, not by speed, so rocking on the spot
  counts as stopped. Being carried round in a door does not.
- A failed go restarts the room at once, and a whole room is about a quarter of a minute.
- Puzzles should have more than one way through, at different prices (the user asked for
  this of the last game, and it still holds).
- Portrait and one thumb come first. The whole room should fit on a phone without scrolling
  where it can; a taller machine scrolls with him.
- Nothing is drawn over the top of the room. The user, three times: "The controls at the
  top really obscure what's happening there"; of the Mill, "the placement of the bail to
  release the water is barely visible because of the controls"; and after the bar had been
  made smaller, "The top is still obscured. I wonder if we can hide the progress bar, the
  replay button and the sound button while the game is happening or transitioning." So
  there is no bar. While he is on his way down the shell and the bales left are a small
  pill at the bottom left (`#tally`); the sound button is on the cards and the bar he is
  let go from; starting again is on the result card (and the R key). The room's number and
  its bales are on the bar he is let go from. When a card is up the view is held so that
  he and the hatch below are both seen above it (`stage.hold`).
- The look is the toy theatre: chunky shapes, warm light, a medieval kitchen, the Egg King with
  his crown and sash, the Queen's cooks and her hook, the Empress Hen.
- Everything soft looks like the bales: gold, strapped, with stalks sticking out of it (the
  `bed` and `nest` looks). Flour sacks drawn as pale lumps were soft too, and the user saw
  them as "the row of eggs", which "doesn't really read as a soft landing spot". Nothing soft
  is to be round or pale again.
- The way from one room to the next is to be seen. The user: "The down he goes dialog between
  floors hides the movement of the egg king from the bottom one to the top of the next
  scene." So while a card is up over a nest, the camera looks lower (`stage.hold`) and shows
  him on it, with the hatch below; and when he is sent down he hops out past the edge of the
  floor and drops to the hatch in front of everything (`ARRIVE`), and only then can he be let
  go.

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
- Trace a run event by event: `npx tsx scripts/kitchen.ts [room=scullery|mill|buttery|cistern] [time:x,y ...]`
  (heights as if the room stood where the Larder does)
- In a browser console, `__egg.step(seconds, { x, y })` drives the game where frames do not
  tick (a hidden tab); set `__egg.stage.app.timeScale = 0` first, `__egg.restart()` to begin,
  `__egg.enter(1)` to sit him in the second room, `__egg.descend()` to leave a roost. Here
  `y` is the house's own height: each room is a `STOREY` (18) lower than the one above.
- Sound is `src/audio.ts`: synthesised, no files, presentation only.
- Pages: `.github/workflows/pages.yml` builds `main` to the site root, tag `streets-v1` to
  `/streets/` and tag `gauntlet-v1` to `/gauntlet/`.
