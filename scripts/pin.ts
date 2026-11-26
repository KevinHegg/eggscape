/**
 * Rolling Pin Hill, every way of dealing with the pin: out of its road in the square, or in
 * front of it all the way down. Prints how near it got, where it went by or caught her, how
 * many times its own powder threw her on, and how it ended.
 */
import { STREETS } from "../src/sim/course";
import { Game } from "../src/sim/game";
import { idle, leanToward, runner, type Pilot } from "../src/sim/autoplay";

const course = STREETS.find((street) => street.name === "Rolling Pin Hill")!;

async function run(name: string, pilot: Pilot): Promise<void> {
  const game = await Game.create(course);
  let nearest = 99;
  let past = "";
  let kicks = 0;
  let shots = 0;
  let bowled = 0;
  let top = 0;
  let mouth = 0;
  while (!game.over && game.time < 100) {
    game.step(pilot(game));
    const pin = game.pin!;
    if (pin.state === "rolling" && pin.d < game.distance) nearest = Math.min(nearest, game.distance - pin.d);
    top = Math.max(top, -game.velocity.z);
    if (!mouth && game.distance >= course.square!.d0) mouth = game.distance - pin.d;
    for (const event of game.takeEvents()) {
      if (event.type === "pinPast") past = `went by at ${Math.round(-event.at.z)}`;
      if (event.type === "kick" && event.gain > 0.5) kicks += 1;
      if (event.type === "shoot") shots += 1;
      if (event.type === "bowled" && event.by === "pin") bowled += 1;
    }
  }
  console.log(
    `${name.padEnd(30)} ${game.phase.padEnd(7)} ${(game.cause ?? "").padEnd(7)} at ${Math.round(game.distance).toString().padStart(3)} stars ${game.stars} shell ${Math.round(game.shell).toString().padStart(3)} hay ${game.hay} knocks ${game.knocks} shots ${shots} eggs ${game.eggs} lead at the square ${mouth.toFixed(1)} nearest ${nearest.toFixed(1).padStart(4)} top ${top.toFixed(1)} kicks ${kicks} pin bowled ${bowled} ${past} pin ${game.pin!.state} ${Math.round(game.pin!.d)} t ${game.time.toFixed(1)}`,
  );
  game.dispose();
}

await run("idle", idle);
await run("straight, right of middle", (game) => ({ lean: leanToward(game, 1) }));
await run("square", runner({ eggs: true }));
await run("square, no brake", runner({ eggs: true, brake: false }));
await run("square, egg the cooks", runner({ eggs: true, duck: true }));
await run("run", runner({ way: "run", eggs: true }));
await run("run, no charge", runner({ way: "run", eggs: true, light: false }));
await run("run, eggs not rounds", runner({ way: "run", eggs: true, duck: true }));
await run("run, brake from 100", runner({ way: "run", eggs: true, dawdle: 100 }));
for (const early of [-0.6, -0.3, 0.3, 0.6]) await run(`run, fuse ${early > 0 ? "+" : ""}${early}`, runner({ way: "run", eggs: true, early }));
