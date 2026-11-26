import assert from "node:assert/strict";
import { test } from "node:test";
import { driver, idle, play, steady, type Pilot } from "../src/sim/autoplay";
import { COURSE } from "../src/sim/course";
import { Game } from "../src/sim/game";
import { PART_IDS, type PartId } from "../src/sim/parts";

const CLASSIC: PartId[] = ["lever", "plane", "wedge"];
/** Drives well but never touches the gun, so the towers get their say. */
const unarmed = driver({ shoot: false });

test("a cart left to itself does not get home", async () => {
  const out = await play(CLASSIC, idle);
  assert.equal(out.phase, "broken");
  assert.ok(out.distance < COURSE.finish);
});

test("a sensible driver brings the King home", async () => {
  const out = await play(CLASSIC, steady);
  assert.equal(out.phase, "won");
  assert.ok(out.stars >= 2, `stars ${out.stars}`);
  assert.ok(out.time > 18 && out.time < 40, `a run should take about half a minute, took ${out.time.toFixed(1)}s`);
});

test("a run replays exactly", async () => {
  const first = await play(CLASSIC, steady);
  const second = await play(CLASSIC, steady);
  assert.equal(first.trace, second.trace);
  assert.equal(first.shell, second.shell);
});

test("every cart ends its run one way or the other, and the build matters", async () => {
  const results = new Set<string>();
  for (let a = 0; a < PART_IDS.length; a += 1) {
    for (let b = a + 1; b < PART_IDS.length; b += 1) {
      for (let c = b + 1; c < PART_IDS.length; c += 1) {
        const out = await play([PART_IDS[a]!, PART_IDS[b]!, PART_IDS[c]!], steady);
        assert.notEqual(out.phase, "run");
        results.add(`${out.phase}:${out.stars}:${Math.round(out.shell / 10)}:${out.men}`);
      }
    }
  }
  assert.ok(results.size >= 5, `only ${results.size} distinct outcomes across twenty carts`);
});

test("the shield turns an arrow volley; without it a man is lost", async () => {
  const run = async (pilot: Pilot): Promise<{ blocked: number; lost: number }> => {
    const game = await Game.create(CLASSIC);
    const seen = { blocked: 0, lost: 0 };
    while (!game.over && game.distance < 160) {
      game.step(pilot(game));
      for (const event of game.takeEvents()) {
        if (event.type !== "volley") continue;
        if (event.blocked) seen.blocked += 1;
        if (event.lostMan) seen.lost += 1;
      }
    }
    return seen;
  };
  const guarded = await run(unarmed);
  assert.ok(guarded.blocked >= 1);
  assert.equal(guarded.lost, 0);
  // Stay right, clear of the first barricade, and never raise the shield.
  const bare = await run((game) => ({ lean: game.position.x < 2.5 ? 1 : 0, fire: [] }));
  assert.ok(bare.lost >= 1);
});

test("a swatted stone brings down the tower that threw it", async () => {
  const game = await Game.create(CLASSIC);
  let down = false;
  while (!game.over && game.distance < 130 && !down) {
    game.step(unarmed(game));
    down ||= game.takeEvents().some((event) => event.type === "towerDown" && event.tower === "m1");
  }
  assert.ok(down);
});

test("the gun brings a tower down, and a dry gun says so", async () => {
  const game = await Game.create(CLASSIC);
  const seen = new Set<string>();
  assert.ok(game.ammo.length > 0);
  while (!game.over && game.distance < 60) {
    game.step({ lean: 0, fire: [], shoot: game.target?.kind === "tower" });
    for (const event of game.takeEvents()) seen.add(event.type);
  }
  assert.ok(seen.has("shoot") && seen.has("bang") && seen.has("towerDown"), [...seen].join(","));
  const empty = await Game.create(CLASSIC, { ...COURSE, pickups: [] });
  let dry = false;
  for (let step = 0; step < 600 && !empty.over; step += 1) {
    empty.step({ lean: 0, fire: [], shoot: true });
    dry ||= empty.takeEvents().some((event) => event.type === "dry");
  }
  assert.ok(dry);
  assert.equal(empty.ammo.length, 0);
});

test("the leaps are real air, and a rolling cart lands them whole", async () => {
  const game = await Game.create(["pulley", "screw", "wheel"], { ...COURSE, walls: [], towers: [], oil: [], pickups: [] });
  const airs: number[] = [];
  while (!game.over && game.time < 60) {
    game.step({ lean: 0, fire: [] });
    for (const event of game.takeEvents()) if (event.type === "air") airs.push(event.time);
  }
  assert.equal(game.phase, "won");
  assert.equal(airs.length, 3);
  assert.ok(Math.max(...airs) > 1.8, `longest flight ${Math.max(...airs).toFixed(2)}s`);
  assert.ok(game.shell > 90, `shell ${game.shell}`);
});
