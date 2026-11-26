# The Great Eggscape

*The Queen wants an omelette. The Egg King wants his mother.*

A mobile-first physics game. The Queen's village is built down a hill, and the whole of it is
one push from falling over. Set it off, then ride the Egg King's cart through what follows,
down to the Empress Hen, with his shell in one piece.

This is an early prototype: one street, **Bell Tower Street**.

The first version, a gauntlet of towers ridden on a cart built from three simple machines, is
kept as its own game on branch `gauntlet` and is published at `/gauntlet/` beside this one.

## Play

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5180](http://127.0.0.1:5180). Add `?auto` to watch the built-in
driver play the street.

- **Steer:** put a finger down anywhere and drag sideways. The cart goes that way and keeps
  going until you lift the finger or bring it back (or **←/→**, **A/D**).
- **Brake:** pull the same finger down (or **↓**, **S**). She slows to a trot, never to a stand.
- **Fire:** everything the gun could hit wears a ring. When a ring turns gold it is in range:
  tap it, or press **Fire** (or **Space**) for the next one. Three rounds, no more.
- **Sling:** tap anything else and one of the men slings a stone at it: an egg beater in mid
  air, a cook, a flower basket, a barrel, a hen coop, the Queen's crown. A dozen stones, for
  whatever takes your fancy.
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
5. **Or make your own trouble.** A stone knocks what they throw out of the air and puts a
   cook's head down for a moment. A basket drops on whoever is under it, a burst barrel or a
   loosed hen coop sends its neighbours diving, and with her crown knocked off the Queen's
   whole kitchen forgets to throw.
6. **Steer round what is left:** the bell where it stopped, the woolsacks, the well.

- **Only a jolt hurts him.** His shell cracks when the cart's velocity changes sharply, when a
  pan lands, or when he runs into a cook. Hay takes each knock first, two bales' worth.
- **Stars:** get him home; arrive with the shell uncracked; arrive without a pan landed.
- A cart that stops is caught.

## Development

```bash
npm run typecheck
npm test                         # headless: winnable, not by an idle cart, replays exact
npx tsx scripts/trace.ts         # one run, event by event (steady, idle, nowain, late, dawdle)
npx tsx scripts/window.ts        # outcome for every shot delay and brake setting (add: wain)
npx tsx scripts/lip.ts           # the jolt of crossing the fallen tower
npm run build
npm run check                    # typecheck, tests and build
```

```
src/sim/      rules and physics, headless (Rapier 3D, fixed 60 Hz, no DOM, no Math.random)
  course.ts     the street: the hill, the canal, the tower, the mob, the wain
  game.ts       the cart, the jolt rule, the gun, the falling tower, the bell, the wain, the mob
  autoplay.ts   pilots for tests and ?auto
src/render/   PlayCanvas view; reads the sim, never writes it
src/audio.ts  every sound, synthesised; presentation only
src/main.ts   screens, HUD, input, the frame loop
```
