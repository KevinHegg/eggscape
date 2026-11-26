/** One run of the street, event by event: `npx tsx scripts/trace.ts [idle|steady|nowain|late|dawdle]`. */
import { driver, idle, steady, type Pilot } from "../src/sim/autoplay";
import { Game } from "../src/sim/game";

const pilots: Record<string, Pilot> = {
  idle,
  steady,
  nowain: driver(),
  late: driver({ wait: 1.5, brake: 0 }),
  dawdle: driver({ brake: 1, dawdle: true }),
};
const name = process.argv[2] ?? "steady";
const pilot = pilots[name] ?? steady;
const game = await Game.create();
const quiet = new Set(["jolt", "throw", "brake"]);
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
    const wain = game.wain.body.translation();
    console.log(
      `${game.time.toFixed(2).padStart(6)}s d=${game.distance.toFixed(1).padStart(6)} v=${game.speed.toFixed(1).padStart(5)} x=${game.position.x.toFixed(1)} brake=${game.braking} tower=${game.tower.state}@${((game.tower.angle * 180) / Math.PI).toFixed(0)}° bell=${bell ? `${(-bell.z).toFixed(0)},${bell.x.toFixed(1)}` : "-"} ${game.bell.state} wain=${(-wain.z).toFixed(0)} up=${game.standing} shell=${game.shell.toFixed(0)} hay=${game.hay}`,
    );
  }
}
console.log(`${name}: ${game.phase} ${game.cause ?? ""} stars=${game.stars} shell=${game.shell.toFixed(0)} hay=${game.hay} knocks=${game.knocks} d=${game.distance.toFixed(0)} t=${game.time.toFixed(1)}`);
