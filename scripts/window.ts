/**
 * The timing window: how the street goes for every mix of "how long did you sit on the shot"
 * and "how hard did you brake". `npx tsx scripts/window.ts [wain]`
 */
import { driver, type Plan } from "../src/sim/autoplay";
import { Game } from "../src/sim/game";

const wain = process.argv.includes("wain");
const brakes: Array<Plan["brake"]> = [0, 0.5, 1, "judge"];
console.log(`gap = seconds between the tower landing and the cart reaching the bank (negative: she got there first)`);
console.log(`wait   ${brakes.map((brake) => `brake ${String(brake).padEnd(5)}`.padEnd(30)).join("")}`);
for (const wait of [0, 0.5, 1, 1.5, 2, 2.5, 3]) {
  const cells: string[] = [];
  for (const brake of brakes) {
    const game = await Game.create();
    const pilot = driver({ wait, brake, wain });
    let slam = NaN;
    let bank = NaN;
    while (!game.over && game.time < 100) {
      game.step(pilot(game));
      if (Number.isNaN(slam) && game.tower?.state === "down") slam = game.time;
      if (Number.isNaN(bank) && game.distance >= game.course.tower!.d) bank = game.time;
    }
    const gap = bank - slam;
    const how = game.phase === "won" ? `${"★".repeat(game.stars)} shell ${game.shell.toFixed(0)} hits ${game.knocks}` : `${game.cause} @${game.distance.toFixed(0)}`;
    cells.push(`${Number.isNaN(gap) ? "  -- " : gap.toFixed(1).padStart(5)} ${how}`.padEnd(30));
    game.dispose();
  }
  console.log(`${wait.toFixed(1)}s  ${cells.join("")}`);
}
