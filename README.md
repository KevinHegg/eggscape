# The Great Eggscape

*The Queen wants an omelette. The Egg King wants his mother.*

A mobile-first physics game. The Egg King falls through the Queen's kitchen by himself: off
shelves, down drops, on to see-saws, past holes that lead to her frying pan. All the player can
do is have a straw bale thrown in: **tap, and a bale lands there a moment later.** Straw is
soft. Nothing else in a kitchen is, bar water.

This is a third try at the game, and so far it is seven rooms, one under another: **The
Larder**, **The Scullery**, **The Mill**, **The Buttery**, **The Cistern**, **The Servery** and
**The Cellar**. They were built to find out whether throwing
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
properly, or `?room=6` to open it at the sixth room.

- **Tap** anywhere in the kitchen and a bale is thrown there. It takes about half a second to
  arrive, so tap where he is going to be, not where he is.
- **Press and slide** to see where the bale will go before you let go.
- A few bales a room: five, four or three, counted at the bottom left while he is on his way down.
  Nothing is drawn over the top of the room. **R** starts the room again at once, and so
  does the card at the end of a go; **♪** on a card (or **M**) mutes the sound.
- The button beside it is **the map**: the whole house in section, every room with its stars
  and what it has in it, and where he is. A room he has been got to can be started from there.
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
stops it at the next shutter, and that shutter opens. Left is the way to the roost, and it is
barred. The bar is roped to the red board outside the right-hand shutter, and only his own
weight on that board takes it off. So he goes out on the right first, into the seat of a
see-saw in the corner; a bale on its gold end throws him back up through a flap to the top of
the door; and the second time round the brake has to go on as he passes the bottom, so that it
stops at the left. Bottom is the pan. Leave it and the clockwork runs down with him back at the
top, where the hook can reach.

The Cistern is dry. Three shelves bring him to it. A bale in the bottom
of it breaks his fall; then a bale on the gold pan lets the water in, and his bale is a raft.
The water rises to the lowest way out. That is a spout in the left wall, which runs to a pan,
unless a bale has been stood in its mouth; then it is the top of the right wall, and he rolls
off his raft and drops on to the roost. But a raft with nobody on it does not wait
at the top: let the water in before he is aboard and it is over the wall without him. An egg
does not float.

The Servery has a dumbwaiter in the middle of it, hung against a gold pan. Every bale on the
pan hauls the car up a landing, and every bale on the car's roof takes it down one. It is
wanted in three places, one after another. He comes to the shaft at the height of the car's
roof when the car is one landing up: so up it goes, to be his bridge. On the far side he comes
down to the bottom landing, where a gate is shut unless the car is there: so down it comes, to
fetch him. And the way out is from the first landing: so, once he is in it, up again. It will
not start with him half in at a door.

The Cellar is the last room. A barrel stands chocked at the top of its run, and he comes down
on the run in front of it. Half way down there is a gap with rails over it: the barrel goes
over on the rails, and he goes down between them into a bucket. A bale on the gold pan lets
the barrel go, and that has to wait until he is in the bucket. It passes over his head; beyond
the gap it rolls over a treadle that throws the bucket up and him out of it, on to the run
behind the barrel; it goes off the end, through the crates on the floor below and into the
pit with the Queen's last pan in it, which it stops. He follows it down at a crawl over a
feather bed, and wants a bale under him when he comes off the end. But not before the barrel
has been by: it flattens straw as readily as it flattens him. Beyond the pit is the Empress
Hen's nest.

- **Only a knock hurts him.** His shell cracks when his velocity changes sharply against
  something hard. Two cracks he can carry; the third, or one great fall, is the end of him.
  Straw is soft wherever it is: in a bale, in a bed on a floor, banked up a wall. So is a
  wheel with the water running on it, and the water in the cistern.
- **The Queen's hook has him if he stops.** It comes down from the top of the house like the
  claw in a fairground machine, and you can see it coming: four seconds of going nowhere, or
  a second and a half in a cage. It waits longer while he sits in a see-saw's seat.
- **Stars**, for each room: get him through; not a crack on him; bales to spare (two in the
  Larder, one in each of the others).

## Development

```bash
npm run typecheck
npm test                         # headless: winnable, not by doing nothing, replays exact
npx tsx scripts/kitchen.ts       # one run, event by event; throws as time:x,y
                                 #   npx tsx scripts/kitchen.ts 1.2:2.9,22.8 2:-1.1,18.9 4.8:0,24.2
                                 #   npx tsx scripts/kitchen.ts room=scullery 0.3:1.3,28.5 2.7:-3,24
                                 #   npx tsx scripts/kitchen.ts room=mill 0.3:1.75,30 2.7:3.2,21.2 4:0.6,19.2
                                 #   npx tsx scripts/kitchen.ts room=buttery 0.3:-0.7,29.5 7:1.7,20.4 14.6:-0.7,29.5
                                 #   npx tsx scripts/kitchen.ts room=cistern 1:0.6,19 2:-0.6,19.5 9.5:-1.5,27.2
                                 #   npx tsx scripts/kitchen.ts room=servery 0.3:2.9,26.2 5.7:0,22 8.4:2.9,26.2
                                 #   npx tsx scripts/kitchen.ts room=cellar 6:3.15,28.6 11:-2.75,18
npm run build
npm run check                    # typecheck, tests and build
```

```
src/sim/      rules and physics, headless (Rapier 3D held to one plane, fixed 60 Hz, no DOM,
              no Math.random)
  kitchen.ts    the rooms, the egg, the bales, the see-saws, the water wheel, the revolving
                door, the cistern, the dumbwaiter, the barrel, the holes, the hook and the one rule
  pilot.ts      a scripted player for each room, for tests and ?auto
src/render/   PlayCanvas view; reads the sim, never writes it
  stage.ts      the kitchen as a doll's house with its front off
src/audio.ts  every sound, synthesised; presentation only
src/main.ts   screens, HUD, the map, touch, the frame loop
```
