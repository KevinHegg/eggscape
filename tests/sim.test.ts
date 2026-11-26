import assert from "node:assert/strict";
import { test } from "node:test";
import { driver, idle, leanAt, leanToward, play, steady, type Pilot } from "../src/sim/autoplay";
import { COURSE } from "../src/sim/course";
import { BRAKE_FLOOR, DUCK, Game, START_STONES, type GameEvent, type Input } from "../src/sim/game";

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

// ---------------------------------------------------------------- the sling

const FAR_BANK = COURSE.tower.d + Math.sin(COURSE.tower.rest) * COURSE.tower.height;
const noWain = driver({});
const clutterAt = (kind: string, d: number): number => COURSE.clutter.find((one) => one.kind === kind && Math.abs(one.d - d) < 0.5)!.id;

/** Drive with `pilot`, adding whatever `extra` asks for, and collect what happens. */
async function drive(pilot: Pilot, extra: (game: Game) => Partial<Input>, until: (game: Game) => boolean = () => false): Promise<{ game: Game; events: GameEvent[] }> {
  return run((game) => ({ ...pilot(game), ...extra(game) }), until);
}

test("a stone knocks what they throw out of the air", async () => {
  const plain = await run(noWain);
  const slung = await run(driver({ sling: true }));
  const downed = slung.events.filter((event) => event.type === "ping" && event.what === "pan").length;
  assert.ok(downed >= 4, `only ${downed} knocked down`);
  assert.equal(slung.game.phase, "won");
  assert.ok(slung.game.knocks < plain.game.knocks, `${slung.game.knocks} knocks with the sling, ${plain.game.knocks} without`);
  assert.ok(slung.game.hay > plain.game.hay, `hay ${slung.game.hay} against ${plain.game.hay}`);
});

test("a stone puts a cook's head down, and not for long", async () => {
  let hitAt = -1;
  const { game, events } = await drive(
    noWain,
    (current) => (current.distance > FAR_BANK - 6 && current.stones === START_STONES ? { sling: { cook: 4 } } : {}),
    (current) => {
      const cook = current.mob.find((one) => one.def.id === 4)!;
      if (hitAt < 0 && cook.state === "down") hitAt = current.time;
      return hitAt >= 0 && current.time > hitAt + DUCK + 0.2;
    },
  );
  assert.ok(hitAt > 0, "the stone never found him");
  assert.ok(events.some((event) => event.type === "ping" && event.what === "cook" && event.kind === 4));
  assert.equal(game.mob.find((one) => one.def.id === 4)!.state, "stand", "he should be up again");
  assert.equal(game.stones, START_STONES - 1);
});

test("anything loose in the village can be set off, once, and only from in range", async () => {
  const game = await Game.create();
  const near = clutterAt("pot", 20);
  const far = COURSE.clutter[COURSE.clutter.length - 1]!.id;
  const events: GameEvent[] = [];
  const step = (input: Input, steps = 1): void => {
    for (let index = 0; index < steps; index += 1) {
      game.step(index === 0 ? input : { lean: 0 });
      events.push(...game.takeEvents());
    }
  };
  step({ lean: 0, sling: { clutter: far } }, 30);
  assert.ok(events.some((event) => event.type === "dry" && event.why === "far"));
  assert.equal(game.stones, START_STONES, "a stone that cannot reach is not thrown");
  step({ lean: 0, sling: { clutter: near } }, 40);
  assert.ok(events.some((event) => event.type === "smash" && event.kind === "pot"));
  assert.equal(game.stones, START_STONES - 1);
  step({ lean: 0, sling: { clutter: near } }, 40);
  assert.equal(game.stones, START_STONES - 1, "it is already in bits");
  game.dispose();
});

test("a basket flattens the cook under it and a barrel sends its neighbours diving", async () => {
  const pot = clutterAt("pot", FAR_BANK + 16);
  const barrel = clutterAt("barrel", FAR_BANK + 20);
  const { game, events } = await drive(
    noWain,
    (current) => (current.distance < FAR_BANK - 4 ? {} : current.clutter[pot]!.done ? { sling: { clutter: barrel } } : { sling: { clutter: pot } }),
    (current) => current.clutter[barrel]!.done,
  );
  const flattened = events.filter((event) => event.type === "bowled" && event.by === "pot");
  assert.deepEqual(flattened.map((event) => (event.type === "bowled" ? event.id : -1)), [4]);
  const right = game.mob.filter((one) => one.def.x >= 2 && one.def.rank < 2);
  assert.deepEqual(right.map((one) => one.state).sort(), ["down", "down", "down", "out"]);
});

test("knock the Queen's crown off and the kitchen forgets to throw", async () => {
  const queen = COURSE.clutter.find((one) => one.kind === "queen")!.id;
  let goneAt = -1;
  const { events } = await drive(
    noWain,
    (current) => (current.distance > FAR_BANK - 12 && !current.clutter[queen]!.done ? { sling: { clutter: queen } } : {}),
    (current) => {
      if (goneAt < 0 && current.clutter[queen]!.done) goneAt = current.time;
      return goneAt >= 0 && current.time > goneAt + 2.5;
    },
  );
  assert.ok(goneAt > 0, "her crown is still on");
  const at = events.findIndex((event) => event.type === "smash" && event.kind === "queen");
  assert.equal(events.slice(at).filter((event) => event.type === "throw").length, 0);
});

test("the bag holds a dozen stones and no more", async () => {
  const game = await Game.create();
  const events: GameEvent[] = [];
  for (let step = 0; step < 60 * 5; step += 1) {
    game.step({ lean: 0, brake: 1, sling: { at: { x: 0, y: game.position.y, z: game.position.z - 12 } } });
    events.push(...game.takeEvents());
  }
  assert.equal(events.filter((event) => event.type === "sling").length, START_STONES);
  assert.equal(game.stones, 0);
  assert.ok(events.some((event) => event.type === "dry" && event.why === "stones"));
  game.dispose();
});
