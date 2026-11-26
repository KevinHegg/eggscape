/**
 * Miller's Leap, measured: for each way of driving it, how fast she left the bridge, how far
 * and how long she flew, and what it cost. Run: npx tsx scripts/leap.ts
 */
import { miller, type Milling, type Pilot } from "../src/sim/autoplay";
import { STREETS } from "../src/sim/course";
import { Game } from "../src/sim/game";

const course = STREETS.find((street) => street.name === "Miller's Leap")!;
const stump = course.pieces.find((piece) => piece.x0 !== undefined)!;

async function run(name: string, plan: Milling, verbose = false): Promise<void> {
  const game = await Game.create(course);
  const pilot: Pilot = miller(plan);
  let off = 0;
  let on = 0;
  let top = 0;
  let stoneAt = "";
  let lead = 0;
  const leads: string[] = [];
  const notes: string[] = [];
  while (!game.over && game.time < 60) {
    const before = game.distance;
    game.step(pilot(game));
    if (before < stump.d1 && game.distance >= stump.d1) off = game.speed;
    if (before < stump.d0 && game.distance >= stump.d0) on = game.speed;
    top = Math.max(top, game.speed);
    if (before < 80 && game.distance >= 80 && game.stone?.body) lead = -game.stone.body.translation().z - game.distance;
    for (const mark of [20, 40, 60, 80, 100]) if (before < mark && game.distance >= mark && game.stone?.body) leads.push(`${mark}:${(-game.stone.body.translation().z - game.distance).toFixed(0)}`);
    for (const event of game.takeEvents()) {
      if (event.type === "thud") stoneAt = `thud@${game.time.toFixed(1)}s cart d=${game.distance.toFixed(0)}`;
      if (event.type === "plunge") notes.push(`plunge@${game.time.toFixed(1)}s cart d=${game.distance.toFixed(0)}`);
      if (event.type === "breach") notes.push(`breach@${game.time.toFixed(1)}s cart d=${game.distance.toFixed(0)}`);
      if (event.type === "kick") notes.push(`kick +${event.gain.toFixed(1)}${event.braked ? " braked" : ""}@${game.distance.toFixed(0)}`);
      if (event.type === "fuse") notes.push(`fuse@${game.distance.toFixed(0)} v=${game.speed.toFixed(1)}`);
      if (event.type === "air") notes.push(`air ${event.distance.toFixed(1)}m ${event.time.toFixed(2)}s`);
      if (event.type === "jolt" && (event.amount > 0.5 || event.absorbed > 0.5)) notes.push(`jolt ${event.amount.toFixed(0)}+${event.absorbed.toFixed(0)}@${game.distance.toFixed(0)}`);
      if (verbose && (event.type === "bowled" || event.type === "boom" || event.type === "panic")) notes.push(`${event.type}@${game.distance.toFixed(0)}`);
    }
  }
  console.log(`${name.padEnd(16)} ${game.phase}${game.cause ? `(${game.cause})` : ""} d=${game.distance.toFixed(0)} t=${game.time.toFixed(1)} on=${on.toFixed(1)} off=${off.toFixed(1)} top=${top.toFixed(1)} leads=${leads.join(" ")} shell=${game.shell.toFixed(0)} hay=${game.hay} stars=${game.stars} knocks=${game.knocks} | ${stoneAt} ${notes.join(", ")}`);
  game.dispose();
}

await run("sensible", { eggs: true });
await run("no eggs", {});
await run("no charge", { light: false, eggs: true });
await run("held brake", { hold: true, eggs: true });
for (const early of [-1.2, -0.9, -0.6, -0.4, -0.2, 0.2, 0.4, 0.6, 0.9, 1.2]) await run(`early ${early}`, { early, eggs: true });
await run("no stone", { stone: false, eggs: true });
await run("idle shots", { stone: false, wall: false });
await run("no rank shots", { ranks: false, eggs: true });
for (const [brake, off] of [[20, 0], [40, 0], [40, 10], [40, 20], [60, 20], [90, 30], [90, 45], [10, -8]] as const) await run(`brake ${brake}-${off}`, { brake, off, eggs: true });
await run("left lane", { ramp: -3, eggs: true });
await run("centre", { ramp: 0, eggs: true });
await run("ramp 1", { ramp: 1, eggs: true });
await run("ramp 4", { ramp: 4, eggs: true });
await run("stone lane", { lane: -3, ramp: 2.2, eggs: true });
await run("wake, no ranks", { lane: -3, ramp: 2.2, eggs: true, ranks: false });
await run("late shot wake", { lane: -3, ramp: 2.2, eggs: true, ranks: false, traps: false });
