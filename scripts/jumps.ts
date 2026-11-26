/** The jumps alone, on an empty road, at every brake setting: `npx tsx scripts/jumps.ts`. */
import { COURSE, chasms } from "../src/sim/course";
import { leanToward } from "../src/sim/autoplay";
import { Game } from "../src/sim/game";

const bare = { ...COURSE, walls: [], towers: [], oil: [], pickups: [] };
console.log("chasms", JSON.stringify(chasms(bare)), "finish", bare.finish, "end y", bare.pieces.at(-1)!.y1.toFixed(1));
for (const brake of [0, 0.5, 1]) {
  const game = await Game.create(["wedge", "lever", "pulley"], bare);
  let takeoff = 0;
  let wasAir = false;
  let top = 0;
  const lines: string[] = [];
  let hurt = 0;
  while (!game.over && game.time < 100) {
    if (!game.grounded && !wasAir) takeoff = game.speed;
    wasAir = !game.grounded;
    // Line up on whichever half of the next bridge is still standing.
    const broken = bare.pieces.find((piece) => piece.x0 !== undefined && piece.d1 > game.distance && piece.d0 - game.distance < 45);
    const goal = broken ? ((broken.x0 ?? 0) + (broken.x1 ?? 0)) / 2 : 0;
    game.step({ lean: leanToward(game, goal), brake });
    top = Math.max(top, game.speed);
    for (const event of game.takeEvents()) {
      if (event.type === "jolt") hurt += event.amount + event.absorbed;
      if (event.type === "air") {
        lines.push(`  air ${event.time.toFixed(2)}s ${event.distance.toFixed(1)}m from v=${takeoff.toFixed(1)} hurt so far ${hurt.toFixed(0)}`);
      }
      if (event.type === "broken") lines.push(`  BROKEN ${event.cause} d=${game.distance.toFixed(1)}`);
    }
  }
  console.log(`brake ${brake}: ${game.phase} t=${game.time.toFixed(1)} top=${top.toFixed(1)} shell=${game.shell.toFixed(0)} hay=${game.hay} hurt=${hurt.toFixed(0)}`);
  for (const line of lines) console.log(line);
}
