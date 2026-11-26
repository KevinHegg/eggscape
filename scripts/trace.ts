/**
 * One run of a street, event by event: `npx tsx scripts/trace.ts [pilot]`.
 * Bell Tower Street: steady, idle, nowain, late, dawdle.
 * Powder Row: wagon, train, rush (the train, never braking), blind (no eggs at all).
 */
import { driver, idle, sapper, steady, type Pilot } from "../src/sim/autoplay";
import { STREETS } from "../src/sim/course";
import { Game } from "../src/sim/game";

const pilots: Record<string, [Pilot, number]> = {
  idle: [idle, 0],
  steady: [steady, 0],
  nowain: [driver(), 0],
  late: [driver({ wait: 1.5, brake: 0 }), 0],
  dawdle: [driver({ brake: 1, dawdle: true }), 0],
  wagon: [sapper(), 1],
  train: [sapper({ how: "train" }), 1],
  rush: [sapper({ how: "train", brake: false }), 1],
  blind: [sapper({ how: "none", traps: false, brake: false }), 1],
};
const name = process.argv[2] ?? "steady";
const [pilot, street] = pilots[name] ?? pilots.steady!;
const game = await Game.create(STREETS[street]);
const quiet = new Set(["jolt", "throw", "brake", "lob", "panic"]);
let next = 0;
while (!game.over && game.time < 100) {
  game.step(pilot(game));
  for (const event of game.takeEvents()) {
    if (quiet.has(event.type) && !(event.type === "jolt" && event.amount + event.absorbed > 3)) continue;
    console.log(`${game.time.toFixed(2).padStart(6)}s d=${game.distance.toFixed(1).padStart(6)} v=${game.speed.toFixed(1).padStart(5)}  ${JSON.stringify(event, (_, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v))}`);
  }
  if (game.time >= next) {
    next += 1;
    const bell = game.bell.body?.translation();
    const works = game.tower ? ` tower=${game.tower.state}@${((game.tower.angle * 180) / Math.PI).toFixed(0)}° bell=${bell ? `${(-bell.z).toFixed(0)},${bell.x.toFixed(1)}` : "-"} ${game.bell.state}` : ` kegs=${game.kegs.filter((keg) => keg.state !== "gone").length} wall=${game.walls[0]?.state ?? "-"}`;
    console.log(`${game.time.toFixed(2).padStart(6)}s d=${game.distance.toFixed(1).padStart(6)} v=${game.speed.toFixed(1).padStart(5)} x=${game.position.x.toFixed(1)} brake=${game.braking}${works} up=${game.standing} shell=${game.shell.toFixed(0)} hay=${game.hay} eggs=${game.eggs} shot=${game.ammo}`);
  }
}
console.log(`${name}: ${game.phase} ${game.cause ?? ""} stars=${game.stars} shell=${game.shell.toFixed(0)} hay=${game.hay} knocks=${game.knocks} d=${game.distance.toFixed(0)} t=${game.time.toFixed(1)}`);
