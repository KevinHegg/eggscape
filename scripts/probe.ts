/** Speed down the bare road, every 20 m: `npx tsx scripts/probe.ts [brake]`. */
import { COURSE } from "../src/sim/course";
import { Game } from "../src/sim/game";

const brake = Number(process.argv[2] ?? 0);
const bare = { ...COURSE, walls: [], towers: [], oil: [], pickups: [] };
const game = await Game.create(["wedge", "lever", "pulley"], bare);
let next = 0;
const row: string[] = [];
while (!game.over && game.time < 100) {
  game.step({ lean: 0, brake });
  game.takeEvents();
  if (game.distance >= next) {
    row.push(`${next}:${game.speed.toFixed(0)}`);
    next += 20;
  }
}
console.log(row.join("  "));
console.log(`afterBridge ${COURSE.towers.find((tower) => tower.id === "a2")!.d - 16} finish ${COURSE.finish} time ${game.time.toFixed(1)}`);
