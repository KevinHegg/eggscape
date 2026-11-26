import assert from "node:assert/strict";
import { test } from "node:test";
import { driver, idle, leanAt, leanToward, pilotFor, play, sapper, steady, type Pilot } from "../src/sim/autoplay";
import { COURSE, STREETS, type CourseDef } from "../src/sim/course";
import { BRAKE_FLOOR, DUCK, EGG_BASKET, Game, MAX_AMMO, START_EGGS, type Carry, type GameEvent, type Input } from "../src/sim/game";

/** Play a street to its end and hand back the game itself, with everything that happened. */
async function run(pilot: Pilot, until: (game: Game) => boolean = () => false, course: CourseDef = COURSE, carry?: Carry): Promise<{ game: Game; events: GameEvent[] }> {
  const game = await Game.create(course, carry);
  const events: GameEvent[] = [];
  while (!game.over && game.time < 100 && !until(game)) {
    game.step(pilot(game));
    events.push(...game.takeEvents());
  }
  return { game, events };
}

const TOWER = COURSE.tower!;
const POWDER_ROW = STREETS[1]!;
const lane = (TOWER.x0 + TOWER.x1) / 2;

test("a cart nobody drives does not get home", async () => {
  const outcome = await play(idle);
  assert.notEqual(outcome.phase, "through", JSON.stringify(outcome));
  // Nor does one that steers for the tower and never fires at the winch.
  const { game } = await run((current) => ({ lean: leanToward(current, lane) }));
  assert.notEqual(game.phase, "through", `${game.phase} ${game.cause}`);
});

test("a sensible driver gets him home without a mark", async () => {
  const outcome = await play(steady);
  assert.equal(outcome.phase, "through", JSON.stringify(outcome));
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
  while (!game.over && game.distance < TOWER.d + 16) {
    game.step(pilot(game));
    if (game.tower!.state === "down" && game.distance > TOWER.d - 3) worst = Math.max(worst, game.jolt);
  }
  assert.equal(game.tower!.state, "down");
  assert.ok(worst < 0.5, `crossing it is no rougher than the street: worst jolt ${worst.toFixed(2)}`);
  assert.equal(game.shell, 100);
});

test("with the brake never touched, she is at the bank before the tower is down", async () => {
  // Fired the instant the winch lights: she rides the tower down as it falls, and it costs her.
  const prompt = await play(driver({ brake: 0, wain: true }));
  assert.ok(prompt.shell < 100 || prompt.phase !== "through", JSON.stringify(prompt));
  // Fired a second late: she meets it standing.
  const late = await play(driver({ wait: 1, brake: 0, wain: true }));
  assert.ok(late.phase !== "through" || late.shell < 40, JSON.stringify(late));
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
  assert.ok(Math.abs(-bell.z - COURSE.sacks!.d) < 3.5 && Math.abs(bell.x - lane) < 1.2, `the bell lies at d=${(-bell.z).toFixed(1)} x=${bell.x.toFixed(1)}`);
});

test("the wain clears the right of the street and ends against the well", async () => {
  const { game, events } = await run(steady);
  assert.equal(events.filter((event) => event.type === "bowled" && event.by === "wain").length, 6);
  assert.equal(game.wain!.state, "wrecked");
  assert.ok(Math.abs(-game.wain!.body.translation().z - COURSE.well!.d) < 3.5);
  assert.equal(game.knocks, 0);
});

test("without the wain the right of the street costs him his hay", async () => {
  const outcome = await play(driver());
  assert.equal(outcome.phase, "through", JSON.stringify(outcome));
  assert.ok(outcome.knocks >= 4 && outcome.hay === 0 && outcome.stars < 3, JSON.stringify(outcome));
});

test("a driver with no nerve is pelted for it", async () => {
  const brave = await play(driver());
  const timid = await play(driver({ brake: 1, dawdle: true }));
  assert.ok(timid.phase !== "through" || timid.shell < brave.shell - 20, `timid ${JSON.stringify(timid)} brave ${JSON.stringify(brave)}`);
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

// ---------------------------------------------------------------- the eggs

const FAR_BANK = TOWER.d + Math.sin(TOWER.rest) * TOWER.height;
const noWain = driver({});
const clutterAt = (kind: string, d: number): number => COURSE.clutter.find((one) => one.kind === kind && Math.abs(one.d - d) < 0.5)!.id;

/** Drive with `pilot`, adding whatever `extra` asks for, and collect what happens. */
async function drive(pilot: Pilot, extra: (game: Game) => Partial<Input>, until: (game: Game) => boolean = () => false, course: CourseDef = COURSE): Promise<{ game: Game; events: GameEvent[] }> {
  return run((game) => ({ ...pilot(game), ...extra(game) }), until, course);
}

test("an egg knocks what they throw out of the air", async () => {
  const plain = await run(noWain);
  const egged = await run(driver({ eggs: true }));
  const downed = egged.events.filter((event) => event.type === "splat" && event.hit === "pan").length;
  assert.ok(downed >= 4, `only ${downed} knocked down`);
  assert.equal(egged.game.phase, "through");
  assert.ok(egged.game.knocks < plain.game.knocks, `${egged.game.knocks} knocks with eggs, ${plain.game.knocks} without`);
  assert.ok(egged.game.hay > plain.game.hay, `hay ${egged.game.hay} against ${plain.game.hay}`);
});

test("an egg puts a cook's head down, and not for long, and does him no other harm", async () => {
  let hitAt = -1;
  const { game, events } = await drive(
    noWain,
    (current) => (current.distance > FAR_BANK - 6 && current.eggs === START_EGGS ? { egg: { cook: 4 } } : {}),
    (current) => {
      const cook = current.mob.find((one) => one.def.id === 4)!;
      if (hitAt < 0 && cook.state === "down") hitAt = current.time;
      return hitAt >= 0 && current.time > hitAt + DUCK + 0.2;
    },
  );
  assert.ok(hitAt > 0, "the egg never found him");
  assert.ok(events.some((event) => event.type === "splat" && event.hit === "cook" && event.kind === 4));
  assert.equal(game.mob.find((one) => one.def.id === 4)!.state, "stand", "he should be up again");
  assert.equal(game.eggs, START_EGGS - 1);
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
  step({ lean: 0, egg: { clutter: far } }, 30);
  assert.ok(events.some((event) => event.type === "dry" && event.why === "far"));
  assert.equal(game.eggs, START_EGGS, "an egg that cannot reach is not thrown");
  step({ lean: 0, egg: { clutter: near } }, 40);
  assert.ok(events.some((event) => event.type === "smash" && event.kind === "pot"));
  assert.equal(game.eggs, START_EGGS - 1);
  step({ lean: 0, egg: { clutter: near } }, 40);
  assert.equal(game.eggs, START_EGGS - 1, "it is already in bits");
  game.dispose();
});

test("a basket flattens the cook under it and a barrel sends its neighbours diving", async () => {
  const pot = clutterAt("pot", FAR_BANK + 16);
  const barrel = clutterAt("barrel", FAR_BANK + 20);
  const { game, events } = await drive(
    noWain,
    (current) => (current.distance < FAR_BANK - 4 ? {} : current.clutter[pot]!.done ? { egg: { clutter: barrel } } : { egg: { clutter: pot } }),
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
    (current) => (current.distance > FAR_BANK - 12 && !current.clutter[queen]!.done ? { egg: { clutter: queen } } : {}),
    (current) => {
      if (goneAt < 0 && current.clutter[queen]!.done) goneAt = current.time;
      return goneAt >= 0 && current.time > goneAt + 2.5;
    },
  );
  assert.ok(goneAt > 0, "her crown is still on");
  const at = events.findIndex((event) => event.type === "smash" && event.kind === "queen");
  assert.equal(events.slice(at).filter((event) => event.type === "throw").length, 0);
});

test("he starts with a dozen eggs, and when they are gone they are gone", async () => {
  const game = await Game.create();
  const events: GameEvent[] = [];
  for (let step = 0; step < 60 * 5; step += 1) {
    game.step({ lean: 0, brake: 1, egg: { at: { x: 0, y: game.position.y, z: game.position.z - 12 } } });
    events.push(...game.takeEvents());
  }
  assert.equal(events.filter((event) => event.type === "lob").length, START_EGGS);
  assert.equal(game.eggs, 0);
  assert.ok(events.some((event) => event.type === "dry" && event.why === "eggs"));
  game.dispose();
});

test("a basket of eggs and a pile of shot in the road are his for the driving over", async () => {
  const eggs = COURSE.pickups.find((one) => one.kind === "eggs")!;
  const shot = COURSE.pickups.find((one) => one.kind === "shot")!;
  const { game, events } = await run(
    (current) => ({ lean: leanToward(current, current.distance < eggs.d + 2 ? eggs.x : shot.x), brake: 1 }),
    (current) => current.distance > shot.d + 3,
  );
  assert.deepEqual(events.filter((event) => event.type === "pickup").map((event) => (event.type === "pickup" ? event.kind : "")), ["eggs", "shot"]);
  assert.equal(game.eggs, START_EGGS + EGG_BASKET);
  assert.equal(game.ammo, MAX_AMMO);
});

// ---------------------------------------------------------------- powder

test("a keg in the road goes off under a cart that comes too near, and not under one that bursts it first", async () => {
  const trap = POWDER_ROW.kegs.find((keg) => keg.trap)!;
  const blind = await run((current) => ({ lean: leanToward(current, trap.x) }), (current) => current.distance > trap.d + 8, POWDER_ROW);
  assert.ok(blind.events.some((event) => event.type === "boom" && event.id === trap.id));
  assert.ok(blind.game.hay < 2 && blind.game.knocks === 1, `hay ${blind.game.hay} knocks ${blind.game.knocks}`);
  const wary = await run(sapper({ how: "none", lane: trap.x }), (current) => current.distance > trap.d + 8, POWDER_ROW);
  assert.ok(wary.events.some((event) => event.type === "boom" && event.id === trap.id));
  assert.equal(wary.game.hay, 2);
  assert.equal(wary.game.knocks, 0);
});

test("one egg sets the whole powder train going, keg by keg, and the wagon takes the barricade with it", async () => {
  const { game, events } = await run(sapper({ how: "train" }), () => false, POWDER_ROW);
  const train = POWDER_ROW.kegs.filter((keg) => !keg.trap).map((keg) => keg.id);
  const went = events.filter((event) => event.type === "boom" && train.includes(event.id)).map((event) => (event.type === "boom" ? event.id : -1));
  assert.deepEqual(went, train, "down the kerb in order, the wagon last");
  assert.ok(events.some((event) => event.type === "breach"));
  assert.ok(events.some((event) => event.type === "bowled" && event.by === "blast"), "somebody was minding the powder");
  assert.equal(game.phase, "won");
  assert.equal(game.shell, 100);
});

test("ride the powder train without the brake and it catches her", async () => {
  const { game } = await run(sapper({ how: "train", brake: false }), () => false, POWDER_ROW);
  assert.equal(game.phase, "broken", `she got ${Math.round(game.distance)} m`);
});

test("nobody gets down Powder Row without shifting the barricade", async () => {
  assert.equal((await play(idle, 100, POWDER_ROW)).phase, "broken");
  const patient = await play(sapper({ how: "none" }), 100, POWDER_ROW);
  assert.equal(patient.phase, "broken", JSON.stringify(patient));
  assert.equal(patient.cause, "caught");
});

test("a round at the barricade brings it down, and the wagon beside it goes up", async () => {
  const pilot = sapper({ how: "none" });
  const { game, events } = await drive(pilot, (current) => (current.targets.find((target) => target.id === "wall0")?.lit ? { shoot: "wall0" } : {}), () => false, POWDER_ROW);
  assert.ok(events.some((event) => event.type === "breach"));
  assert.ok(events.some((event) => event.type === "boom" && event.big));
  assert.equal(game.phase, "won");
});

// ---------------------------------------------------------------- one street into the next

test("what she has left goes through the gate with her", async () => {
  const first = await run(noWain);
  assert.equal(first.game.phase, "through");
  const carry = first.game.carry;
  const second = await Game.create(POWDER_ROW, carry);
  assert.equal(second.shell, first.game.shell);
  assert.equal(second.stage, first.game.stage);
  assert.equal(second.hay, first.game.hay);
  assert.equal(second.eggs, first.game.eggs);
  assert.equal(second.ammo, first.game.ammo);
  assert.equal(second.knocks, first.game.knocks);
  assert.ok(second.speed >= 5 && second.speed <= 9.1, `she comes in at ${second.speed.toFixed(1)} m/s`);
  second.dispose();
});

test("a sensible driver rides both streets home without a mark", async () => {
  let carry: Carry | undefined;
  let last: Game | null = null;
  let time = 0;
  for (const street of STREETS) {
    const { game } = await run(pilotFor(street), () => false, street, carry);
    assert.ok(game.phase === "through" || game.phase === "won", `${street.name}: ${game.phase} ${game.cause} at ${Math.round(game.distance)} m`);
    carry = game.carry;
    time += game.time;
    last = game;
  }
  assert.equal(last!.phase, "won");
  assert.equal(last!.stars, 3, `shell ${last!.shell} knocks ${last!.knocks}`);
  assert.ok(time < 50, `two streets in ${time.toFixed(1)} s`);
});

test("Powder Row replays exactly", async () => {
  const sign = async (): Promise<string> => {
    const { game, events } = await run(sapper({ how: "train", eggs: true }), () => false, POWDER_ROW);
    const p = game.position;
    return JSON.stringify([game.tick, p.x, p.y, p.z, game.shell, events.length, game.props.map((prop) => prop.body.translation().x)]);
  };
  assert.equal(await sign(), await sign());
});
