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

/** Heights in the scullery's plan are written as if it stood where the larder does: it hangs a storey down. */
export const GOOD_TOSS = 24.9;

/**
 * The second screen played properly: bridge the gap over the pan at once, a bale under the
 * long drop, one in the hole, and one dropped on the see-saw once he is sitting in it.
 */
export function sculleryPlan(drop = GOOD_TOSS, options: { bridge?: number | false; cushion?: boolean; stopHole?: boolean } = {}): Move[] {
  const { bridge = 0.3, cushion = true, stopHole = true } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY });
  return [
    ...(bridge === false ? [] : [at((game) => game.time > bridge, 1.3, 28.5)]),
    ...(cushion ? [at((game) => game.time > 2.7, -3.05, 24)] : []),
    ...(stopHole ? [at((game) => game.time > 4.6, 1.1, 18.9)] : []),
    at(settled, -0.3, drop),
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

/** Each room played properly, by its key. */
export const PLANS: Record<string, () => Move[]> = {
  larder: () => larderPlan(),
  scullery: () => sculleryPlan(),
  mill: () => millPlan(),
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
