# The Great Eggscape

*The Queen wants an omelette. The Egg King wants his mother.*

A mobile-first physics game. The Queen's village is built down a hill, and the whole of it is
one push from falling over. Set it off, then ride the Egg King's cart through what follows,
down to the Empress Hen, with his shell in one piece.

This is an early prototype: five streets, **Bell Tower Street**, **Powder Row**,
**Pudding Lane**, **Cauldron Gate** and **Miller's Leap**, joined by town gates. What is left of the cart at the bottom of one is what you have at the
top of the next.

The first version, a gauntlet of towers ridden on a cart built from three simple machines, is
kept as its own game on branch `gauntlet` and is published at `/gauntlet/` beside this one.

## Play

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5180](http://127.0.0.1:5180). Add `?auto` to watch the built-in
driver play every street, or `?street=2` up to `?street=5` to start on a later one with a
fresh cart.

- **Steer:** put a finger down anywhere and drag sideways. The cart goes that way and keeps
  going until you lift the finger or bring it back (or **←/→**, **A/D**).
- **Brake:** the round button bottom left (or **B**, **↓**, **S**). Tap it and she slows to a
  trot, never to a stand; tap it again to let her run. Dragging only steers. There is no going
  faster than letting her run, unless powder goes off behind her.
- **Fire:** everything the gun could hit wears a ring. When a ring turns gold it is in range:
  tap it, or press **Fire** (or **Space**, **F**) for the next one. Three rounds to start with.
- **Eggs:** tap anything else and one of the men throws an egg at it: an egg beater in mid
  air, a cook, a flower basket, a barrel, a hen coop, a powder keg, the Queen's crown. It
  bursts over whatever is near, and leaves the yolk on the cobbles. A dozen to start with.
- **More of both:** a basket of eggs or a pyramid of shot in a gold ring is yours for driving
  over it.
- **R** restarts; **M** mutes the sound.

## Bell Tower Street

The bridge over the canal is gone. The bell tower beside it leans out over the water, held
back by one rope to a capstan on the quay.

1. **Shoot the capstan.** The tower falls away from you and lies from bank to bank: its face
   is the new bridge.
2. **Brake.** It takes about three seconds to come down. Reach the bank too soon and you meet
   it standing, or the water.
3. **The bell** breaks loose as the tower lands, rolls down the far street and bowls the
   Queen's kitchen mob out of its side of the road. The cooks nearby dive for the gutter, for
   a while.
4. **The cheese wain** on the far bank is only chocked. Knock the chock out and it runs down
   the other side of the street into the well, and clears that side too. Leave it, and the
   cooks still standing throw what they are holding.
5. **Or make your own trouble.** An egg knocks what they throw out of the air and puts the
   cooks' heads down for a moment. A basket drops on whoever is under it, a burst barrel or a
   loosed hen coop sends its neighbours diving, and with her crown knocked off the Queen's
   whole kitchen forgets to throw.
6. **Steer round what is left:** the bell where it stopped, the woolsacks, the well.

## Powder Row

The Queen's powder is stacked all down one kerb as far as the wagon drawn up against her
barricade, and she has left a few kegs in the road with slow matches in them.

1. **Red rings are traps.** Come inside one and the keg goes off under the cart. Steer wide,
   or burst it with an egg from a distance.
2. **The barricade** will not move for a cart. The powder wagon parked against it will move
   it: an egg at the wagon, or a round at the barricade's ring.
3. **Or light the train.** One egg on any kerb keg sets off the next, and the next, all the
   way down to the wagon.
4. **Brake.** Be well back when the wagon goes.

## Pudding Lane

Kegs sown all down the lane, the kitchen across the middle of it, a shield wall at the bottom,
and at the top the cistern the whole quarter drinks from. Fire or water: neither is the right
answer.

1. **Water.** A round at the cistern's ring and everything in it goes down the lane: every keg
   it reaches is soaked and every cook it reaches is carried off. So is the one keg that would
   have been useful.
2. **Fire.** Keep the powder dry and it has to be got past: weave between the red rings, or
   burst them with eggs from a distance.
3. **The gilt keg** has a long match in it. An egg lights it, a red ring closes on it as it
   burns, and gold arrows on the road show where to be when it goes: just past it. Powder
   going off behind the cart throws her down the street, fast enough to go through the shield
   wall like a ball through skittles. With the brake on when it goes, most of the push is lost.
4. **The shield wall** throws nothing and does not move. A slow cart is thrown back off it. A
   round opens it, an egg apiece puts the heads in the way down, or she comes through on a blast.

## Cauldron Gate

A stone wall across the bottom of the hill, its gate shut and a shield wall braced behind it.
In the yard in front of it a plank lies over a log, long end down in the road, with a keg on
it; and over the short end the Queen's biggest cauldron hangs from a crane.

1. **A plank over a log is a see-saw.** Shoot the rope, and whatever is on the long end when
   the cauldron lands on the short one goes over the wall.
2. **Send the keg.** Leave it where it is and cut the rope: it comes down in the kitchen behind
   the gate, and takes the gate off its hinges. Brake until it has, then go through.
3. **Or go yourself.** Burst the keg off the plank with an egg, ride on to the long arm, and
   cut the rope as she crosses the gold bar. She goes over the wall, the shield wall and all,
   and comes down in the hayricks. On the brake there is time to spare; without it, very little.
   Too late and she is under the cauldron.
4. **Or knock.** A round at the gate's ring opens it. The shield wall behind it wants another.

## Miller's Leap

A windmill at the top of the hill with its millstone swung out over the road, the Queen's
kitchen and a barricade below, and at the bottom a gorge with half of one arch of its bridge
left standing.

1. **Shoot the hoist.** The stone comes down in the road and goes on down the left of the
   street by itself: through the cooks in its way, over the kegs, through the barricade and
   off the quay into the gorge.
2. **Keep up, and keep clear.** Follow in its wake and the hill costs one round. The cooks it
   only frightened get up again.
3. **Light the gilt keg on the quay.** The gorge is wider than a cart can jump. Egg the keg as
   she comes through the barricade and be just past it, on the way up the bridge, when it goes.
4. **Brake off, and keep right.** What is left of the bridge is a ramp on the right. Thrown by
   the blast she clears the gorge and comes down in the straw the Hen's people have laid. With
   the brake on when it goes, or with the keg never lit, she does not.

- **Only a jolt hurts him.** His shell cracks when the cart's velocity changes sharply, when a
  pan lands, when he runs into a cook, or when powder goes off beside him. Hay takes each knock first, two bales' worth.
- **Stars:** get him home; arrive with the shell uncracked; arrive without a pan landed.
- A cart that stops is caught.

## Development

```bash
npm run typecheck
npm test                         # headless: winnable, not by an idle cart, replays exact
npx tsx scripts/trace.ts         # one run, event by event (steady, idle, nowain, late, dawdle;
                                 # on Powder Row: wagon, train, rush, blind)
npx tsx scripts/window.ts        # outcome for every shot delay and brake setting (add: wain)
npx tsx scripts/lip.ts           # the jolt of crossing the fallen tower
npx tsx scripts/lane.ts          # Pudding Lane: every way down it, by fire and by water
npx tsx scripts/gate.ts          # Cauldron Gate: where she was when the cauldron landed, every way
npx tsx scripts/leap.ts          # Miller's Leap: speed off the bridge, air and cost, every way
npm run build
npm run check                    # typecheck, tests and build
```

```
src/sim/      rules and physics, headless (Rapier 3D, fixed 60 Hz, no DOM, no Math.random)
  course.ts     the streets: the hill, the canal, the tower, the mob, the wain, the powder
  game.ts       the cart, the jolt rule, the gun, the eggs, the tower, the bell, the wain,
                the mob, the kegs, the barricade, the see-saw, the millstone, what is carried
                through a gate
  autoplay.ts   pilots for tests and ?auto
src/render/   PlayCanvas view; reads the sim, never writes it
src/audio.ts  every sound, synthesised; presentation only
src/main.ts   screens, HUD, input, the frame loop
```
