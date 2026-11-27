import assert from "node:assert/strict";
import { before, test } from "node:test";
import { Game, IDLE, LARDER, loadPhysics, type GameEvent, type Input } from "../src/sim/kitchen";
import { GOOD_DROP, larderPlan, pilot } from "../src/sim/pilot";

before(async () => {
  await loadPhysics();
});

function run(hands: (game: Game) => Input, limit = 40): { game: Game; events: GameEvent[] } {
  const game = new Game(LARDER);
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

test("sat in the see-saw with nothing done, a cook has him", () => {
  const { game } = run(pilot(larderPlan().slice(0, 1)));
  assert.equal(game.phase, "caught");
  assert.ok(game.idle >= IDLE);
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
