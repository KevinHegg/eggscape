import { Game, LARDER, STEP, loadPhysics, type GameEvent } from "../src/sim/kitchen";

/** One run of the first screen, event by event. Throws are "time:x,y" on the command line. */
await loadPhysics();
const throws = process.argv.slice(2).map((arg) => {
  const [at, where] = arg.split(":");
  const [x, y] = (where ?? "0,0").split(",").map(Number);
  return { at: Number(at), x: x ?? 0, y: y ?? 0, done: false };
});
const game = new Game(LARDER);
game.start();
const say = (event: GameEvent): string => Object.entries(event).map(([key, value]) => (typeof value === "number" ? `${key}=${value.toFixed(2)}` : `${value}`)).join(" ");
let next = 0;
while (!game.over && game.time < 40) {
  const due = throws.find((item) => !item.done && item.at <= game.time);
  if (due) due.done = true;
  game.step(due ? { bale: { x: due.x, y: due.y } } : {});
  for (const event of game.drain()) console.log(game.time.toFixed(2).padStart(6), say(event));
  if (game.time >= next) {
    const egg = game.egg;
    console.log(game.time.toFixed(2).padStart(6), `  egg ${egg.x.toFixed(2)}, ${egg.y.toFixed(2)}  v ${egg.vx.toFixed(2)}, ${egg.vy.toFixed(2)}`);
    next += 0.25;
  }
}
console.log(`${game.phase} at ${game.time.toFixed(2)}s, cracks ${game.cracks}, bales left ${game.balesLeft}, stars ${game.stars}`);
void STEP;
