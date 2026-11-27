import { STOREY, type Game, type Input } from "./kitchen";

/** What a player does on a screen, as a list of things to wait for and where to put the bale. */
export interface Move {
  when: (game: Game) => boolean;
  x: number;
  y: number;
}

/** Whether he has come to rest in a see-saw's seat. */
export function seated(game: Game): boolean {
  const egg = game.egg;
  return game.seesaws.some(({ def }) => {
    const along = (egg.x - def.x) * def.side;
    return along > 0 && along < def.seat + 0.4 && Math.abs(egg.y - def.y) < 1;
  });
}
const settled = (game: Game): boolean => game.idle > 0.6 && seated(game);

/** How high over the see-saw a bale should be let go to throw him clean on to the flour sacks. */
export const GOOD_DROP = 24.2;

/**
 * The first screen played properly: a bale where he comes down, one in the hole to the pan,
 * and one dropped on the see-saw once he is sitting in it.
 */
export function larderPlan(drop = GOOD_DROP, stopHole = true): Move[] {
  return [
    { when: (game) => game.time > 1.2, x: 2.9, y: 22.8 },
    ...(stopHole ? [{ when: (game: Game) => game.time > 2, x: -1.1, y: 18.9 }] : []),
    { when: settled, x: 0, y: drop },
  ];
}

/**
 * The second screen played properly: bridge the gap over the pan, a bale under the long drop,
 * one on the gold end of the see-saw as he comes to it, and one in the hole once he is thrown.
 * `toss` as a number is a time to throw that third bale at, whatever he is doing.
 * Heights are written as if the scullery stood where the larder does: it hangs a storey down.
 */
export function sculleryPlan(options: { bridge?: number | false; cushion?: boolean; toss?: number | false; stopHole?: boolean } = {}): Move[] {
  const { bridge = 0.5, cushion = true, toss, stopHole = true } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY });
  // He has come down the long drop and is on his way to the see-saw.
  const coming = (game: Game): boolean => game.egg.x > -2.4 && game.egg.x < 0 && game.egg.y + STOREY < 25;
  return [
    ...(bridge === false ? [] : [at((game) => game.time > bridge, -0.9, 27.7)]),
    ...(cushion ? [at((game) => game.time > 3.2, -3.1, 24.3)] : []),
    ...(toss === false ? [] : [at(typeof toss === "number" ? (game) => game.time > toss : coming, -1.3, 23.5)]),
    ...(stopHole ? [at((game) => game.egg.x > 1.6 && game.egg.y + STOREY > 22, 0.6, 18.9)] : []),
  ];
}

/**
 * The third screen played properly: a bale on the sluice pan at once; then, while the wheel
 * has him, one under the long drop at the right wall and one in the hole in the bottom floor.
 * Heights are written as if the mill stood where the larder does: it hangs two storeys down.
 */
export function millPlan(options: { sluice?: number | false; cushion?: boolean | number; stopHole?: boolean } = {}): Move[] {
  const { sluice = 0.3, cushion = true, stopHole = true } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 2 });
  const riding = (game: Game): boolean => game.egg.x > -0.2 && game.wheels.some((wheel) => wheel.wet);
  return [
    ...(sluice === false ? [] : [at((game) => game.time > sluice, 1.75, 30)]),
    ...(cushion === false ? [] : [at(typeof cushion === "number" ? (game) => game.time > cushion : riding, 3.2, 21.2)]),
    ...(stopHole ? [at((game) => game.egg.x > 1.2, 0.6, 19.2)] : []),
  ];
}

/**
 * The fourth screen played properly. Brake at once, and the door stops at the right-hand
 * shutter; he goes out over the red board, which takes the bar off the left-hand one, and into
 * the seat of the see-saw. A bale on its gold end throws him back up to the door. The second
 * time round the brake goes on as the door carries him past the bottom, and he comes out on
 * the left. `first` is a time; `second` is how far round the door has gone (in quarters) since
 * he came back to it; `toss` as a number is a time to throw at, whatever he is doing.
 */
export function butteryPlan(options: { first?: number | false; toss?: boolean | number; second?: number | false } = {}): Move[] {
  const { first = 0.3, toss = true, second = 2.1 } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 3 });
  const round = (game: Game): number => -(game.doors[0]?.turn ?? 0) / (Math.PI / 2);
  // Back in the door after the see-saw: it is turning again, and has already been a quarter round.
  const again = (game: Game): boolean => game.doors[0]?.turning === true && round(game) > 1.001;
  return [
    ...(first === false ? [] : [at((game) => game.time > first, -0.7, 29.5)]),
    ...(toss === false ? [] : [at(toss === true ? settled : (game) => game.time > toss, 1.7, 20.4)]),
    ...(second === false ? [] : [at((game) => again(game) && round(game) - 1 >= second, -0.7, 29.5)]),
  ];
}

/**
 * The fifth screen played properly: a bale in the bottom of the cistern, one stood in the
 * spout, and then, once he has dropped in, one on the sluice pan. `sluice` as a number is a
 * time to throw that one at, whatever he is doing.
 */
export function cisternPlan(options: { raft?: number | false; plug?: number | false; sluice?: number | false } = {}): Move[] {
  const { raft = 1, plug = 2, sluice } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 4 });
  const aboard = (game: Game): boolean => {
    const tank = game.tanks[0];
    return tank !== undefined && game.egg.x > tank.def.x0 && game.egg.x < tank.def.x1 && game.egg.y < tank.def.weir + 1;
  };
  return [
    ...(raft === false ? [] : [at((game) => game.time > raft, 0.6, 19)]),
    ...(plug === false ? [] : [at((game) => game.time > plug, -0.6, 19.5)]),
    ...(sluice === false ? [] : [at(typeof sluice === "number" ? (game) => game.time > sluice : aboard, -1.5, 27.2)]),
  ];
}

/**
 * The sixth screen played properly: a bale on the pan at once, so that the car's roof is his
 * bridge; one on the roof when he is over and off it, to bring the car down to the gate; and
 * one more on the pan when he is in it. `fetch` and `up` as numbers are times to throw at,
 * whatever he is doing.
 */
export function serveryPlan(options: { bridge?: number | false; fetch?: boolean | number; up?: boolean | number } = {}): Move[] {
  const { bridge = 0.3, fetch = true, up = true } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 5 });
  const crossed = (game: Game): boolean => game.egg.x > 1.3 && game.egg.y + STOREY * 5 < 22.5;
  const aboard = (game: Game): boolean => game.lifts[0]?.aboard === true && !game.lifts[0].moving;
  return [
    ...(bridge === false ? [] : [at((game) => game.time > bridge, 2.9, 26.2)]),
    ...(fetch === false ? [] : [at(fetch === true ? crossed : (game) => game.time > fetch, 0, 22)]),
    ...(up === false ? [] : [at(up === true ? aboard : (game) => game.time > up, 2.9, 26.2)]),
  ];
}

/**
 * The seventh screen played properly: the barrel let go once he is in the bucket under its
 * run, and a bale under the end of the run once the barrel has been through the crates.
 * Either as a number is a time to throw at, whatever is going on.
 */
export function cellarPlan(options: { release?: boolean | number; cushion?: boolean | number } = {}): Move[] {
  const { release = true, cushion = true } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 6 });
  const bucketed = (game: Game): boolean => {
    const bucket = game.barrels[0]?.def.bucket;
    return bucket !== undefined && game.idle > 0.4 && game.egg.x > bucket.x0 && game.egg.x < bucket.x1 && game.egg.y > bucket.y0 && game.egg.y < bucket.y1;
  };
  const through = (game: Game): boolean => game.barrels[0]?.crates === false;
  return [
    ...(release === false ? [] : [at(release === true ? bucketed : (game) => game.time > release, 3.15, 28.6)]),
    ...(cushion === false ? [] : [at(cushion === true ? through : (game) => game.time > cushion, -2.75, 18)]),
  ];
}

/** Each room played properly, by its key. */
export const PLANS: Record<string, () => Move[]> = {
  larder: () => larderPlan(),
  scullery: () => sculleryPlan(),
  mill: () => millPlan(),
  buttery: () => butteryPlan(),
  cistern: () => cisternPlan(),
  servery: () => serveryPlan(),
  cellar: () => cellarPlan(),
};

/** A driver for tests and `?auto`: makes each move, in order, as soon as its moment comes. */
export function pilot(plan: Move[]): (game: Game) => Input {
  let next = 0;
  return (game) => {
    const move = plan[next];
    if (!move || !move.when(game)) return {};
    next += 1;
    return { bale: { x: move.x, y: move.y } };
  };
}
