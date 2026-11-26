import { chasms } from "./course";
import { Game, STEP, type Input } from "./game";
import type { PartId } from "./parts";

/** Something that plays a run: given the game, what to do this step. */
export type Pilot = (game: Game) => Input;

/** Does nothing at all. A cart left to itself should not get home. */
export const idle: Pilot = () => ({ lean: 0 });

/** The lean that carries the cart towards `x` across the road and settles it there. */
export function leanToward(game: Game, x: number): number {
  const value = (x - game.position.x) * 0.9 - game.velocity.x * 0.32;
  return Math.max(-1, Math.min(1, value));
}

/**
 * A plain, sensible driver used to prove a cart can get home: it steers out of every red ring,
 * round what stands in the road, into the gifts, and fires at what the gun is laid on. It reads
 * only what a player can see.
 */
export function driver(options: { shoot?: boolean; brake?: boolean } = {}): Pilot {
  return (game) => drive(game, options.shoot ?? true, options.brake ?? true);
}

/** The ordinary driver. */
export const steady: Pilot = driver();

function drive(game: Game, mayShoot: boolean, mayBrake: boolean): Input {
  const cart = game.position;
  const d = game.distance;
  const reach = game.course.width / 2 - 1.1;

  // Where on the road is it safe to be over the next stretch?
  const blocked: Array<[number, number]> = [];
  if (!game.has("wedge")) {
    for (const wall of game.course.walls) {
      if (wall.d > d && wall.d - d < 34 && game.wallStands(wall)) blocked.push([wall.x0 - 1.3, wall.x1 + 1.3]);
    }
  }
  if (!game.has("wheel")) {
    for (const patch of game.course.oil) {
      if (patch.d1 > d && patch.d0 - d < 26) blocked.push([patch.x0 - 1, patch.x1 + 1]);
    }
  }
  // A bridge with a side gone: be on the side that is left.
  for (const piece of game.course.pieces) {
    if (piece.d1 < d || piece.d0 - d > 45) continue;
    if (piece.x0 !== undefined && piece.x0 > -reach) blocked.push([-99, piece.x0 + 1.3]);
    if (piece.x1 !== undefined && piece.x1 < reach) blocked.push([piece.x1 - 1.3, 99]);
  }
  for (const marker of game.markers) blocked.push([marker.at.x - marker.radius - 1, marker.at.x + marker.radius + 1]);
  const safe = (x: number): boolean => blocked.every(([low, high]) => x < low || x > high);
  let goal = cart.x;
  if (!safe(cart.x)) {
    let best = Infinity;
    for (let x = -reach; x <= reach; x += 0.5) {
      if (safe(x) && Math.abs(x - cart.x) < best) {
        best = Math.abs(x - cart.x);
        goal = x;
      }
    }
  } else {
    // Greed: drift towards a gift worth having, if the way is clear.
    for (const pickup of game.pickups) {
      const ahead = -pickup.pos.z - d;
      if (pickup.taken || ahead < 2 || ahead > 30) continue;
      if (pickup.kind === "man" && game.men >= 3) continue;
      if (safe(pickup.pos.x)) goal = pickup.pos.x;
    }
  }

  // The brake: when a ring is going to land on the cart anyway, let it land in front instead.
  // Never near a gap: a slow cart falls short.
  let brake = 0;
  const lipAhead = chasms(game.course).some((gap) => gap.d0 - d > -2 && gap.d0 - d < 40);
  if (mayBrake && !lipAhead) {
    for (const marker of game.markers) {
      const due = cart.z + game.velocity.z * Math.max(0, marker.t);
      if (Math.abs(marker.at.x - cart.x) < marker.radius + 0.5 && Math.abs(due - marker.at.z) < marker.radius + 1.5) brake = 1;
    }
  }

  // The gun: towers on sight; a wall only when it's in the way.
  let shoot = false;
  if (mayShoot && game.target && game.ammo.length > 0) {
    if (game.target.kind === "tower") shoot = true;
    else shoot = !game.has("wedge") && Math.abs(game.target.at.x - cart.x) < 1.2 && !safe(cart.x);
  }
  return { lean: leanToward(game, goal), brake, shoot };
}

export interface Outcome {
  phase: Game["phase"];
  cause: Game["cause"];
  time: number;
  shell: number;
  men: number;
  stars: number;
  distance: number;
  /** A fingerprint of the whole run, for checking that it replays exactly. */
  trace: string;
}

/** Play one run to its end without drawing anything. */
export async function play(build: readonly PartId[], pilot: Pilot, limit = 130): Promise<Outcome> {
  const game = await Game.create(build);
  let hash = 2166136261;
  while (!game.over && game.time < limit) {
    game.step(pilot(game));
    game.takeEvents();
    if (game.tick % 30 === 0) {
      const p = game.position;
      for (const value of [p.x, p.y, p.z, game.shell]) {
        hash ^= Math.round(value * 1000);
        hash = Math.imul(hash, 16777619);
      }
    }
  }
  for (let settle = 0; settle < 60; settle += 1) game.step({ lean: 0 });
  const outcome = { phase: game.phase, cause: game.cause, time: game.time, shell: game.shell, men: game.men, stars: game.stars, distance: game.distance, trace: (hash >>> 0).toString(16) };
  game.dispose();
  return outcome;
}
