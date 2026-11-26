/** One run by the test pilot, event by event: `npx tsx scripts/trace.ts lever,wedge,plane`. */
import { steady } from "../src/sim/autoplay";
import { Game } from "../src/sim/game";
import type { PartId } from "../src/sim/parts";

const build = (process.argv[2]?.split(",") ?? ["lever", "plane", "wedge"]) as PartId[];
const game = await Game.create(build);
let hurt = 0;
let since = 0;
const flush = (): void => {
  if (hurt > 0.5) console.log(`   hurt ${hurt.toFixed(0)} by d=${since.toFixed(0)} (shell ${game.shell.toFixed(0)})`);
  hurt = 0;
};
while (!game.over && game.time < 80) {
  game.step(process.argv[3] === "idle" ? { lean: 0, fire: [] } : steady(game));
  for (const event of game.takeEvents()) {
    if (event.type === "jolt") {
      hurt += event.amount;
      since = game.distance;
      continue;
    }
    if (event.type === "plough" || event.type === "land" || event.type === "machine") continue;
    flush();
    console.log(`${game.time.toFixed(1)}s d=${game.distance.toFixed(0)} v=${game.speed.toFixed(0)} ${JSON.stringify(event).slice(0, 110)}`);
  }
}
flush();
console.log(`END ${game.phase} shell=${game.shell.toFixed(0)} men=${game.men} ammo=${game.ammo.join(",")}`);
