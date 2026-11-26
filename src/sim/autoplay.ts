import { Game, STEP, type Input } from "./game";

/** Something that plays a street: given the game, what to do this step. */
export type Pilot = (game: Game) => Input;

/** Does nothing at all. A cart left to itself should not get home. */
export const idle: Pilot = () => ({ lean: 0 });

/** The lean that carries the cart towards `x` across the street and settles it there. */
export function leanToward(game: Game, x: number): number {
  const value = (x - game.position.x) * 0.9 - game.velocity.x * 0.32;
  return Math.max(-1, Math.min(1, value));
}

/** Metres a second she crosses the street with the lean held hard over. */
const SIDLE = 4;

/**
 * The lean that keeps the cart moving across the street for as long as it is asked: `rate` is
 * -1 (hard left) to 1 (hard right), and 0 steadies her where she is. It will not grind the kerb.
 */
export function leanAt(game: Game, rate: number): number {
  const edge = game.course.width / 2 - 0.9;
  const asked = rate + (rate * SIDLE - game.velocity.x) * 0.3;
  const value = Math.max(leanToward(game, -edge), Math.min(leanToward(game, edge), asked));
  return Math.max(-1, Math.min(1, value));
}

export interface Plan {
  /** Seconds to sit on the shot after the winch comes into range. */
  wait?: number;
  /** Knock the wain's chock out too, when it lights. */
  wain?: boolean;
  /**
   * "judge" brakes just enough to reach the bank as the tower lands. A number is a fixed brake
   * from the moment the winch lights until the far bank, whatever the tower is doing.
   */
  brake?: "judge" | number;
  /** Keep the brake hard on beyond the canal too: a driver with no nerve. */
  dawdle?: boolean;
  /** Seconds of safety "judge" leaves between the tower landing and the cart reaching it. */
  margin?: number;
}

/**
 * A driver with a plan for Bell Tower Street, reading only what a player can see: where the
 * tower has got to, where the bell lies, who is standing.
 */
export function driver(plan: Plan = {}): Pilot {
  let litAt = -1;
  return (game) => {
    const course = game.course;
    const cart = game.position;
    const d = game.distance;
    const lip = course.tower.d;
    const far = lip + Math.sin(course.tower.rest) * course.tower.height;
    const lane = (course.tower.x0 + course.tower.x1) / 2;

    // Across the fallen tower, then down the street the bell has cleared, round the bell itself.
    // Between the woolsacks on one side and the well on the other there is a way through.
    const through = (course.sacks.x + 1.2 + course.well.x - 1.15) / 2;
    const goal = d < far + 1 ? lane : d < course.well.d + 4 ? through : 0;

    let shoot: string | undefined;
    const winch = game.targets.find((target) => target.id === "windlass");
    if (winch?.lit) {
      if (litAt < 0) litAt = game.time;
      if (game.time - litAt >= (plan.wait ?? 0)) shoot = "windlass";
    }
    if (!shoot && plan.wain && game.targets.find((target) => target.id === "wain")?.lit) shoot = "wain";

    let brake = 0;
    if (d < lip) {
      const mode = plan.brake ?? "judge";
      if (mode === "judge") {
        // Would she be at the bank before the tower is down? Then hold her back.
        const arrive = (lip - d) / Math.max(1, -game.velocity.z);
        const down = game.bridgeIn + (plan.margin ?? 0.35);
        // While the rope still holds there is nothing to time: only hold her off the bank itself.
        brake = (game.tower.state === "held" ? lip - d < 24 : arrive < down) ? 1 : 0;
      } else if (litAt >= 0) {
        brake = mode;
      }
    } else if (plan.dawdle && d < far + 50) {
      brake = 1;
    }
    return shoot ? { lean: leanToward(game, goal), brake, shoot } : { lean: leanToward(game, goal), brake };
  };
}

/** The ordinary driver: fires the moment the winch lights, sets the wain off, brakes by eye. */
export const steady: Pilot = driver({ wain: true });

export interface Outcome {
  phase: Game["phase"];
  cause: Game["cause"];
  stars: number;
  shell: number;
  hay: number;
  knocks: number;
  distance: number;
  time: number;
}

/** Play one street to its end and say how it went. */
export async function play(pilot: Pilot, limit = 100): Promise<Outcome> {
  const game = await Game.create();
  while (!game.over && game.time < limit) game.step(pilot(game));
  const outcome: Outcome = {
    phase: game.phase,
    cause: game.cause,
    stars: game.stars,
    shell: Math.round(game.shell),
    hay: game.hay,
    knocks: game.knocks,
    distance: Math.round(game.distance),
    time: Math.round(game.time * 10) / 10,
  };
  game.dispose();
  return outcome;
}

export { STEP };
