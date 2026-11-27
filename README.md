# The Great Eggscape

*The Queen wants an omelette. The Egg King wants his mother.*

A mobile-first physics game. The Egg King falls through the Queen's kitchen by himself: off
shelves, down drops, on to see-saws, past holes that lead to her frying pan. All the player can
do is have a straw bale thrown in: **tap, and a bale lands there a moment later.** Straw is
soft. Nothing else in a kitchen is, bar water.

This is a third try at the game, and so far it is four rooms, one under another: **The
Larder**, **The Scullery**, **The Mill** and **The Buttery**. They were built to find out whether throwing
bales is fun, how one room hands him on to the next, and whether each room can bring a new
contraption without a new control. The house is one tall building and he falls down through it, but each room is a
short game of its own: at the bottom of a room a hen keeps a **roost**, and once he is on it he
is safe. Whatever happens further down, he starts again from the roost above, mended and with
a fresh stack of bales. The Empress Hen is at the bottom of the last room.

The two earlier games are kept as they were and published beside
this one: the six streets ridden in a cart (branch `streets`, tag `streets-v1`, at `/streets/`)
and the Queen's gauntlet (branch `gauntlet`, tag `gauntlet-v1`, at `/gauntlet/`).

## Play

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5180](http://127.0.0.1:5180). Add `?auto` to watch the house played
properly.

- **Tap** anywhere in the kitchen and a bale is thrown there. It takes about half a second to
  arrive, so tap where he is going to be, not where he is.
- **Press and slide** to see where the bale will go before you let go.
- A few bales a room: five or four. **↻** (or **R**) starts the room
  again at once; **M** mutes the sound.
- At the top of a new room he sits on a hatch until you let him go, so there is time to look
  the room over first.

One bale does three jobs:

1. **A cushion.** Whatever he lands on that is straw or sacks does not hurt him. A bale that
   takes a hard landing bursts, and is gone.
2. **A weight.** Dropped on the gold end of a see-saw it throws whoever is sitting on the other
   end. The higher it falls from, the harder the throw: too low and he goes nowhere, too high
   and he meets the far wall.
3. **A stopper.** Dropped in a hole in the floor, or a gap in a shelf, it fills it, and he
   rolls over the top instead of down into the pan.

The Scullery has a see-saw that will not wait for him. He crawls across its red cushion and off
the far end into a cage; a bale on its gold end while he is still on the red throws him clear.
Too soon and the plank has gone over before he gets there; too late and he is in the cage.

The Mill has a water wheel in it, and the wheel is dry. A dry wheel is loose on its axle: it
gives under him and lets him down into a pan. A bale on the gold pan of the sluice lever (a
weight again) lets the water in, and a moment later the wheel is turning the other way and
carries him over the top. While it has him there is time to get ready for what comes after.

The Buttery has a revolving door in it: a drum with one way in, at the top, and three shutters,
right, bottom and left. It starts turning once he is inside. A bale on the gold pan of its brake
stops it at the next shutter, and that shutter opens. Right is a long way home that costs two
more bales; bottom is the pan; left is a straight drop into the nest. Leave it and the
clockwork runs down with him back at the top, where the hook can reach.

- **Only a knock hurts him.** His shell cracks when his velocity changes sharply against
  something hard. Two cracks he can carry; the third, or one great fall, is the end of him.
  Straw is soft wherever it is: in a bale, in a bed on a floor, banked up a wall. So is a
  wheel with the water running on it.
- **The Queen's hook has him if he stops.** It comes down from the top of the house like the
  claw in a fairground machine, and you can see it coming: four seconds of going nowhere, or
  a second and a half in a cage. It waits longer while he sits in a see-saw's seat.
- **Stars**, for each room: get him through; not a crack on him; bales to spare (two in the
  Larder and the Buttery, one in the Scullery and the Mill).

## Development

```bash
npm run typecheck
npm test                         # headless: winnable, not by doing nothing, replays exact
npx tsx scripts/kitchen.ts       # one run, event by event; throws as time:x,y
                                 #   npx tsx scripts/kitchen.ts 1.2:2.9,22.8 2:-1.1,18.9 4.8:0,24.2
                                 #   npx tsx scripts/kitchen.ts room=scullery 0.3:1.3,28.5 2.7:-3,24
                                 #   npx tsx scripts/kitchen.ts room=mill 0.3:1.75,30 2.7:3.2,21.2 4:0.6,19.2
                                 #   npx tsx scripts/kitchen.ts room=buttery 5.6:2.75,28.6
npm run build
npm run check                    # typecheck, tests and build
```

```
src/sim/      rules and physics, headless (Rapier 3D held to one plane, fixed 60 Hz, no DOM,
              no Math.random)
  kitchen.ts    the rooms, the egg, the bales, the see-saws, the water wheel, the revolving
                door, the holes, the hook and the one rule
  pilot.ts      a scripted player for each room, for tests and ?auto
src/render/   PlayCanvas view; reads the sim, never writes it
  stage.ts      the kitchen as a doll's house with its front off
src/audio.ts  every sound, synthesised; presentation only
src/main.ts   screens, HUD, touch, the frame loop
```
