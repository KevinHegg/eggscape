import assert from "node:assert/strict";
import { test } from "node:test";
import { driver, idle, leanToward, play, steady, type Pilot } from "../src/sim/autoplay";
import { COURSE } from "../src/sim/course";
import { Game, type GameEvent } from "../src/sim/game";
import { PART_IDS, type PartId } from "../src/sim/parts";

const CLASSIC: PartId[] = ["lever", "plane", "wedge"];
const BARE = { ...COURSE, walls: [], towers: [], oil: [], pickups: [] };
/** Drives well but never touches the gun, so the towers get their say. */
const unarmed = driver({ shoot: false });
/** Holds the middle of the road and does nothing else: every ring lands on it. */
const straight: Pilot = (game) => ({ lean: leanToward(game, 0) });

async function watch(build: PartId[], pilot: Pilot, until: number, course = COURSE): Promise<{ game: Game; events: GameEvent[] }> {
  const game = await Game.create(build, course);
  const events: GameEvent[] = [];
  while (!game.over && game.distance < until && game.time < 120) {
    game.step(pilot(game));
    events.push(...game.takeEvents());
  }
  return { game, events };
}

test("no cart gets home with nobody steering", async () => {
  for (const build of [CLASSIC, ["pulley", "screw", "wheel"], ["lever", "plane", "wheel"]] as PartId[][]) {
    const out = await play(build, idle);
    assert.equal(out.phase, "broken", build.join("+"));
    assert.ok(out.distance < COURSE.finish);
  }
});

test("a sensible driver brings the King home", async () => {
  const out = await play(CLASSIC, steady);
  assert.equal(out.phase, "won");
  assert.ok(out.stars >= 2, `stars ${out.stars}`);
  assert.ok(out.time > 28 && out.time < 60, `a run should take most of a minute, took ${out.time.toFixed(1)}s`);
});

test("a run replays exactly, pile-ups and all", async () => {
  for (const build of [CLASSIC, ["lever", "plane", "wheel"]] as PartId[][]) {
    const first = await play(build, steady);
    const second = await play(build, steady);
    assert.equal(first.trace, second.trace, build.join("+"));
    assert.equal(first.shell, second.shell);
  }
});

test("most carts can be driven home, and every run ends", async () => {
  let home = 0;
  for (let a = 0; a < PART_IDS.length; a += 1) {
    for (let b = a + 1; b < PART_IDS.length; b += 1) {
      for (let c = b + 1; c < PART_IDS.length; c += 1) {
        const out = await play([PART_IDS[a]!, PART_IDS[b]!, PART_IDS[c]!], steady);
        assert.notEqual(out.phase, "run");
        if (out.phase === "won") home += 1;
      }
    }
  }
  assert.ok(home >= 15, `only ${home} of twenty carts got home`);
});

test("the brake slows her, and never stops her", async () => {
  const free = await watch(["pulley", "screw", "wheel"], straight, 120, BARE);
  const braked = await watch(["pulley", "screw", "wheel"], (game) => ({ lean: leanToward(game, 0), brake: 1 }), 120, BARE);
  assert.ok(braked.game.time > free.game.time * 1.25, `free ${free.game.time.toFixed(1)}s, braked ${braked.game.time.toFixed(1)}s`);
  assert.ok(braked.game.distance >= 120);
  assert.ok(braked.events.some((event) => event.type === "brake"));
});

test("the roof turns three blows aside and then is spent", async () => {
  const { game, events } = await watch(["plane", "pulley", "screw"], straight, 148);
  const turned = events.filter((event) => event.type === "deflect" || (event.type === "volley" && event.blocked)).length;
  assert.ok(turned >= 1 && turned <= 3, `turned ${turned}`);
  assert.equal(game.machine("plane")!.charges, 3 - turned);
});

test("archers hit a cart that stays in the ring, and miss one that leaves it", async () => {
  const stayed = await watch(["pulley", "screw", "wheel"], straight, 148);
  assert.ok(stayed.events.some((event) => event.type === "volley" && event.hit && event.lostMan));
  const left = await watch(["pulley", "screw", "wheel"], unarmed, 148);
  assert.ok(left.events.some((event) => event.type === "volley" && !event.hit));
});

test("the batting arm sends a stone back and brings down the tower that threw it", async () => {
  const { events } = await watch(CLASSIC, straight, 130);
  assert.ok(events.some((event) => event.type === "swat"));
  assert.ok(events.some((event) => event.type === "towerDown" && event.tower === "m1"));
});

test("hay takes the knocks before the shell does", async () => {
  const { game, events } = await watch(["plane", "wheel", "lever"], straight, 60);
  const jolts = events.filter((event): event is Extract<GameEvent, { type: "jolt" }> => event.type === "jolt");
  assert.ok(jolts.some((jolt) => jolt.absorbed > 0), "the first barricade should cost him hay");
  assert.ok(game.hay < 2);
  const pressed = await Game.create(["screw", "wheel", "lever"]);
  assert.ok(pressed.bale > game.bale);
});

test("the gun brings a tower down, and a dry gun says so", async () => {
  const game = await Game.create(CLASSIC);
  const seen = new Set<string>();
  assert.ok(game.ammo.length > 0);
  while (!game.over && game.distance < 60) {
    game.step({ lean: 0, shoot: game.target?.kind === "tower" });
    for (const event of game.takeEvents()) seen.add(event.type);
  }
  assert.ok(seen.has("shoot") && seen.has("bang") && seen.has("towerDown"), [...seen].join(","));
  const empty = await Game.create(CLASSIC, { ...COURSE, pickups: [] });
  let dry = false;
  for (let step = 0; step < 600 && !empty.over; step += 1) {
    empty.step({ lean: 0, shoot: true });
    dry ||= empty.takeEvents().some((event) => event.type === "dry");
  }
  assert.ok(dry);
  assert.equal(empty.ammo.length, 0);
});

test("the leaps are real air, and she lands them whole at any speed", async () => {
  for (const brake of [0, 1]) {
    const pilot = driver({ shoot: false, brake: false });
    const { game, events } = await watch(["pulley", "screw", "wheel"], (now) => ({ ...pilot(now), brake }), 9999, BARE);
    const airs = events.filter((event): event is Extract<GameEvent, { type: "air" }> => event.type === "air").map((event) => event.time);
    assert.equal(game.phase, "won", `brake ${brake}`);
    assert.ok(game.shell > 90, `brake ${brake}: shell ${game.shell}`);
    if (brake === 0) {
      assert.equal(airs.length, 3);
      assert.ok(Math.max(...airs) > 1.5, `longest flight ${Math.max(...airs).toFixed(2)}s`);
    }
  }
});

test("a bridge with a side gone drops a cart that is on the wrong side", async () => {
  const { game } = await watch(["pulley", "screw", "wheel"], straight, 9999, BARE);
  assert.equal(game.phase, "broken");
  assert.ok(game.distance > 135 && game.distance < 175, `went at ${game.distance.toFixed(0)}`);
});
