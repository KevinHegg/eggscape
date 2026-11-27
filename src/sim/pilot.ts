import type { Game, Input } from "./kitchen";

/** What a player does on a screen, as a list of things to wait for and where to put the bale. */
export interface Move {
  when: (game: Game) => boolean;
  x: number;
  y: number;
}

/** How high over the see-saw a bale should be let go to throw him clean on to the flour sacks. */
export const GOOD_DROP = 24.2;

/**
 * The first screen played properly: a bale where he comes down, one in the hole to the pan,
 * and one dropped on the see-saw once he is sitting in it.
 */
export function larderPlan(drop = GOOD_DROP, stopHole = true): Move[] {
  const seated = (game: Game): boolean => game.idle > 0.6 && game.egg.x > 0.7 && game.egg.x < 2.2 && game.egg.y < 22.4;
  return [
    { when: (game) => game.time > 1.2, x: 2.9, y: 22.8 },
    ...(stopHole ? [{ when: (game: Game) => game.time > 2, x: -1.1, y: 18.9 }] : []),
    { when: seated, x: 0, y: drop },
  ];
}

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
