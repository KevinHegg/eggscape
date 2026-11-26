import { STREETS, type CourseDef } from "./course";
import { EGG_RANGE, Game, RAM_SPEED, STEP, type Carry, type Input } from "./game";

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

/** How a driver means to use a charge with a long match in it. */
export interface Riding {
  /** Light it so as to be just past it when it goes. False leaves it alone. */
  light?: boolean;
  /** Light it this many seconds sooner than he should (or, negative, later). */
  early?: number;
  /** Keep the brake on until it has gone up: for showing what that costs. */
  hold?: boolean;
}

/** Metres past the charge he means to be when it goes: clear of the hurt, well inside the push. */
const RIDE = 5.8;

/**
 * Lights the next long-matched charge at the moment that puts him just beyond it when it goes,
 * going by how fast he is rolling now. Brakes if he is going too fast to do that from in reach.
 */
function ride(game: Game, input: Input, plan: Riding): void {
  if (plan.light === false) return;
  const d = game.distance;
  const charge = game.kegs.find((keg) => keg.def.fuse !== undefined && keg.state !== "gone" && keg.state !== "wet" && keg.def.d > d - 12);
  if (!charge) return;
  if (charge.state === "lit") {
    if (plan.hold) input.brake = 1;
    return;
  }
  if (charge.def.d < d + 2) return;
  const cart = game.position;
  const reach = Math.hypot(charge.at.x - cart.x, charge.at.y - cart.y, charge.at.z - cart.z);
  const burn = (charge.def.fuse ?? 0) + Math.min(0.7, reach / 46) + (plan.early ?? 0);
  const coming = d + Math.max(game.speed, 1) * burn;
  const thrown = game.eggFlights.some((egg) => "keg" in egg.aim && egg.aim.keg === charge.def.id);
  if (reach < EGG_RANGE - 1 && coming >= charge.def.d + RIDE) {
    if (!thrown) input.egg = { keg: charge.def.id };
  }
  // Too fast to light it from where an egg will carry: ease her until he can.
  else if (reach < 46 && game.speed * burn - RIDE > EGG_RANGE - 3) input.brake = 1;
}

export interface Milling extends Riding {
  /** Shoot the hoist and let the stone go. Without it the barricade has to be shot down instead. */
  stone?: boolean;
  /** A round at the barricade if it is still standing when it comes into reach. */
  wall?: boolean;
  /** Brake from this far short of the bridge until `off` short of it: for showing what a slow leap costs. */
  brake?: number;
  off?: number;
  /** A round into any rank with somebody still standing in his road. */
  ranks?: boolean;
  /** Burst the traps in his own road from a safe distance. */
  traps?: boolean;
  /** Throw an egg at everything the cooks throw. */
  eggs?: boolean;
  /** Where he keeps on the hill, and where he takes the bridge. */
  lane?: number;
  ramp?: number;
}

/** A driver for Miller's Leap, reading only what a player can see. */
export function miller(plan: Milling = {}): Pilot {
  const asked = new Map<number, number>();
  return (game) => {
    const cart = game.position;
    const d = game.distance;
    const course = game.course;
    const stump = course.pieces.find((piece) => piece.x0 !== undefined);
    const quay = stump?.d0 ?? Infinity;
    // Keep clear of the stone's lane on the hill, and square on what is left of the bridge.
    const lane = d > quay - 30 ? (plan.ramp ?? 2.2) : (plan.lane ?? 2.2);
    const input: Input = { lean: leanToward(game, lane) };
    if (plan.brake !== undefined && d > quay - plan.brake && d < quay - (plan.off ?? -8)) input.brake = 1;
    const hoist = game.targets.find((target) => target.id === "hoist");
    const wall = game.targets.find((target) => target.kind === "wall");
    if ((plan.stone ?? true) && hoist?.lit) input.shoot = "hoist";
    else if ((plan.wall ?? true) && wall?.lit && game.stone?.state !== "rolling") input.shoot = wall.id;
    else if (plan.ranks ?? true) {
      // Whoever the stone has left standing where he means to go.
      const rank = game.targets.find((target) => target.kind === "rank" && target.lit && Math.abs(target.at.x - lane) < 1.6 && -target.at.z - d < 18);
      if (rank) input.shoot = rank.id;
    }
    const reach = (at: { x: number; y: number; z: number }): number => Math.hypot(at.x - cart.x, at.y - cart.y, at.z - cart.z);
    const want = (id: number): boolean => {
      if (game.time - (asked.get(id) ?? -9) < 1) return false;
      asked.set(id, game.time);
      return true;
    };
    ride(game, input, plan);
    if (!input.egg && (plan.traps ?? true)) {
      const trap = game.kegs.find((keg) => keg.def.trap && keg.state === "set" && keg.def.d > d + 7 && Math.abs(keg.def.x - lane) < 3.4 && reach(keg.at) < 26);
      if (trap && want(trap.def.id)) input.egg = { keg: trap.def.id };
    }
    if (!input.egg && plan.eggs) {
      const thrown = game.pans.find((pan) => !pan.doomed);
      if (thrown) input.egg = { pan: thrown.id };
    }
    return input;
  };
}

export interface Baking extends Riding {
  /** "water" bursts the cistern and follows the flood down. "fire" keeps the powder dry. */
  way?: "water" | "fire";
  /** Hold her back behind the front of the water. Without it she runs out ahead of it. */
  follow?: boolean;
  /** Burst the traps in his own road from a safe distance. Otherwise he has to steer round them. */
  traps?: boolean;
  /** A round into any rank with somebody still standing in his road. */
  ranks?: boolean;
  /** An egg at whoever is standing in his road, to put his head down while she goes by. */
  duck?: boolean;
  /** Throw an egg at everything the cooks throw. */
  eggs?: boolean;
  /** Where he keeps in the lane, or the line he threads down it: [distance, x] and so on. */
  lane?: number | [number, number][];
}

/** Down the middle, with a step aside for the pile of shot near the bottom. */
const BY_THE_PILE: [number, number][] = [
  [84, 0],
  [92, -2.4],
  [96, -2.4],
  [104, 0],
];

/** A driver for Pudding Lane, reading only what a player can see. */
export function baker(plan: Baking = {}): Pilot {
  return (game) => {
    const cart = game.position;
    const d = game.distance;
    const way = plan.way ?? "water";
    let lane = 0;
    if (typeof plan.lane === "number") lane = plan.lane;
    else {
      const line = plan.lane ?? BY_THE_PILE;
      const next = line.findIndex(([at]) => at > d);
      if (next < 0) lane = line[line.length - 1]![1];
      else if (next === 0) lane = line[0]![1];
      else {
        const [d0, x0] = line[next - 1]!;
        const [d1, x1] = line[next]!;
        lane = x0 + ((x1 - x0) * (d - d0)) / (d1 - d0);
      }
    }
    const input: Input = { lean: leanToward(game, lane) };
    const flood = game.flood;
    if (way === "water") {
      if (game.targets.find((target) => target.id === "cistern")?.lit) input.shoot = "cistern";
      // The water has to get there first. There is nothing to be had by being ahead of it.
      if ((plan.follow ?? true) && flood && flood.state !== "spent" && d > flood.front - 7) input.brake = 1;
    }
    // Going fast enough to go through them, there is nothing to shoot at.
    if (!input.shoot && (plan.ranks ?? true) && game.speed < RAM_SPEED) {
      const charge = game.kegs.find((keg) => keg.def.fuse !== undefined && (keg.state === "set" || keg.state === "lit"));
      const rank = game.targets.find((target) => {
        if (target.kind !== "rank" || !target.lit || -target.at.z - d > 18) return false;
        // Anybody the charge is going to send her through can be left where he is.
        if (plan.light !== false && charge && (charge.state === "lit" || d < charge.def.d) && -target.at.z > charge.def.d && -target.at.z < charge.def.d + 26) return false;
        return game.mob.some((one) => one.state === "stand" && Math.abs(one.def.d + target.at.z) < 1 && Math.abs(one.def.x - lane) < 1.5);
      });
      if (rank) input.shoot = rank.id;
    }
    const reach = (at: { x: number; y: number; z: number }): number => Math.hypot(at.x - cart.x, at.y - cart.y, at.z - cart.z);
    // One egg at a thing is enough: not another while the first is still in the air.
    const flying = (kind: "keg" | "cook", id: number): boolean => game.eggFlights.some((egg) => kind in egg.aim && (egg.aim as Record<string, number>)[kind] === id);
    ride(game, input, plan);
    if (!input.egg && (plan.traps ?? true)) {
      // Only what he would actually set off, and nothing the water is about to see to.
      const trap = game.kegs.find((keg) => keg.def.trap && keg.state === "set" && keg.def.d > d + 7 && Math.abs(keg.def.x - lane) < 2.9 && reach(keg.at) < 26 && flood?.state !== "running");
      if (trap && !flying("keg", trap.def.id)) input.egg = { keg: trap.def.id };
    }
    if (!input.egg && plan.duck) {
      const one = game.mob.find((cook) => cook.state === "stand" && cook.def.d > d + 3 && cook.def.d < d + 14 && Math.abs(cook.def.x - cart.x) < 1.6);
      if (one && !flying("cook", one.def.id)) input.egg = { cook: one.def.id };
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
  if (course.tower) return driver({ wain: true, eggs: true });
  if (course.mill) return miller({ eggs: true });
  return course.cistern ? baker({ eggs: true }) : sapper({ eggs: true });
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
