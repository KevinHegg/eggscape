# The Great Eggscape

*The Queen wants an omelette. The Egg King wants his mother.*

A mobile-first physics game. Bolt three simple machines to the Egg King's cart, then ride
it down the Queen's gauntlet to the Empress Hen with his shell in one piece.

This is an early prototype: one gauntlet, six machines, no sound.

## Play

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5180](http://127.0.0.1:5180). Add `?auto` to watch the built-in
driver play the run.

- **Build:** pick three of the six machines. Each becomes one button.
- **Lean:** hold the left or right half of the road (or **←/→**, **A/D**). The King's men
  lean and the cart drifts; lose men and the lean gets weaker.
- **Machines:** tap the buttons in the bottom bar (or **1**, **2**, **3**).
- **R** restarts the run.

## Rules

- **Only a jolt hurts him.** The King has no hit points. His shell cracks when the cart's
  velocity changes sharply: a stone, a hard landing, a rammed barricade, a blast.
- **Stars:** get him home; arrive with the shell uncracked; arrive with all three men aboard.
- **The six machines**

  | Machine | Button | What it does |
  |---|---|---|
  | Lever | Swat | Bats a stone in flight back at the tower that threw it |
  | Wedge | Smash | Drops the prow and flings a barricade out of the road |
  | Inclined plane | Shield | Turns arrows and stones aside for a moment |
  | Pulley | Brace | Hoists the King's cradle so a jolt passes under him |
  | Screw | Hop | A short lift over oil or a low obstacle |
  | Wheel and axle | Surge | A burst of speed that leaves a stone behind you |

- **Towers:** mangonels wind up and mark where the stone will land (the red ring fills as it
  arrives). Archers pick off the King's men, or chip the shell once the men are gone.
- **On the road:** barricades to steer round or smash, oil that kills your grip, two drops.
- **Pickups:** hay soaks up jolts until it's knocked off; stragglers climb aboard; a powder
  keg clears the road and any tower nearby, and shakes you too.

## Development

```bash
npm run typecheck
npm test                      # headless: the run is winnable, an idle cart is not, replays are exact
npm run probe -- idle         # trace one run in the terminal (idle | right | left | hop)
npx tsx scripts/builds.ts     # all twenty carts, driven by the test pilot
npm run build
npm run check                 # typecheck, tests and build
```

```
src/sim/      rules and physics, headless (Rapier 3D, fixed 60 Hz, no DOM, no Math.random)
  parts.ts      the six machines
  course.ts     the gauntlet: road, towers, barricades, oil, pickups
  game.ts       the cart, the jolt rule, towers, machines, pickups, the verdict
  autoplay.ts   pilots for tests and ?auto
src/render/   PlayCanvas view; reads the sim, never writes it
src/main.ts   screens, HUD, input, the frame loop
```
