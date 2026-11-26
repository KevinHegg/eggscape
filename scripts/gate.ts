/**
 * Cauldron Gate, every way of going at the wall: over it on the see-saw, the keg over it first,
 * or knocking at the gate. Prints where she was when the cauldron landed, how high she crossed
 * the wall, what the landing cost, and how it ended.
 */
import { STREETS } from "../src/sim/course";
import { Game } from "../src/sim/game";
import { idle, tumbler, type Pilot } from "../src/sim/autoplay";

const course = STREETS.find((street) => street.name === "Cauldron Gate")!;
const wall = course.walls[0]!;
const saw = course.seesaw!;

async function run(name: string, pilot: Pilot): Promise<void> {
  const game = await Game.create(course);
  let wham = "";
  let over = 0;
  let before = 0;
  let cost = 0;
  let boom = "";
  let bowled = 0;
  let shots = 0;
  while (!game.over && game.time < 100) {
    const shell = game.shell + game.hay * 22;
    const was = game.distance;
    game.step(pilot(game));
    if (was < wall.d && game.distance >= wall.d) over = game.position.y - course.pieces[course.pieces.length - 1]!.y0;
    for (const event of game.takeEvents()) {
      if (event.type === "wham") {
        wham = `${event.flung}${event.hit ? "+hit" : ""} at arm ${(saw.d - game.distance).toFixed(1)}`;
        before = game.shell + game.padding;
      }
      if (event.type === "boom" && -event.at.z > wall.d) boom = "keg over";
      if (event.type === "bowled") bowled += 1;
      if (event.type === "shoot") shots += 1;
    }
    void shell;
  }
  cost = before ? before - game.shell - game.padding : 0;
  console.log(
    `${name.padEnd(26)} ${game.phase.padEnd(7)} ${(game.cause ?? "").padEnd(8)} stars ${game.stars} shell ${Math.round(game.shell).toString().padStart(3)} hay ${game.hay} knocks ${game.knocks} shots ${shots} eggs ${game.eggs} bowled ${bowled}  ${wham.padEnd(22)} over wall at ${over.toFixed(1)} after ${cost.toFixed(0)} ${boom} t ${game.time.toFixed(1)}`,
  );
  game.dispose();
}

await run("idle", idle);
await run("fly", tumbler({ eggs: true }));
await run("fly, no brake", tumbler({ eggs: true, brake: false }));
for (const early of [-1.2, -0.9, -0.6, -0.3, 0.3, 0.6, 0.9, 1.2]) await run(`fly, rope ${early > 0 ? "+" : ""}${early}`, tumbler({ eggs: true, early }));
for (const early of [-0.6, -0.3, 0.3, 0.6]) await run(`no brake, rope ${early > 0 ? "+" : ""}${early}`, tumbler({ eggs: true, brake: false, early }));
await run("fly, keg left on", tumbler({ eggs: true, keg: true }));
await run("keg over, then knock", tumbler({ way: "keg", eggs: true }));
await run("knock", tumbler({ way: "gate", eggs: true }));
await run("knock, eggs not rounds", tumbler({ way: "gate", eggs: true, duck: true }));
