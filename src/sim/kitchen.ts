import RAPIER from "@dimforge/rapier3d-deterministic-compat";

/**
 * The Queen's kitchen, seen from the side with its front wall off. The Egg King falls through
 * it by himself; all the player can do is have a straw bale thrown in. Everything here lives
 * in one plane (x across, y up): bodies cannot leave it and turn only about the axis out of
 * the page. No DOM, no wall clock, no dice: a run replays exactly.
 */

export const STEP = 1 / 60;
export const G = 9.81;

/** A bale, across and high. It is as deep as the kitchen is. */
export const BALE_W = 1.6;
export const BALE_H = 0.6;
/** Seconds between the tap and the bale being there. This is the game's one delay: lead him. */
export const BALE_FLIGHT = 0.55;
const BALE_DENSITY = 3.2;

/** A change of velocity in one step, in m/s, that cracks him; and one that ends him outright. */
export const CRACK = 5;
export const BREAK = 9.5;
/** A landing this hard on a bale bursts it. Rolling on to one does not. */
export const BURST = 7;
/** The shell takes this many cracks. The next one is the last. */
export const SHELL = 2;
/** Seconds after a knock in which another does not count: one fall, one crack. */
const KNOCK_GRACE = 0.3;
/** Seconds something soft still counts after he has left it, so being thrown off a cushion is not a knock. */
const SOFT_GRACE = 0.06;

/** Seconds he may stand still before a cook has him, and when the warning comes. */
export const IDLE = 8;
export const IDLE_WARN = 4;
/** Getting nowhere means not having moved this far from where the count began. */
const STILL = 0.5;

/** A see-saw's plank: its weight, how hard it is to turn, and the torque that keeps the seat end down. */
const PLANK_BALL = 0.9;
const PLANK_DENSITY = 0.3;
const PLANK_BIAS = 3;
/**
 * The throw is a rule, not a collision: when the seat end comes up against its stop, whoever
 * is in the seat leaves at this share of the speed the bale came down on the other end with,
 * and never faster than the top speed. So the height a bale is dropped from is the throw.
 */
export const FLING_GAIN = 0.9;
export const FLING_TOP = 11;
const FLING_LEAST = 1.2;

/**
 * The egg: half an ellipse below its waist and a taller half above, turned about his long axis
 * (local y). No flat anywhere on him, so no slope here is gentle enough for him to lie on.
 */
export const EGG = { wide: 0.42, blunt: 0.46, sharp: 0.58 } as const;
/** His outline: how far out he is at each of `count + 1` heights from his blunt end to his sharp one. */
export function eggOutline(count: number): Array<{ y: number; r: number }> {
  const outline: Array<{ y: number; r: number }> = [];
  for (let index = 0; index <= count; index += 1) {
    const t = (index / count) * Math.PI;
    const up = -Math.cos(t);
    outline.push({ y: up * (up < 0 ? EGG.blunt : EGG.sharp), r: Math.sin(t) * EGG.wide });
  }
  return outline;
}

export type Look = "stone" | "wood" | "wall" | "sack" | "nest" | "iron";

/** A fixed piece of the kitchen: a box with its centre, size and tilt (radians, anticlockwise). */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  turn: number;
  /** Straw and sacks: nothing that lands on them is hurt. */
  soft: boolean;
  look: Look;
}

/** A plank on a pivot. The seat end is down and padded; a bale on the other end throws what sits there. */
export interface SeesawDef {
  /** The pivot. */
  x: number;
  y: number;
  /** Length of the seat arm and the bale arm. `side` is +1 when the seat is on the right. */
  seat: number;
  load: number;
  side: 1 | -1;
  /** How far it tips either way, radians. */
  tip: number;
  /** Which way it throws whoever is in the seat when the seat end comes up against its stop: radians off straight up, towards the bale end. */
  cast: number;
}

/** A hole in a floor with a frying pan under it. */
export interface PitDef {
  x: number;
  /** The floor it is cut in, and the pan below. */
  y: number;
  w: number;
  pan: number;
  /** The pan hangs on a bracket just under the hole, not on a stove on the floor. */
  hung: boolean;
}

/**
 * A place a bale is meant for. A tap within `reach` across, between `y0` and `y1`, is taken to
 * mean exactly here across; and with `seat`, exactly there and at that tilt, so it drops in.
 */
export interface SocketDef {
  x: number;
  y0: number;
  y1: number;
  reach: number;
  seat?: { y: number; turn: number };
}

export interface LevelDef {
  /** A short name for code and saved games, and the name the player sees. */
  key: string;
  name: string;
  /**
   * What the nest at the bottom is: a roost, where a hen keeps him safe and the next room down
   * begins; or the Empress Hen's own nest, which is home.
   */
  ends: "roost" | "nest";
  /** He comes in through a trapdoor in the ceiling, from the roost above. */
  hatch: boolean;
  /** Inside walls. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  start: { x: number; y: number };
  /** The shove that sets him off: a spin, radians a second (negative rolls him to the right). */
  shove: number;
  blocks: Block[];
  seesaws: SeesawDef[];
  pits: PitDef[];
  sockets: SocketDef[];
  /** The nest at the bottom: once he is inside this box he has done the room. */
  nest: { x0: number; x1: number; y0: number; y1: number };
  bales: number;
  /** How many of them must be left over for the third star. */
  spare: number;
}

/** A slab whose top face runs from one point to another. */
export function slab(x0: number, y0: number, x1: number, y1: number, thick: number, look: Look, soft = false): Block {
  const turn = Math.atan2(y1 - y0, x1 - x0);
  const length = Math.hypot(x1 - x0, y1 - y0);
  return {
    x: (x0 + x1) / 2 + (Math.sin(turn) * thick) / 2,
    y: (y0 + y1) / 2 - (Math.cos(turn) * thick) / 2,
    w: length,
    h: thick,
    turn,
    soft,
    look,
  };
}

/** An upright box by its corners. */
export function box(x0: number, y0: number, x1: number, y1: number, look: Look, soft = false): Block {
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), turn: 0, soft, look };
}

const FLOOR = 14.2;
/** The step down into the see-saw's seat. The seat's lip swings up just clear of it. */
const SEAT_WALL = 2.12;
/** The floor with the hole in it: its height at the left wall, and how fast it falls to the right. */
const LOW = { y: 19.8, fall: 0.36 };
const lowAt = (x: number): number => LOW.y - LOW.fall * (x + 4);
const LOW_TURN = -Math.atan(LOW.fall);
const PIT = { x: -1.1, w: 1.1, well: BALE_W * Math.cos(LOW_TURN) + 0.12 };
/** How far below the floor the well's ledges lie, straight down: one bale, measured square to the slope. */
const WELL_DEEP = BALE_H / Math.cos(LOW_TURN);
const WELL = { x0: PIT.x - PIT.well / 2, x1: PIT.x + PIT.well / 2 };

/**
 * The first screen. Three things to do with a bale, top to bottom: catch him at the foot of
 * the long drop; drop one on the see-saw to throw him across to the flour sacks; and stop the
 * hole to the frying pan before he rolls into it.
 */
export const LARDER: LevelDef = {
  key: "larder",
  name: "The Larder",
  ends: "roost",
  hatch: false,
  left: -4,
  right: 4,
  top: 31,
  bottom: 13,
  start: { x: -2.9, y: 28.9 - (1.1 * 1.5) / 4.2 + EGG.blunt + 0.06 },
  shove: -2.4,
  bales: 5,
  spare: 2,
  blocks: [
    box(-4.8, 12.6, -4, 31.4, "wall"),
    box(4, 12.6, 4.8, 31.4, "wall"),
    box(-4, 13.4, 4, FLOOR, "stone"),

    // The larder shelf he starts on, and the long drop off the end of it.
    slab(-4, 28.9, 0.2, 27.4, 0.4, "wood"),

    // Where he comes down: a short floor falling to the left, into the see-saw's seat.
    slab(SEAT_WALL, 22.03, 4, 22.7, 0.4, "stone"),
    box(SEAT_WALL, 20.8, 2.8, 21.7, "stone"),
    box(-0.9, 20.8, SEAT_WALL, 21.1, "stone"),

    // The flour sacks he is thrown on to, and the floor with the hole in it.
    slab(-4, lowAt(-4) + 0.4, -2.5, lowAt(-2.5) + 0.4, 0.4, "sack", true),
    slab(-4, lowAt(-4), WELL.x0, lowAt(WELL.x0), 0.5, "stone"),
    // The well: two ledges a bale deep, lying along the slope, and the hole between them.
    slab(WELL.x0 - 0.12, lowAt(WELL.x0 - 0.12) - WELL_DEEP, PIT.x - PIT.w / 2, lowAt(PIT.x - PIT.w / 2) - WELL_DEEP, 0.4, "stone"),
    slab(PIT.x + PIT.w / 2, lowAt(PIT.x + PIT.w / 2) - WELL_DEEP, WELL.x1 + 0.12, lowAt(WELL.x1 + 0.12) - WELL_DEEP, 0.4, "stone"),
    slab(WELL.x1 + 0.04, lowAt(WELL.x1 + 0.04), 1.9, lowAt(1.9), 0.5, "stone"),
    // The flue under the hole: whatever goes in comes out in the pan.
    box(PIT.x - PIT.w / 2 - 0.25, FLOOR + 1.9, PIT.x - PIT.w / 2, lowAt(PIT.x) - WELL_DEEP - 0.5, "iron"),
    box(PIT.x + PIT.w / 2, FLOOR + 1.9, PIT.x + PIT.w / 2 + 0.25, lowAt(PIT.x) - WELL_DEEP - 0.7, "iron"),

    // The nest, bottom right.
    box(1.5, FLOOR, 4, FLOOR + 0.5, "nest", true),
    box(1.2, FLOOR, 1.5, FLOOR + 1, "nest", true),
    // Straw banked up the wall behind it, for an egg that arrives in a hurry.
    box(3.7, FLOOR, 4, FLOOR + 3.8, "nest", true),
  ],
  seesaws: [{ x: 0.7, y: 21.55, seat: 1.25, load: 1.3, side: 1, tip: 0.31, cast: 0.7 }],
  pits: [{ x: PIT.x, y: lowAt(PIT.x) - WELL_DEEP, w: PIT.w, pan: FLOOR + 0.7, hung: false }],
  sockets: [
    { x: PIT.x, y0: lowAt(PIT.x) - 1.2, y1: lowAt(PIT.x) + 1.4, reach: 1, seat: { y: lowAt(PIT.x) - WELL_DEEP / 2 + 0.08, turn: LOW_TURN } },
    { x: 0.7 - 0.72, y0: 21, y1: 27.5, reach: 0.85 },
    // Under the long drop: clear of the step into the seat, wherever on that floor the finger lands.
    { x: 3.05, y0: 22, y1: 25, reach: 1 },
  ],
  nest: { x0: 1.5, x1: 3.7, y0: FLOOR + 0.4, y1: FLOOR + 1.9 },
};

/** The same room, further down the house. */
function lowered(level: LevelDef, by: number): LevelDef {
  return {
    ...level,
    top: level.top - by,
    bottom: level.bottom - by,
    start: { x: level.start.x, y: level.start.y - by },
    blocks: level.blocks.map((block) => ({ ...block, y: block.y - by })),
    seesaws: level.seesaws.map((saw) => ({ ...saw, y: saw.y - by })),
    pits: level.pits.map((pit) => ({ ...pit, y: pit.y - by, pan: pit.pan - by })),
    sockets: level.sockets.map((socket) => ({
      x: socket.x,
      y0: socket.y0 - by,
      y1: socket.y1 - by,
      reach: socket.reach,
      ...(socket.seat ? { seat: { y: socket.seat.y - by, turn: socket.seat.turn } } : {}),
    })),
    nest: { x0: level.nest.x0, x1: level.nest.x1, y0: level.nest.y0 - by, y1: level.nest.y1 - by },
  };
}

/** How tall a room is: each one hangs this far below the last. */
export const STOREY = 18;

/** The scullery's top shelf, which falls to the left, and the gap in it over the hanging pan. */
const RACK = { y: 29.5, fall: 0.36 };
const rackAt = (x: number): number => RACK.y - RACK.fall * (4 - x);
const RACK_TURN = Math.atan(RACK.fall);
const GAP = { x: 1.3, w: 1.1, well: BALE_W * Math.cos(RACK_TURN) + 0.12 };
const GAP_DEEP = BALE_H / Math.cos(RACK_TURN);
const GAP_WELL = { x0: GAP.x - GAP.well / 2, x1: GAP.x + GAP.well / 2 };
/** The scullery's see-saw is the larder's, the other way round: its pivot, and the step down into its seat. */
const TIP = { x: -1, y: 22.55, wall: -1 - 1.42 };
/** Where the bale under the long drop goes: hard up against the wall, which is all the room there is. */
const CATCH = -4 + BALE_W / 2 + 0.02;
/** The short floor he comes down on, which falls to the right into that seat. */
const landAt = (x: number): number => TIP.y + 0.48 + 0.356 * (TIP.wall - x);
/** The bottom floor, which falls to the left, over the hole and on to the nest. */
const SINK = { y: 19.8, fall: 0.36 };
const sinkAt = (x: number): number => SINK.y - SINK.fall * (4 - x);
const SINK_TURN = Math.atan(SINK.fall);
const PLUG = { x: 1.1, w: 1.1, well: BALE_W * Math.cos(SINK_TURN) + 0.12 };
const PLUG_DEEP = BALE_H / Math.cos(SINK_TURN);
const PLUG_WELL = { x0: PLUG.x - PLUG.well / 2, x1: PLUG.x + PLUG.well / 2 };

/**
 * The second screen, written as if it stood where the first does and then lowered a storey.
 * He comes in through the hatch at the top right, already rolling, and the first thing in his
 * way is a gap over a pan: bridge it, and quickly. Then the long drop at the far wall, which
 * wants a bale under it; the see-saw, thrown the other way; and the hole in the bottom floor.
 * Four things to do and five bales: one to spare.
 */
const SCULLERY_HERE: LevelDef = {
  key: "scullery",
  name: "The Scullery",
  ends: "nest",
  hatch: true,
  left: -4,
  right: 4,
  top: 31,
  bottom: 13,
  start: { x: 3.5, y: 30.2 },
  // A backward spin: he dithers under the hatch for a moment before the shelf takes him.
  shove: -3,
  bales: 5,
  spare: 1,
  blocks: [
    box(-4.8, 12.6, -4, 31.4, "wall"),
    box(4, 12.6, 4.8, 31.4, "wall"),
    box(-4, 13.4, 4, FLOOR, "stone"),

    // The shelf under the hatch, the gap in it with a ledge each side a bale deep, and the rest of it.
    slab(GAP_WELL.x1, rackAt(GAP_WELL.x1), 4, RACK.y, 0.4, "wood"),
    // The far ledge and the end of the shelf beyond are padded: he comes across the gap fast.
    slab(GAP_WELL.x0 - 0.12, rackAt(GAP_WELL.x0 - 0.12) - GAP_DEEP, GAP.x - GAP.w / 2, rackAt(GAP.x - GAP.w / 2) - GAP_DEEP, 0.4, "sack", true),
    slab(GAP.x + GAP.w / 2, rackAt(GAP.x + GAP.w / 2) - GAP_DEEP, GAP_WELL.x1 + 0.12, rackAt(GAP_WELL.x1 + 0.12) - GAP_DEEP, 0.4, "wood"),
    slab(GAP_WELL.x0 - 0.2, rackAt(GAP_WELL.x0 - 0.2), GAP_WELL.x0 - 0.04, rackAt(GAP_WELL.x0 - 0.04), 0.4, "sack", true),
    slab(-2.5, rackAt(-2.5), GAP_WELL.x0 - 0.2, rackAt(GAP_WELL.x0 - 0.2), 0.4, "wood"),
    // The sides of the pan's flue, hung under the gap.
    box(GAP.x - GAP.w / 2 - 0.2, rackAt(GAP.x) - GAP_DEEP - 2, GAP.x - GAP.w / 2, rackAt(GAP.x) - GAP_DEEP - 0.7, "iron"),
    box(GAP.x + GAP.w / 2, rackAt(GAP.x) - GAP_DEEP - 2, GAP.x + GAP.w / 2 + 0.2, rackAt(GAP.x) - GAP_DEEP - 0.5, "iron"),
    box(GAP.x - GAP.w / 2 - 0.2, rackAt(GAP.x) - GAP_DEEP - 2.2, GAP.x + GAP.w / 2 + 0.2, rackAt(GAP.x) - GAP_DEEP - 2, "iron"),
    // Straw on the wall where he comes off the end of the shelf. Under it, a long drop.
    box(-4, 25.4, -3.8, 28.6, "nest", true),

    // Where he comes down: a short floor falling to the right, into the see-saw's seat.
    slab(-4, landAt(-4), TIP.wall, landAt(TIP.wall), 0.4, "stone"),
    box(TIP.wall - 0.68, TIP.y - 0.75, TIP.wall, TIP.y + 0.15, "stone"),
    box(TIP.wall, TIP.y - 0.75, TIP.x + 1.6, TIP.y - 0.45, "stone"),

    // The sacks he is thrown on to, and the floor with the hole in it.
    slab(PLUG_WELL.x1 + 0.05, sinkAt(PLUG_WELL.x1 + 0.05) + 0.4, 4, sinkAt(4) + 0.4, 0.4, "sack", true),
    slab(PLUG_WELL.x1, sinkAt(PLUG_WELL.x1), 4, sinkAt(4), 0.5, "stone"),
    slab(PLUG_WELL.x0 - 0.12, sinkAt(PLUG_WELL.x0 - 0.12) - PLUG_DEEP, PLUG.x - PLUG.w / 2, sinkAt(PLUG.x - PLUG.w / 2) - PLUG_DEEP, 0.4, "stone"),
    slab(PLUG.x + PLUG.w / 2, sinkAt(PLUG.x + PLUG.w / 2) - PLUG_DEEP, PLUG_WELL.x1 + 0.12, sinkAt(PLUG_WELL.x1 + 0.12) - PLUG_DEEP, 0.4, "stone"),
    slab(-1.9, sinkAt(-1.9), PLUG_WELL.x0 - 0.04, sinkAt(PLUG_WELL.x0 - 0.04), 0.5, "stone"),
    box(PLUG.x - PLUG.w / 2 - 0.25, FLOOR + 1.9, PLUG.x - PLUG.w / 2, sinkAt(PLUG.x) - PLUG_DEEP - 0.7, "iron"),
    box(PLUG.x + PLUG.w / 2, FLOOR + 1.9, PLUG.x + PLUG.w / 2 + 0.25, sinkAt(PLUG.x) - PLUG_DEEP - 0.5, "iron"),

    // The Empress Hen's nest, bottom left, with straw banked up the wall behind it.
    box(-4, FLOOR, -1.5, FLOOR + 0.5, "nest", true),
    box(-1.5, FLOOR, -1.2, FLOOR + 1, "nest", true),
    box(-4, FLOOR, -3.7, FLOOR + 3.8, "nest", true),
  ],
  seesaws: [{ x: TIP.x, y: TIP.y, seat: 1.25, load: 1.3, side: -1, tip: 0.31, cast: 0.7 }],
  pits: [
    { x: GAP.x, y: rackAt(GAP.x) - GAP_DEEP, w: GAP.w, pan: rackAt(GAP.x) - GAP_DEEP - 1.9, hung: true },
    { x: PLUG.x, y: sinkAt(PLUG.x) - PLUG_DEEP, w: PLUG.w, pan: FLOOR + 0.7, hung: false },
  ],
  sockets: [
    { x: GAP.x, y0: rackAt(GAP.x) - 1.2, y1: rackAt(GAP.x) + 1.4, reach: 1, seat: { y: rackAt(GAP.x) - GAP_DEEP / 2 + 0.08, turn: RACK_TURN } },
    { x: TIP.x + 0.72, y0: TIP.y - 0.55, y1: 27, reach: 0.85 },
    { x: CATCH, y0: TIP.y, y1: TIP.y + 3, reach: 0.95 },
    { x: PLUG.x, y0: sinkAt(PLUG.x) - 1.2, y1: sinkAt(PLUG.x) + 1.4, reach: 1, seat: { y: sinkAt(PLUG.x) - PLUG_DEEP / 2 + 0.08, turn: SINK_TURN } },
  ],
  nest: { x0: -3.7, x1: -1.5, y0: FLOOR + 0.4, y1: FLOOR + 1.9 },
};

export const SCULLERY: LevelDef = lowered(SCULLERY_HERE, STOREY);

/** The house, from the top down. Each room is a game of its own; the roost between two is a waypoint. */
export const LEVELS: LevelDef[] = [LARDER, SCULLERY];

export type Phase = "ready" | "run" | "home" | "fried" | "broken" | "caught";

export type GameEvent =
  | { type: "start" }
  | { type: "throw"; id: number; x: number; y: number }
  | { type: "empty" }
  | { type: "bale"; id: number; x: number; y: number }
  | { type: "burst"; id: number; x: number; y: number }
  | { type: "soft"; jolt: number; x: number; y: number }
  | { type: "knock"; jolt: number; x: number; y: number }
  | { type: "crack"; cracks: number; x: number; y: number }
  | { type: "broken"; x: number; y: number }
  | { type: "fling"; speed: number }
  | { type: "warn" }
  | { type: "caught" }
  | { type: "fried"; x: number; y: number }
  | { type: "home" };

export interface Input {
  /** Throw a bale here. */
  bale?: { x: number; y: number };
}

export interface Pose {
  x: number;
  y: number;
  turn: number;
}

interface Bale {
  id: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  /** How fast it was falling before this step, and whether it has come down on a see-saw yet. */
  fall: number;
  spent: boolean;
}

interface Incoming {
  id: number;
  x: number;
  y: number;
  turn: number;
  at: number;
}

let ready: Promise<void> | null = null;
/** Rapier is WebAssembly: wait for this once before making a game. */
export function loadPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

const quat = (turn: number) => ({ x: 0, y: 0, z: Math.sin(turn / 2), w: Math.cos(turn / 2) });
const turnOf = (q: { z: number; w: number }): number => 2 * Math.atan2(q.z, q.w);

/** Points on the egg's skin, for its hull. */
function eggPoints(): Float32Array {
  const points: number[] = [];
  for (const { y, r } of eggOutline(20)) {
    const around = r < 0.001 ? 1 : 16;
    for (let step = 0; step < around; step += 1) {
      const lon = (step / around) * Math.PI * 2;
      points.push(Math.cos(lon) * r, y, Math.sin(lon) * r);
    }
  }
  return new Float32Array(points);
}

export class Game {
  readonly level: LevelDef;
  readonly world: RAPIER.World;
  time = 0;
  phase: Phase = "ready";
  cracks = 0;
  balesLeft: number;
  /** Bales he has landed on and burst. */
  burst = 0;
  /** The hardest knock he has taken on something hard, m/s. */
  worst = 0;
  /** Seconds he has been standing still. */
  idle = 0;
  events: GameEvent[] = [];

  private readonly eggBody: RAPIER.RigidBody;
  private readonly eggCollider: RAPIER.Collider;
  private readonly soft = new Set<number>();
  /** `hit` is the speed of the hardest bale to come down on it since it last threw. */
  private readonly planks: Array<{ body: RAPIER.RigidBody; def: SeesawDef; hit: number; up: boolean; spin: number }> = [];
  /** The padded seats: he sinks into one and stays put. */
  private readonly seats = new Set<number>();
  private flungAt = -1;
  /** Where he was when he last got anywhere, and when. */
  private anchor = { x: 0, y: 0 };
  private readonly live: Bale[] = [];
  private readonly coming: Incoming[] = [];
  private nextId = 1;
  private last = { x: 0, y: 0 };
  private softUntil = -1;
  private knockUntil = -1;
  private warned = false;
  private homeAt = -1;

  constructor(level: LevelDef = LARDER) {
    this.level = level;
    this.balesLeft = level.bales;
    this.world = new RAPIER.World({ x: 0, y: -G, z: 0 });
    this.world.timestep = STEP;

    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const block of level.blocks) {
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(block.w / 2, block.h / 2, 1)
          .setTranslation(block.x, block.y, 0)
          .setRotation(quat(block.turn))
          .setFriction(block.soft ? 1 : 0.8)
          .setRestitution(0),
        ground,
      );
      if (block.soft) this.soft.add(collider.handle);
    }

    for (const def of level.seesaws) {
      // No joint: the plank cannot move at all, only turn, and it is weighted to turn about
      // its pivot. A steady torque stands in for the heavy seat end and holds that end down.
      const rest = -def.side * def.tip;
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(def.x, def.y, 0)
          .setRotation(quat(rest))
          .enabledTranslations(false, false, false)
          .enabledRotations(false, false, true)
          .setCanSleep(false)
          .setCcdEnabled(true),
      );
      // All its weight is a ball on the pivot that touches nothing, so it turns about the pivot.
      this.world.createCollider(RAPIER.ColliderDesc.ball(PLANK_BALL).setDensity(PLANK_DENSITY).setCollisionGroups(0), body);
      // The bale arm is bare board; the seat arm is padded, flush with it, so nothing stands
      // between him and the low end of the seat; and a lip keeps him on it.
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.load / 2, 0.06, 0.9)
          .setTranslation((-def.side * def.load) / 2, 0, 0)
          .setDensity(0)
          .setFriction(0.9)
          .setRestitution(0),
        body,
      );
      const pad = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.seat / 2, 0.06, 0.9)
          .setTranslation((def.side * def.seat) / 2, 0, 0)
          .setDensity(0)
          .setFriction(1)
          .setRestitution(0),
        body,
      );
      const lip = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.06, 0.2, 0.9)
          .setTranslation(def.side * (def.seat - 0.06), 0.3, 0)
          .setDensity(0)
          .setFriction(1)
          .setRestitution(0),
        body,
      );
      this.soft.add(pad.handle);
      this.soft.add(lip.handle);
      this.seats.add(pad.handle);
      body.addTorque({ x: 0, y: 0, z: -def.side * PLANK_BIAS }, true);
      this.planks.push({ body, def, hit: 0, up: false, spin: 0 });
    }

    this.eggBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(level.start.x, level.start.y, 0)
        .enabledTranslations(true, true, false)
        .enabledRotations(false, false, true)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setAngularDamping(0.15),
    );
    const hull = RAPIER.ColliderDesc.convexHull(eggPoints());
    if (!hull) throw new Error("no hull for the egg");
    this.eggCollider = this.world.createCollider(hull.setDensity(1).setFriction(0.8).setRestitution(0.05), this.eggBody);
    this.eggBody.setGravityScale(0, false);
    this.last = { x: 0, y: 0 };
  }

  dispose(): void {
    this.world.free();
  }

  get over(): boolean {
    return this.phase !== "ready" && this.phase !== "run";
  }

  get egg(): Pose & { vx: number; vy: number } {
    const p = this.eggBody.translation();
    const v = this.eggBody.linvel();
    return { x: p.x, y: p.y, turn: turnOf(this.eggBody.rotation()), vx: v.x, vy: v.y };
  }

  get bales(): Array<Pose & { id: number }> {
    return this.live.map((bale) => {
      const p = bale.body.translation();
      return { id: bale.id, x: p.x, y: p.y, turn: turnOf(bale.body.rotation()) };
    });
  }

  /** Bales on their way in: where each will be, and how far along (0 thrown, 1 there). */
  get incoming(): Array<{ id: number; x: number; y: number; turn: number; k: number }> {
    return this.coming.map((bale) => ({ id: bale.id, x: bale.x, y: bale.y, turn: bale.turn, k: 1 - Math.max(0, bale.at - this.time) / BALE_FLIGHT }));
  }

  get seesaws(): Array<Pose & { def: SeesawDef }> {
    return this.planks.map((plank) => {
      const p = plank.body.translation();
      return { x: p.x, y: p.y, turn: turnOf(plank.body.rotation()), def: plank.def };
    });
  }

  drain(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Let him go. */
  start(): void {
    if (this.phase !== "ready") return;
    this.phase = "run";
    this.eggBody.setGravityScale(1, true);
    this.eggBody.setAngvel({ x: 0, y: 0, z: this.level.shove }, true);
    this.events.push({ type: "start" });
  }

  /** Where a tap at this point puts a bale: across to a socket if one is near, and up out of anything solid. */
  aim(x: number, y: number): { x: number; y: number; turn: number } {
    const level = this.level;
    const ax = Math.min(level.right - BALE_W / 2 - 0.02, Math.max(level.left + BALE_W / 2 + 0.02, x));
    const ay = Math.min(level.top - 1, Math.max(level.bottom + 1, y));
    for (const socket of level.sockets) {
      if (Math.abs(x - socket.x) > socket.reach || y < socket.y0 || y > socket.y1) continue;
      if (socket.seat && this.free(socket.x, socket.seat.y, socket.seat.turn)) return { x: socket.x, y: socket.seat.y, turn: socket.seat.turn };
      return { x: socket.x, y: this.lifted(socket.x, ay), turn: 0 };
    }
    return { x: ax, y: this.lifted(ax, ay), turn: 0 };
  }

  private free(x: number, y: number, turn = 0): boolean {
    const shape = new RAPIER.Cuboid(BALE_W / 2 - 0.03, BALE_H / 2 - 0.03, 0.5);
    return this.world.intersectionWithShape({ x, y, z: 0 }, quat(turn), shape) === null;
  }

  private lifted(x: number, y: number): number {
    for (let up = 0; up <= 3; up += 0.1) {
      if (this.free(x, y + up)) return y + up;
    }
    return y + 3;
  }

  step(input: Input = {}): void {
    if (this.phase === "run" && input.bale) {
      if (this.balesLeft <= 0) {
        this.events.push({ type: "empty" });
      } else {
        const at = this.aim(input.bale.x, input.bale.y);
        const id = this.nextId;
        this.nextId += 1;
        this.balesLeft -= 1;
        this.coming.push({ id, x: at.x, y: at.y, turn: at.turn, at: this.time + BALE_FLIGHT });
        this.events.push({ type: "throw", id, x: at.x, y: at.y });
      }
    }

    for (let index = this.coming.length - 1; index >= 0; index -= 1) {
      const bale = this.coming[index]!;
      if (bale.at > this.time) continue;
      this.coming.splice(index, 1);
      this.land(bale);
    }

    const before = this.eggBody.linvel();
    this.last = { x: before.x, y: before.y };
    for (const bale of this.live) bale.fall = Math.max(0, -bale.body.linvel().y);
    this.world.step();
    this.time += STEP;
    this.weigh();
    this.stop();
    if (this.phase !== "run") return;

    this.feel();
    this.watch();
  }

  private land(bale: Incoming): void {
    // Things move in half a second: if its place has been taken, it comes in on top.
    const y = this.free(bale.x, bale.y, bale.turn) ? bale.y : this.lifted(bale.x, bale.y);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(bale.x, y, 0)
        .setRotation(quat(bale.turn))
        .enabledTranslations(true, true, false)
        .enabledRotations(false, false, true)
        .setCcdEnabled(true)
        .setAngularDamping(0.6),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(BALE_W / 2, BALE_H / 2, 0.4).setDensity(BALE_DENSITY).setFriction(1).setRestitution(0),
      body,
    );
    this.soft.add(collider.handle);
    this.live.push({ id: bale.id, body, collider, fall: 0, spent: false });
    this.events.push({ type: "bale", id: bale.id, x: bale.x, y });
  }

  /** A bale coming down on a plank: how fast it was falling is what the plank will throw with. */
  private weigh(): void {
    for (const bale of this.live) {
      if (bale.spent) continue;
      for (const plank of this.planks) {
        let on = false;
        this.world.contactPairsWith(bale.collider, (other) => {
          if (other.parent()?.handle !== plank.body.handle) return;
          this.world.contactPair(bale.collider, other, (manifold) => {
            if (manifold.numContacts() > 0) on = true;
          });
        });
        if (!on) continue;
        bale.spent = true;
        plank.hit = Math.max(plank.hit, bale.fall);
      }
    }
  }

  /** A plank goes no further than its stops, and when the seat end comes up against its stop, that is what throws him. */
  private stop(): void {
    for (const plank of this.planks) {
      const turn = turnOf(plank.body.rotation());
      const tip = plank.def.tip;
      const spin = plank.body.angvel().z;
      if (Math.abs(turn) > tip) {
        plank.body.setRotation(quat(Math.sign(turn) * tip), true);
        if (Math.sign(spin) === Math.sign(turn)) plank.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      // The stop may be the far end meeting the floor a hair short of the limit: either counts.
      const raised = turn * plank.def.side;
      if (raised < 0) plank.up = false;
      if (!plank.up && raised >= tip - 0.04) {
        plank.up = true;
        const coming = Math.max(spin * plank.def.side, plank.spin);
        if (this.phase === "run") this.fling(plank.def, plank.hit > 0 ? plank.hit * FLING_GAIN : coming);
        plank.hit = 0;
      }
      plank.spin = spin * plank.def.side;
    }
  }

  /** The seat end has come up against its stop: whoever is in the seat goes. */
  private fling(def: SeesawDef, power: number): void {
    if (power < FLING_LEAST) return;
    const p = this.eggBody.translation();
    const turn = def.side * def.tip;
    const dx = p.x - def.x;
    const dy = p.y - def.y;
    const along = (dx * Math.cos(turn) + dy * Math.sin(turn)) * def.side;
    const above = -dx * Math.sin(turn) + dy * Math.cos(turn);
    if (along < 0.1 || along > def.seat + 0.5 || above < 0 || above > 1.6) return;
    const speed = Math.min(FLING_TOP, power);
    this.eggBody.setLinvel({ x: -def.side * Math.sin(def.cast) * speed, y: Math.cos(def.cast) * speed, z: 0 }, true);
    this.eggBody.setAngvel({ x: 0, y: 0, z: def.side * Math.min(6, speed * 0.6) }, true);
    this.eggBody.setLinearDamping(0);
    this.flungAt = this.time;
    this.softUntil = this.time + SOFT_GRACE * 2;
    this.events.push({ type: "fling", speed });
  }

  /** What he is touching that is soft, if anything; and which bales. */
  private touching(): { soft: boolean; seat: boolean; bales: Bale[] } {
    let soft = false;
    let seat = false;
    const bales: Bale[] = [];
    this.world.contactPairsWith(this.eggCollider, (other) => {
      if (!this.soft.has(other.handle)) return;
      let contact = false;
      this.world.contactPair(this.eggCollider, other, (manifold) => {
        if (manifold.numContacts() > 0) contact = true;
      });
      if (!contact) return;
      soft = true;
      if (this.seats.has(other.handle)) seat = true;
      const bale = this.live.find((candidate) => candidate.collider.handle === other.handle);
      if (bale) bales.push(bale);
    });
    return { soft, seat, bales };
  }

  /** The one rule: a sharp change in his velocity is a knock, unless what did it was soft. */
  private feel(): void {
    const v = this.eggBody.linvel();
    const p = this.eggBody.translation();
    // Gravity's own share of the change is not a knock.
    const jolt = Math.hypot(v.x - this.last.x, v.y - this.last.y + G * STEP);
    const touch = this.touching();
    if (touch.soft) this.softUntil = Math.max(this.softUntil, this.time + SOFT_GRACE);
    // A padded seat holds him: he does not rock about in it.
    const held = touch.seat && this.time > this.flungAt + 0.5;
    this.eggBody.setLinearDamping(held ? 4 : 0);
    this.eggBody.setAngularDamping(held ? 6 : 0.15);
    if (jolt < CRACK) return;

    if (this.time <= this.softUntil) {
      this.events.push({ type: "soft", jolt, x: p.x, y: p.y });
      for (const bale of jolt >= BURST ? touch.bales : []) {
        const at = bale.body.translation();
        this.events.push({ type: "burst", id: bale.id, x: at.x, y: at.y });
        this.soft.delete(bale.collider.handle);
        this.world.removeRigidBody(bale.body);
        this.live.splice(this.live.indexOf(bale), 1);
        this.burst += 1;
      }
      return;
    }
    if (this.time < this.knockUntil) return;
    this.knockUntil = this.time + KNOCK_GRACE;
    this.worst = Math.max(this.worst, jolt);
    this.events.push({ type: "knock", jolt, x: p.x, y: p.y });
    this.cracks += jolt >= BREAK ? SHELL + 1 : 1;
    if (this.cracks > SHELL) {
      this.phase = "broken";
      this.events.push({ type: "broken", x: p.x, y: p.y });
    } else {
      this.events.push({ type: "crack", cracks: this.cracks, x: p.x, y: p.y });
    }
  }

  /** Where he has got to: the nest, a pan, or nowhere for too long. */
  private watch(): void {
    if (this.phase !== "run") return;
    const p = this.eggBody.translation();
    const v = this.eggBody.linvel();
    const level = this.level;

    for (const pit of level.pits) {
      // Once he is down the hole he is in the pan: there is nowhere else the flue goes.
      // Under a pan that hangs in the air he is only passing by.
      if (Math.abs(p.x - pit.x) < pit.w / 2 + 0.1 && p.y < pit.y - 0.35 && p.y > pit.pan - 0.4) {
        this.phase = "fried";
        this.events.push({ type: "fried", x: pit.x, y: pit.pan });
        return;
      }
    }

    const nest = level.nest;
    if (p.x > nest.x0 && p.x < nest.x1 && p.y > nest.y0 && p.y < nest.y1) {
      if (this.homeAt < 0) this.homeAt = this.time + 0.5;
      if (this.time >= this.homeAt) {
        this.phase = "home";
        this.events.push({ type: "home" });
        return;
      }
    } else {
      this.homeAt = -1;
    }

    // Standing still, or rocking on the spot: either way he is getting nowhere.
    void v;
    const still = Math.hypot(p.x - this.anchor.x, p.y - this.anchor.y) < STILL;
    if (!still) this.anchor = { x: p.x, y: p.y };
    this.idle = still ? this.idle + STEP : 0;
    if (!still) this.warned = false;
    if (this.idle >= IDLE_WARN && !this.warned) {
      this.warned = true;
      this.events.push({ type: "warn" });
    }
    if (this.idle >= IDLE) {
      this.phase = "caught";
      this.events.push({ type: "caught" });
    }
  }

  /** Stars: there; there without a crack; there with bales to spare. */
  get stars(): number {
    if (this.phase !== "home") return 0;
    return 1 + (this.cracks === 0 ? 1 : 0) + (this.balesLeft >= this.level.spare ? 1 : 0);
  }
}
