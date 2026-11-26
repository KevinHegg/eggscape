/** How quickly the cart crosses the road when asked to: `npx tsx scripts/steer.ts`. */
import { leanToward } from "../src/sim/autoplay";
import { COURSE } from "../src/sim/course";
import { Game } from "../src/sim/game";

const bare = { ...COURSE, walls: [], towers: [], oil: [], pickups: [] };
for (const from of [20, 190]) {
  const game = await Game.create(["pulley", "screw", "lever"], bare);
  while (game.distance < from) game.step({ lean: leanToward(game, from === 190 ? -2.7 : 0) });
  const x0 = game.position.x;
  const row: string[] = [];
  let most = -99;
  for (let step = 0; step < 150; step += 1) {
    game.step({ lean: leanToward(game, x0 + 3) });
    most = Math.max(most, game.position.x - x0);
    if (step % 15 === 14) row.push((game.position.x - x0).toFixed(2));
  }
  console.log(`v=${game.speed.toFixed(0)} asked +3 m: every 0.25 s ${row.join(" ")}  overshoot ${(most - 3).toFixed(2)} shell ${game.shell.toFixed(0)}`);
}
