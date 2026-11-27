import assert from "node:assert/strict";
import { before, test } from "node:test";
import { BUTTERY, CAGE, DOOR_LAPS, DOOR_TURN, Game, IDLE, LARDER, LEVELS, MILLROOM, RACE, SCULLERY, SEAT_IDLE, STEP, STOREY, WHEEL_TURN, loadPhysics, type GameEvent, type Input, type LevelDef } from "../src/sim/kitchen";
import { GOOD_DROP, PLANS, butteryPlan, larderPlan, millPlan, pilot, sculleryPlan } from "../src/sim/pilot";

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
    assert.ok(game.time < 16, `${level.name} took ${game.time.toFixed(1)}s`);
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
const port = (events: GameEvent[]): string => {
  const event = events.find((item) => item.type === "port");
  return event && event.type === "port" ? event.port : "none";
};

test("buttery: one bale, for whoever can wait: out on the left, and nothing between him and the nest", () => {
  const { game, events } = buttery(pilot(butteryPlan()));
  assert.equal(port(events), "left");
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, BUTTERY.bales - 1);
  assert.equal(game.stars, 3);
});

test("buttery: three bales, for whoever cannot: out on the right, the long drop and the hole", () => {
  const { game, events } = buttery(pilot(butteryPlan({ brake: "right" })));
  assert.equal(port(events), "right");
  assert.equal(game.phase, "home");
  assert.equal(game.cracks, 0);
  assert.equal(game.balesLeft, BUTTERY.bales - 3);
  assert.equal(game.stars, 2);
});

test("buttery: out on the right with nothing under the drop he is cracked, and with the hole open he is fried", () => {
  const bare = buttery(pilot(butteryPlan({ brake: "right", cushion: false }))).game;
  assert.equal(bare.phase, "home");
  assert.equal(bare.cracks, 1);
  assert.equal(buttery(pilot(butteryPlan({ brake: "right", stopHole: false }))).game.phase, "fried");
});

test("buttery: where the door stops is where the brake found it: right, bottom, left, top, and round again", () => {
  const want = ["right", "bottom", "left", "top", "right"];
  const ends = ["home", "fried", "home", "caught", "home"];
  want.forEach((name, index) => {
    for (const part of [0.1, 0.45, 0.8]) {
      // The bale takes its moment to arrive, so it is thrown most of a quarter ahead.
      const { game, events } = buttery(pilot(butteryPlan({ brake: Math.max(0.01, index + part - 0.45) })));
      assert.equal(port(events), name, `thrown ${(index + part - 0.45).toFixed(2)} quarters round`);
      assert.equal(game.phase, ends[index], `out at the ${name}`);
    }
  });
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
  assert.ok(began > 2 && began < 3.5, `it began at ${began.toFixed(2)}s`);
  assert.ok(Math.abs(-game.doors[0]!.turn - DOOR_TURN * (game.time - began)) < 0.05);
  assert.ok(Math.abs(Math.PI / 2 / DOOR_TURN - 1.5) < 1e-9);
});

test("buttery: a brake put on before he is in it stops the door at the first quarter", () => {
  const game = new Game(BUTTERY);
  game.start();
  const events: GameEvent[] = [];
  while (!game.over && game.time < 12) {
    game.step(game.time < STEP ? { bale: { x: 2.75, y: 28.6 - STOREY * 3 } } : {});
    events.push(...game.drain());
  }
  assert.equal(port(events), "right");
});

test("buttery: left to itself the clockwork runs down with him at the top, and the hook has him", () => {
  const { game, events } = buttery(() => ({}));
  assert.equal(port(events), "top");
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
