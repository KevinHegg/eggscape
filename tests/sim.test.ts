import assert from "node:assert/strict";
import { test } from "node:test";
import { driver, idle, leanAt, leanToward, play, steady, type Pilot } from "../src/sim/autoplay";
import { COURSE } from "../src/sim/course";
import { BRAKE_FLOOR, Game, type GameEvent } from "../src/sim/game";

/** Play a street to its end and hand back the game itself, with everything that happened. */
async function run(pilot: Pilot, until: (game: Game) => boolean = () => false): Promise<{ game: Game; events: GameEvent[] }> {
  const game = await Game.create();
  const events: GameEvent[] = [];
  while (!game.over && game.time < 100 && !until(game)) {
    game.step(pilot(game));
    events.push(...game.takeEvents());
  }
  return { game, events };
}

const lane = (COURSE.tower.x0 + COURSE.tower.x1) / 2;

test("a cart nobody drives does not get home", async () => {
  const outcome = await play(idle);
  assert.notEqual(outcome.phase, "won", JSON.stringify(outcome));
  // Nor does one that steers for the tower and never fires at the winch.
  const { game } = await run((current) => ({ lean: leanToward(current, lane) }));
  assert.notEqual(game.phase, "won", `${game.phase} ${game.cause}`);
});

test("a sensible driver gets him home without a mark", async () => {
  const outcome = await play(steady);
  assert.equal(outcome.phase, "won", JSON.stringify(outcome));
  assert.equal(outcome.stars, 3, JSON.stringify(outcome));
  assert.ok(outcome.time < 30, `a street is short: ${outcome.time} s`);
});

test("a run replays exactly", async () => {
  const sign = async (): Promise<string> => {
    const { game, events } = await run(steady);
    const p = game.position;
    const bell = game.bell.body?.translation();
    return JSON.stringify([game.tick, p.x, p.y, p.z, game.shell, bell?.x, bell?.z, events.length, game.props.map((prop) => prop.body.translation().x)]);
  };
  assert.equal(await sign(), await sign());
});

test("the fallen tower lies flush from bank to bank", async () => {
  const game = await Game.create();
  const pilot = driver();
  let worst = 0;
  while (!game.over && game.distance < COURSE.tower.d + 16) {
    game.step(pilot(game));
    if (game.tower.state === "down" && game.distance > COURSE.tower.d - 3) worst = Math.max(worst, game.jolt);
  }
  assert.equal(game.tower.state, "down");
  assert.ok(worst < 0.5, `crossing it is no rougher than the street: worst jolt ${worst.toFixed(2)}`);
  assert.equal(game.shell, 100);
});

test("with the brake never touched, she is at the bank before the tower is down", async () => {
  // Fired the instant the winch lights: she rides the tower down as it falls, and it costs her.
  const prompt = await play(driver({ brake: 0, wain: true }));
  assert.ok(prompt.shell < 100 || prompt.phase !== "won", JSON.stringify(prompt));
  // Fired a second late: she meets it standing.
  const late = await play(driver({ wait: 1, brake: 0, wain: true }));
  assert.ok(late.phase !== "won" || late.shell < 40, JSON.stringify(late));
});

test("the brake slows her to a walk and never stops her", async () => {
  const game = await Game.create();
  while (game.distance < 40) game.step({ lean: leanToward(game, lane), brake: 1 });
  assert.ok(game.speed > BRAKE_FLOOR - 0.6 && game.speed < BRAKE_FLOOR + 0.6, `full brake: ${game.speed.toFixed(1)} m/s`);
  const free = await Game.create();
  while (free.distance < 40) free.step({ lean: leanToward(free, lane) });
  assert.ok(free.speed > game.speed + 2.5, `let run: ${free.speed.toFixed(1)} m/s`);
});

test("the bell bowls one of every rank, frightens their neighbours, and stops in the woolsacks", async () => {
  const { game, events } = await run(driver());
  const bowled = events.filter((event) => event.type === "bowled" && event.by === "bell");
  assert.equal(bowled.length, 3, "one from each rank");
  assert.equal(events.filter((event) => event.type === "panic").length, 6, "two beside each");
  assert.equal(game.bell.state, "still");
  const bell = game.bell.body!.translation();
  assert.ok(Math.abs(-bell.z - COURSE.sacks.d) < 3.5 && Math.abs(bell.x - lane) < 1.2, `the bell lies at d=${(-bell.z).toFixed(1)} x=${bell.x.toFixed(1)}`);
});

test("the wain clears the right of the street and ends against the well", async () => {
  const { game, events } = await run(steady);
  assert.equal(events.filter((event) => event.type === "bowled" && event.by === "wain").length, 6);
  assert.equal(game.wain.state, "wrecked");
  assert.ok(Math.abs(-game.wain.body.translation().z - COURSE.well.d) < 3.5);
  assert.equal(game.knocks, 0);
});

test("without the wain the right of the street costs him his hay", async () => {
  const outcome = await play(driver());
  assert.equal(outcome.phase, "won", JSON.stringify(outcome));
  assert.ok(outcome.knocks >= 4 && outcome.hay === 0 && outcome.stars < 3, JSON.stringify(outcome));
});

test("a driver with no nerve is pelted for it", async () => {
  const brave = await play(driver());
  const timid = await play(driver({ brake: 1, dawdle: true }));
  assert.ok(timid.phase !== "won" || timid.shell < brave.shell - 20, `timid ${JSON.stringify(timid)} brave ${JSON.stringify(brave)}`);
});

test("a round in among a rank puts it on the ground", async () => {
  const pilot = driver();
  const game = await Game.create();
  while (!game.targets.find((target) => target.id === "rank0")!.lit && !game.over) game.step(pilot(game));
  assert.equal(game.phase, "run");
  const before = game.mob.filter((one) => one.def.rank === 0 && one.state === "stand").length;
  game.step({ ...pilot(game), shoot: "rank0" });
  for (let step = 0; step < 70; step += 1) game.step({ ...pilot(game), shoot: undefined });
  const after = game.mob.filter((one) => one.def.rank === 0 && one.state === "stand").length;
  assert.ok(before > 0 && after === 0, `rank 0 standing: ${before} then ${after}`);
  assert.equal(game.ammo, 1);
});

test("the gun only reaches what is lit, and three rounds is all there is", async () => {
  const game = await Game.create();
  const events: GameEvent[] = [];
  game.step({ lean: 0, shoot: "windlass" });
  events.push(...game.takeEvents());
  assert.ok(events.some((event) => event.type === "dry" && event.why === "aimless"), "out of range at the crest");
  assert.equal(game.ammo, 3);
});

test("a cart that stands still is caught", async () => {
  // She never fires, brakes all the way, and comes to rest against the tower.
  const { game } = await run((current) => ({ lean: leanToward(current, lane), brake: 1 }));
  assert.equal(game.phase, "broken");
  assert.equal(game.cause, "caught");
});

test("a held drag keeps her crossing the street until it is let go, and never grinds the kerb", async () => {
  const game = await Game.create();
  while (game.distance < 12) game.step({ lean: leanToward(game, -3) });
  const from = game.position.x;
  for (let step = 0; step < 30; step += 1) game.step({ lean: leanAt(game, 1) });
  const half = game.position.x - from;
  for (let step = 0; step < 30; step += 1) game.step({ lean: leanAt(game, 1) });
  const whole = game.position.x - from;
  assert.ok(half > 0.5 && whole - half > 1.2, `she kept going: ${half.toFixed(2)} m then ${whole.toFixed(2)} m`);
  const lifted = game.position.x;
  for (let step = 0; step < 60; step += 1) game.step({ lean: leanAt(game, 0) });
  assert.ok(game.position.x - lifted < 0.8, `she steadied within ${(game.position.x - lifted).toFixed(2)} m of the finger lifting`);
  for (let step = 0; step < 120; step += 1) game.step({ lean: leanAt(game, 1) });
  assert.ok(game.position.x < COURSE.width / 2 - 0.6 && game.shell === 100, `held hard over she rides inside the kerb, unhurt (x ${game.position.x.toFixed(2)})`);
});
