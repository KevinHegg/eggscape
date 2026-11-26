/**
 * Pudding Lane, measured: for each way of getting down it, what happened and what it cost.
 * Run: npx tsx scripts/lane.ts
 */
import { baker, idle, type Baking, type Pilot } from "../src/sim/autoplay";
import { STREETS } from "../src/sim/course";
import { Game } from "../src/sim/game";

const course = STREETS.find((street) => street.name === "Pudding Lane")!;

export const WEAVE: [number, number][] = [
  [28, 1.4],
  [39, 1.4],
  [46, -0.8],
  [49, -0.8],
  [56, 1],
  [66, 1],
  [72, -0.8],
  [75, -0.8],
  [82, 1.6],
  [87, 1.6],
  [96, 0],
];

async function run(name: string, pilot: Pilot): Promise<void> {
  const game = await Game.create(course);
  let top = 0;
  const notes: string[] = [];
  const marks: string[] = [];
  while (!game.over && game.time < 60) {
    const before = game.distance;
    game.step(pilot(game));
    top = Math.max(top, game.speed);
    for (const mark of [38, 66, 105, 115, 125]) if (before < mark && game.distance >= mark) marks.push(`${mark}:${game.speed.toFixed(1)}${game.flood ? `/${(game.flood.front - game.distance).toFixed(0)}` : ""}`);
    for (const event of game.takeEvents()) {
      const at = game.distance.toFixed(0);
      if (event.type === "kick") notes.push(`kick +${event.gain.toFixed(1)}${event.braked ? " braked" : ""}@${at}`);
      else if (event.type === "fuse") notes.push(`fuse${event.id}@${at}`);
      else if (event.type === "boom") notes.push(`boom${event.id}@${at}`);
      else if (event.type === "doused") notes.push(`wet${event.id}`);
      else if (event.type === "flood") notes.push(`flood@${at}`);
      else if (event.type === "ebb") notes.push(`ebb@${at}`);
      else if (event.type === "jolt" && (event.amount > 0.5 || event.absorbed > 0.5)) notes.push(`JOLT ${event.amount.toFixed(0)}+${event.absorbed.toFixed(0)}@${at}`);
      else if (event.type === "bash") notes.push(`BASH@${at}`);
      else if (event.type === "bowled") notes.push(`${event.by}@${at}`);
    }
  }
  console.log(`${name.padEnd(18)} ${game.phase}${game.cause ? `(${game.cause})` : ""} d=${game.distance.toFixed(0)} t=${game.time.toFixed(1)} top=${top.toFixed(1)} shell=${game.shell.toFixed(0)} hay=${game.hay} stars=${game.stars} knocks=${game.knocks} ammo=${game.ammo} eggs=${game.eggs} | ${marks.join(" ")} | ${notes.join(", ")}`);
  game.dispose();
}

const go = (plan: Baking): Pilot => baker(plan);
await run("idle", idle);
await run("water", go({ eggs: true }));
await run("water, no brake", go({ follow: false, eggs: true }));
await run("water, no charge", go({ light: false, eggs: true }));
await run("water, no rounds", go({ light: false, ranks: false, eggs: true }));
await run("fire, eggs", go({ way: "fire", eggs: true }));
await run("fire, slalom", go({ way: "fire", traps: false, lane: WEAVE, eggs: true }));
await run("fire, duck", go({ way: "fire", ranks: false, duck: true, eggs: true }));
await run("fire, weave, duck", go({ way: "fire", traps: false, ranks: false, duck: true, lane: WEAVE, eggs: true }));
await run("water, duck", go({ ranks: false, duck: true, eggs: true }));
await run("fire, straight", go({ way: "fire", traps: false, ranks: false, light: false }));
await run("fire, held brake", go({ way: "fire", hold: true, eggs: true }));
await run("fire, no charge", go({ way: "fire", light: false, eggs: true }));
for (const early of [-0.8, -0.4, 0.4, 0.8]) await run(`fire early ${early}`, go({ way: "fire", early, eggs: true }));
