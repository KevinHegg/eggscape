/** Headless look at a run: `npm run probe -- [idle|right|left|hop] [parts,comma,separated]`. */
import { Game, STEP } from "../src/sim/game";
import type { PartId } from "../src/sim/parts";

const mode = process.argv[2] ?? "idle";
const build = (process.argv[3]?.split(",") ?? ["lever", "plane", "wedge"]) as PartId[];
const game = await Game.create(build);
let last = -1;
let peak = 0;
for (let tick = 0; tick < 60 * 60 && game.after < 2; tick += 1) {
  const t = tick * STEP;
  let lean = 0;
  const fire: PartId[] = [];
  if (mode === "right" && t > 1 && t < 2) lean = 1;
  if (mode === "left" && t > 1 && t < 2) lean = -1;
  if (mode === "hop" && tick === 120) fire.push("screw");
  game.step({ lean, fire });
  peak = Math.max(peak, game.jolt);
  for (const event of game.takeEvents()) {
    if (event.type === "plough" || event.type === "land") continue;
    console.log(`${t.toFixed(2)}s d=${game.distance.toFixed(0)}`, JSON.stringify(event));
  }
  const bucket = Math.floor(t * 2);
  if (bucket !== last) {
    last = bucket;
    const p = game.position;
    console.log(
      `${t.toFixed(1)}s d=${game.distance.toFixed(1)} x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} v=${game.speed.toFixed(1)} shell=${game.shell.toFixed(0)} men=${game.men} peakJolt=${peak.toFixed(2)} ${game.grounded ? "" : "AIR"} ${game.slick ? "OIL" : ""}`,
    );
    peak = 0;
  }
}
console.log(`END phase=${game.phase} cause=${game.cause} t=${game.time.toFixed(1)} shell=${game.shell.toFixed(0)} men=${game.men} stars=${game.stars}`);
