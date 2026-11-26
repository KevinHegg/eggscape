import { STREETS, type CourseDef } from "./course";
import { Game, STEP, type Carry, type Input } from "./game";

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
  /** Throw an egg at everything the cooks throw, the moment it is in the air. */
  eggs?: boolean;
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
    const d = game.distance;
    const tower = course.tower;
    if (!tower || !course.sacks || !course.well || !game.tower) return { lean: leanToward(game, 0) };
    const lip = tower.d;
    const far = lip + Math.sin(tower.rest) * tower.height;
    const lane = (tower.x0 + tower.x1) / 2;

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
    const input: Input = { lean: leanToward(game, goal), brake };
    if (shoot) input.shoot = shoot;
    const thrown = plan.eggs ? game.pans.find((pan) => !pan.doomed) : undefined;
    if (thrown) input.egg = { pan: thrown.id };
    return input;
  };
}

/** The ordinary driver: fires the moment the winch lights, sets the wain off, brakes by eye. */
export const steady: Pilot = driver({ wain: true });

export interface Blasting {
  /**
   * "wagon" throws an egg straight at the powder wagon once it is in reach. "train" sets the
   * first keg on the kerb going as soon as it can be reached, and lets the fire run down to it.
   */
  how?: "wagon" | "train" | "none";
  /** Hold her back until the barricade is down. Without it she rolls on regardless. */
  brake?: boolean;
  /** Burst the traps in the road from a safe distance, rather than steering round them. */
  traps?: boolean;
  /** Throw an egg at everything the cooks throw. */
  eggs?: boolean;
  lane?: number;
}

/** A driver for Powder Row, reading only what a player can see. */
export function sapper(plan: Blasting = {}): Pilot {
  const asked = new Map<number, number>();
  return (game) => {
    const cart = game.position;
    const d = game.distance;
    const how = plan.how ?? "wagon";
    const wall = game.walls.find((one) => one.state === "up");
    const input: Input = { lean: leanToward(game, plan.lane ?? 1.4) };
    // Hold off the barricade until it has gone, and off the wagon while it is still to go.
    if ((plan.brake ?? true) && wall && wall.def.d - d < 34) input.brake = 1;
    const reach = (at: { x: number; y: number; z: number }): number => Math.hypot(at.x - cart.x, at.y - cart.y, at.z - cart.z);
    const want = (id: number): boolean => {
      if (game.time - (asked.get(id) ?? -9) < 1) return false;
      asked.set(id, game.time);
      return true;
    };
    if (plan.traps ?? true) {
      const trap = game.kegs.find((keg) => keg.def.trap && keg.state === "set" && keg.def.d > d + 7 && reach(keg.at) < 26);
      if (trap && want(trap.def.id)) input.egg = { keg: trap.def.id };
    }
    if (!input.egg && how !== "none") {
      const first = how === "wagon" ? game.kegs.find((keg) => keg.def.big) : game.kegs.find((keg) => !keg.def.trap && !keg.def.big);
      if (first && first.state === "set" && reach(first.at) < 28 && want(first.def.id)) input.egg = { keg: first.def.id };
    }
    if (!input.egg && plan.eggs) {
      const thrown = game.pans.find((pan) => !pan.doomed);
      if (thrown) input.egg = { pan: thrown.id };
    }
    return input;
  };
}

/** A fresh, sensible driver for whichever street this is. */
export function pilotFor(course: CourseDef): Pilot {
  return course.tower ? driver({ wain: true, eggs: true }) : sapper({ eggs: true });
}


export interface Outcome {
  phase: Game["phase"];
  cause: Game["cause"];
  stars: number;
  shell: number;
  hay: number;
  knocks: number;
  eggs: number;
  distance: number;
  time: number;
}

/** Play one street to its end and say how it went. */
export async function play(pilot: Pilot, limit = 100, course: CourseDef = STREETS[0]!, carry?: Carry): Promise<Outcome> {
  const game = await Game.create(course, carry);
  while (!game.over && game.time < limit) game.step(pilot(game));
  const outcome: Outcome = {
    phase: game.phase,
    cause: game.cause,
    stars: game.stars,
    shell: Math.round(game.shell),
    hay: game.hay,
    knocks: game.knocks,
    eggs: game.eggs,
    distance: Math.round(game.distance),
    time: Math.round(game.time * 10) / 10,
  };
  game.dispose();
  return outcome;
}

export { STEP };
