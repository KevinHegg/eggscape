# The Great Eggscape

*The Queen wants an omelette. The Egg King wants his mother.*

A mobile-first physics game. The Egg King falls through the Queen's kitchen by himself: off
shelves, down drops, on to see-saws, past holes that lead to her frying pan. All the player can
do is have a straw bale thrown in: **tap, and a bale lands there a moment later.** Straw is
soft. Nothing else in a kitchen is.

This is a third try at the game, and so far it is one room, **The Larder**, built to find out
whether throwing bales is fun. The two earlier games are kept as they were and published beside
this one: the six streets ridden in a cart (branch `streets`, tag `streets-v1`, at `/streets/`)
and the Queen's gauntlet (branch `gauntlet`, tag `gauntlet-v1`, at `/gauntlet/`).

## Play

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5180](http://127.0.0.1:5180). Add `?auto` to watch the room played
properly.

- **Tap** anywhere in the kitchen and a bale is thrown there. It takes about half a second to
  arrive, so tap where he is going to be, not where he is.
- **Press and slide** to see where the bale will go before you let go.
- Five bales a room. **↻** (or **R**) starts again at once; **M** mutes the sound.

One bale does three jobs:

1. **A cushion.** Whatever he lands on that is straw or sacks does not hurt him. A bale that
   takes a hard landing bursts, and is gone.
2. **A weight.** Dropped on the gold end of a see-saw it throws whoever is sitting on the other
   end. The higher it falls from, the harder the throw: too low and he goes nowhere, too high
   and he meets the far wall.
3. **A stopper.** Dropped in a hole in the floor it fills it, and he rolls over the top instead
   of down into the pan.

- **Only a knock hurts him.** His shell cracks when his velocity changes sharply against
  something hard. Two cracks he can carry; the third, or one great fall, is the end of him.
- **A cook has him if he stops** for eight seconds.
- **Stars:** get him to the nest; not a crack on him; two bales to spare.

## Development

```bash
npm run typecheck
npm test                         # headless: winnable, not by doing nothing, replays exact
npx tsx scripts/kitchen.ts       # one run, event by event; throws as time:x,y
                                 #   npx tsx scripts/kitchen.ts 1.2:2.9,22.8 2:-1.1,18.9 4.8:0,24.2
npm run build
npm run check                    # typecheck, tests and build
```

```
src/sim/      rules and physics, headless (Rapier 3D held to one plane, fixed 60 Hz, no DOM,
              no Math.random)
  kitchen.ts    the room, the egg, the bales, the see-saw, the hole and the one rule
  pilot.ts      a scripted player, for tests and ?auto
src/render/   PlayCanvas view; reads the sim, never writes it
  stage.ts      the kitchen as a doll's house with its front off
src/audio.ts  every sound, synthesised; presentation only
src/main.ts   screens, HUD, touch, the frame loop
```
