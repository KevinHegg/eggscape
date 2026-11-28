import { Game, LEVELS, STEP, loadPhysics, type GameEvent } from "../src/sim/kitchen";

/**
 * One run of a room, event by event. Throws are "time:x,y" on the command line, with heights
 * as if the room stood where the first one does; "room=scullery" picks the room.
 */
await loadPhysics();
const args = process.argv.slice(2);
const key = args.find((arg) => arg.startsWith("room="))?.slice(5) ?? "larder";
const level = LEVELS.find((item) => item.key === key) ?? LEVELS[0]!;
const down = LEVELS[0]!.top - level.top;
/** "wait=2.5" lets that long go by before he is let go: in the yard, the sky keeps its own time. */
const wait = Number(args.find((arg) => arg.startsWith("wait="))?.slice(5) ?? 0);
const throws = args.filter((arg) => !arg.startsWith("room=") && !arg.startsWith("wait=")).map((arg) => {
  const [at, where] = arg.split(":");
  const [x, y] = (where ?? "0,0").split(",").map(Number);
  return { at: Number(at), x: x ?? 0, y: (y ?? 0) - down, done: false };
});
const game = new Game(level);
const say = (event: GameEvent): string => Object.entries(event).map(([key, value]) => (typeof value === "number" ? `${key}=${value.toFixed(2)}` : `${value}`)).join(" ");
for (let step = 0; step < Math.round(wait / STEP); step += 1) {
  game.wait();
  for (const event of game.drain()) console.log(`${game.sky.toFixed(2).padStart(6)}*`, say(event));
}
game.start();
let next = 0;
while (!game.over && game.time < 40) {
  const due = throws.find((item) => !item.done && item.at <= game.time);
  if (due) due.done = true;
  game.step(due ? { bale: { x: due.x, y: due.y } } : {});
  for (const event of game.drain()) console.log(game.time.toFixed(2).padStart(6), say(event));
  if (game.time >= next) {
    const egg = game.egg;
    console.log(game.time.toFixed(2).padStart(6), `  egg ${egg.x.toFixed(2)}, ${(egg.y + down).toFixed(2)}  v ${egg.vx.toFixed(2)}, ${egg.vy.toFixed(2)}`);
    next += 0.25;
  }
}
console.log(`${game.phase} at ${game.time.toFixed(2)}s, cracks ${game.cracks}, bales left ${game.balesLeft}, stars ${game.stars}`);
