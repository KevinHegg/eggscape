import { Game, STEP, type Input } from "./game";
import type { PartId } from "./parts";

/** Something that plays a run: given the game, what to do this step. */
export type Pilot = (game: Game) => Input;

/** Does nothing at all. A cart left to itself should not get home. */
export const idle: Pilot = () => ({ lean: 0, fire: [] });

/**
 * A plain, sensible driver used to prove a cart can get home: it steers round what it can see
 * and fires each machine at the moment it is useful. It reads only what a player can see.
 */
export const steady: Pilot = (game) => {
  const cart = game.position;
  const d = game.distance;
  const speed = Math.max(6, -game.velocity.z);
  const fire: PartId[] = [];
  const has = (part: PartId): boolean => (game.machine(part)?.cooldown ?? 1) <= 0;
  const reach = game.course.width / 2 - 1.1;

  // Where on the road is it safe to be over the next stretch?
  const blocked: Array<[number, number]> = [];
  for (const wall of game.course.barricades) {
    const standing = game.props.some((prop) => prop.kind === "crate" && !prop.flung && Math.abs(-prop.body.translation().z - wall.d) < 1.5);
    if (standing && wall.d > d && wall.d - d < 34) blocked.push([wall.x0 - 1.3, wall.x1 + 1.3]);
  }
  for (const patch of game.course.oil) {
    if (patch.d1 > d && patch.d0 - d < 26) blocked.push([patch.x0 - 1, patch.x1 + 1]);
  }
  for (const marker of game.markers) {
    if (!has("lever") && !has("plane")) blocked.push([marker.at.x - 2, marker.at.x + 2]);
  }
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
    // Greed: drift towards a pickup worth having, if the way is clear.
    for (const pickup of game.pickups) {
      const ahead = -pickup.pos.z - d;
      if (pickup.taken || pickup.kind === "keg" || ahead < 2 || ahead > 30) continue;
      if (pickup.kind === "man" && game.men >= 3) continue;
      if (safe(pickup.pos.x)) goal = pickup.pos.x;
    }
  }
  const lean = Math.abs(goal - cart.x) < 0.35 ? 0 : Math.sign(goal - cart.x);

  // Machines.
  const stones = game.props.filter((prop) => prop.kind === "stone" && !prop.landed && !prop.deflected && prop.returning === undefined);
  const nearest = Math.min(...stones.map((stone) => {
    const p = stone.body.translation();
    return Math.hypot(p.x - cart.x, p.y - cart.y, p.z - cart.z);
  }), Infinity);
  if (nearest < 8 && has("lever")) fire.push("lever");
  else if (nearest < 3.6 && has("plane")) fire.push("plane");
  else if (nearest < 3.2 && has("pulley")) fire.push("pulley");
  const threatened = game.markers.some((marker) => marker.t < 1.1 && Math.hypot(marker.at.x - cart.x, marker.at.z - (cart.z + game.velocity.z * marker.t)) < 1.8);
  if (threatened && has("wheel") && !has("lever") && !has("plane")) fire.push("wheel");

  for (const tower of game.towers) {
    if (tower.alive && tower.def.kind === "archers" && tower.windup > 0 && tower.windup < 0.5 && has("plane") && !fire.includes("plane")) fire.push("plane");
  }

  const crateAhead = game.props.some((prop) => {
    if (prop.kind !== "crate" || prop.flung) return false;
    const p = prop.body.translation();
    const ahead = cart.z - p.z;
    return ahead > 0 && ahead < speed * 0.22 && Math.abs(p.x - cart.x) < 1.5;
  });
  if (crateAhead && has("wedge")) fire.push("wedge");
  else if (crateAhead && has("pulley") && !fire.includes("pulley")) fire.push("pulley");

  const oilAhead = game.course.oil.some((patch) => patch.d0 - d > 0 && patch.d0 - d < speed * 0.12 && cart.x > patch.x0 && cart.x < patch.x1);
  if (oilAhead && has("screw")) fire.push("screw");

  // Brace for the two drops in the road.
  for (let index = 1; index < game.course.pieces.length; index += 1) {
    const piece = game.course.pieces[index]!;
    const before = game.course.pieces[index - 1]!;
    if (before.y1 - piece.y0 < 0.5) continue;
    const landing = piece.d0 + speed * 0.45;
    if (d > piece.d0 && landing - d < speed * 0.3 && landing - d > 0 && has("pulley") && !fire.includes("pulley")) fire.push("pulley");
  }
  return { lean, fire };
};

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
export async function play(build: readonly PartId[], pilot: Pilot, limit = 90): Promise<Outcome> {
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
  for (let settle = 0; settle < 60; settle += 1) game.step({ lean: 0, fire: [] });
  return { phase: game.phase, cause: game.cause, time: game.time, shell: game.shell, men: game.men, stars: game.stars, distance: game.distance, trace: (hash >>> 0).toString(16) };
}
