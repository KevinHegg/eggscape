import assert from "node:assert/strict";
import { test } from "node:test";
import { baker, driver, idle, leanAt, leanToward, miller, pilotFor, play, sapper, steady, tumbler, type Pilot } from "../src/sim/autoplay";
import { COURSE, STREETS, type CourseDef } from "../src/sim/course";
import { BRAKE_FLOOR, DUCK, EGG_BASKET, Game, KEG_KICK, KICK_BRAKED, KICK_TOP, MAX_AMMO, RAM_SPEED, SHOT_PILE, START_AMMO, START_EGGS, STONE_PACE, type Carry, type GameEvent, type Input } from "../src/sim/game";

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
const street = (name: string): CourseDef => STREETS.find((one) => one.name === name)!;
const POWDER_ROW = street("Powder Row");
const PUDDING_LANE = street("Pudding Lane");
const MILLERS_LEAP = street("Miller's Leap");
const CAULDRON_GATE = street("Cauldron Gate");
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
  assert.equal(game.phase, "through");
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
  assert.equal(game.phase, "through");
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

test("a sensible driver rides every street home without a mark", async () => {
  let carry: Carry | undefined;
  let last: Game | null = null;
  let time = 0;
  assert.deepEqual(STREETS.map((one) => one.name), ["Bell Tower Street", "Powder Row", "Pudding Lane", "Cauldron Gate", "Miller's Leap"]);
  for (const course of STREETS) {
    const { game } = await run(pilotFor(course), () => false, course, carry);
    assert.ok(game.phase === "through" || game.phase === "won", `${course.name}: ${game.phase} ${game.cause} at ${Math.round(game.distance)} m`);
    assert.equal(game.knocks, 0, `${course.name}: knocked about`);
    carry = game.carry;
    time += game.time;
    last = game;
  }
  assert.equal(last!.phase, "won");
  assert.equal(last!.stars, 3, `shell ${last!.shell} knocks ${last!.knocks}`);
  assert.ok(time < STREETS.length * 25, `${STREETS.length} streets in ${time.toFixed(1)} s`);
});

// ---------------------------------------------------------------- Miller's Leap

const STUMP = MILLERS_LEAP.pieces.find((piece) => piece.x0 !== undefined)!;
const CHARGE = MILLERS_LEAP.kegs.find((keg) => keg.fuse !== undefined)!;

test("the millstone keeps its lane, leads the cart all the way down, and goes into the gorge", async () => {
  const { game, events } = await run(miller({ eggs: true }), () => false, MILLERS_LEAP);
  const order = events.map((event) => event.type).filter((type) => type === "stoneLoose" || type === "thud" || type === "breach" || type === "plunge" || type === "finish");
  assert.deepEqual(order, ["stoneLoose", "thud", "breach", "plunge", "finish"]);
  const bowled = events.filter((event) => event.type === "bowled" && event.by === "stone").map((event) => (event.type === "bowled" ? event.id : -1));
  const inItsWay = MILLERS_LEAP.mob.filter((one) => Math.abs(one.x - MILLERS_LEAP.mill!.x) < 1.7).map((one) => one.id);
  assert.deepEqual(bowled, inItsWay, "everyone in its lane, and nobody else");
  const itsKegs = MILLERS_LEAP.kegs.filter((keg) => Math.abs(keg.x - MILLERS_LEAP.mill!.x) < 1).map((keg) => keg.id);
  for (const id of itsKegs) assert.equal(game.kegs.find((keg) => keg.def.id === id)!.state, "gone", `keg ${id}`);
  assert.equal(game.stone!.state, "gone");
  assert.equal(game.phase, "won");
  assert.equal(game.stars, 3, `shell ${game.shell} knocks ${game.knocks}`);
});

test("the stone is never caught up by a cart in its own lane", async () => {
  const game = await Game.create(MILLERS_LEAP);
  const pilot = miller({ lane: MILLERS_LEAP.mill!.x, traps: false, ranks: false });
  let nearest = Infinity;
  let fastest = 0;
  while (!game.over && game.time < 60) {
    game.step(pilot(game));
    if (game.stone?.body && game.stone.state === "rolling") {
      nearest = Math.min(nearest, -game.stone.body.translation().z - game.distance);
      fastest = Math.max(fastest, -game.stone.body.linvel().z);
    }
  }
  assert.ok(nearest > 6, `it led by as little as ${nearest.toFixed(1)} m`);
  assert.ok(fastest < STONE_PACE + 3.5, `it reached ${fastest.toFixed(1)} m/s`);
  assert.equal(game.phase, "won", `${game.cause} at ${Math.round(game.distance)} m`);
  game.dispose();
});

test("the gorge is wider than a cart can jump: it wants the charge behind her", async () => {
  const without = await play(miller({ light: false, eggs: true }), 100, MILLERS_LEAP);
  assert.equal(without.phase, "broken", JSON.stringify(without));
  assert.equal(without.cause, "fell");
  const { game, events } = await run(miller({ eggs: true }), () => false, MILLERS_LEAP);
  const kick = events.find((event) => event.type === "kick");
  assert.ok(kick && kick.type === "kick" && !kick.braked && kick.gain > 3, `thrown: ${JSON.stringify(kick)}`);
  assert.ok(events.findIndex((event) => event.type === "fuse" && event.id === CHARGE.id) < events.indexOf(kick), "lit, and then it goes");
  assert.equal(game.phase, "won");
  assert.equal(game.knocks, 0, "far enough past it to be pushed and not hurt");
});

test("with the brake on when it goes, the push is not enough to get her over", async () => {
  // On from just short of the charge until she is off the bridge.
  const { game, events } = await run(miller({ brake: 10, off: -8, eggs: true }), () => false, MILLERS_LEAP);
  const kick = events.find((event) => event.type === "kick");
  assert.ok(kick && kick.type === "kick" && kick.braked, `the brake had her: ${JSON.stringify(kick)}`);
  assert.ok(kick.gain <= KEG_KICK.speed * KICK_BRAKED + 0.01, `only ${kick.gain.toFixed(1)} m/s out of it`);
  assert.equal(game.phase, "broken");
  assert.equal(game.cause, "fell");
  // Nor does it help to keep it on from the lighting of the fuse.
  const held = await play(miller({ hold: true, eggs: true }), 100, MILLERS_LEAP);
  assert.equal(held.phase, "broken", JSON.stringify(held));
  // Brake down to the charge, light it from close to, and let her go: that is a way of doing it.
  const freed = await play(miller({ brake: 40, off: 0, eggs: true }), 100, MILLERS_LEAP);
  assert.equal(freed.phase, "won", JSON.stringify(freed));
  assert.equal(freed.stars, 3, JSON.stringify(freed));
});

test("light the fuse too late and she is past it; too soon and it costs her, or goes off in her face", async () => {
  const late = await play(miller({ early: -0.9, eggs: true }), 100, MILLERS_LEAP);
  assert.equal(late.phase, "broken", JSON.stringify(late));
  // A little soon and she is still inside the blast when it throws her: over, and marked for it.
  const soon = await play(miller({ early: 0.6, eggs: true }), 100, MILLERS_LEAP);
  assert.equal(soon.phase, "won", JSON.stringify(soon));
  assert.ok(soon.knocks > 0 && soon.stars < 3, JSON.stringify(soon));
});

test("only the right-hand half of the bridge is left", async () => {
  const left = await play(miller({ ramp: MILLERS_LEAP.mill!.x, eggs: true }), 100, MILLERS_LEAP);
  assert.equal(left.phase, "broken", JSON.stringify(left));
  assert.equal(left.cause, "fell");
  assert.ok(left.distance < STUMP.d1 + 13, `she went in at ${left.distance} m`);
  for (const ramp of [0, 1, 4]) assert.equal((await play(miller({ ramp, eggs: true }), 100, MILLERS_LEAP)).phase, "won", `taking it at x=${ramp}`);
});

test("a clean leap lands in the straw without a mark", async () => {
  const { game, events } = await run(miller({ eggs: true }), () => false, MILLERS_LEAP);
  const air = events.find((event) => event.type === "air" && event.distance > 5);
  assert.ok(air && air.type === "air" && air.time > 0.7, "a good long way through the air");
  assert.equal(game.shell, 100);
  assert.equal(game.hay, 2);
});

test("nobody gets down Miller's Leap by sitting still, and the stone is the cheap way through", async () => {
  assert.equal((await play(idle, 100, MILLERS_LEAP)).phase, "broken");
  const stubborn = await play(miller({ stone: false, wall: false }), 100, MILLERS_LEAP);
  assert.equal(stubborn.phase, "broken", JSON.stringify(stubborn));
  // Follow the stone down its own lane and one round does for the whole hill.
  const { game } = await run(miller({ lane: MILLERS_LEAP.mill!.x, ranks: false, eggs: true }), () => false, MILLERS_LEAP);
  assert.equal(game.phase, "won");
  assert.equal(game.stars, 3);
  assert.ok(game.ammo >= 2, `${game.ammo} rounds left`);
});

test("Miller's Leap replays exactly", async () => {
  const sign = async (): Promise<string> => {
    const { game, events } = await run(miller({ eggs: true }), () => false, MILLERS_LEAP);
    const p = game.position;
    return JSON.stringify([game.tick, p.x, p.y, p.z, game.shell, events.length, game.props.map((prop) => prop.body.translation().x)]);
  };
  assert.equal(await sign(), await sign());
});

test("Powder Row replays exactly", async () => {
  const sign = async (): Promise<string> => {
    const { game, events } = await run(sapper({ how: "train", eggs: true }), () => false, POWDER_ROW);
    const p = game.position;
    return JSON.stringify([game.tick, p.x, p.y, p.z, game.shell, events.length, game.props.map((prop) => prop.body.translation().x)]);
  };
  assert.equal(await sign(), await sign());
});

// ---------------------------------------------------------------- Pudding Lane

/** A line down Pudding Lane that goes round every keg in the road. */
const WEAVE: [number, number][] = [
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
const WALL_RANK = 1;
const bowledBy = (events: GameEvent[], by: string): number[] => events.flatMap((event) => (event.type === "bowled" && event.by === by ? [event.id] : []));

test("nobody gets down Pudding Lane by sitting still, or by driving straight at it", async () => {
  assert.equal((await play(idle, 100, PUDDING_LANE)).phase, "broken");
  const straight = await play(baker({ way: "fire", traps: false, ranks: false, light: false }), 100, PUDDING_LANE);
  assert.equal(straight.phase, "broken", JSON.stringify(straight));
});

test("water: the cistern soaks every keg down to the charge and carries the kitchen off", async () => {
  const { game, events } = await run(baker({ eggs: true }), () => false, PUDDING_LANE);
  const reach = PUDDING_LANE.cistern!.d + PUDDING_LANE.cistern!.reach;
  for (const keg of game.kegs) assert.equal(keg.state, keg.def.d <= reach ? "wet" : "set", `keg ${keg.def.id} at ${keg.def.d} m`);
  assert.equal(game.kegs.find((keg) => keg.def.fuse !== undefined)!.state, "wet", "the charge with the rest");
  assert.deepEqual(bowledBy(events, "flood"), PUDDING_LANE.mob.filter((one) => one.d <= reach).map((one) => one.id));
  assert.ok(!events.some((event) => event.type === "boom" || event.type === "kick"), "wet powder does nothing at all");
  // So the shield wall is still standing, and it is rounds or nothing.
  assert.ok(bowledBy(events, "shot").length > 0);
  assert.equal(game.phase, "through");
  assert.equal(game.stars, 3, `shell ${game.shell} knocks ${game.knocks}`);
  assert.equal(game.ammo, START_AMMO - 3 + SHOT_PILE, "one for the cistern and one for each rank, and the pile at the bottom");
});

test("fire: the charge behind her sends her through the shield wall like a ball through skittles", async () => {
  const { game, events } = await run(baker({ way: "fire", eggs: true }), () => false, PUDDING_LANE);
  const kick = events.find((event) => event.type === "kick");
  assert.ok(kick && kick.type === "kick" && !kick.braked, JSON.stringify(kick));
  assert.equal(bowledBy(events, "cart").length, 0, "nobody clouted her");
  // With no eggs flying to put their heads down, the ones in her road are simply gone through.
  const plain = await run(baker({ way: "fire" }), () => false, PUDDING_LANE);
  const rammed = bowledBy(plain.events, "ram");
  assert.ok(rammed.length >= 2, `through ${rammed.length} of them`);
  assert.ok(rammed.every((id) => PUDDING_LANE.mob.find((one) => one.id === id)!.d > PUDDING_LANE.kegs.find((keg) => keg.fuse !== undefined)!.d));
  assert.equal(bowledBy(plain.events, "cart").length, 0, "and it cost her nothing");
  assert.equal(game.phase, "through");
  assert.equal(game.stars, 3, `shell ${game.shell} knocks ${game.knocks}`);
  assert.ok(game.ammo >= START_AMMO - 1, `${game.ammo} rounds left`);
  assert.equal(game.flood!.state, "held");
});

test("there is a way to weave through the kegs without touching one", async () => {
  const { game, events } = await run(baker({ way: "fire", traps: false, lane: WEAVE, eggs: true }), () => false, PUDDING_LANE);
  for (const keg of game.kegs) if (keg.def.trap) assert.equal(keg.state, "set", `keg ${keg.def.id}`);
  assert.equal(events.filter((event) => event.type === "boom").length, 1, "only the charge");
  assert.equal(game.stars, 3, `shell ${game.shell} knocks ${game.knocks}`);
});

test("an egg apiece puts enough heads down to get through a rank without a round", async () => {
  const { game, events } = await run(baker({ ranks: false, duck: true, eggs: true }), () => false, PUDDING_LANE);
  assert.equal(bowledBy(events, "cart").length, 0, "nobody clouted her");
  assert.equal(bowledBy(events, "shot").length, 0);
  assert.equal(game.phase, "through");
  assert.equal(game.ammo, START_AMMO - 1 + SHOT_PILE, "only the one for the cistern");
  // With neither eggs nor rounds she does not get through at all: a shield wall is a wall.
  const blunt = await run(baker({ ranks: false }), () => false, PUDDING_LANE);
  assert.equal(blunt.game.phase, "broken", `${blunt.game.phase} with shell ${blunt.game.shell}`);
  const wallAt = PUDDING_LANE.mob.find((one) => one.shield)!.d;
  assert.ok(blunt.game.distance < wallAt + 1, `stopped at ${blunt.game.distance.toFixed(0)} m`);
  assert.ok(blunt.events.filter((event) => event.type === "bash").length >= 3, "thrown back off it, again and again");
  assert.equal(bowledBy(blunt.events, "cart").filter((id) => PUDDING_LANE.mob.find((one) => one.id === id)!.shield).length, 0, "and not one of them shifted");
});

test("brake through the blast and she reaches the shield wall at a walk", async () => {
  const { game, events } = await run(baker({ way: "fire", hold: true, ranks: false }), () => false, PUDDING_LANE);
  assert.equal(bowledBy(events, "ram").length, 0, "no going through anybody at that pace");
  assert.ok(events.some((event) => event.type === "bash"), "and they are waiting for her");
  assert.equal(game.phase, "broken");
  const wall = PUDDING_LANE.mob.filter((one) => one.rank === WALL_RANK);
  assert.ok(wall.length >= 6 && wall.every((one, index) => one.shield && (index === 0 || one.x - wall[index - 1]!.x < 2.3 - 0.4)), "shoulder to shoulder");
  const thrown = events.flatMap((event) => (event.type === "throw" ? [event.id] : []));
  assert.ok(!thrown.some((id) => wall.some((one) => one.id === id)), "both hands on the shield: nothing thrown from the wall");
});

test("only powder gets her up to ramming speed", async () => {
  const plans: [CourseDef, Pilot][] = [
    [COURSE, steady],
    [POWDER_ROW, sapper({ eggs: true })],
    [PUDDING_LANE, baker({ light: false, eggs: true })],
    [MILLERS_LEAP, miller({ light: false, eggs: true })],
  ];
  for (const [course, pilot] of plans) {
    const game = await Game.create(course);
    const edge = course.pieces.find((piece) => piece.x0 !== undefined)?.d1 ?? Infinity;
    let top = 0;
    while (!game.over && game.time < 100 && game.distance < edge) {
      game.step(pilot(game));
      top = Math.max(top, -game.velocity.z);
    }
    assert.ok(top < RAM_SPEED - 0.3, `${course.name}: ${top.toFixed(1)} m/s with no powder behind her`);
    game.dispose();
  }
  assert.ok(KICK_TOP > RAM_SPEED + 1);
});

test("Pudding Lane replays exactly, by fire and by water", async () => {
  for (const way of ["fire", "water"] as const) {
    const sign = async (): Promise<string> => {
      const { game, events } = await run(baker({ way, eggs: true }), () => false, PUDDING_LANE);
      const p = game.position;
      return JSON.stringify([game.tick, p.x, p.y, p.z, game.shell, events.length, game.props.map((prop) => prop.body.translation().x)]);
    };
    assert.equal(await sign(), await sign());
  }
});

// ---------------------------------------------------------------- Cauldron Gate

const SAW = CAULDRON_GATE.seesaw!;
const KITCHEN_WALL = CAULDRON_GATE.walls[0]!;
const count = (events: GameEvent[], type: GameEvent["type"]): number => events.filter((event) => event.type === type).length;

test("nobody gets through the kitchen wall by sitting still, or by driving at the gate", async () => {
  for (const pilot of [idle, (game: Game): Input => ({ lean: leanToward(game, KITCHEN_WALL.gate!.x) })]) {
    const { game } = await run(pilot, () => false, CAULDRON_GATE);
    assert.equal(game.phase, "broken");
    assert.ok(game.distance < KITCHEN_WALL.d, `stopped at the wall: ${game.distance.toFixed(1)}`);
    assert.equal(game.walls[0]!.state, "up");
  }
});

test("on the long arm when the cauldron lands, she goes over the wall and comes down in the hay", async () => {
  let crossed = 0;
  let was = 0;
  const { game, events } = await run(tumbler({ eggs: true }), (current) => {
    if (was < KITCHEN_WALL.d && current.distance >= KITCHEN_WALL.d) crossed = current.position.y - current.walls[0]!.body.translation().y;
    was = current.distance;
    return false;
  }, CAULDRON_GATE);
  const wham = events.find((event) => event.type === "wham");
  assert.ok(wham?.type === "wham" && wham.flung === "cart" && !wham.hit, JSON.stringify(wham));
  assert.equal(game.walls[0]!.state, "up", "the gate never opened");
  assert.ok(crossed > KITCHEN_WALL.height / 2 + 1, `well clear of the top of it: ${crossed.toFixed(1)}`);
  const air = events.find((event) => event.type === "air" && event.time > 1.5);
  assert.ok(air, "a second and a half in the air");
  assert.equal(game.phase, "through");
  assert.equal(game.stars, 3, `shell ${game.shell} knocks ${game.knocks}`);
  assert.equal(game.shell, 100);
  assert.equal(game.hay, 2, "the hay took the landing");
  assert.ok(count(events, "shoot") <= 3, "a round for the rope, and one for each rank in her road");
});

test("the brake is what makes the see-saw easy: braked or not, there is a moment that works", async () => {
  for (const [brake, early] of [[true, -0.6], [true, 0.3], [false, -0.3], [false, 0]] as const) {
    const { game, events } = await run(tumbler({ eggs: true, brake, early }), () => false, CAULDRON_GATE);
    const wham = events.find((event) => event.type === "wham");
    assert.ok(wham?.type === "wham" && wham.flung === "cart", `brake ${brake} early ${early}: ${JSON.stringify(wham)}`);
    assert.equal(game.stars, 3, `brake ${brake} early ${early}`);
  }
  // Without it the same slip that the brake forgives puts her under the cauldron, or leaves her short of the plank.
  const late = await run(tumbler({ eggs: true, brake: false, early: -0.6 }), () => false, CAULDRON_GATE);
  const hit = late.events.find((event) => event.type === "wham");
  assert.ok(hit?.type === "wham" && hit.hit && hit.flung === "none", JSON.stringify(hit));
  assert.ok(late.game.knocks > 0);
  const soon = await run(tumbler({ eggs: true, brake: false, early: 0.3 }), () => false, CAULDRON_GATE);
  const missed = soon.events.find((event) => event.type === "wham");
  assert.ok(missed?.type === "wham" && !missed.hit && missed.flung === "none", JSON.stringify(missed));
});

test("cut the rope too soon and the see-saw is wasted: there is still the gate", async () => {
  let sprungAt = -1;
  const { game, events } = await run(tumbler({ eggs: true, early: 0.9 }), (current) => {
    if (sprungAt < 0 && current.seesaw!.state === "sprung") sprungAt = current.distance;
    return false;
  }, CAULDRON_GATE);
  assert.ok(sprungAt > 0 && sprungAt < SAW.d - SAW.near, `she was not on it: ${sprungAt.toFixed(1)}`);
  assert.equal(game.seesaw!.body, null, "the plank is in two and out of the road");
  assert.equal(game.walls[0]!.state, "down");
  assert.equal(game.phase, "through");
  assert.ok(count(events, "shoot") >= 3, "the rope, the gate, and the shield wall behind it");
});

test("what is on the plank goes over the wall: left there, the keg lands in the kitchen behind the gate", async () => {
  const { game, events } = await run(tumbler({ way: "keg", eggs: true }), () => false, CAULDRON_GATE);
  const wham = events.find((event) => event.type === "wham");
  assert.ok(wham?.type === "wham" && wham.flung === "keg", JSON.stringify(wham));
  const boom = events.find((event) => event.type === "boom" && -event.at.z > KITCHEN_WALL.d);
  assert.ok(boom, "it came down beyond the wall");
  const blown = events.filter((event) => event.type === "bowled" && event.by === "blast").length;
  assert.ok(blown >= 3, `it went off among the shield wall: ${blown}`);
  assert.equal(game.walls[0]!.state, "down", "and took the gate off its hinges from behind");
  assert.equal(count(events, "shoot"), 3, "the rope, and a rank up the hill and down it: nothing for the gate");
  assert.equal(game.phase, "through");
  assert.equal(game.stars, 3);
  // Ride on to the plank without bursting it first, and it goes off under her instead.
  const under = await run(tumbler({ eggs: true, keg: true }), () => false, CAULDRON_GATE);
  assert.ok(under.game.knocks > 0);
  assert.ok(under.game.stars < 3);
});

test("knocking at the gate gets her through, at a price: more rounds than flying, or a beating", async () => {
  const fly = await run(tumbler({ eggs: true }), () => false, CAULDRON_GATE);
  const knock = await run(tumbler({ way: "gate", eggs: true }), () => false, CAULDRON_GATE);
  assert.equal(knock.game.phase, "through");
  assert.equal(knock.game.seesaw!.pot, "hung", "the cauldron is still up there");
  assert.ok(count(knock.events, "shoot") > count(fly.events, "shoot"), `${count(knock.events, "shoot")} rounds against ${count(fly.events, "shoot")}`);
  const cheap = await run(tumbler({ way: "gate", eggs: true, duck: true }), () => false, CAULDRON_GATE);
  assert.ok(cheap.game.knocks > 0, "with one round and eggs, the shield wall gets its licks in");
});

test("only the gate gives: the stone either side of it stands", async () => {
  const knock = tumbler({ way: "gate", eggs: true });
  const { game } = await run((current) => {
    const input = knock(current);
    // Once the gate is open, make for the wall beside it instead.
    return current.walls[0]!.state === "down" ? { ...input, lean: leanToward(current, 4.2), brake: 0 } : input;
  }, () => false, CAULDRON_GATE);
  assert.equal(game.walls[0]!.state, "down");
  assert.equal(game.phase, "broken");
  assert.ok(game.distance < KITCHEN_WALL.d + 1, `stopped by the wall: ${game.distance.toFixed(1)}`);
});

test("Cauldron Gate replays exactly, over the wall and through it", async () => {
  for (const pilot of [() => tumbler({ eggs: true }), () => tumbler({ way: "keg", eggs: true })]) {
    const sign = async (): Promise<string> => {
      const { game, events } = await run(pilot(), () => false, CAULDRON_GATE);
      const p = game.position;
      return JSON.stringify([game.tick, p.x, p.y, p.z, game.shell, game.eggs, game.ammo, events.length]);
    };
    assert.equal(await sign(), await sign());
  }
});
