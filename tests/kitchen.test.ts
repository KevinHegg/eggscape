import assert from "node:assert/strict";
import { before, test } from "node:test";
import { BAKEHOUSE, BOIL, BURN, BUTTERY, CAGE, CELLAR, CISTERN, DOOR_LAPS, DOOR_TURN, Game, IDLE, LARDER, LEVELS, LIFT_SPEED, MILLROOM, PASTRY, RACE, RISE, SCULLERY, SEAT_IDLE, SERVERY, STEP, STOREY, WHEEL_TURN, loadPhysics, type GameEvent, type Input, type LevelDef } from "../src/sim/kitchen";
import { GOOD_DROP, PLANS, bakehousePlan, butteryPlan, cellarPlan, cisternPlan, larderPlan, millPlan, pastryPlan, pilot, sculleryPlan, serveryPlan, type Move } from "../src/sim/pilot";

before(async () => {
  await loadPhysics();
});

function run(hands: (game: Game) => Input, limit = 40, level: LevelDef = LARDER): { game: Game; events: GameEvent[] } {
  const game = new Game(level);
  const events: GameEvent[] = [];
  game.start();
  while (!game.over && game.time < limit) {
    game.step(hands(game));
    events.push(...game.drain());
  }
  return { game, events };
}

const count = (events: GameEvent[], type: GameEvent["type"]): number => events.filter((event) => event.type === type).length;

test("three bales in the right places get him home whole, with three stars", () => {
  const { game, events } = run(pilot(larderPlan()));
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, LARDER.bales - 3);
  assert.equal(game.stars, 3);
  assert.equal(count(events, "fling"), 1);
  assert.ok(game.time < 16, `a clean run is short: took ${game.time.toFixed(1)}s`);
});

test("left alone, the long drop ends him", () => {
  const { game } = run(() => ({}));
  assert.equal(game.phase, "broken");
  assert.ok(game.time < 4);
});

test("a bale under the drop saves him and is burst doing it", () => {
  const { game, events } = run(pilot(larderPlan().slice(0, 1)), 6);
  assert.equal(game.cracks, 0);
  assert.equal(count(events, "burst"), 1);
  assert.equal(game.bales.length, 0);
});

test("sat in the see-saw with nothing done, the hook comes down for him, and slowly", () => {
  const game = new Game(LARDER);
  game.start();
  const hands = pilot(larderPlan().slice(0, 1));
  let last = 0;
  let down = 0;
  while (!game.over && game.time < 40) {
    game.step(hands(game));
    if (game.hook > 0 && game.phase === "run") {
      assert.ok(game.hook >= last, "once let down, the hook does not go back up while he sits there");
      last = game.hook;
      down += STEP;
    }
  }
  assert.equal(game.phase, "caught");
  assert.ok(game.idle >= SEAT_IDLE);
  assert.equal(game.hook, 1);
  assert.ok(down > 3, `the hook took ${down.toFixed(1)}s to come down`);
  assert.ok(SEAT_IDLE > IDLE, "a seat that waits for him is where there is time to think");
});

test("with the hole left open he rolls into the pan", () => {
  const { game } = run(pilot(larderPlan(GOOD_DROP, false)));
  assert.equal(game.phase, "fried");
});

test("a bale laid on the see-saw, not dropped, does not throw him far enough", () => {
  const { game, events } = run(pilot(larderPlan(22.4)));
  assert.notEqual(game.phase, "home");
  assert.equal(count(events, "fling"), 1);
});

test("dropped from as high as there is, it throws him into the wall", () => {
  const { game } = run(pilot(larderPlan(26.4)));
  assert.equal(game.phase, "home");
  assert.ok(game.cracks >= 1, "he should have a crack to show for it");
  assert.ok(game.stars < 3);
});

test("the height of the drop is the strength of the throw", () => {
  const speeds = [23.4, 24.2, 25, 25.8].map((drop) => {
    const { events } = run(pilot(larderPlan(drop)));
    const fling = events.find((event) => event.type === "fling");
    assert.ok(fling && fling.type === "fling");
    return fling.speed;
  });
  for (let index = 1; index < speeds.length; index += 1) assert.ok(speeds[index]! > speeds[index - 1]!, `not rising: ${speeds.join(", ")}`);
});

test("there is a good band of heights that work, not a needle's eye", () => {
  let clean = 0;
  for (let drop = 23.3; drop <= 24.91; drop += 0.2) {
    const { game } = run(pilot(larderPlan(drop)));
    if (game.stars === 3) clean += 1;
  }
  assert.ok(clean >= 8, `only ${clean} of 9 heights between 23.3 and 24.9 were clean`);
});

test("bales run out", () => {
  const game = new Game(LARDER);
  game.start();
  const events: GameEvent[] = [];
  for (let index = 0; index < LARDER.bales + 1; index += 1) {
    game.step({ bale: { x: -3 + index, y: 16 } });
    events.push(...game.drain());
  }
  assert.equal(game.balesLeft, 0);
  assert.equal(count(events, "throw"), LARDER.bales);
  assert.equal(count(events, "empty"), 1);
});

test("a tap near the hole puts the bale in it, and a second one goes on top", () => {
  const game = new Game(LARDER);
  game.start();
  const socket = LARDER.sockets[0]!;
  const first = game.aim(socket.x + 0.6, socket.seat!.y + 0.5);
  assert.equal(first.x, socket.x);
  assert.equal(first.y, socket.seat!.y);
  game.step({ bale: { x: socket.x + 0.6, y: socket.seat!.y + 0.5 } });
  for (let index = 0; index < 90; index += 1) game.step();
  const second = game.aim(socket.x, socket.seat!.y);
  assert.ok(second.y > socket.seat!.y + 0.3, "the second bale should be lifted clear of the first");
});

test("the same taps give the same run, to the last bit", () => {
  const a = run(pilot(larderPlan())).game;
  const b = run(pilot(larderPlan())).game;
  assert.equal(a.time, b.time);
  assert.deepEqual(a.egg, b.egg);
});

// ------------------------------------------------------------------ the house

test("the rooms hang one under another, and each hatch is under the roost above", () => {
  for (let index = 1; index < LEVELS.length; index += 1) {
    const above = LEVELS[index - 1]!;
    const room = LEVELS[index]!;
    assert.equal(room.top, above.bottom);
    assert.equal(above.ends, "roost");
    assert.ok(room.hatch);
    assert.ok(room.start.x > above.nest.x0 && room.start.x < above.nest.x1, "the hatch should be under the roost");
  }
  assert.equal(LEVELS[LEVELS.length - 1]!.ends, "nest");
  for (const level of LEVELS) assert.ok(PLANS[level.key], `no plan for ${level.name}`);
});

test("every room's plan gets him through it whole, with three stars", () => {
  for (const level of LEVELS) {
    const { game } = run(pilot(PLANS[level.key]!()), 40, level);
    assert.equal(game.phase, "home", level.name);
    assert.equal(game.stars, 3, level.name);
    assert.ok(game.time < 22, `${level.name} took ${game.time.toFixed(1)}s`);
  }
});

// ------------------------------------------------------------------ the scullery

const scullery = (hands: (game: Game) => Input, limit = 40) => run(hands, limit, SCULLERY);

test("scullery: four bales in the right places, and one to spare", () => {
  const { game, events } = scullery(pilot(sculleryPlan()));
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, 1);
  assert.equal(count(events, "fling"), 1);
  assert.equal(count(events, "caged"), 0);
});

test("scullery: left alone he is in the pan under the gap, but not at once", () => {
  const { game } = scullery(() => ({}));
  assert.equal(game.phase, "fried");
  assert.ok(game.time > 3 && game.time < 4.5, `he was in the pan at ${game.time.toFixed(1)}s`);
});

test("scullery: there are a good two seconds in which to bridge the gap, and then there are not", () => {
  for (const at of [0.05, 0.6, 1.2, 1.8]) assert.equal(scullery(pilot(sculleryPlan({ bridge: at }))).game.stars, 3, `bridged at ${at}s`);
  // Too late, the bale comes down on top of him in the gap, or after him.
  for (const at of [2.4, 2.6, 2.8]) assert.notEqual(scullery(pilot(sculleryPlan({ bridge: at }))).game.phase, "home", `bridged at ${at}s`);
});

test("scullery: with nothing under the long drop he gets home with a crack", () => {
  const { game } = scullery(pilot(sculleryPlan({ cushion: false })));
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 1);
  assert.equal(game.stars, 2);
});

test("scullery: with the bottom hole left open he rolls into the pan", () => {
  assert.equal(scullery(pilot(sculleryPlan({ stopHole: false }))).game.phase, "fried");
});

test("scullery: the pan under the gap does not take him as he goes by underneath it", () => {
  const { events } = scullery(pilot(sculleryPlan()));
  assert.equal(count(events, "fried"), 0);
});

test("scullery: the see-saw does not wait: with no bale he wallows off the cushion into the cage, and the hook has him", () => {
  const { game, events } = scullery(pilot(sculleryPlan({ toss: false })));
  assert.equal(game.phase, "caught");
  assert.equal(count(events, "caged"), 1);
  assert.equal(count(events, "fling"), 0);
  const caged = events.findIndex((event) => event.type === "caged");
  const caught = events.findIndex((event) => event.type === "caught");
  assert.ok(caged >= 0 && caught > caged);
  assert.equal(game.hook, 1);
  assert.ok(CAGE < IDLE, "out of a cage is quicker than out of anywhere else");
});

test("scullery: there are a good two seconds in which to throw the bale, and it always throws the same", () => {
  let clean = 0;
  const speeds = new Set<string>();
  for (let toss = 4.35; toss < 6.31; toss += 0.1) {
    const { game, events } = scullery(pilot(sculleryPlan({ toss })));
    if (game.stars === 3) clean += 1;
    const fling = events.find((event) => event.type === "fling");
    if (fling && fling.type === "fling") speeds.add(fling.speed.toFixed(2));
  }
  assert.ok(clean >= 19, `only ${clean} of 20 throws between 4.35s and 6.25s were clean`);
  assert.equal(speeds.size, 1, `the throw varied: ${[...speeds].join(", ")}`);
});

test("scullery: thrown too soon or too late, the bale does not save him", () => {
  for (const toss of [3.5, 7, 7.6]) {
    const { game } = scullery(pilot(sculleryPlan({ toss })));
    assert.equal(game.phase, "caught", `thrown at ${toss}s`);
  }
});

test("scullery: the same taps give the same run, to the last bit", () => {
  const a = scullery(pilot(sculleryPlan())).game;
  const b = scullery(pilot(sculleryPlan())).game;
  assert.equal(a.time, b.time);
  assert.deepEqual(a.egg, b.egg);
});

// ------------------------------------------------------------------ the mill

const mill = (hands: (game: Game) => Input, limit = 40) => run(hands, limit, MILLROOM);

test("mill: three bales in the right places, and one to spare", () => {
  assert.ok(IDLE > 2, "the hook gives him a moment");
  const { game, events } = mill(pilot(millPlan()));
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, 1);
  assert.equal(count(events, "sluice"), 1);
  assert.equal(count(events, "water"), 1);
});

test("mill: left alone, the dry wheel gives under him and lets him down into the pan", () => {
  const { game } = mill(() => ({}));
  assert.equal(game.phase, "fried");
  assert.ok(game.time < 6);
  assert.ok(game.wheels[0]!.turn > 0.5, "the wheel should have turned back under him");
});

test("mill: the water takes its moment to come down, and then the wheel turns at its own rate", () => {
  const game = new Game(MILLROOM);
  game.start();
  const at: Record<string, number> = {};
  let before = 0;
  while (game.time < 4) {
    if (Math.abs(game.time - 3) < STEP / 2) before = game.wheels[0]!.turn;
    // No one on the wheel: he is left sitting ready while the bale goes on the pan.
    game.step(game.time < STEP ? { bale: { x: 1.75, y: 30 - STOREY * 2 } } : {});
    for (const event of game.drain()) at[event.type] ??= game.time;
  }
  assert.ok(at.sluice !== undefined && at.water !== undefined);
  assert.ok(Math.abs(at.water - at.sluice - RACE) < 0.05, `the water took ${(at.water - at.sluice).toFixed(2)}s`);
  const turned = before - game.wheels[0]!.turn;
  assert.ok(Math.abs(turned - WHEEL_TURN) < 0.1, `it turned ${turned.toFixed(2)} in a second`);
});

test("mill: whenever the water is let in during the first two seconds, he gets home whole", () => {
  for (let at = 0.05; at < 2.2; at += 0.15) {
    const { game } = mill(pilot(millPlan({ sluice: at })));
    assert.equal(game.stars, 3, `water let in at ${at.toFixed(2)}s: ${game.phase}, ${game.cracks} cracks`);
  }
});

test("mill: let in too late, the water does not save him", () => {
  assert.equal(mill(pilot(millPlan({ sluice: 3 }))).game.phase, "fried");
});

test("mill: with nothing under the drop at the wall he gets home with a crack", () => {
  for (const at of [0.1, 0.3, 0.9, 1.6]) {
    const { game } = mill(pilot(millPlan({ sluice: at, cushion: false })));
    assert.equal(game.phase, "home", `water at ${at}s`);
    assert.equal(game.cracks, 1, `water at ${at}s`);
    assert.equal(game.stars, 2, `water at ${at}s`);
  }
});

test("mill: with the hole left open he rolls into the pan", () => {
  assert.equal(mill(pilot(millPlan({ stopHole: false }))).game.phase, "fried");
});

test("mill: the same taps give the same run, to the last bit", () => {
  const a = mill(pilot(millPlan())).game;
  const b = mill(pilot(millPlan())).game;
  assert.equal(a.time, b.time);
  assert.deepEqual(a.egg, b.egg);
});

// ------------------------------------------------------------------ the buttery

const buttery = (hands: (game: Game) => Input, limit = 40) => run(hands, limit, BUTTERY);
/** Where the door stopped, each time it stopped. */
const ports = (events: GameEvent[]): string[] => events.flatMap((event) => (event.type === "port" ? [event.port] : []));

test("buttery: four bales, and one to spare: out on the right, thrown back up, round again and out on the left", () => {
  const { game, events } = buttery(pilot(butteryPlan()));
  assert.deepEqual(ports(events), ["right", "left"]);
  assert.equal(count(events, "unbar"), 1);
  assert.equal(count(events, "fling"), 1);
  assert.equal(count(events, "release"), 1);
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, BUTTERY.bales - 4);
  assert.equal(game.stars, 3);
});

test("buttery: the left-hand shutter is barred: stopped there the first time round, it stays shut and the hook has him", () => {
  // The bale takes its moment to arrive: thrown as he passes the bottom, it stops the door at the left.
  const { game, events } = buttery(pilot([{ when: (now) => -(now.doors[0]?.turn ?? 0) / (Math.PI / 2) >= 2.1, x: -0.7, y: 29.5 - STOREY * 3 }]));
  const stop = events.find((event) => event.type === "port");
  assert.ok(stop && stop.type === "port" && stop.port === "left" && stop.shut);
  assert.equal(count(events, "unbar"), 0);
  assert.equal(game.phase, "caught");
});

test("buttery: stopped at the bottom, he is in the pan", () => {
  const { game, events } = buttery(pilot([{ when: (now) => -(now.doors[0]?.turn ?? 0) / (Math.PI / 2) >= 1.1, x: -0.7, y: 29.5 - STOREY * 3 }]));
  assert.deepEqual(ports(events), ["bottom"]);
  assert.equal(game.phase, "fried");
});

test("buttery: his weight on the board takes the bar off, but nothing else does", () => {
  const out = buttery(pilot(butteryPlan({ toss: false, second: false })));
  assert.equal(count(out.events, "unbar"), 1);
  assert.equal(out.game.phase, "caught", "sat in the see-saw with nothing done, the hook comes for him");
  // A bale thrown on to the board is not him.
  const tread = BUTTERY.doors[0]!.bar!.tread;
  const baled = buttery(pilot([{ when: (now) => now.time > 0.2, x: (tread.x0 + tread.x1) / 2, y: tread.y0 + 0.6 }]), 8);
  assert.equal(count(baled.events, "unbar"), 0);
});

test("buttery: the see-saw in the corner always throws alike, and there is a long time to throw the bale in", () => {
  let clean = 0;
  for (let at = 5; at <= 11.5; at += 0.5) {
    const { game, events } = buttery(pilot(butteryPlan({ toss: at })));
    if (game.phase === "home" && game.cracks === 0) clean += 1;
    assert.equal(count(events, "release"), 1, `thrown at ${at}s he should be back in the door`);
  }
  assert.equal(clean, 14);
  // Thrown before he is in the seat, it has gone over without him.
  assert.notEqual(buttery(pilot(butteryPlan({ toss: 2.5 }))).game.phase, "home");
});

test("buttery: the second time round there is a quarter of a turn in which to brake, and outside it he is not home", () => {
  for (const part of [2.05, 2.3, 2.55]) {
    const { game, events } = buttery(pilot(butteryPlan({ second: part })));
    assert.deepEqual(ports(events), ["right", "left"], `thrown ${part} quarters round`);
    assert.equal(game.phase, "home");
  }
  const soon = buttery(pilot(butteryPlan({ second: 0.2 })));
  assert.deepEqual(ports(soon.events), ["right", "right"]);
  assert.equal(soon.game.phase, "caught", "out on the right again, and the see-saw has thrown already");
  const pan = buttery(pilot(butteryPlan({ second: 1.2 })));
  assert.deepEqual(ports(pan.events), ["right", "bottom"]);
  assert.equal(pan.game.phase, "fried");
  const never = buttery(pilot(butteryPlan({ second: false })));
  assert.deepEqual(ports(never.events), ["right", "top"]);
  assert.equal(never.game.phase, "caught");
});

test("buttery: the door turns a quarter in a second and a half, and not until he is in it", () => {
  const game = new Game(BUTTERY);
  game.start();
  let began = -1;
  while (game.time < 6) {
    game.step();
    for (const event of game.drain()) if (event.type === "turning") began = game.time;
    if (began < 0) assert.equal(game.doors[0]!.turn, 0);
  }
  assert.ok(began > 1.5 && began < 3.5, `it began at ${began.toFixed(2)}s`);
  assert.ok(Math.abs(-game.doors[0]!.turn - DOOR_TURN * (game.time - began)) < 0.05);
  assert.ok(Math.abs(Math.PI / 2 / DOOR_TURN - 1.5) < 1e-9);
});

test("buttery: left to itself the clockwork runs down with him at the top, and the hook has him", () => {
  const { game, events } = buttery(() => ({}));
  assert.deepEqual(ports(events), ["top"]);
  assert.equal(game.phase, "caught");
  assert.ok(game.time > DOOR_LAPS * 6 && game.time < DOOR_LAPS * 6 + 8, `it took ${game.time.toFixed(1)}s`);
  assert.equal(game.cracks, 0, "the ride does not hurt him");
});

test("buttery: nothing can be thrown into the drum of the door", () => {
  const game = new Game(BUTTERY);
  const door = BUTTERY.doors[0]!;
  for (const [dx, dy] of [[0, 0], [0.4, 0.9], [-0.8, -0.3], [0, 1.2]] as const) {
    const at = game.aim(door.x + dx, door.y + dy);
    assert.ok(Math.hypot(at.x - door.x, at.y - door.y) >= door.r + 0.4, `a bale aimed ${dx}, ${dy} from the axle would land in the drum`);
  }
});

test("buttery: the same taps give the same run, to the last bit", () => {
  const a = buttery(pilot(butteryPlan())).game;
  const b = buttery(pilot(butteryPlan())).game;
  assert.equal(a.time, b.time);
  assert.deepEqual(a.egg, b.egg);
});

// ------------------------------------------------------------------ the cistern

const cistern = (hands: (game: Game) => Input, limit = 40) => run(hands, limit, CISTERN);

test("cistern: a raft, a stopper, the mine and then the water: four bales, and one to spare", () => {
  const { game, events } = cistern(pilot(cisternPlan()));
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, CISTERN.bales - 4);
  assert.equal(game.stars, 3);
  assert.equal(count(events, "plug"), 1);
  assert.equal(count(events, "wash"), 0);
  const spills = events.filter((event) => event.type === "spill");
  assert.ok(spills.length === 1 && spills[0]!.type === "spill" && spills[0]!.over === "weir");
});

test("cistern: left alone he comes down in it dry, and the hook has him", () => {
  const { game } = cistern(() => ({}));
  assert.notEqual(game.phase, "home");
  assert.ok(game.cracks > 0);
});

test("cistern: with the spout left open he goes out of it with the water, into the pan", () => {
  const { game, events } = cistern(pilot(cisternPlan({ plug: false })));
  assert.equal(game.phase, "fried");
  assert.ok(events.some((event) => event.type === "spill" && event.over === "spout"));
});

test("cistern: with no bale under him he goes down in the water, and the hook has him", () => {
  const { game, events } = cistern(pilot(cisternPlan({ raft: false, sluice: 7.5 })));
  assert.equal(count(events, "splash"), 1);
  assert.equal(game.cracks, 0, "water is soft");
  assert.equal(game.phase, "caught");
});

test("cistern: with no water he sits on his bale until the hook comes", () => {
  const { game } = cistern(pilot(cisternPlan({ sluice: false })));
  assert.equal(game.cracks, 0, "the bale broke his fall, and was not burst by it");
  assert.equal(game.bales.length, 2);
  assert.equal(game.phase, "caught");
});

test("cistern: let in before he is aboard, the water takes the raft away without him", () => {
  for (const at of [0.2, 1.5, 3, 4]) {
    const { game, events } = cistern(pilot(cisternPlan({ raft: 0.1, plug: 0.15, sluice: at })));
    assert.equal(count(events, "wash"), 1, `let in at ${at}s`);
    assert.equal(game.phase, "caught");
  }
});

test("cistern: there are a good six seconds in which to let the water in", () => {
  for (let at = 5.5; at <= 11.5; at += 0.5) {
    const { game } = cistern(pilot(cisternPlan({ sluice: at })));
    assert.equal(game.phase, "home", `let in at ${at}s`);
    assert.equal(game.cracks, 0);
  }
});

test("cistern: the water comes up at its own rate, to the lowest way out and no further", () => {
  const game = new Game(CISTERN);
  const tank = CISTERN.tanks[0]!;
  game.start();
  let wet = -1;
  while (game.time < 8) {
    game.step(game.time < STEP ? { bale: { x: tank.pan.x, y: tank.pan.y + 0.5 } } : {});
    for (const event of game.drain()) if (event.type === "water") wet = game.time;
    if (wet < 0) assert.equal(game.tanks[0]!.level, tank.floor);
  }
  assert.ok(wet > RACE && wet < RACE + 1, `the water came at ${wet.toFixed(2)}s`);
  assert.ok(Math.abs(game.tanks[0]!.level - tank.spout.lip) < 0.2, "with the spout open it stops at the spout");
  assert.equal(game.tanks[0]!.over, "spout");
  assert.ok(Math.abs((tank.spout.lip - tank.floor) / RISE - 1) < 0.5, "and takes about a second to get there");
});

test("cistern: the same taps give the same run, to the last bit", () => {
  const a = cistern(pilot(cisternPlan())).game;
  const b = cistern(pilot(cisternPlan())).game;
  assert.equal(a.time, b.time);
  assert.deepEqual(a.egg, b.egg);
});

// ------------------------------------------------------------------ the servery

const servery = (hands: (game: Game) => Input, limit = 40) => run(hands, limit, SERVERY);
const DOWN5 = STOREY * 5;
/** Which landing the car came to, each time it stopped. */
const landings = (events: GameEvent[]): number[] => events.flatMap((event) => (event.type === "landing" ? [event.floor] : []));

test("servery: up to be his bridge, down to fetch him, up to let him out: three bales, and one to spare", () => {
  const { game, events } = servery(pilot(serveryPlan()));
  assert.deepEqual(events.flatMap((event) => (event.type === "hoist" ? [event.way] : [])), [1, -1, 1]);
  assert.deepEqual(landings(events), [1, 0, 1]);
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, SERVERY.bales - 3);
  assert.equal(game.stars, 3);
});

test("servery: left alone he goes down the shaft on to the car's roof, and the hook has him there", () => {
  const { game } = servery(() => ({}));
  assert.equal(game.phase, "caught");
  assert.ok(game.cracks > 0, "the roof is bare board");
  assert.ok(Math.abs(game.egg.x) < 0.8 && game.lifts[0]!.over, "he should be on the roof of the car");
});

test("servery: over the roof, and then the gate at the bottom landing is shut, because the car is not there", () => {
  const { game, events } = servery(pilot(serveryPlan({ fetch: false, up: false })));
  assert.deepEqual(landings(events), [1]);
  assert.equal(game.phase, "caught");
  assert.equal(game.cracks, 0);
  assert.ok(game.egg.x > 1 && game.egg.x < 1.8, `he should be at the gate, not at ${game.egg.x.toFixed(2)}`);
  assert.equal(game.lifts[0]!.gate, false);
});

test("servery: brought down before he is over it, the car is no bridge", () => {
  const { game } = servery(pilot(serveryPlan({ fetch: 1.2, up: false })));
  assert.equal(game.phase, "caught");
  assert.ok(Math.abs(game.egg.x) < 0.8, "he should be down the shaft, on the roof of the car");
});

test("servery: hauled up two landings, the car is a step too high for him and he stops at it", () => {
  const { game } = servery(pilot([
    { when: (now) => now.time > 0.3, x: 2.9, y: 26.2 - DOWN5 },
    { when: (now) => now.time > 0.6, x: 2.9, y: 26.2 - DOWN5 },
  ]));
  assert.equal(game.lifts[0]!.floor, 2);
  assert.equal(game.phase, "caught");
  assert.ok(game.egg.x < -0.8, "he should not have got over");
});

test("servery: hauled up again before he is in it, the car leaves him at the gate", () => {
  const { game, events } = servery(pilot(serveryPlan({ up: 6.4 })));
  assert.deepEqual(landings(events), [1, 1]);
  assert.equal(game.phase, "caught");
  assert.ok(game.egg.x > 1);
  // But it does not go without him if he is on his way in at the door.
  assert.equal(servery(pilot(serveryPlan({ up: 7.5 }))).game.phase, "home");
});

test("servery: a bale on the pan is a landing up, a bale on the roof is a landing down, and it goes at its own rate", () => {
  const game = new Game(SERVERY);
  const def = SERVERY.lifts[0]!;
  game.start();
  const wait = (seconds: number, bale?: { x: number; y: number }): void => {
    game.step(bale ? { bale } : {});
    for (let step = 1; step < seconds / STEP; step += 1) game.step();
  };
  const pan = { x: def.pan.x, y: def.pan.y + 0.5 };
  const roof = { x: def.x, y: def.floor + 3 };
  assert.equal(game.lifts[0]!.y, def.floor);
  game.step({ bale: pan });
  let began = -1;
  let arrived = -1;
  while (game.time < 3) {
    game.step();
    if (began < 0 && game.lifts[0]!.moving) began = game.time;
    if (began >= 0 && arrived < 0 && !game.lifts[0]!.moving) arrived = game.time;
  }
  assert.equal(game.lifts[0]!.y, def.floor + def.storey);
  assert.ok(arrived - began > def.storey / LIFT_SPEED && arrived - began < def.storey / LIFT_SPEED + 0.8, `it took ${(arrived - began).toFixed(2)}s`);
  assert.ok(Math.abs(game.lifts[0]!.pan - (def.pan.y - def.pan.step)) < 1e-6, "the pan comes down as the car goes up");
  wait(2, pan);
  assert.equal(game.lifts[0]!.y, def.floor + 2 * def.storey);
  wait(3, roof);
  assert.equal(game.lifts[0]!.y, def.floor + def.storey);
  assert.deepEqual([game.lifts[0]!.up, game.lifts[0]!.down], [2, 1]);
});

test("servery: there are a good four seconds in which to bring the car down for him", () => {
  let home = 0;
  for (let at = 5; at <= 9; at += 0.5) {
    if (servery(pilot(serveryPlan({ fetch: at }))).game.phase === "home") home += 1;
  }
  assert.equal(home, 9);
});

test("servery: a tap anywhere in the shaft puts the bale on the car's roof", () => {
  const game = new Game(SERVERY);
  const def = SERVERY.lifts[0]!;
  for (const [dx, up] of [[0, 0.5], [0.6, 1.2], [-0.9, 4], [0.3, 8]] as const) {
    const at = game.aim(def.x + dx, def.floor + up);
    assert.equal(at.x, def.x);
    assert.ok(at.y > def.floor + def.tall && at.y < def.floor + def.tall + 0.6, `aimed ${dx}, ${up}: ${at.y - def.floor}`);
  }
});

test("servery: the same taps give the same run, to the last bit", () => {
  const a = servery(pilot(serveryPlan())).game;
  const b = servery(pilot(serveryPlan())).game;
  assert.equal(a.time, b.time);
  assert.deepEqual(a.egg, b.egg);
});

// ------------------------------------------------------------------ the cellar

const cellar = (hands: (game: Game) => Input, limit = 40) => run(hands, limit, CELLAR);
const DOWN6 = STOREY * 6;
/** When the barrel rolled over the treadle. */
const trodAt = (hands: (game: Game) => Input): number => {
  const game = new Game(CELLAR);
  game.start();
  while (!game.over && game.time < 40) {
    game.step(hands(game));
    if (game.drain().some((event) => event.type === "tread")) return game.time;
  }
  return -1;
};

test("cellar: the barrel let go while he is in the bucket, and a bale under him after it: two bales, and one to spare", () => {
  const { game, events } = cellar(pilot(cellarPlan()));
  for (const type of ["roll", "tread", "fling", "smash", "bung"] as const) assert.equal(count(events, type), 1, type);
  const tread = events.find((event) => event.type === "tread");
  assert.ok(tread && tread.type === "tread" && tread.threw);
  assert.equal(count(events, "crush"), 0);
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, CELLAR.bales - 2);
  assert.equal(game.stars, 3);
});

test("cellar: left alone he sits in the bucket under the run until the hook comes, and it is slow to come", () => {
  const { game } = cellar(() => ({}));
  const bucket = CELLAR.barrels[0]!.bucket;
  assert.equal(game.phase, "caught");
  assert.equal(game.cracks, 0);
  assert.ok(game.egg.x > bucket.x0 && game.egg.x < bucket.x1 && game.egg.y < bucket.y1);
  assert.ok(game.time > 5 + SEAT_IDLE - 1.5, `it took ${game.time.toFixed(1)}s`);
});

test("cellar: let go at once, the barrel has gone by before he is there, and nothing else will throw him", () => {
  const { game, events } = cellar(pilot(cellarPlan({ release: 0.3, cushion: false })));
  const tread = events.find((event) => event.type === "tread");
  assert.ok(tread && tread.type === "tread" && !tread.threw);
  assert.equal(count(events, "bung"), 1);
  assert.equal(game.phase, "caught");
});

test("cellar: let go as he is coming down on to the run, it flattens him", () => {
  const { game, events } = cellar(pilot(cellarPlan({ release: 2.1, cushion: false })));
  assert.equal(count(events, "flat"), 1);
  assert.equal(game.phase, "broken");
});

test("cellar: with nothing under the end of the run he does not live through the drop", () => {
  const { game, events } = cellar(pilot(cellarPlan({ cushion: false })));
  assert.equal(count(events, "bung"), 1);
  assert.equal(game.phase, "broken");
});

test("cellar: a bale put down before the barrel has been by is flattened", () => {
  const hands = () => pilot(cellarPlan({ cushion: false }));
  const trod = trodAt(hands());
  const { game, events } = cellar(pilot([...cellarPlan({ cushion: false }), { when: (now) => now.time > trod - 0.4, x: -2.75, y: 18 - DOWN6 }]));
  assert.equal(count(events, "crush"), 1);
  assert.equal(game.phase, "broken");
});

test("cellar: there are a good three seconds after the barrel in which to put the bale down", () => {
  const trod = trodAt(pilot(cellarPlan({ cushion: false })));
  let home = 0;
  for (let after = 1.4; after <= 4.4; after += 0.5) {
    const { game } = cellar(pilot([...cellarPlan({ cushion: false }), { when: (now) => now.time > trod + after, x: -2.75, y: 18 - DOWN6 }]));
    if (game.phase === "home" && game.cracks === 0) home += 1;
  }
  assert.equal(home, 7);
});

test("cellar: a bale thrown at the gap goes down between the rails, and does not bridge it", () => {
  const { game } = cellar(pilot([{ when: (now) => now.time > 0.3, x: 0, y: 23.6 - DOWN6 }]));
  const bucket = CELLAR.barrels[0]!.bucket;
  assert.equal(game.phase, "caught");
  assert.ok(game.egg.x > bucket.x0 && game.egg.x < bucket.x1, "he should be in the bucket, on the bale");
  assert.ok(game.bales[0]!.y < bucket.y1);
});

test("cellar: the same taps give the same run, to the last bit", () => {
  const a = cellar(pilot(cellarPlan())).game;
  const b = cellar(pilot(cellarPlan())).game;
  assert.equal(a.time, b.time);
  assert.deepEqual(a.egg, b.egg);
});

test("servery: three bales on the car's roof are no staircase to the way out, for the gate there is shut too", () => {
  const def = SERVERY.lifts[0]!;
  const roof = { x: def.x, y: def.floor + 1 };
  const { game } = servery(pilot([0.3, 0.5, 0.7].map((at) => ({ when: (g: Game) => g.time >= at, x: roof.x, y: roof.y }))));
  assert.equal(game.phase, "caught");
  assert.deepEqual(game.lifts[0]!.gates, [true, false]);
});

// ------------------------------------------------------------------ mines

const MINED: Array<[LevelDef, (mine: number | false) => Move[]]> = [
  [SCULLERY, (mine) => sculleryPlan({ mine })],
  [BUTTERY, (mine) => butteryPlan({ mine })],
  [CISTERN, (mine) => cisternPlan({ mine })],
];
const blasts = (events: GameEvent[]) => events.flatMap((event) => (event.type === "blast" ? [event] : []));
/** The room played properly but for its mine, which gets its bale at a time of its own. */
function mineAt(level: LevelDef, plan: Move[], at: number): (game: Game) => Input {
  const hands = pilot(plan);
  const mine = level.mines[0]!;
  let thrown = false;
  return (game) => {
    if (thrown || game.time <= at) return hands(game);
    thrown = true;
    return { bale: { x: mine.x, y: mine.y + 0.3 } };
  };
}

test("mines: three rooms have one, each in the face of a shelf he rolls along", () => {
  assert.deepEqual(LEVELS.filter((level) => level.mines.length > 0).map((level) => level.key), ["scullery", "buttery", "cistern"]);
});

test("mines: left alone, a mine goes off under him and that is the end of him", () => {
  for (const [level, plan] of MINED) {
    const { game, events } = run(pilot(plan(false)), 40, level);
    assert.equal(game.phase, "broken", level.name);
    assert.deepEqual(blasts(events).map((event) => event.by), ["egg"], level.name);
    assert.ok(Math.hypot(game.egg.x - level.mines[0]!.x, game.egg.y - level.mines[0]!.y) < 1.2, level.name);
  }
});

test("mines: a bale on it sets it off, and neither the bale nor the mine is there afterwards", () => {
  for (const [level, plan] of MINED) {
    const { game, events } = run(pilot(plan(1.5)), 40, level);
    const [blast] = blasts(events);
    assert.ok(blast && blast.by === "bale" && !blast.near, level.name);
    assert.equal(blasts(events).length, 1, level.name);
    assert.equal(game.mines[0]!.live, false, level.name);
    assert.equal(game.phase, "home", level.name);
    assert.equal(game.cracks, 0, level.name);
  }
});

test("mines: a tap anywhere about a mine lays the bale on its plate", () => {
  for (const [level] of MINED) {
    const game = new Game(level);
    const mine = level.mines[0]!;
    for (const [dx, dy] of [[0, 0.3], [0.5, 0.7], [-0.6, 0.1], [0.2, 1]] as const) {
      const at = game.aim(mine.x + dx, mine.y + dy);
      assert.ok(Math.hypot(at.x - mine.x, at.y - mine.y) < 0.45, `${level.name}: ${dx}, ${dy}`);
      assert.equal(at.turn, mine.turn);
    }
    game.dispose();
  }
});

test("mines: there are seconds to do it in, and not just one moment", () => {
  for (const [level, plan, times] of [
    [SCULLERY, sculleryPlan({ mine: false }), [0.2, 1.5, 3, 4.5, 6, 7.2]],
    [BUTTERY, butteryPlan({ mine: false }), [0.8, 2, 4, 6, 7.2]],
    [CISTERN, cisternPlan({ mine: false }), [0.2, 1.5, 3, 4.5, 6]],
  ] as const) {
    for (const at of times) {
      const { game } = run(mineAt(level, [...plan], at), 40, level);
      assert.equal(game.phase, "home", `${level.name}, at ${at}`);
      assert.equal(game.cracks, 0, `${level.name}, at ${at}`);
    }
  }
});

test("mines: set off when he is nearly on it, it cracks him and throws him", () => {
  const { game, events } = run(mineAt(CISTERN, cisternPlan({ mine: false }), 6.8), 40, CISTERN);
  const [blast] = blasts(events);
  assert.ok(blast && blast.by === "bale" && blast.near);
  assert.ok(game.cracks >= 1);
  assert.ok(game.stars < 3);
});

// ------------------------------------------------------------------ the bakehouse

const bakehouse = (hands: (game: Game) => Input, limit = 40) => run(hands, limit, BAKEHOUSE);
const at = (events: GameEvent[], type: GameEvent["type"]): number[] => events.flatMap((event, index) => (event.type === type ? [index] : []));

test("bakehouse: three bales, each when it is wanted, get him to the roost whole, with one to spare", () => {
  const { game, events } = bakehouse(pilot(bakehousePlan()));
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, BAKEHOUSE.bales - 3);
  assert.equal(game.stars, 3);
  assert.equal(count(events, "kindle"), 3);
  assert.deepEqual(events.flatMap((event) => (event.type === "blow" ? [event.threw] : [])), [true]);
});

test("bakehouse: left alone, he rolls into the embers in his own shelf", () => {
  const { game, events } = bakehouse(() => ({}));
  assert.equal(game.phase, "fried");
  assert.equal(count(events, "toast"), 1);
  assert.ok(Math.abs(game.egg.x - BAKEHOUSE.hearths[0]!.x) < 1);
});

test("bakehouse: straw on embers is alight as it lands, and ash four seconds after", () => {
  const game = new Game(BAKEHOUSE);
  const hearth = BAKEHOUSE.hearths[2]!;
  game.start();
  let lit = -1;
  let gone = -1;
  let first = true;
  while (gone < 0 && game.time < 10) {
    game.step(first ? { bale: { x: hearth.x, y: hearth.y + 0.5 } } : {});
    first = false;
    for (const event of game.drain()) {
      if (event.type === "kindle") lit = game.time;
      if (event.type === "ash") gone = game.time;
    }
    if (lit >= 0 && gone < 0) assert.ok(game.bales.some((bale) => bale.burnt > 0) || game.time - lit < 0.05, "it is seen to burn");
  }
  assert.ok(lit > 0 && lit < 0.7, `alight at ${lit.toFixed(2)}s`);
  assert.ok(Math.abs(gone - lit - BURN) < 0.05, `burned for ${(gone - lit).toFixed(2)}s`);
  assert.equal(game.bales.length, 0);
  game.dispose();
});

test("bakehouse: the first tray gives him two seconds, and takes a bale thrown as he is let go", () => {
  for (const tray of [0, 0.5, 1, 1.5, 2]) {
    const { game } = bakehouse(pilot(bakehousePlan({ tray })));
    assert.equal(game.phase, "home", `thrown at ${tray}s`);
    assert.equal(game.stars, 3, `thrown at ${tray}s`);
  }
  assert.equal(bakehouse(pilot(bakehousePlan({ tray: 2.6 }))).game.phase, "fried");
});

test("bakehouse: nothing in the kettle's fire, and he sits on its lid until the hook comes", () => {
  const { game, events } = bakehouse(pilot(bakehousePlan({ boil: false, grill: false })));
  assert.equal(game.phase, "caught");
  assert.equal(game.kettles[0]!.on, true);
  assert.equal(count(events, "blow"), 0);
  assert.ok(game.time > SEAT_IDLE, "and it is slow to come, as it is to any seat");
});

test("bakehouse: a fire lit before he is on the lid blows it off at nothing", () => {
  const { game, events } = bakehouse(pilot(bakehousePlan({ boil: 2, grill: false })));
  assert.deepEqual(events.flatMap((event) => (event.type === "blow" ? [event.threw] : [])), [false]);
  assert.equal(game.phase, "caught");
});

test("bakehouse: the kettle boils two seconds after its fire is lit, and there are seconds to light it in", () => {
  const { events } = bakehouse(pilot(bakehousePlan()));
  const lit = events[at(events, "kindle")[1]!]!;
  assert.ok(lit.type === "kindle" && lit.kettle);
  for (const boil of [5, 7, 9, 11]) {
    const game = new Game(BAKEHOUSE);
    const hands = pilot(bakehousePlan({ boil }));
    game.start();
    let kindled = -1;
    let blew = -1;
    while (!game.over && game.time < 40) {
      game.step(hands(game));
      for (const event of game.drain()) {
        if (event.type === "kindle" && event.kettle) kindled = game.time;
        if (event.type === "blow") blew = game.time;
      }
    }
    assert.ok(Math.abs(blew - kindled - BOIL) < 0.05, `lit at ${boil}s: boiled in ${(blew - kindled).toFixed(2)}s`);
    assert.equal(game.phase, "home", `lit at ${boil}s`);
    assert.equal(game.stars, 3, `lit at ${boil}s`);
    game.dispose();
  }
});

test("bakehouse: the hob's bale thrown with the kettle's has burned away before he is across the room", () => {
  const { game, events } = bakehouse(pilot(bakehousePlan({ boil: 7, grill: 7 })));
  assert.equal(game.phase, "fried");
  assert.equal(count(events, "ash"), 3);
  assert.equal(count(events, "toast"), 1);
});

test("bakehouse: thrown while he is in the air, or just down, it is there for him", () => {
  // The lid goes at 9.6s; he is down on the hob at 11.3s, and at the tray a second and a half after that.
  for (const grill of [8.9, 9.6, 10.4, 11.2, 12]) {
    const { game } = bakehouse(pilot(bakehousePlan({ boil: 7, grill })));
    assert.equal(game.phase, "home", `thrown at ${grill}s`);
    assert.equal(game.cracks, 0, `thrown at ${grill}s`);
  }
});

// ------------------------------------------------------------------ the pastry

const pastry = (hands: (game: Game) => Input, limit = 40) => run(hands, limit, PASTRY);
const throws = (list: Array<[number, number, number]>): ((game: Game) => Input) =>
  pilot(list.map(([time, x, y]) => ({ when: (game: Game) => game.time >= time, x, y })));

test("pastry: a bale in the last jelly and one on the gold pan get him home whole, with one to spare", () => {
  const { game, events } = pastry(pilot(pastryPlan()));
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, PASTRY.bales - 2);
  assert.equal(game.stars, 3);
  assert.equal(count(events, "boing"), 2);
  assert.deepEqual(events.flatMap((event) => (event.type === "birds" ? [event.took] : [])), [true]);
  assert.equal(count(events, "drop"), 1);
});

test("pastry: left alone, each jelly throws him to the next and the last throws him in the pan", () => {
  const { game, events } = pastry(() => ({}));
  assert.equal(game.phase, "fried");
  assert.deepEqual(events.flatMap((event) => (event.type === "boing" ? [event.x] : [])), PASTRY.jellies.map((jelly) => jelly.x));
});

test("pastry: a bale sinks into a jelly, and is not there afterwards", () => {
  const { game, events } = pastry(pilot(pastryPlan({ open: false })), 3);
  assert.equal(count(events, "set"), 1);
  assert.equal(game.bales.length, 0);
  assert.deepEqual(game.jellies.map((jelly) => jelly.set), [false, false, true]);
});

test("pastry: stop the first or the second and he only rolls off it on to the next, and so to the pan", () => {
  for (const which of [0, 1]) {
    const { game, events } = pastry(pilot(pastryPlan({ which, open: false })));
    assert.equal(game.phase, "fried", `jelly ${which + 1}`);
    assert.equal(count(events, "boing"), 2, `jelly ${which + 1}`);
  }
});

test("pastry: the wrong jelly costs a bale and not the run", () => {
  const first = PASTRY.jellies[0]!;
  const last = PASTRY.jellies[2]!;
  const pan = PASTRY.pies[0]!.pan;
  const { game } = pastry(throws([[0.5, first.x, first.y + 0.3], [2, last.x, last.y + 0.3], [9, pan.x, pan.y + 0.5]]));
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.stars, 2);
});

test("pastry: the last jelly can be stopped at any time before he is on it", () => {
  for (const set of [0, 1.5, 3, 4]) {
    const { game } = pastry(pilot(pastryPlan({ set })));
    assert.equal(game.phase, "home", `thrown at ${set}s`);
    assert.equal(game.stars, 3, `thrown at ${set}s`);
  }
});

test("pastry: open the pie before he is on it and the blackbirds go without him", () => {
  for (const open of [1, 4]) {
    const { game, events } = pastry(pilot(pastryPlan({ open })));
    assert.deepEqual(events.flatMap((event) => (event.type === "birds" ? [event.took] : [])), [false], `opened at ${open}s`);
    assert.equal(game.phase, "caught", `opened at ${open}s`);
    assert.equal(game.caged, true, "an open pie is a cage");
    assert.ok(game.time < 6 + CAGE + 1.5, "and the hook is quick about it");
  }
});

test("pastry: he can sit on the crust for seconds before it is opened", () => {
  for (const open of [5.4, 7, 9, 11, 13]) {
    const { game } = pastry(pilot(pastryPlan({ open })));
    assert.equal(game.phase, "home", `opened at ${open}s`);
    assert.equal(game.cracks, 0, `opened at ${open}s`);
  }
  assert.equal(pastry(pilot(pastryPlan({ open: false }))).game.phase, "caught");
});

test("pastry: the blackbirds carry him clear of everything, and set him down over the nest", () => {
  const game = new Game(PASTRY);
  const hands = pilot(pastryPlan());
  game.start();
  let flew = 0;
  let knocked = false;
  while (!game.over && game.time < 40) {
    game.step(hands(game));
    for (const event of game.drain()) if (event.type === "knock") knocked = true;
    if (game.flying) flew += STEP;
  }
  assert.ok(flew > 2 && flew < 3.2, `in the air ${flew.toFixed(2)}s`);
  assert.equal(knocked, false);
  assert.equal(game.phase, "home");
  game.dispose();
});

test("pastry: a jelly that keeps getting him back has had enough the third time", () => {
  // Two bales stood on the pie are a wall the last jelly throws him at, and he comes back off it.
  const down = STOREY * 8;
  const { game, events } = pastry(throws([[0.68, 1.34, 17.45 - down], [1.73, 1.29, 18.02 - down], [4.31, -1.7, 18 - down]]), 60);
  assert.ok(game.over, "it ends");
  assert.ok(events.some((event) => event.type === "set" && event.id === -1));
});

test("the house is nine rooms, each under the last, and only the bottom one is home", () => {
  assert.equal(LEVELS.length, 9);
  LEVELS.forEach((level, index) => {
    assert.equal(level.top, LARDER.top - STOREY * index, level.name);
    assert.equal(level.ends, index === LEVELS.length - 1 ? "nest" : "roost", level.name);
    assert.ok(PLANS[level.key], `${level.name} has a plan`);
  });
});

test("every room is done by its plan, whole and with straw to spare", () => {
  for (const level of LEVELS) {
    const { game } = run(pilot(PLANS[level.key]!()), 60, level);
    assert.equal(game.phase, "home", level.name);
    assert.equal(game.stars, 3, level.name);
  }
});
