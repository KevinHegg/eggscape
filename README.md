# The Great Eggscape

*The Queen wants an omelette. The Egg King wants his mother.*

A mobile-first physics game. Bolt three simple machines to the Egg King's cart, pack him in hay, then steer
it down the Queen's gauntlet to the Empress Hen with his shell in one piece.

This is an early prototype: one gauntlet, six machines, one gun.

## Play

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5180](http://127.0.0.1:5180). Add `?auto` to watch the built-in
driver play the run.

- **Build:** pick three of the six machines. They work on their own; there is nothing to press.
- **Steer:** put a finger down anywhere and drag. The cart follows it across the road
  (or **←/→**, **A/D**). The King's men do the leaning; lose men and she answers more slowly.
- **Brake:** pull the same finger down (or **↓**, **S**). She slows to a trot, never to a stand.
- **Fire:** the gun lays itself on the nearest tower or wall ahead and rings it in gold. Tap
  the screen, touch it with a second finger, or press **Fire** (or **Space**).
- **R** restarts the run; **M** mutes the sound.

## Rules

- **Only a jolt hurts him.** The King has no hit points. His shell cracks when the cart's
  velocity changes sharply: a stone, a hard landing, a rammed barricade, a blast.
- **Hay is his cushion.** He rides packed in bales, and every knock comes out of the hay
  before it reaches his shell. Farmers leave more by the road.
- **Stars:** get him home; arrive with the shell uncracked; arrive with all three men aboard.
- **The six machines**

  | Machine | On the cart | What it does, unasked |
  |---|---|---|
  | Lever | Batting Arm | Bats a stone back at the tower that threw it, then must be cocked again |
  | Wedge | Plough | Shoulders crates and rubble out of the road |
  | Inclined plane | Sloped Roof | Turns aside three stones or volleys, a plank each |
  | Pulley | Hoist | Swings gifts aboard from half the road away |
  | Screw | Hay Press | Packs the hay tight, so each bale takes a harder knock |
  | Wheel and axle | Great Wheels | Grip through oil, and a quicker lean |

- **Towers** take turns. Each marks the road with a red ring that fills: a small one for a
  mangonel's stone, a wide one for an archers' volley. Be out of it when it fills, or brake
  and let it land in front of you.
- **The gun:** every cart carries one, with two rounds in the rack. A round brings a tower
  down or blows a hole in a wall. There are more towers than rounds.
- **On the road:** barricades to steer round, plough or shoot; oil that kills your grip; a
  hump, and two bridges that have each lost a side. Get onto the half that is left and let
  her run: the landing hill beyond is cut for a rolling cart and forgives a slow one.
- **Pickups** are what the King's subjects have left by the road: hay to pack round him;
  volunteers who climb aboard; the smith's shot, two more rounds; a powder keg stolen from
  the Queen, which goes to the front of the rack and takes out everything near where it lands.

## Development

```bash
npm run typecheck
npm test                      # headless: the run is winnable, an idle cart is not, replays are exact
npm run probe                 # speed down the bare road (add a brake setting, 0 to 1)
npx tsx scripts/jumps.ts      # air time and damage on each jump, free and braked
npx tsx scripts/builds.ts     # all twenty carts, driven by the test pilot
npm run build
npm run check                 # typecheck, tests and build
```

```
src/sim/      rules and physics, headless (Rapier 3D, fixed 60 Hz, no DOM, no Math.random)
  parts.ts      the six machines
  course.ts     the gauntlet: road and jumps, towers, walls, oil, pickups
  game.ts       the cart, the jolt rule, the gun, towers, machines, pickups, the verdict
  autoplay.ts   pilots for tests and ?auto
src/render/   PlayCanvas view; reads the sim, never writes it
src/audio.ts  every sound, synthesised; presentation only
src/main.ts   screens, HUD, input, the frame loop
```
