/** What a held drag does, and how she settles when the finger lifts: `npx tsx scripts/hold.ts`. */
import { leanAt, leanToward } from "../src/sim/autoplay";
import { COURSE } from "../src/sim/course";
import { Game } from "../src/sim/game";

const bare = { ...COURSE, walls: [], towers: [], oil: [], pickups: [] };
for (const rate of [0.3, 1]) {
  for (const from of [20, 262]) {
    const game = await Game.create(["pulley", "screw", "lever"], bare);
    while (game.distance < from) game.step({ lean: leanToward(game, -3) });
    const x0 = game.position.x;
    const held: string[] = [];
    for (let step = 0; step < 60; step += 1) {
      game.step({ lean: leanAt(game, rate) });
      if (step % 12 === 11) held.push(`${(game.position.x - x0).toFixed(2)}@${game.velocity.x.toFixed(1)}`);
    }
    const lifted = game.position.x;
    for (let step = 0; step < 60; step += 1) game.step({ lean: leanAt(game, 0) });
    const coast = game.position.x - lifted;
    for (let step = 0; step < 150; step += 1) game.step({ lean: leanAt(game, 1) });
    console.log(
      `drag ${rate} v=${game.speed.toFixed(0)}: every 0.2 s ${held.join(" ")}  coasts ${coast.toFixed(2)} m; held hard over she sits at x=${game.position.x.toFixed(2)} of ${(COURSE.width / 2).toFixed(1)}, shell ${game.shell.toFixed(0)}`,
    );
  }
}
