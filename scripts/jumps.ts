/** The jumps alone, on an empty road: `npx tsx scripts/jumps.ts [surge-at-d ...]`. */
import { COURSE, chasms } from "../src/sim/course";
import { Game } from "../src/sim/game";
import type { PartId } from "../src/sim/parts";

const surgeAt = process.argv.slice(2).map(Number);
const bare = { ...COURSE, walls: [], towers: [], oil: [], pickups: [] };
console.log("chasms", JSON.stringify(chasms(bare)), "finish", bare.finish, "end y", bare.pieces.at(-1)!.y1.toFixed(1));
const game = await Game.create(["wheel", "pulley", "screw"], bare);
let hurt = 0;
const pending = [...surgeAt];
let takeoff = 0;
let wasAir = false;
let top = 0;
while (!game.over && game.time < 60) {
  const fire: PartId[] = [];
  if (pending.length && game.distance >= pending[0]!) {
    fire.push("wheel");
    pending.shift();
  }
  if (!game.grounded && !wasAir) takeoff = game.speed;
  wasAir = !game.grounded;
  game.step({ lean: 0, fire });
  top = Math.max(top, game.speed);
  for (const event of game.takeEvents()) {
    if (event.type === "jolt") hurt += event.amount;
    if (event.type === "air") {
      console.log(`air ${event.time.toFixed(2)}s over ${event.distance.toFixed(1)}m, landed d=${game.distance.toFixed(1)} takeoff v=${takeoff.toFixed(1)} shell=${game.shell.toFixed(0)}`);
    }
    if (event.type === "broken") console.log("BROKEN", event.cause, "d=", game.distance.toFixed(1));
  }
}
console.log(`top speed ${top.toFixed(1)}`);
console.log(`END ${game.phase} t=${game.time.toFixed(1)} shell=${game.shell.toFixed(0)} total hurt=${hurt.toFixed(0)}`);
