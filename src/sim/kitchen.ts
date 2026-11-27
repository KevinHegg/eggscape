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
/** Seconds the straw of a burst bale goes on breaking his fall: it is still under him, on its way to the floor. */
const STRAW_GRACE = 0.6;

/**
 * Seconds he may get nowhere before the Queen's hook has him, and when it is first let down.
 * In the seat of a see-saw that waits for him there is longer: that is where a player thinks.
 */
export const IDLE = 4;
export const IDLE_WARN = 1.8;
export const SEAT_IDLE = 8;
export const SEAT_WARN = 4.5;
/** Seconds in a cage before the hook has him out of it. There is no way out of a cage. */
export const CAGE = 1.5;
/** Getting nowhere means not having moved this far from where the count began. */
const STILL = 0.5;

/** A see-saw's plank: its weight, how hard it is to turn, and the torque that keeps the seat end down. */
const PLANK_BALL = 0.9;
const PLANK_DENSITY = 0.3;
const PLANK_BIAS = 3;
/** A see-saw he rolls across is held down harder, so that his own weight on the gold end does not tip it. */
const PASS_BIAS = 9;
/**
 * The cushion of such a see-saw does not hold him. However he came on to it, he wallows across
 * at this pace (metres a second) and off the low end: so how long he is on it is always the same.
 */
export const CRAWL = 0.4;
/** How fast such a see-saw goes over when the bale comes down on it, radians a second. */
const SNAP = 8;
/**
 * The throw is a rule, not a collision: when the seat end comes up against its stop, whoever
 * is in the seat leaves at this share of the speed the bale came down on the other end with,
 * and never faster than the top speed. So the height a bale is dropped from is the throw.
 */
export const FLING_GAIN = 0.9;
export const FLING_TOP = 11;
const FLING_LEAST = 1.2;

/**
 * A water wheel. Dry, it is loose on its axle and gives under whatever lands on it; with the
 * water on, it turns one way at this rate (radians a second) and is not easily stopped.
 */
export const WHEEL_TURN = 1.3;
/** Seconds from the sluice opening to the water reaching the wheel. */
export const RACE = 0.6;
/** How hard the water pushes (radians a second, each second), and how stiffly a dry wheel turns. */
const WHEEL_PUSH = 40;
const WHEEL_DRAG = 0.6;
const WHEEL_BALL = 1;
const WHEEL_DENSITY = 0.48;

/**
 * A revolving door, seen from the side: four leaves in a drum. It turns by clockwork at this
 * rate (radians a second) from the moment he is in it until its brake is put on, and then it
 * runs on to the next quarter and stops there.
 */
/** A cistern fills this fast once its water is in, and a bale afloat rides this deep in it. */
export const RISE = 0.8;
const FLOAT_DEEP = 0.2;
/** A raft that has come up to a way out leans this far towards it. */
const RAFT_LEAN = 0.22;
/** One with nobody on it bobs there this long, and then the water takes it out. */
export const WASH = 0.4;
/** How fast a dumbwaiter's car goes, and how much its floor and its roof are tilted. */
export const LIFT_SPEED = 3;
export const LIFT_TILT = 0.1;
/** How fast something has to be going to do damage: a barrel to straw and to him. */
const BARREL_HURT = 1.2;
export const DOOR_TURN = Math.PI / 3;
const QUARTER = Math.PI / 2;
/** How many times round it will carry him before the clockwork has run down. */
export const DOOR_LAPS = 2;
/** The ways out of the drum, by how many quarters it has turned: none at the top, then right, bottom, left. */
export const PORTS = ["top", "right", "bottom", "left"] as const;
export type Port = (typeof PORTS)[number];
/** Where each shutter is on the drum, in degrees anticlockwise from three o'clock; and half the slot in the top. */
export const SHUTTER: Record<Exclude<Port, "top">, [number, number]> = { right: [-52, 4], bottom: [-116, -64], left: [-184, -128] };
export const DOOR_SLOT = 24;
export const DOOR_WALL = 0.2;

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

export type Look = "stone" | "wood" | "board" | "wall" | "bed" | "nest" | "iron";

/** A fixed piece of the kitchen: a box with its centre, size and tilt (radians, anticlockwise). */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  turn: number;
  /** Straw, in a bed on a floor or banked up a wall: nothing that lands on it is hurt. */
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
  /**
   * He does not stop in this one. He comes on over the gold end and wallows across the cushion,
   * and off the low end of it: the bale has to come down behind him while he is on the cushion.
   */
  pass?: boolean;
  /** This one always throws at the same speed, however the bale came down: with it, the skill is when. */
  throw?: number;
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
 * A water wheel with a cistern over it. A bale on the pan at the end of the sluice lever lets
 * the water in, and it stays in. Until then the wheel is loose: his weight turns it the way he
 * is leaning, which is the wrong way.
 */
export interface WheelDef {
  /** The axle. */
  x: number;
  y: number;
  /** Out to the tips of the paddles, and the drum in the middle. */
  r: number;
  drum: number;
  paddles: number;
  /** Which way the water turns it: +1 carries what is on top of it to the right. */
  way: 1 | -1;
  /** The pan on the sluice lever: the middle of its top face, and how wide it is. */
  pan: { x: number; y: number; w: number };
  /** The cistern, and where its trough ends over the wheel. The view's business only. */
  tank: { x0: number; y0: number; x1: number; y1: number };
  spout: { x: number; y: number };
}

/**
 * A revolving door. He drops in through a slot in the top of the drum; the door starts to turn,
 * and carries him round past three shutters: right, bottom, left. A bale on the brake's pan
 * stops it at the next quarter, and the shutter he is against opens.
 */
export interface DoorDef {
  /** The axle. */
  x: number;
  y: number;
  /** Out to the edges of the leaves. */
  r: number;
  /** The pan on the brake lever: the middle of its top face, and how wide it is. */
  pan: { x: number; y: number; w: number };
  /**
   * A shutter with a bar across it, and the treadle the bar is roped to: the bar comes off when
   * he puts his weight on the treadle, and not before. Stopped against a barred shutter, the
   * door has nowhere to let him out.
   */
  bar?: { port: Exclude<Port, "top">; tread: { x0: number; x1: number; y0: number; y1: number } };
}

/**
 * A flap in a floor, hinged to open upwards only: thrown up from under it he goes through,
 * and it has shut again before he comes down. Its top face runs from one point to another.
 */
export interface FlapDef {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
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

/**
 * A cistern. The sluice lets water in and it rises to the lowest way out: a spout in one wall,
 * or, if that is stopped with a bale, the top of the other wall. A bale in it floats.
 */
export interface TankDef {
  /** Inside: between its walls, and its floor. */
  x0: number;
  x1: number;
  floor: number;
  /** The spout: which wall it is in, its lip, and the top of its mouth. */
  spout: { side: 1 | -1; lip: number; top: number };
  /** The top of the other wall. */
  weir: number;
  /** The pan on the sluice lever, and the tap the water comes out of. */
  pan: { x: number; y: number; w: number };
  tap: { x: number; y: number };
}

/**
 * A dumbwaiter: a car in a shaft, hung against a gold pan. Every bale on the pan hauls the car
 * up a landing, and every bale on its roof takes it down one. With the car a landing below
 * him its roof is his way over the shaft; its own floor falls to one side, and he goes out
 * that way wherever the shaft has an opening.
 */
export interface LiftDef {
  /** The middle of the shaft, and half the width of the car. */
  x: number;
  half: number;
  /**
   * The car's floor at the bottom landing; how far apart the landings are; the highest of them,
   * counting the bottom as nought; and the car, from its floor to the top of its roof.
   */
  floor: number;
  storey: number;
  floors: number;
  tall: number;
  /** The side its floor falls to. Its roof falls the other way. */
  side: 1 | -1;
  /** The top of the shaft, where the windlass is. */
  head: number;
  /** The ways through the shaft's walls. */
  openings: Array<{ side: 1 | -1; y0: number; y1: number }>;
  /** The landings with a gate across them. A gate is shut unless the car is there. */
  gates: Array<{ side: 1 | -1; floor: number }>;
  /** The pan: the middle of its top face with the car at the bottom, how wide it is, and how far it comes down for each landing the car goes up. */
  pan: { x: number; y: number; w: number; step: number };
}

/**
 * A barrel on a rack, held by a chock. A bale on the pan knocks the chock out and the barrel
 * goes down its run: over the rails across the gap, over the treadle, off the end, through
 * the crates and into the pit. Nothing stops it, and nothing in its way is spared.
 */
export interface BarrelDef {
  /** Where it stands, and how big it is. */
  x: number;
  y: number;
  r: number;
  pan: { x: number; y: number; w: number };
  /** The rails over the gap in its run: a barrel's length apart, with nothing between them. */
  rails: { x0: number; y0: number; x1: number; y1: number };
  /** The bucket under the gap; the treadle beyond it; and how whoever is in the bucket is thrown when the barrel is on the treadle. */
  bucket: { x0: number; x1: number; y0: number; y1: number };
  tread: { x0: number; x1: number };
  toss: { x: number; y: number };
  /** The crates across its way lower down. */
  crates: { x0: number; x1: number; y0: number; y1: number };
  /** The pit it ends in: the middle, the floor it is cut in, and how wide. */
  pit: { x: number; y: number; w: number };
}

/** A feather bed on a shelf: he wallows down it at a crawl, whatever he was doing before. Its top face runs from one point to another. */
export interface MatDef {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  crawl: number;
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
  wheels: WheelDef[];
  doors: DoorDef[];
  flaps: FlapDef[];
  tanks: TankDef[];
  lifts: LiftDef[];
  barrels: BarrelDef[];
  mats: MatDef[];
  pits: PitDef[];
  /** Places there is no way out of: the hook has him out of one in `CAGE` seconds. */
  cages: Array<{ x0: number; x1: number; y0: number; y1: number }>;
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
 * the long drop; drop one on the see-saw to throw him across to a bed of straw; and stop the
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

    // The bed of straw he is thrown on to, and the floor with the hole in it.
    slab(-4, lowAt(-4) + 0.4, -2.5, lowAt(-2.5) + 0.4, 0.4, "bed", true),
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
  wheels: [],
  doors: [],
  flaps: [],
  tanks: [],
  lifts: [],
  barrels: [],
  mats: [],
  cages: [],
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
    wheels: level.wheels.map((wheel) => ({
      ...wheel,
      y: wheel.y - by,
      pan: { ...wheel.pan, y: wheel.pan.y - by },
      tank: { ...wheel.tank, y0: wheel.tank.y0 - by, y1: wheel.tank.y1 - by },
      spout: { x: wheel.spout.x, y: wheel.spout.y - by },
    })),
    doors: level.doors.map((door) => ({
      ...door,
      y: door.y - by,
      pan: { ...door.pan, y: door.pan.y - by },
      ...(door.bar ? { bar: { port: door.bar.port, tread: { ...door.bar.tread, y0: door.bar.tread.y0 - by, y1: door.bar.tread.y1 - by } } } : {}),
    })),
    flaps: level.flaps.map((flap) => ({ ...flap, y0: flap.y0 - by, y1: flap.y1 - by })),
    tanks: level.tanks.map((tank) => ({
      ...tank,
      floor: tank.floor - by,
      spout: { side: tank.spout.side, lip: tank.spout.lip - by, top: tank.spout.top - by },
      weir: tank.weir - by,
      pan: { ...tank.pan, y: tank.pan.y - by },
      tap: { x: tank.tap.x, y: tank.tap.y - by },
    })),
    lifts: level.lifts.map((lift) => ({
      ...lift,
      floor: lift.floor - by,
      head: lift.head - by,
      openings: lift.openings.map((opening) => ({ side: opening.side, y0: opening.y0 - by, y1: opening.y1 - by })),
      pan: { ...lift.pan, y: lift.pan.y - by },
    })),
    barrels: level.barrels.map((barrel) => ({
      ...barrel,
      y: barrel.y - by,
      pan: { ...barrel.pan, y: barrel.pan.y - by },
      rails: { ...barrel.rails, y0: barrel.rails.y0 - by, y1: barrel.rails.y1 - by },
      bucket: { ...barrel.bucket, y0: barrel.bucket.y0 - by, y1: barrel.bucket.y1 - by },
      crates: { ...barrel.crates, y0: barrel.crates.y0 - by, y1: barrel.crates.y1 - by },
      pit: { ...barrel.pit, y: barrel.pit.y - by },
    })),
    mats: level.mats.map((mat) => ({ ...mat, y0: mat.y0 - by, y1: mat.y1 - by })),
    pits: level.pits.map((pit) => ({ ...pit, y: pit.y - by, pan: pit.pan - by })),
    cages: level.cages.map((cage) => ({ ...cage, y0: cage.y0 - by, y1: cage.y1 - by })),
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
/**
 * The gap is most of the way along the shelf, so that there are a good two seconds to bridge it
 * in; and its pan hangs close under it, to leave the air over the see-saw clear for a bale.
 */
const GAP = { x: -0.9, w: 1.1, well: BALE_W * Math.cos(RACK_TURN) + 0.12, hang: 1.1 };
const GAP_DEEP = BALE_H / Math.cos(RACK_TURN);
const GAP_WELL = { x0: GAP.x - GAP.well / 2, x1: GAP.x + GAP.well / 2 };
/**
 * The scullery's see-saw does not wait for him. He rolls on over its gold end and wallows across
 * the cushion: a bale has to come down on the gold behind him while he is there. Off the end of
 * the cushion is a cage.
 */
/** Its gold arm is longer than a bale, so that one lies on it clear of the floor beside it. */
const TIP = { x: -0.5, y: 22.5, seat: 1.25, load: 1.75, tip: 0.31 };
/** The gold end where it rests, up in the air; and the short floor that falls to the right on to it. */
const TIP_END = { x: TIP.x - TIP.load * Math.cos(TIP.tip), y: TIP.y + TIP.load * Math.sin(TIP.tip) + 0.07 };
const LAND_END = TIP_END.x - 0.2;
const landAt = (x: number): number => TIP_END.y + 0.03 + 0.356 * (LAND_END - x);
/** Where the bale under the long drop goes: hard up against the wall, which is all the room there is. */
const CATCH = -4 + BALE_W / 2 + 0.02;
/** The cage off the low end of the cushion, and the wall he has to be thrown over. */
const CAGE_X0 = TIP.x + TIP.seat * Math.cos(TIP.tip) + 0.02;
const CAGE_BOX = { x0: CAGE_X0, x1: CAGE_X0 + 1.25, floor: 21.15, top: 23.1 };
/** The bottom floor, which falls to the left, over the hole and on to the nest. */
const SINK = { y: 19.8, fall: 0.36 };
const sinkAt = (x: number): number => SINK.y - SINK.fall * (4 - x);
const SINK_TURN = Math.atan(SINK.fall);
const PLUG = { x: 1.1, w: 1.1, well: BALE_W * Math.cos(SINK_TURN) + 0.12 };
const PLUG_DEEP = BALE_H / Math.cos(SINK_TURN);
/**
 * The scullery's own hole is cut level, not on the slope. He comes down the bed fast after a
 * long fall, and a hole that fell away under him he jumped two times in five; one that is
 * level takes him every time, and a bale laid in it is a level bridge.
 */
const DRAIN = { x: 0.6, w: 1.1, well: BALE_W + 0.12 };
const DRAIN_WELL = { x0: DRAIN.x - DRAIN.well / 2, x1: DRAIN.x + DRAIN.well / 2 };
const DRAIN_Y = sinkAt(DRAIN_WELL.x1);
/** The floor beyond the hole, which goes on falling to the left from the hole's own level. */
const DRAIN_LIP = DRAIN_WELL.x0 - 0.3;
const sunkAt = (x: number): number => DRAIN_Y - SINK.fall * (DRAIN_LIP - x);

/**
 * The second screen, written as if it stood where the first does and then lowered a storey.
 * He comes in through the hatch at the top right and rolls down a long shelf to a gap over a
 * pan: bridge it. Then the long drop at the far wall, which wants a bale under it; the see-saw,
 * which has to be timed; and the hole in the bottom floor. Four things to do and five bales.
 */
const SCULLERY_HERE: LevelDef = {
  key: "scullery",
  name: "The Scullery",
  ends: "roost",
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
    slab(GAP_WELL.x0 - 0.12, rackAt(GAP_WELL.x0 - 0.12) - GAP_DEEP, GAP.x - GAP.w / 2, rackAt(GAP.x - GAP.w / 2) - GAP_DEEP, 0.4, "bed", true),
    slab(GAP.x + GAP.w / 2, rackAt(GAP.x + GAP.w / 2) - GAP_DEEP, GAP_WELL.x1 + 0.12, rackAt(GAP_WELL.x1 + 0.12) - GAP_DEEP, 0.4, "wood"),
    slab(GAP_WELL.x0 - 0.2, rackAt(GAP_WELL.x0 - 0.2), GAP_WELL.x0 - 0.04, rackAt(GAP_WELL.x0 - 0.04), 0.4, "bed", true),
    slab(-2.6, rackAt(-2.6), GAP_WELL.x0 - 0.2, rackAt(GAP_WELL.x0 - 0.2), 0.4, "wood"),
    // The sides of the pan's flue, hung under the gap.
    box(GAP.x - GAP.w / 2 - 0.2, rackAt(GAP.x) - GAP_DEEP - GAP.hang - 0.1, GAP.x - GAP.w / 2, rackAt(GAP.x) - GAP_DEEP - 0.7, "iron"),
    box(GAP.x + GAP.w / 2, rackAt(GAP.x) - GAP_DEEP - GAP.hang - 0.1, GAP.x + GAP.w / 2 + 0.2, rackAt(GAP.x) - GAP_DEEP - 0.5, "iron"),
    box(GAP.x - GAP.w / 2 - 0.2, rackAt(GAP.x) - GAP_DEEP - GAP.hang - 0.3, GAP.x + GAP.w / 2 + 0.2, rackAt(GAP.x) - GAP_DEEP - GAP.hang - 0.1, "iron"),
    // Straw on the wall where he comes off the end of the shelf. Under it, a long drop.
    box(-4, 25.2, -3.8, 28.6, "nest", true),

    // Where he comes down: a short floor falling to the right, on to the gold end of the see-saw.
    slab(-4, landAt(-4), LAND_END, landAt(LAND_END), 0.4, "stone"),
    box(LAND_END - 0.5, TIP.y - 1, LAND_END, landAt(LAND_END) - 0.4, "stone"),
    // What the see-saw stands on, and the cage off the end of it: iron, and too high to roll out of.
    box(LAND_END - 0.5, TIP.y - 1, CAGE_BOX.x0, TIP.y - 0.7, "stone"),
    box(CAGE_BOX.x0 - 0.2, CAGE_BOX.floor, CAGE_BOX.x0, TIP.y - 1, "iron"),
    box(CAGE_BOX.x0 - 0.2, CAGE_BOX.floor - 0.25, CAGE_BOX.x1 + 0.2, CAGE_BOX.floor, "iron"),
    box(CAGE_BOX.x1, CAGE_BOX.floor, CAGE_BOX.x1 + 0.2, CAGE_BOX.top, "iron"),
    // Straw on the floor of it: he is to be caught there, not cracked.
    box(CAGE_BOX.x0, CAGE_BOX.floor, CAGE_BOX.x1, CAGE_BOX.floor + 0.12, "bed", true),

    // The bed of straw he is thrown on to, the straw up the wall behind it, and the floor with the hole in it.
    slab(DRAIN_WELL.x1 + 0.6, sinkAt(DRAIN_WELL.x1 + 0.6) + 0.4, 4, sinkAt(4) + 0.4, 0.4, "bed", true),
    box(3.8, sinkAt(4) + 0.4, 4, 26.5, "nest", true),
    slab(DRAIN_WELL.x1, DRAIN_Y, 4, sinkAt(4), 0.5, "stone"),
    box(DRAIN_WELL.x0 - 0.12, DRAIN_Y - BALE_H - 0.4, DRAIN.x - DRAIN.w / 2, DRAIN_Y - BALE_H, "stone"),
    box(DRAIN.x + DRAIN.w / 2, DRAIN_Y - BALE_H - 0.4, DRAIN_WELL.x1 + 0.12, DRAIN_Y - BALE_H, "stone"),
    // Its walls stand upright, so a bale goes in flat; the floor takes up its slope again a step beyond.
    box(DRAIN_LIP, DRAIN_Y - BALE_H - 0.4, DRAIN_WELL.x0, DRAIN_Y, "stone"),
    box(DRAIN_WELL.x1, DRAIN_Y - BALE_H - 0.4, DRAIN_WELL.x1 + 0.3, DRAIN_Y - 0.03, "stone"),
    slab(-1.9, sunkAt(-1.9), DRAIN_LIP, DRAIN_Y, 0.5, "stone"),
    box(DRAIN.x - DRAIN.w / 2 - 0.25, FLOOR + 1.9, DRAIN.x - DRAIN.w / 2, DRAIN_Y - BALE_H - 0.4, "iron"),
    box(DRAIN.x + DRAIN.w / 2, FLOOR + 1.9, DRAIN.x + DRAIN.w / 2 + 0.25, DRAIN_Y - BALE_H - 0.4, "iron"),

    // The nest, bottom left, with straw banked up the wall behind it.
    box(-4, FLOOR, -1.5, FLOOR + 0.5, "nest", true),
    box(-1.5, FLOOR, -1.2, FLOOR + 1, "nest", true),
    box(-4, FLOOR, -3.7, FLOOR + 3.8, "nest", true),
  ],
  seesaws: [{ x: TIP.x, y: TIP.y, seat: TIP.seat, load: TIP.load, side: 1, tip: TIP.tip, cast: -0.5, pass: true, throw: 7 }],
  wheels: [],
  doors: [],
  flaps: [],
  tanks: [],
  lifts: [],
  barrels: [],
  mats: [],
  pits: [
    { x: GAP.x, y: rackAt(GAP.x) - GAP_DEEP, w: GAP.w, pan: rackAt(GAP.x) - GAP_DEEP - GAP.hang, hung: true },
    { x: DRAIN.x, y: DRAIN_Y - BALE_H, w: DRAIN.w, pan: FLOOR + 0.7, hung: false },
  ],
  cages: [{ x0: CAGE_BOX.x0, x1: CAGE_BOX.x1, y0: CAGE_BOX.floor, y1: TIP.y - 0.2 }],
  sockets: [
    { x: GAP.x, y0: rackAt(GAP.x) - 1.2, y1: rackAt(GAP.x) + 1.4, reach: 1, seat: { y: rackAt(GAP.x) - GAP_DEEP / 2 + 0.08, turn: RACK_TURN } },
    // Over the gold end, a bale is always let go from the same height: here it is when, not how hard.
    { x: TIP.x - 0.82, y0: TIP.y - 0.3, y1: TIP.y + 3.1, reach: 0.9, seat: { y: TIP.y + 1.2, turn: 0 } },
    { x: CATCH, y0: landAt(CATCH) - 0.3, y1: landAt(CATCH) + 2.8, reach: 0.95 },
    { x: DRAIN.x, y0: DRAIN_Y - 1.4, y1: DRAIN_Y + 1.4, reach: 1, seat: { y: DRAIN_Y - BALE_H / 2 + 0.03, turn: 0 } },
  ],
  nest: { x0: -3.7, x1: -1.5, y0: FLOOR + 0.4, y1: FLOOR + 1.9 },
};

export const SCULLERY: LevelDef = lowered(SCULLERY_HERE, STOREY);

/** The mill's wheel, and how far outside its paddles the shelf beside it stops. */
const MILL = { x: 0, y: 27.15, r: 1.75, clear: 0.2 };
/** The end of the shelf he comes in on, up on the wheel's left shoulder; and that shelf, which falls to the right. */
const HEAD = { x: MILL.x - (MILL.r + MILL.clear) * Math.SQRT1_2, y: MILL.y + (MILL.r + MILL.clear) * Math.SQRT1_2 };
const headAt = (x: number): number => HEAD.y + 0.36 * (HEAD.x - x);
/**
 * Nothing he could come to rest on is within a paddle's reach: a paddle that came down on him
 * there would pin him. So the wheel drops him, and what it drops him on is well below it: a
 * bed of straw that falls to the right and stops short of the wall.
 */
const TAIL = { x: 0.85, y: 24.4, end: 2.75 };
const tailAt = (x: number): number => TAIL.y - 0.36 * (x - TAIL.x);
/** The pan the dry wheel lets him down into: a tray from the left wall to the high end of that bed. */
const TRAY = { x0: -4, x1: TAIL.x, y: 23.9 };
/** The bottom floor, which falls to the left, over the hole and on to the nest. */
const BASE = { y: 20.45, fall: 0.36 };
const baseAt = (x: number): number => BASE.y - BASE.fall * (4 - x);
const HOLE = { x: 0.6, w: 1.1 };
const HOLE_WELL = { x0: HOLE.x - PLUG.well / 2, x1: HOLE.x + PLUG.well / 2 };
/** Where the bale under the drop at the right wall goes. */
const MILL_CATCH = 4 - BALE_W / 2 - 0.02;
/** The pan on the sluice lever, up by the cistern. */
const SLUICE = { x: 1.75, y: 29.95, w: 1.3 };

/**
 * The third screen, written as if it stood where the first does. He comes in through the hatch
 * at the top left and rolls on to a water wheel. The wheel is dry, and a dry wheel gives under
 * him and lets him down into a pan: a bale on the sluice lever lets the water in, and then it
 * carries him over the top and drops him on a bed of straw. While it does there is time to
 * get ready for what comes after: the long drop at the right wall, and the hole in the bottom
 * floor. Three things to do and four bales: one to spare.
 */
const MILL_HERE: LevelDef = {
  key: "mill",
  name: "The Mill",
  ends: "roost",
  hatch: true,
  left: -4,
  right: 4,
  top: 31,
  bottom: 13,
  start: { x: -3.5, y: 30.2 },
  // A backward spin: he dithers under the hatch for a moment before the shelf takes him.
  shove: 3,
  bales: 4,
  spare: 1,
  blocks: [
    box(-4.8, 12.6, -4, 31.4, "wall"),
    box(4, 12.6, 4.8, 31.4, "wall"),
    box(-4, 13.4, 4, FLOOR, "stone"),

    // The shelf under the hatch, which ends just clear of the wheel's paddles.
    slab(-4, headAt(-4), HEAD.x, HEAD.y, 0.3, "wood"),
    // The tray the dry wheel lets him down into.
    box(TRAY.x0, TRAY.y - 0.2, TRAY.x1, TRAY.y, "iron"),
    box(TRAY.x1 - 0.2, TRAY.y, TRAY.x1, TAIL.y - 0.3, "iron"),
    // A splash board hung beside the wheel: now and then a paddle carries him clean over the
    // top, and without it he would clear the straw as well.
    box(2.45, 25.6, 2.6, 29.2, "board"),
    // The bed of straw the wheel drops him on, and the board it lies on.
    slab(TAIL.x - 0.2, tailAt(TAIL.x - 0.2), TAIL.end, tailAt(TAIL.end), 0.35, "bed", true),
    slab(TAIL.x - 0.2, tailAt(TAIL.x - 0.2) - 0.35, TAIL.end, tailAt(TAIL.end) - 0.35, 0.2, "wood"),

    // The bottom floor with the hole in it, and the flue to the pan.
    slab(HOLE_WELL.x1, baseAt(HOLE_WELL.x1), 4, baseAt(4), 0.5, "stone"),
    slab(HOLE_WELL.x0 - 0.12, baseAt(HOLE_WELL.x0 - 0.12) - PLUG_DEEP, HOLE.x - HOLE.w / 2, baseAt(HOLE.x - HOLE.w / 2) - PLUG_DEEP, 0.4, "stone"),
    slab(HOLE.x + HOLE.w / 2, baseAt(HOLE.x + HOLE.w / 2) - PLUG_DEEP, HOLE_WELL.x1 + 0.12, baseAt(HOLE_WELL.x1 + 0.12) - PLUG_DEEP, 0.4, "stone"),
    slab(-1.9, baseAt(-1.9), HOLE_WELL.x0 - 0.04, baseAt(HOLE_WELL.x0 - 0.04), 0.5, "stone"),
    box(HOLE.x - HOLE.w / 2 - 0.25, FLOOR + 1.9, HOLE.x - HOLE.w / 2, baseAt(HOLE.x) - PLUG_DEEP - 0.7, "iron"),
    box(HOLE.x + HOLE.w / 2, FLOOR + 1.9, HOLE.x + HOLE.w / 2 + 0.25, baseAt(HOLE.x) - PLUG_DEEP - 0.5, "iron"),

    // The nest, bottom left, with straw banked up the wall behind it.
    box(-4, FLOOR, -1.5, FLOOR + 0.5, "nest", true),
    box(-1.5, FLOOR, -1.2, FLOOR + 1, "nest", true),
    box(-4, FLOOR, -3.7, FLOOR + 3.8, "nest", true),
  ],
  seesaws: [],
  doors: [],
  flaps: [],
  tanks: [],
  lifts: [],
  barrels: [],
  mats: [],
  cages: [],
  wheels: [
    {
      x: MILL.x,
      y: MILL.y,
      r: MILL.r,
      drum: 0.5,
      paddles: 6,
      way: 1,
      pan: SLUICE,
      tank: { x0: 2.75, y0: 29.3, x1: 4, y1: 30.55 },
      spout: { x: 0.95, y: 29.3 },
    },
  ],
  pits: [
    // Anything that comes out of the bottom of the wheel is in the tray.
    { x: (TRAY.x0 + TRAY.x1 - 0.2) / 2, y: MILL.y - MILL.r - 0.05, w: TRAY.x1 - 0.2 - TRAY.x0, pan: TRAY.y + 0.05, hung: true },
    { x: HOLE.x, y: baseAt(HOLE.x) - PLUG_DEEP, w: HOLE.w, pan: FLOOR + 0.7, hung: false },
  ],
  sockets: [
    { x: SLUICE.x, y0: SLUICE.y - 0.65, y1: 31, reach: 2.3, seat: { y: SLUICE.y + BALE_H / 2 + 0.02, turn: 0 } },
    { x: MILL_CATCH, y0: baseAt(MILL_CATCH) - 0.4, y1: baseAt(MILL_CATCH) + 2.8, reach: 0.95 },
    { x: HOLE.x, y0: baseAt(HOLE.x) - 1.2, y1: baseAt(HOLE.x) + 1.4, reach: 1, seat: { y: baseAt(HOLE.x) - PLUG_DEEP / 2 + 0.08, turn: SINK_TURN } },
  ],
  nest: { x0: -3.7, x1: -1.5, y0: FLOOR + 0.4, y1: FLOOR + 1.9 },
};

export const MILLROOM: LevelDef = lowered(MILL_HERE, STOREY * 2);

/** The buttery's revolving door, and how far out its drum comes. */
/** The whole of it hangs a little down from the ceiling, so that the brake over the drum has room for its bale. */
const TURN = { x: -1, y: 25, r: 1.5 };
const DRUM = TURN.r + 0.06 + DOOR_WALL;
/** Half the width of the slot in the top of the drum. */
const SLOT = DRUM * Math.sin((DOOR_SLOT * Math.PI) / 180);
/** The shelf he comes in on, which falls to the right and stops at the slot. */
const LEAD = { x: TURN.x - SLOT - 0.02, y: TURN.y + DRUM + 0.2, fall: 0.6 };
const leadAt = (x: number): number => LEAD.y + LEAD.fall * (LEAD.x - x);
/**
 * The shelf he comes back on, from the right wall down to the other side of the slot. Its lip
 * stands a little proud of the first shelf's, so that coming in fast he does not run on up it.
 */
const BACKWAY = { x: TURN.x + SLOT + 0.02, y: LEAD.y + 0.12, fall: 0.3 };
const backAt = (x: number): number => BACKWAY.y + BACKWAY.fall * (x - BACKWAY.x);
/** The part of it over the see-saw is a flap, hinged to let him up through it. */
const FLAP = { x0: 2.45, x1: 4 };
/** The shelves under the two side doors: each begins at the lip of its shutter and falls away from the drum. */
const SILL = { out: 1.1, y: TURN.y - 1.32, left: 1.7, right: 3.3 };
const sillAt = (out: number): number => SILL.y - 0.36 * (out - SILL.out);
/** The pan on the brake lever, up over the drum. */
const BRAKE = { x: TURN.x + 0.3, y: TURN.y + 4.15, w: 1.5 };
/**
 * The see-saw in the corner under the right-hand shelf: its seat is against the wall. It stands
 * well down from that shelf, so that it can be seen there is room over its gold end for a bale.
 */
const TOSS = { x: 2.6, y: TURN.y - 5.2, seat: 1.25, load: 1.75, tip: 0.31 };
/** How hard it throws: enough to take him from down there up through the flap. */
const TOSS_THROW = Math.sqrt(12.2 * 12.2 + 2 * G * 1.2);

/**
 * The fourth screen, written as if it stood where the first does. He comes in through the hatch
 * at the top left and drops into a revolving door, which begins to turn and carries him round
 * past three shutters: right, bottom, left. A bale on the brake stops it at the next quarter,
 * and the shutter he is against opens. The left one is the way to the roost, and it is barred.
 * The bar is roped to the board outside the right-hand shutter: his weight on that takes it
 * off. So he has to go out on the right first, into the seat of a see-saw in the corner, be
 * thrown back up through a flap on to the shelf that runs down into the top of the door, go
 * round again, and be let out on the left. The bottom is a pan. Three bales, and four to do
 * it with.
 */
const BUTTERY_HERE: LevelDef = {
  key: "buttery",
  name: "The Buttery",
  ends: "roost",
  hatch: true,
  left: -4,
  right: 4,
  top: 31,
  bottom: 13,
  start: { x: -3.5, y: TURN.y + 4.2 },
  shove: 3,
  bales: 4,
  spare: 1,
  blocks: [
    box(-4.8, 12.6, -4, 31.4, "wall"),
    box(4, 12.6, 4.8, 31.4, "wall"),
    box(-4, 13.4, 4, FLOOR, "stone"),

    // The shelf under the hatch, and the one he comes back on, as far as its flap.
    slab(-4, leadAt(-4), LEAD.x, LEAD.y, 0.3, "wood"),
    // Its lip is padded: coming in off the first shelf he runs into it.
    slab(BACKWAY.x, BACKWAY.y, BACKWAY.x + 0.7, backAt(BACKWAY.x + 0.7), 0.3, "bed", true),
    slab(BACKWAY.x + 0.7, backAt(BACKWAY.x + 0.7), FLAP.x0, backAt(FLAP.x0), 0.3, "wood"),
    // The shelves under the side doors. The one on the left is short: beyond it there is nothing.
    slab(TURN.x + SILL.out, sillAt(SILL.out), TURN.x + SILL.right, sillAt(SILL.right), 0.3, "wood"),
    slab(TURN.x - SILL.left, sillAt(SILL.left), TURN.x - SILL.out, sillAt(SILL.out), 0.3, "wood"),
    // The tray under the bottom door.
    box(TURN.x - 1.05, TURN.y - DRUM - 1.05, TURN.x + 1.05, TURN.y - DRUM - 0.85, "iron"),

    // The corner the right-hand shelf drops him into: straw up the wall, and a ledge for the see-saw to stand on.
    box(3.93, TOSS.y + 1.7, 4, TOSS.y + 4.6, "nest", true),
    box(0.45, TOSS.y - 1.2, 4, TOSS.y - 0.75, "stone"),
    box(0.45, TOSS.y - 0.75, 0.7, TOSS.y + 0.75, "stone"),

    // The roost, bottom left. The straw up the wall behind it is thin, and goes all the way up
    // to the shelf he comes off: a bank with a top to it was a ledge, and he could catch it.
    box(-4, FLOOR, -1.5, FLOOR + 0.5, "nest", true),
    box(-1.5, FLOOR, -1.2, FLOOR + 1, "nest", true),
    box(-4, FLOOR, -3.88, TURN.y - 0.6, "nest", true),
  ],
  seesaws: [{ x: TOSS.x, y: TOSS.y, seat: TOSS.seat, load: TOSS.load, side: 1, tip: TOSS.tip, cast: 0.012, throw: TOSS_THROW }],
  wheels: [],
  doors: [
    {
      x: TURN.x,
      y: TURN.y,
      r: TURN.r,
      pan: BRAKE,
      bar: { port: "left", tread: { x0: TURN.x + SILL.out + 0.5, x1: TURN.x + SILL.right, y0: sillAt(SILL.right), y1: sillAt(SILL.out) + 1.3 } },
    },
  ],
  flaps: [{ x0: FLAP.x0, y0: backAt(FLAP.x0), x1: FLAP.x1, y1: backAt(FLAP.x1) }],
  tanks: [],
  lifts: [],
  barrels: [],
  mats: [],
  pits: [{ x: TURN.x, y: TURN.y - DRUM + 0.05, w: 2.1, pan: TURN.y - DRUM - 0.8, hung: true }],
  cages: [],
  sockets: [
    { x: BRAKE.x, y0: BRAKE.y - 0.7, y1: BRAKE.y + 1.85, reach: 1.25, seat: { y: BRAKE.y + BALE_H / 2 + 0.02, turn: 0 } },
    // The gold end of the see-saw, under the shelf.
    { x: TOSS.x - 0.9, y0: TOSS.y - 0.5, y1: TOSS.y + 2.6, reach: 1, seat: { y: TOSS.y + 0.9 * Math.sin(TOSS.tip) + 0.48, turn: -TOSS.tip } },
  ],
  nest: { x0: -3.7, x1: -1.5, y0: FLOOR + 0.4, y1: FLOOR + 1.9 },
};

export const BUTTERY: LevelDef = lowered(BUTTERY_HERE, STOREY * 3);

/** The house, from the top down. Each room is a game of its own; the roost between two is a waypoint. */
/** The fifth room's shelves: three of them, there and back and there again. */
const RUN = { a: 29.6, b: 26.2, c: 22.8, fall: 0.36 };
const runA = (x: number): number => RUN.a - RUN.fall * (x + 4);
const runB = (x: number): number => RUN.b - RUN.fall * (4 - x);
const runC = (x: number): number => RUN.c - RUN.fall * (x + 4);

/** The cistern: its spout is low in the left wall, with a mouth a bale stood on end just fills. */
const VAT = { x0: -0.3, x1: 1.5, wall: 0.3, floor: 17.9, lip: 18.7, mouth: 1.7, weir: 19.6 };
const VAT_TOP = runC(VAT.x0 - VAT.wall) - 0.08;
/** The padded board hung over the right wall: he comes off the last shelf at a run, and it stops him. */
const BAFFLE = { y0: VAT.weir + 1.45, y1: VAT.weir + 3.6 };
const SPIGOT = { x: -1.5, y: 26.7, w: 1.3 };
const GUTTER = { flat: 0.45, x: -2.3, drop: 0.5 };

/**
 * The fifth screen, written as if it stood where the first does. He comes in through the hatch
 * at the top left and has three shelves to roll down, there and back and there again, and the
 * last of them tips him into a cistern with nothing in it. A bale in the bottom of it breaks
 * his fall, and when the water is let in the bale is a raft: it brings him up to the spout in
 * the left wall, and out of that into a pan, unless a bale is stood in the spout; then it
 * brings him up to the top of the right wall, and he rolls off it and drops on to the roost.
 * But a raft with nobody on it does not wait: let the water in before he is aboard and it is
 * over the wall and gone. Three bales, and four to do it with.
 */
const CISTERN_HERE: LevelDef = {
  key: "cistern",
  name: "The Cistern",
  ends: "roost",
  hatch: true,
  left: -4,
  right: 4,
  top: 31,
  bottom: 13,
  start: { x: -3.5, y: 30.2 },
  shove: 3,
  bales: 4,
  spare: 1,
  blocks: [
    box(-4.8, 12.6, -4, 31.4, "wall"),
    box(4, 12.6, 4.8, 31.4, "wall"),
    box(-4, 13.4, 4, FLOOR, "stone"),

    // Three shelves, with a bed where he comes down on to the second and the third.
    slab(-4, runA(-4), 2.6, runA(2.6), 0.3, "wood"),
    slab(-2.6, runB(-2.6), 2.4, runB(2.4), 0.3, "wood"),
    slab(2.4, runB(2.4), 4, runB(4), 0.3, "bed", true),
    box(3.9, runB(4), 4, runA(2.6) + 0.8, "nest", true),
    slab(-4, runC(-4), -2.6, runC(-2.6), 0.3, "bed", true),
    slab(-2.6, runC(-2.6), VAT.x0 - VAT.wall, runC(VAT.x0 - VAT.wall), 0.3, "wood"),
    box(-4, runC(-4), -3.9, runB(-2.6) + 0.8, "nest", true),

    // The cistern, on its pier: the left wall with the spout in it, and the right, which is lower.
    box(VAT.x0 - VAT.wall, VAT.floor - 0.4, VAT.x1 + VAT.wall, VAT.floor, "stone"),
    box(VAT.x0 - VAT.wall, VAT.floor, VAT.x0, VAT.lip, "stone"),
    box(VAT.x0 - VAT.wall, VAT.lip + VAT.mouth, VAT.x0, VAT_TOP, "stone"),
    box(VAT.x1, VAT.floor, VAT.x1 + VAT.wall, VAT.weir, "stone"),
    box(VAT.x1, BAFFLE.y0, VAT.x1 + VAT.wall, BAFFLE.y1, "nest", true),
    box(0.1, FLOOR, 1.1, VAT.floor - 0.4, "stone"),

    // Out of the spout: a gutter down to the pan on the left.
    box(VAT.x0 - VAT.wall - GUTTER.flat, VAT.lip - 0.3, VAT.x0 - VAT.wall, VAT.lip, "stone"),
    slab(GUTTER.x, VAT.lip - GUTTER.drop, VAT.x0 - VAT.wall - GUTTER.flat, VAT.lip, 0.3, "stone"),
    box(-4, 16.6, -2.1, 16.8, "iron"),

    // Over the right wall: a short board, and then nothing till the nest.
    slab(VAT.x1 + VAT.wall, VAT.weir, 2.6, VAT.weir - 0.3, 0.3, "wood"),
    box(1.9, FLOOR, 4, FLOOR + 0.5, "nest", true),
    box(1.6, FLOOR, 1.9, FLOOR + 1, "nest", true),
    box(3.9, FLOOR, 4, FLOOR + 6.4, "nest", true),
  ],
  seesaws: [],
  wheels: [],
  doors: [],
  flaps: [],
  tanks: [
    {
      x0: VAT.x0,
      x1: VAT.x1,
      floor: VAT.floor,
      spout: { side: -1, lip: VAT.lip, top: VAT.lip + VAT.mouth },
      weir: VAT.weir,
      pan: SPIGOT,
      tap: { x: 0.95, y: 23.1 },
    },
  ],
  lifts: [],
  barrels: [],
  mats: [],
  pits: [{ x: -3.1, y: VAT.lip - GUTTER.drop, w: 1.8, pan: 16.85, hung: true }],
  cages: [],
  sockets: [
    { x: SPIGOT.x, y0: SPIGOT.y - 0.65, y1: SPIGOT.y + 1.6, reach: 1.3, seat: { y: SPIGOT.y + BALE_H / 2 + 0.02, turn: 0 } },
    // In the cistern a bale goes in the middle, whatever is in there already.
    { x: (VAT.x0 + VAT.x1) / 2, y0: VAT.floor - 0.2, y1: VAT_TOP, reach: (VAT.x1 - VAT.x0) / 2 },
    // And in the mouth of the spout it stands on end.
    { x: VAT.x0 - 0.3, y0: VAT.lip - 0.5, y1: VAT.lip + VAT.mouth + 0.3, reach: 0.9, seat: { y: VAT.lip + BALE_W / 2 + 0.03, turn: Math.PI / 2 } },
  ],
  nest: { x0: 1.9, x1: 3.9, y0: FLOOR + 0.4, y1: FLOOR + 1.9 },
};

export const CISTERN: LevelDef = lowered(CISTERN_HERE, STOREY * 4);

/** The servery's dumbwaiter: where its car stands, and how high the way over its roof is with the car at the first landing. */
const HOIST = { x: 0, half: 0.8, floor: 17, storey: 2.5, tall: 1.9, head: 27.1 };
const SHAFT = HOIST.half + 0.02;
const OVER = HOIST.floor + HOIST.storey + HOIST.tall;
const FIRST = HOIST.floor + HOIST.storey;
/** The shelf that brings him to the shaft, on the left, and the one that brings him back to it lower down, on the right. */
const toShaft = (x: number): number => OVER + 0.1 + 0.36 * (-SHAFT - x);
const backToShaft = (x: number): number => HOIST.floor + 0.1 + 0.36 * (x - SHAFT);

/**
 * The sixth screen, written as if it stood where the first does. A dumbwaiter stands in the
 * middle of it, hung against a gold pan: every bale on the pan hauls the car up a landing,
 * and every bale on the car's roof takes it down one. He comes in at the top right, and the
 * long shelf brings him round to the left of the shaft at the height of the car's roof when
 * the car is one landing up: so it has to be hauled up one, to be his bridge. On the far side
 * he comes down to the bottom landing, where there is a gate that is shut unless the car is
 * there: so it has to be brought down again to fetch him. And the way out is from the first
 * landing, on the left: so, once he is in it, up it goes again. Three bales, and four to do
 * it with.
 */
const SERVERY_HERE: LevelDef = {
  key: "servery",
  name: "The Servery",
  ends: "roost",
  hatch: true,
  left: -4,
  right: 4,
  top: 31,
  bottom: 13,
  start: { x: 3.5, y: 30.2 },
  shove: -3,
  bales: 4,
  spare: 1,
  blocks: [
    box(-4.8, 12.6, -4, 31.4, "wall"),
    box(4, 12.6, 4.8, 31.4, "wall"),
    box(-4, 13.4, 4, FLOOR, "stone"),

    // The long shelf under the hatch, right across the room over the head of the shaft.
    slab(-2.6, 29.6 - 0.36 * 6.6, 4, 29.6, 0.3, "wood"),
    box(-4, toShaft(-4) - 0.2, -3.9, 28.4, "nest", true),
    // Where he comes down from it: a bed, and a shelf to the shaft at the height of the car's roof.
    slab(-4, toShaft(-4), -2, toShaft(-2), 0.3, "bed", true),
    slab(-2, toShaft(-2), -SHAFT, toShaft(-SHAFT), 0.3, "wood"),

    // Off the roof on the far side, and down to the bottom landing.
    slab(SHAFT, OVER - 0.1, 2.7, OVER - 0.1 - 0.36 * (2.7 - SHAFT), 0.3, "wood"),
    box(3.9, backToShaft(4) - 0.2, 4, OVER + 0.2, "nest", true),
    slab(SHAFT, backToShaft(SHAFT), 2.4, backToShaft(2.4), 0.3, "wood"),
    slab(2.4, backToShaft(2.4), 4, backToShaft(4), 0.3, "bed", true),

    // Out of the car at the first landing, on the left, and off the end of that into the roost.
    slab(-2.7, FIRST - 0.1 - 0.36 * (2.7 - SHAFT), -SHAFT, FIRST - 0.1, 0.3, "wood"),
    box(-0.98, FLOOR, 0.98, HOIST.floor - 0.35, "stone"),
    box(-4, FLOOR, -1.9, FLOOR + 0.5, "nest", true),
    box(-1.9, FLOOR, -1.6, FLOOR + 1, "nest", true),
    box(-4, FLOOR, -3.9, FLOOR + 5.2, "nest", true),
  ],
  seesaws: [],
  wheels: [],
  doors: [],
  flaps: [],
  tanks: [],
  lifts: [
    {
      x: HOIST.x,
      half: HOIST.half,
      floor: HOIST.floor,
      storey: HOIST.storey,
      floors: 2,
      tall: HOIST.tall,
      side: -1,
      head: HOIST.head,
      openings: [
        { side: -1, y0: FIRST - 0.1, y1: FIRST + 1.6 },
        { side: -1, y0: OVER + 0.1, y1: OVER + 1.85 },
        { side: 1, y0: HOIST.floor + 0.1, y1: HOIST.floor + 1.8 },
        { side: 1, y0: OVER - 0.1, y1: OVER + 1.8 },
      ],
      gates: [
        { side: 1, floor: 0 },
        { side: -1, floor: 1 },
      ],
      pan: { x: 2.9, y: 25.6, w: 1.6, step: 0.9 },
    },
  ],
  barrels: [],
  mats: [],
  pits: [],
  cages: [],
  sockets: [],
  nest: { x0: -3.9, x1: -1.9, y0: FLOOR + 0.4, y1: FLOOR + 1.9 },
};

export const SERVERY: LevelDef = lowered(SERVERY_HERE, STOREY * 5);

/** The cellar's barrel run: its height at the right wall, and its fall to the left. */
const RUNWAY = { y: 24.6, fall: 0.3 };
const runwayAt = (x: number): number => RUNWAY.y - RUNWAY.fall * (4 - x);
const RUNWAY_TURN = Math.atan(RUNWAY.fall);
/** The gap in it, with the bucket under; where the run ends; and the skid along the floor below. */
const GAPE = { x0: -0.9, x1: 0.9, deep: 1.75 };
const RUN_END = -2.1;
const SKID = { y: 17.65, fall: 0.3, end: -0.55 };
const skidAt = (x: number): number => SKID.y - SKID.fall * (x + 4);
/** The pit at the foot of the skid, with the Queen's last pan in the bottom of it: just big enough for a barrel. */
const VAULT = { x: 0.4, w: 1.76, pan: 14.95 };
const CASK = { r: 0.85, at: 3.35 };
const UNDER_RUN = -2.75;

/**
 * The seventh screen, written as if it stood where the first does. A barrel stands chocked at
 * the top of its run, and he comes down on the run in front of it. Half way down there is a
 * gap with rails over it: the barrel goes over on the rails, and he goes down between them
 * into a bucket. That is where he has to be when the barrel is let go: it passes over his
 * head, and on the far side of the gap it rolls over a treadle that throws the bucket up, and
 * him out of it, on to the run behind the barrel. The barrel goes off the end, down to the
 * floor, through the crates that are in his way and into the pit, which it stops. He follows
 * it down, and wants a bale under him when he comes off the end: but not before the barrel
 * has been by, or it is flattened. Two bales, and three to do it with.
 */
const CELLAR_HERE: LevelDef = {
  key: "cellar",
  name: "The Cellar",
  ends: "nest",
  hatch: true,
  left: -4,
  right: 4,
  top: 31,
  bottom: 13,
  start: { x: -3.5, y: 30.2 },
  shove: 3,
  bales: 3,
  spare: 1,
  blocks: [
    box(-4.8, 12.6, -4, 31.4, "wall"),
    box(4, 12.6, 4.8, 31.4, "wall"),
    box(-4, 13.4, 4, FLOOR, "stone"),

    // The shelf under the hatch, and the padded board that stops him at the end of it.
    slab(-4, 29.6, 0.7, 29.6 - 0.36 * 4.7, 0.3, "wood"),
    box(2, 26.4, 2.3, 28.8, "nest", true),

    // The run: the rack the barrel stands on, the bed he comes down on, and beyond the gap a feather bed.
    slab(2.2, runwayAt(2.2), 4, runwayAt(4), 0.3, "wood"),
    slab(GAPE.x1, runwayAt(GAPE.x1), 2.2, runwayAt(2.2), 0.3, "bed", true),
    slab(RUN_END, runwayAt(RUN_END), GAPE.x0, runwayAt(GAPE.x0), 0.3, "bed", true),
    // The bucket under the gap.
    box(GAPE.x0 + 0.1, runwayAt(0) - GAPE.deep - 0.2, GAPE.x1 - 0.1, runwayAt(0) - GAPE.deep, "nest", true),
    box(GAPE.x0 - 0.05, runwayAt(0) - GAPE.deep - 0.2, GAPE.x0 + 0.1, runwayAt(0) - GAPE.deep + 0.75, "nest", true),
    box(GAPE.x1 - 0.1, runwayAt(0) - GAPE.deep - 0.2, GAPE.x1 + 0.05, runwayAt(0) - GAPE.deep + 0.95, "nest", true),

    // The skid along the floor, on its plinth; the pit, with its tray; and the far side of the pit.
    box(-4, FLOOR, SKID.end, 16.2, "stone"),
    box(-4, 16.2, -2.4, 16.7, "stone"),
    slab(-4, skidAt(-4), SKID.end, skidAt(SKID.end), 0.45, "wood"),
    box(VAULT.x - VAULT.w / 2, VAULT.pan - 0.2, VAULT.x + VAULT.w / 2, VAULT.pan, "iron"),
    box(VAULT.x + VAULT.w / 2, FLOOR, VAULT.x + VAULT.w / 2 + 0.6, skidAt(SKID.end), "stone"),

    // The Empress Hen's nest, bottom right.
    box(VAULT.x + VAULT.w / 2 + 0.6, FLOOR, 4, FLOOR + 0.5, "nest", true),
    box(3.9, FLOOR, 4, FLOOR + 4.6, "nest", true),
  ],
  seesaws: [],
  wheels: [],
  doors: [],
  flaps: [],
  tanks: [],
  lifts: [],
  barrels: [
    {
      x: CASK.at - CASK.r * Math.sin(RUNWAY_TURN),
      y: runwayAt(CASK.at) + CASK.r * Math.cos(RUNWAY_TURN),
      r: CASK.r,
      pan: { x: 3.15, y: 28.2, w: 1.5 },
      rails: { x0: GAPE.x0, y0: runwayAt(GAPE.x0), x1: GAPE.x1, y1: runwayAt(GAPE.x1) },
      bucket: { x0: GAPE.x0 + 0.1, x1: GAPE.x1 - 0.1, y0: runwayAt(0) - GAPE.deep, y1: runwayAt(0) - GAPE.deep + 1.2 },
      tread: { x0: -1.6, x1: -1.1 },
      toss: { x: -1, y: 7.5 },
      crates: { x0: -1.6, x1: -1.1, y0: skidAt(-1.35) - 0.1, y1: skidAt(-1.35) + 1.8 },
      pit: { x: VAULT.x, y: skidAt(SKID.end), w: VAULT.w },
    },
  ],
  mats: [{ x0: RUN_END, y0: runwayAt(RUN_END), x1: GAPE.x0, y1: runwayAt(GAPE.x0), crawl: 0.3 }],
  pits: [{ x: VAULT.x, y: skidAt(SKID.end), w: VAULT.w, pan: VAULT.pan, hung: true }],
  cages: [],
  sockets: [
    { x: 3.15, y0: 27.5, y1: 30.2, reach: 1.2, seat: { y: 28.2 + BALE_H / 2 + 0.02, turn: 0 } },
    // Under the end of the run, on the skid.
    { x: UNDER_RUN, y0: skidAt(UNDER_RUN) - 1.2, y1: skidAt(UNDER_RUN) + 3.5, reach: 1.25, seat: { y: skidAt(UNDER_RUN) + BALE_H / 2 + 0.05, turn: -Math.atan(SKID.fall) } },
  ],
  nest: { x0: VAULT.x + VAULT.w / 2 + 0.6, x1: 3.9, y0: FLOOR + 0.4, y1: FLOOR + 1.9 },
};

export const CELLAR: LevelDef = lowered(CELLAR_HERE, STOREY * 6);

export const LEVELS: LevelDef[] = [LARDER, SCULLERY, MILLROOM, BUTTERY, CISTERN, SERVERY, CELLAR];

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
  | { type: "sluice"; x: number; y: number }
  | { type: "water"; x: number; y: number }
  | { type: "turning"; x: number; y: number }
  | { type: "brake"; x: number; y: number }
  | { type: "port"; port: Port; shut: boolean; x: number; y: number }
  | { type: "unbar"; x: number; y: number }
  | { type: "release"; id: number; x: number; y: number }
  | { type: "plug"; id: number; x: number; y: number }
  | { type: "spill"; over: "spout" | "weir"; x: number; y: number }
  | { type: "wash"; id: number; over: "spout" | "weir"; x: number; y: number }
  | { type: "splash"; x: number; y: number }
  | { type: "hoist"; way: 1 | -1; id: number; x: number; y: number }
  | { type: "landing"; floor: number; x: number; y: number }
  | { type: "roll"; x: number; y: number }
  | { type: "tread"; threw: boolean; x: number; y: number }
  | { type: "crush"; id: number; x: number; y: number }
  | { type: "smash"; x: number; y: number }
  | { type: "bung"; x: number; y: number }
  | { type: "flat"; x: number; y: number }
  | { type: "caged"; x: number; y: number }
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
  /** In a cistern, where there is nowhere for it to burst to; and washed out of one. */
  tank: boolean;
  washed: boolean;
  /** Made fast to the pan or the roof of a dumbwaiter: it goes where that goes. */
  held: boolean;
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
  private readonly planks: Array<{ body: RAPIER.RigidBody; def: SeesawDef; hit: number; up: boolean; spin: number; lip: RAPIER.Collider | null; threw: number }> = [];
  /** `openAt` is when a bale came down on its sluice pan (before that, -1); `wet` once the water has reached it. */
  private readonly mills: Array<{ body: RAPIER.RigidBody; def: WheelDef; pan: RAPIER.Collider; wood: RAPIER.Collider[]; openAt: number; wet: boolean }> = [];
  /** The revolving doors: how far each has turned, and where it is to stop. */
  private readonly gates: Array<{
    body: RAPIER.RigidBody;
    def: DoorDef;
    pan: RAPIER.Collider;
    shutters: Record<Exclude<Port, "top">, RAPIER.Collider[]>;
    state: "still" | "turning" | "stopped";
    turned: number;
    /** How far it had turned when it was last set going: the clockwork runs down from there. */
    wound: number;
    target: number;
    braked: boolean;
    /** The shutter that is up; where it has stopped, up or not; and whether he has been out of it since. */
    open: Port | null;
    at: Port | null;
    out: boolean;
    barred: boolean;
  }> = [];
  private readonly valves: Array<{ def: FlapDef; collider: RAPIER.Collider; open: boolean }> = [];
  private readonly cisterns: Array<{
    def: TankDef;
    pan: RAPIER.Collider;
    openAt: number;
    wet: boolean;
    level: number;
    rising: boolean;
    plug: Bale | null;
    over: "spout" | "weir" | null;
    /** How long the raft has stood at a way out with nobody on it; and one the water is taking. */
    bob: number;
    wash: { bale: Bale; until: number; way: number } | null;
    under: boolean;
    aboard: boolean;
    /** He has ridden it to a way out: it has done its work, and stays where it is. */
    rode: boolean;
  }> = [];
  /** The dumbwaiters: where each car is, which landing it is bound for, and the bales made fast to its pan and its roof. */
  private readonly hoists: Array<{
    def: LiftDef;
    car: RAPIER.RigidBody;
    roof: RAPIER.Collider;
    /** The car's own doors, and the rails along the edges of its roof: each stands open only while the car is at rest against a way through the shaft. */
    doors: Array<{ collider: RAPIER.Collider; side: 1 | -1; above: boolean; open: boolean }>;
    pan: RAPIER.RigidBody;
    plate: RAPIER.Collider;
    gates: RAPIER.Collider[];
    y: number;
    speed: number;
    floor: number;
    moving: boolean;
    up: Bale[];
    down: Bale[];
    aboard: boolean;
    over: boolean;
  }> = [];
  /** The barrels: chocked, on their way, or down the pit; whether the treadle has been trodden; and the crates, while they stand. */
  private readonly casks: Array<{
    def: BarrelDef;
    body: RAPIER.RigidBody;
    collider: RAPIER.Collider;
    pan: RAPIER.Collider;
    crates: RAPIER.Collider | null;
    state: "chocked" | "rolling" | "sunk";
    trod: boolean;
  }> = [];
  /** Rails that carry a barrel and nothing else: they are in nobody's way but a barrel's. */
  private readonly rails = new Set<number>();
  /** Somewhere the hook is slow to come to: a seat, a dumbwaiter's car, the bucket under a barrel's run. */
  private waiting = false;
  /** The padded seats: he sinks into one and stays put. And the cushions he only wallows across. */
  private readonly seats = new Set<number>();
  /** The balls that stand in for the weight of a plank or a wheel: they touch nothing, and are in nothing's way. */
  private readonly weights = new Set<number>();
  private readonly cushions = new Set<number>();
  private inSeat = false;
  /** Seconds he has been in a cage. */
  private snared = 0;
  private flungAt = -1;
  /** Where he was when he last got anywhere, and when. */
  private anchor = { x: 0, y: 0 };
  private readonly live: Bale[] = [];
  private readonly coming: Incoming[] = [];
  private nextId = 1;
  private last = { x: 0, y: 0 };
  private softUntil = -1;
  private strawUntil = -1;
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
      this.weights.add(this.world.createCollider(RAPIER.ColliderDesc.ball(PLANK_BALL).setDensity(PLANK_DENSITY).setCollisionGroups(0), body).handle);
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
      this.soft.add(pad.handle);
      let lip: RAPIER.Collider | null = null;
      if (def.pass) {
        // Nothing to keep him on it: he goes off the low end unless he is thrown first.
        this.cushions.add(pad.handle);
      } else {
        lip = this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.06, 0.2, 0.9)
            .setTranslation(def.side * (def.seat - 0.06), 0.3, 0)
            .setDensity(0)
            .setFriction(1)
            .setRestitution(0),
          body,
        );
        this.soft.add(lip.handle);
        this.seats.add(pad.handle);
      }
      body.addTorque({ x: 0, y: 0, z: -def.side * (def.pass ? PASS_BIAS : PLANK_BIAS) }, true);
      this.planks.push({ body, def, hit: 0, up: false, spin: 0, lip, threw: -1 });
    }

    for (const def of level.wheels) {
      // Like a plank, the wheel cannot move, only turn; and all its weight is a ball on the axle.
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(def.x, def.y, 0)
          .enabledTranslations(false, false, false)
          .enabledRotations(false, false, true)
          .setCanSleep(false)
          .setCcdEnabled(true)
          .setAngularDamping(WHEEL_DRAG),
      );
      this.weights.add(this.world.createCollider(RAPIER.ColliderDesc.ball(WHEEL_BALL).setDensity(WHEEL_DENSITY).setCollisionGroups(0), body).handle);
      const wood = [this.world.createCollider(RAPIER.ColliderDesc.ball(def.drum).setDensity(0).setFriction(0.6).setRestitution(0), body)];
      // One paddle stands straight up to begin with, so he cannot roll over the top of a dry wheel.
      const inner = def.drum * 0.6;
      for (let index = 0; index < def.paddles; index += 1) {
        const turn = Math.PI / 2 + (index / def.paddles) * Math.PI * 2;
        const mid = (inner + def.r) / 2;
        wood.push(
          this.world.createCollider(
            RAPIER.ColliderDesc.cuboid((def.r - inner) / 2, 0.06, 0.8)
              .setTranslation(Math.cos(turn) * mid, Math.sin(turn) * mid, 0)
              .setRotation(quat(turn))
              .setDensity(0)
              // Slippery: between two rough paddles he wedged, and went all the way round.
              .setFriction(0.2)
              .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
              .setRestitution(0),
            body,
          ),
        );
      }
      const pan = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.pan.w / 2, 0.05, 0.6).setTranslation(def.pan.x, def.pan.y - 0.05, 0).setFriction(1).setRestitution(0),
        ground,
      );
      this.mills.push({ body, def, pan, wood, openAt: -1, wet: false });
    }

    for (const def of level.tanks) {
      const pan = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.pan.w / 2, 0.05, 0.6).setTranslation(def.pan.x, def.pan.y - 0.05, 0).setFriction(1).setRestitution(0),
        ground,
      );
      this.cisterns.push({ def, pan, openAt: -1, wet: false, level: def.floor, rising: false, plug: null, over: null, bob: 0, wash: null, under: false, aboard: false, rode: false });
    }

    for (const def of level.doors) {
      // The leaves are clockwork: nothing he does can turn them or stop them.
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(def.x, def.y, 0));
      // The leaves are quilted, like the seat of a see-saw: he drops in on them and is not hurt.
      this.soft.add(this.world.createCollider(RAPIER.ColliderDesc.ball(0.3).setFriction(0.3).setRestitution(0), body).handle);
      for (let leaf = 0; leaf < 4; leaf += 1) {
        const turn = Math.PI / 4 + leaf * QUARTER;
        const mid = (0.2 + def.r) / 2;
        const quilt = this.world.createCollider(
          RAPIER.ColliderDesc.cuboid((def.r - 0.2) / 2, 0.07, 0.8)
            .setTranslation(Math.cos(turn) * mid, Math.sin(turn) * mid, 0)
            .setRotation(quat(turn))
            .setFriction(0.3)
            .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
            .setRestitution(0),
          body,
        );
        this.soft.add(quilt.handle);
      }
      // The drum: a ring of short staves, with a slot left in the top and three lots that open.
      const ring = def.r + 0.06 + DOOR_WALL / 2;
      const shutters: Record<Exclude<Port, "top">, RAPIER.Collider[]> = { right: [], bottom: [], left: [] };
      for (let from = -184; from < 176; from += 6) {
        const mid = from + 3;
        if (Math.abs(mid - 90) < DOOR_SLOT) continue;
        const turn = (mid * Math.PI) / 180;
        const stave = this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(DOOR_WALL / 2, ring * Math.tan((3 * Math.PI) / 180) + 0.02, 0.8)
            .setTranslation(def.x + Math.cos(turn) * ring, def.y + Math.sin(turn) * ring, 0)
            .setRotation(quat(turn))
            .setFriction(0.5)
            .setRestitution(0),
          ground,
        );
        // The lips of the slot are padded: he comes in off the shelf at a run, and meets one of them.
        if (Math.abs(mid - 90) < DOOR_SLOT + 13) this.soft.add(stave.handle);
        for (const port of ["right", "bottom", "left"] as const) {
          if (mid > SHUTTER[port][0] && mid < SHUTTER[port][1]) shutters[port].push(stave);
        }
      }
      const pan = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.pan.w / 2, 0.05, 0.6).setTranslation(def.pan.x, def.pan.y - 0.05, 0).setFriction(1).setRestitution(0),
        ground,
      );
      this.gates.push({ body, def, pan, shutters, state: "still", turned: 0, wound: 0, target: -1, braked: false, open: null, at: null, out: false, barred: Boolean(def.bar) });
    }

    for (const def of level.lifts) {
      // The shaft: a wall either side of the car, with ways through. Smooth, so that he slides up and down them.
      const foot = def.floor - 0.35;
      for (const side of [-1, 1] as const) {
        const gaps = def.openings.filter((opening) => opening.side === side).sort((a, b) => a.y0 - b.y0);
        let from = foot;
        for (const span of [...gaps, { y0: def.head, y1: def.head }]) {
          if (span.y0 > from + 0.02) {
            this.world.createCollider(
              RAPIER.ColliderDesc.cuboid(0.075, (span.y0 - from) / 2, 1)
                .setTranslation(def.x + side * (def.half + 0.105), (from + span.y0) / 2, 0)
                .setFriction(0.1)
                .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
                .setRestitution(0),
              ground,
            );
          }
          from = span.y1;
        }
      }
      // The car goes where the bales send it, and nothing he does can move it.
      const car = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(def.x, def.floor, 0));
      // Its floor is quilted, and falls to the side he leaves by; its roof is bare board, and falls the other way.
      const pad = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.half, 0.1, 0.8)
          .setTranslation(0, -0.1, 0)
          .setRotation(quat(-def.side * LIFT_TILT))
          .setFriction(0.6)
          .setRestitution(0),
        car,
      );
      this.soft.add(pad.handle);
      const roof = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.half, 0.1, 0.8)
          .setTranslation(0, def.tall - 0.1, 0)
          .setRotation(quat(def.side * LIFT_TILT))
          .setFriction(0.8)
          .setRestitution(0),
        car,
      );
      // Doors to the car and rails to its roof go up and down with it, so that he is never
      // rubbed against the shaft: against a corner of that, a rising floor would have him out like a pip.
      const doors: Array<{ collider: RAPIER.Collider; side: 1 | -1; above: boolean; open: boolean }> = [];
      for (const side of [-1, 1] as const) {
        const door = this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.04, (def.tall - 0.2) / 2, 0.8).setTranslation(side * (def.half - 0.04), (def.tall - 0.2) / 2, 0).setFriction(0.3).setRestitution(0),
          car,
        );
        this.soft.add(door.handle);
        doors.push({ collider: door, side, above: false, open: false });
        const rail = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.04, 0.3, 0.8).setTranslation(side * (def.half - 0.04), def.tall + 0.3, 0).setFriction(0.3).setRestitution(0), car);
        doors.push({ collider: rail, side, above: true, open: false });
      }
      const pan = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(def.pan.x, def.pan.y, 0));
      const plate = this.world.createCollider(RAPIER.ColliderDesc.cuboid(def.pan.w / 2, 0.05, 0.6).setTranslation(0, -0.05, 0).setFriction(1).setRestitution(0), pan);
      const gates = def.gates.map((each) => {
        const gate = this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.05, 0.9, 0.8)
            .setTranslation(def.x + each.side * (def.half + 0.13), def.floor + each.floor * def.storey + 0.95, 0)
            .setFriction(0.3)
            .setRestitution(0),
          ground,
        );
        gate.setEnabled(each.floor !== 0);
        return gate;
      });
      this.hoists.push({ def, car, roof, doors, pan, plate, gates, y: def.floor, speed: 0, floor: 0, moving: false, up: [], down: [], aboard: false, over: false });
    }

    for (const def of level.barrels) {
      // It stands until its chock is knocked out. It is heavy, and it is not soft.
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(def.x, def.y, 0).enabledTranslations(true, true, false).enabledRotations(false, false, true).setCanSleep(false).setCcdEnabled(true),
      );
      const collider = this.world.createCollider(RAPIER.ColliderDesc.ball(def.r).setDensity(2).setFriction(0.9).setRestitution(0).setCollisionGroups(0x0003ffff), body);
      // The rails over the gap are for it alone: he and his bales go down between them.
      const rail = slab(def.rails.x0, def.rails.y0, def.rails.x1, def.rails.y1, 0.2, "iron");
      this.rails.add(
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(rail.w / 2 + 0.05, rail.h / 2, 1).setTranslation(rail.x, rail.y, 0).setRotation(quat(rail.turn)).setFriction(0.9).setRestitution(0).setCollisionGroups(0x00020002),
          ground,
        ).handle,
      );
      const pan = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.pan.w / 2, 0.05, 0.6).setTranslation(def.pan.x, def.pan.y - 0.05, 0).setFriction(1).setRestitution(0),
        ground,
      );
      const crates = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid((def.crates.x1 - def.crates.x0) / 2, (def.crates.y1 - def.crates.y0) / 2, 1)
          .setTranslation((def.crates.x0 + def.crates.x1) / 2, (def.crates.y0 + def.crates.y1) / 2, 0)
          .setFriction(0.8)
          .setRestitution(0),
        ground,
      );
      this.casks.push({ def, body, collider, pan, crates, state: "chocked", trod: false });
    }

    for (const def of level.flaps) {
      const board = slab(def.x0, def.y0, def.x1, def.y1, 0.16, "wood");
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(board.w / 2, board.h / 2, 1).setTranslation(board.x, board.y, 0).setRotation(quat(board.turn)).setFriction(0.8).setRestitution(0),
        ground,
      );
      this.valves.push({ def, collider, open: false });
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
    // He and his bales are of one kind, which the rails of a barrel run let through.
    this.eggCollider = this.world.createCollider(hull.setDensity(1).setFriction(0.8).setRestitution(0.05).setCollisionGroups(0x0005ffff), this.eggBody);
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

  /** `flow` is how far the water has got from the cistern to the wheel: 0 shut, 1 there. */
  get wheels(): Array<Pose & { def: WheelDef; open: boolean; flow: number; wet: boolean }> {
    return this.mills.map((mill) => ({
      x: mill.def.x,
      y: mill.def.y,
      turn: turnOf(mill.body.rotation()),
      def: mill.def,
      open: mill.openAt >= 0,
      flow: mill.openAt < 0 ? 0 : Math.min(1, (this.time - mill.openAt) / RACE),
      wet: mill.wet,
    }));
  }

  /** `turn` is how far the leaves have gone round; `open` the shutter that has been let up, once it has stopped. */
  get doors(): Array<Pose & { def: DoorDef; turning: boolean; braked: boolean; open: Port | null; stopped: boolean; barred: boolean }> {
    return this.gates.map((gate) => ({
      x: gate.def.x,
      y: gate.def.y,
      turn: 0 - gate.turned,
      def: gate.def,
      turning: gate.state === "turning",
      braked: gate.braked,
      open: gate.open,
      stopped: gate.state === "stopped",
      barred: gate.barred,
    }));
  }

  /** The flaps, and whether each is standing open to let him up through it. */
  /** `level` is the top of the water; `over` the way it is running out, once it has got that high. */
  get tanks(): Array<{ def: TankDef; open: boolean; flow: number; wet: boolean; level: number; plugged: boolean; over: "spout" | "weir" | null }> {
    return this.cisterns.map((tank) => ({
      def: tank.def,
      open: tank.openAt >= 0,
      flow: tank.openAt < 0 ? 0 : Math.min(1, (this.time - tank.openAt) / RACE),
      wet: tank.wet,
      level: tank.level,
      plugged: tank.plug !== null,
      over: tank.over,
    }));
  }

  get lifts(): Array<{ def: LiftDef; y: number; floor: number; moving: boolean; pan: number; up: number; down: number; gate: boolean; gates: boolean[]; aboard: boolean; over: boolean; doors: Array<{ side: 1 | -1; above: boolean; open: boolean }> }> {
    return this.hoists.map((hoist) => ({
      def: hoist.def,
      y: hoist.y,
      floor: hoist.floor,
      moving: hoist.moving,
      pan: hoist.def.pan.y - (hoist.def.pan.step * (hoist.y - hoist.def.floor)) / hoist.def.storey,
      up: hoist.up.length,
      down: hoist.down.length,
      gate: !hoist.gates[0]!.isEnabled(),
      gates: hoist.gates.map((gate) => !gate.isEnabled()),
      aboard: hoist.aboard,
      over: hoist.over,
      doors: hoist.doors.map((door) => ({ side: door.side, above: door.above, open: door.open })),
    }));
  }

  get barrels(): Array<Pose & { def: BarrelDef; state: "chocked" | "rolling" | "sunk"; trod: boolean; crates: boolean }> {
    return this.casks.map((cask) => {
      const p = cask.body.translation();
      return { x: p.x, y: p.y, turn: turnOf(cask.body.rotation()), def: cask.def, state: cask.state, trod: cask.trod, crates: cask.crates !== null };
    });
  }

  get flaps(): Array<{ def: FlapDef; open: boolean }> {
    return this.valves.map((valve) => ({ def: valve.def, open: valve.open }));
  }

  /** He is in a cage. */
  get caged(): boolean {
    return this.snared > 0;
  }

  /** How far down the Queen's hook has come for him: 0 not let down yet, 1 it has him. */
  get hook(): number {
    if (this.phase === "caught") return 1;
    if (this.phase !== "run") return 0;
    const patience = this.waiting ? SEAT_IDLE : IDLE;
    const warn = this.waiting ? SEAT_WARN : IDLE_WARN;
    return Math.max(0, Math.min(1, Math.max((this.idle - warn) / (patience - warn), this.snared / CAGE)));
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
    for (const hoist of this.hoists) {
      // A dumbwaiter has two places for a bale, and both of them move: on its pan, and on its
      // roof. Anywhere in the shaft is taken to mean the roof.
      const def = hoist.def;
      const plate = hoist.pan.translation().y;
      if (Math.abs(x - def.pan.x) <= def.pan.w / 2 + 0.45 && y > def.pan.y - def.pan.step * def.floors - 0.8 && y < def.pan.y + 2.6) {
        return { x: def.pan.x, y: this.lifted(def.pan.x, plate + BALE_H / 2 + 0.03), turn: 0 };
      }
      if (Math.abs(x - def.x) <= def.half + 0.4 && y > def.floor - 0.4 && y < def.head) {
        return { x: def.x, y: this.lifted(def.x, hoist.y + def.tall + BALE_H / 2 + 0.12), turn: 0 };
      }
    }
    for (const socket of level.sockets) {
      if (Math.abs(x - socket.x) > socket.reach || y < socket.y0 || y > socket.y1) continue;
      if (socket.seat && this.free(socket.x, socket.seat.y, socket.seat.turn)) return { x: socket.x, y: socket.seat.y, turn: socket.seat.turn };
      return { x: socket.x, y: this.lifted(socket.x, ay), turn: 0 };
    }
    return { x: ax, y: this.lifted(ax, ay), turn: 0 };
  }

  private free(x: number, y: number, turn = 0): boolean {
    // Nothing is thrown into the drum of a door: its leaves would have the bale in splinters.
    for (const gate of this.gates) {
      if (Math.hypot(x - gate.def.x, y - gate.def.y) < gate.def.r + DOOR_WALL + 0.3) return false;
    }
    const shape = new RAPIER.Cuboid(BALE_W / 2 - 0.03, BALE_H / 2 - 0.03, 0.5);
    return this.world.intersectionWithShape({ x, y, z: 0 }, quat(turn), shape, undefined, undefined, undefined, undefined, (collider) => !this.weights.has(collider.handle) && !this.rails.has(collider.handle)) === null;
  }

  private lifted(x: number, y: number): number {
    for (let up = 0; up <= 4.5; up += 0.1) {
      if (this.free(x, y + up)) return y + up;
    }
    return y + 4.5;
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
    this.drive();
    this.revolve();
    this.swing();
    this.flood();
    this.hoist();
    this.world.step();
    this.time += STEP;
    this.weigh();
    this.sluice();
    this.brake();
    this.stop();
    this.stow();
    this.trundle();
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
      RAPIER.ColliderDesc.cuboid(BALE_W / 2, BALE_H / 2, 0.4).setDensity(BALE_DENSITY).setFriction(1).setRestitution(0).setCollisionGroups(0x0001ffff),
      body,
    );
    this.soft.add(collider.handle);
    this.live.push({ id: bale.id, body, collider, fall: 0, spent: false, tank: false, washed: false, held: false });
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
        plank.hit = Math.max(plank.hit, bale.fall, 0.01);
        // A see-saw that is to be timed goes over at once, wherever on it he is sitting.
        // So does one that always throws alike: a bale set down gently would only lean on it.
        if (plank.def.pass || plank.def.throw !== undefined) {
          plank.body.setAngvel({ x: 0, y: 0, z: plank.def.side * SNAP }, true);
          // And its lip folds down out of his way, or coming round behind him it would bat him off line.
          plank.threw = this.time;
        }
      }
    }
  }

  /** A bale on a sluice pan lets the water in, and a moment later it is on the wheel. */
  private sluice(): void {
    for (const mill of this.mills) {
      if (mill.openAt < 0) {
        let on = false;
        this.world.contactPairsWith(mill.pan, (other) => {
          if (!this.live.some((bale) => bale.collider.handle === other.handle)) return;
          this.world.contactPair(mill.pan, other, (manifold) => {
            if (manifold.numContacts() > 0) on = true;
          });
        });
        if (!on) continue;
        mill.openAt = this.time;
        this.events.push({ type: "sluice", x: mill.def.pan.x, y: mill.def.pan.y });
      }
      if (!mill.wet && this.time >= mill.openAt + RACE) {
        mill.wet = true;
        mill.body.setAngularDamping(0);
        // Paddles running with water are a soft landing: he comes down in it with a splash.
        for (const collider of mill.wood) this.soft.add(collider.handle);
        this.events.push({ type: "water", x: mill.def.spout.x, y: mill.def.y + mill.def.r });
      }
    }
  }

  /** The water pushes a wet wheel round. It pushes hard, but something wedged in the wheel can still hold it. */
  private drive(): void {
    for (const mill of this.mills) {
      if (!mill.wet) continue;
      const spin = mill.body.angvel().z;
      const want = -mill.def.way * WHEEL_TURN;
      const push = Math.min(WHEEL_PUSH * STEP, Math.max(-WHEEL_PUSH * STEP, want - spin));
      mill.body.setAngvel({ x: 0, y: 0, z: spin + push }, true);
    }
  }

  /** A door that is turning goes on turning, to the quarter after its brake went on. */
  private revolve(): void {
    for (const gate of this.gates) {
      if (gate.state !== "turning") continue;
      gate.turned += DOOR_TURN * STEP;
      if (gate.braked && gate.turned >= gate.target - 1e-9) {
        gate.turned = gate.target;
        gate.state = "stopped";
        gate.out = false;
        // Counted from where the leaves stood when he came in: the second time round that is not where they began.
        const port = PORTS[Math.round((gate.target - gate.wound) / QUARTER) % 4]!;
        gate.at = port;
        const shut = port === "top" || (gate.barred && gate.def.bar?.port === port);
        if (port !== "top" && !shut) {
          gate.open = port;
          for (const stave of gate.shutters[port]) stave.setEnabled(false);
        }
        this.events.push({ type: "port", port, shut, x: gate.def.x, y: gate.def.y });
      }
      gate.body.setNextKinematicRotation(quat(-gate.turned));
    }
  }

  /** A door starts to turn when he is well inside it, and a bale on its brake's pan stops it at the next quarter. */
  private brake(): void {
    const p = this.eggBody.translation();
    for (const gate of this.gates) {
      if (!gate.braked) {
        let on = false;
        this.world.contactPairsWith(gate.pan, (other) => {
          if (!this.live.some((bale) => bale.collider.handle === other.handle)) return;
          this.world.contactPair(gate.pan, other, (manifold) => {
            if (manifold.numContacts() > 0) on = true;
          });
        });
        if (on) {
          // Put on before he is in it, the brake stops it at the first quarter.
          gate.braked = true;
          gate.target = Math.max(gate.wound + QUARTER, Math.ceil((gate.turned + 0.03) / QUARTER) * QUARTER);
          this.events.push({ type: "brake", x: gate.def.pan.x, y: gate.def.pan.y });
        }
      }
      // Left to itself the clockwork runs down, and it runs down with him at the top.
      if (!gate.braked && gate.turned >= gate.wound + DOOR_LAPS * 4 * QUARTER - 0.03) {
        gate.braked = true;
        gate.target = gate.wound + DOOR_LAPS * 4 * QUARTER;
      }
      const far = Math.hypot(p.x - gate.def.x, p.y - gate.def.y);
      if (gate.state === "still" && this.phase === "run" && far < 0.95) {
        gate.state = "turning";
        this.events.push({ type: "turning", x: gate.def.x, y: gate.def.y });
      }
      // His weight on the treadle pulls the bar off its shutter; and if the door is standing
      // against that shutter, up it goes.
      const bar = gate.def.bar;
      if (gate.barred && bar && this.phase === "run" && p.x > bar.tread.x0 && p.x < bar.tread.x1 && p.y > bar.tread.y0 && p.y < bar.tread.y1) {
        gate.barred = false;
        this.events.push({ type: "unbar", x: (bar.tread.x0 + bar.tread.x1) / 2, y: bar.tread.y0 });
        if (gate.state === "stopped" && gate.at === bar.port) {
          gate.open = bar.port;
          for (const stave of gate.shutters[bar.port]) stave.setEnabled(false);
          this.events.push({ type: "port", port: bar.port, shut: false, x: gate.def.x, y: gate.def.y });
        }
      }
      // Out of the door and back in at the top: it is the same door, and it starts again. The
      // shutter comes down, the brake comes off, and what was on its pan goes with it.
      if (gate.state !== "stopped" || this.phase !== "run") continue;
      if (far > gate.def.r + DOOR_WALL + 0.5) gate.out = true;
      if (!gate.out || far >= 0.95) continue;
      if (gate.open && gate.open !== "top") for (const stave of gate.shutters[gate.open]) stave.setEnabled(true);
      gate.open = null;
      gate.at = null;
      gate.out = false;
      gate.braked = false;
      gate.target = -1;
      gate.wound = gate.turned;
      gate.state = "turning";
      for (const bale of [...this.live]) {
        let on = false;
        this.world.contactPair(gate.pan, bale.collider, (manifold) => {
          if (manifold.numContacts() > 0) on = true;
        });
        if (!on) continue;
        const at = bale.body.translation();
        this.events.push({ type: "release", id: bale.id, x: at.x, y: at.y });
        this.scrap(bale);
      }
      this.events.push({ type: "turning", x: gate.def.x, y: gate.def.y });
    }
  }

  /**
   * A dumbwaiter goes to the landing its bales make: one up for each on the pan, one down for
   * each on the roof. It does not set off while he is half in and half out of it.
   */
  private hoist(): void {
    const p = this.eggBody.translation();
    for (const hoist of this.hoists) {
      const def = hoist.def;
      const floor = Math.max(0, Math.min(def.floors, hoist.up.length - hoist.down.length));
      const want = def.floor + floor * def.storey;
      const out = Math.abs(p.x - def.x);
      const level = p.y > hoist.y - 0.2 && p.y < hoist.y + def.tall - 0.2;
      hoist.aboard = level && out < def.half - 0.3;
      hoist.over = out < def.half + 0.2 && p.y >= hoist.y + def.tall - 0.2 && p.y < hoist.y + def.tall + 1.5;
      const astride = level && out >= def.half - 0.3 && out < def.half + 0.38;
      const gap = want - hoist.y;
      const was = hoist.moving;
      if (Math.abs(gap) < 1e-4 || (astride && !hoist.moving)) {
        hoist.speed = 0;
        hoist.moving = false;
        if (Math.abs(gap) < 1e-4) hoist.y = want;
      } else {
        // It gets going over a moment, and eases in to the landing.
        const wish = Math.sign(gap) * Math.min(LIFT_SPEED, Math.abs(gap) * 6 + 0.3);
        hoist.speed += Math.max(-10 * STEP, Math.min(10 * STEP, wish - hoist.speed));
        const move = hoist.speed * STEP;
        hoist.y = Math.abs(move) >= Math.abs(gap) && Math.sign(move) === Math.sign(gap) ? want : hoist.y + move;
        hoist.moving = true;
      }
      hoist.floor = floor;
      if (was && !hoist.moving) this.events.push({ type: "landing", floor, x: def.x, y: hoist.y });
      hoist.car.setNextKinematicTranslation({ x: def.x, y: hoist.y, z: 0 });
      const plate = def.pan.y - (def.pan.step * (hoist.y - def.floor)) / def.storey;
      hoist.pan.setNextKinematicTranslation({ x: def.pan.x, y: plate, z: 0 });
      hoist.up.forEach((bale, index) => bale.body.setNextKinematicTranslation({ x: def.pan.x, y: plate + (index + 0.5) * (BALE_H + 0.01), z: 0 }));
      hoist.down.forEach((bale, index) => bale.body.setNextKinematicTranslation({ x: def.x, y: hoist.y + def.tall + 0.02 + (index + 0.5) * (BALE_H + 0.01), z: 0 }));
      for (const door of hoist.doors) {
        const sill = hoist.y + (door.above ? def.tall : 0);
        door.open = !hoist.moving && def.openings.some((opening) => opening.side === door.side && opening.y0 <= sill + 0.25 && opening.y1 >= sill + 1.3);
        // Shut, they are there for him alone: a bale for the roof is wider than the rails are apart.
        door.collider.setCollisionGroups(door.open ? 0 : 0x00040004);
      }
      // The gate at a landing is shut unless the car is standing there.
      hoist.gates.forEach((gate, index) => gate.setEnabled(Math.abs(hoist.y - (def.floor + def.gates[index]!.floor * def.storey)) > 0.04));
    }
  }

  /** A bale that comes down on a dumbwaiter's pan, or on its roof, is made fast there and counts. */
  private stow(): void {
    for (const hoist of this.hoists) {
      for (const bale of this.live) {
        if (bale.held) continue;
        const touches = (other: RAPIER.Collider): boolean => {
          let on = false;
          this.world.contactPair(bale.collider, other, (manifold) => {
            if (manifold.numContacts() > 0) on = true;
          });
          return on;
        };
        const way: 1 | -1 | 0 = touches(hoist.plate) || hoist.up.some((each) => touches(each.collider)) ? 1 : touches(hoist.roof) || hoist.down.some((each) => touches(each.collider)) ? -1 : 0;
        if (way === 0) continue;
        bale.held = true;
        bale.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        bale.body.setRotation(quat(way > 0 ? 0 : hoist.def.side * LIFT_TILT), true);
        (way > 0 ? hoist.up : hoist.down).push(bale);
        const at = bale.body.translation();
        this.events.push({ type: "hoist", way, id: bale.id, x: at.x, y: at.y });
      }
    }
  }

  /**
   * A barrel. A bale on its pan lets it go. It flattens straw, and him; on the treadle it
   * throws whoever is in the bucket; it goes through the crates; and the pit stops it.
   */
  private trundle(): void {
    const p = this.eggBody.translation();
    for (const cask of this.casks) {
      const def = cask.def;
      if (cask.state === "chocked") {
        let on = false;
        this.world.contactPairsWith(cask.pan, (other) => {
          if (!this.live.some((bale) => bale.collider.handle === other.handle)) return;
          this.world.contactPair(cask.pan, other, (manifold) => {
            if (manifold.numContacts() > 0) on = true;
          });
        });
        if (!on) continue;
        cask.state = "rolling";
        cask.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        this.events.push({ type: "roll", x: def.x, y: def.y });
        continue;
      }
      if (cask.state !== "rolling") continue;
      const at = cask.body.translation();
      const v = cask.body.linvel();
      const fast = Math.hypot(v.x, v.y) > BARREL_HURT;
      const touches = (other: RAPIER.Collider): boolean => {
        let on = false;
        this.world.contactPair(cask.collider, other, (manifold) => {
          if (manifold.numContacts() > 0) on = true;
        });
        return on;
      };
      if (fast) {
        for (const bale of [...this.live]) {
          if (!touches(bale.collider)) continue;
          const where = bale.body.translation();
          this.events.push({ type: "crush", id: bale.id, x: where.x, y: where.y });
          this.scrap(bale);
        }
        if (this.phase === "run" && touches(this.eggCollider)) {
          this.phase = "broken";
          this.cracks = SHELL + 1;
          this.events.push({ type: "flat", x: p.x, y: p.y });
          this.events.push({ type: "broken", x: p.x, y: p.y });
        }
      }
      // On the treadle: up comes the bucket, and out goes whoever is in it.
      if (!cask.trod && at.x > def.tread.x0 && at.x < def.tread.x1 && at.y > def.bucket.y1) {
        cask.trod = true;
        const inside = this.phase === "run" && p.x > def.bucket.x0 && p.x < def.bucket.x1 && p.y > def.bucket.y0 && p.y < def.bucket.y1;
        this.events.push({ type: "tread", threw: inside, x: (def.tread.x0 + def.tread.x1) / 2, y: at.y - def.r });
        if (inside) {
          this.eggBody.setTranslation({ x: (def.bucket.x0 + def.bucket.x1) / 2, y: p.y, z: 0 }, true);
          this.eggBody.setLinvel({ x: def.toss.x, y: def.toss.y, z: 0 }, true);
          this.eggBody.setAngvel({ x: 0, y: 0, z: 4 }, true);
          this.eggBody.setLinearDamping(0);
          this.idle = 0;
          this.warned = false;
          this.flungAt = this.time;
          this.softUntil = this.time + SOFT_GRACE * 2;
          this.events.push({ type: "fling", speed: Math.hypot(def.toss.x, def.toss.y) });
        }
      }
      // Through the crates as if they were not there.
      const crates = def.crates;
      if (cask.crates && at.x > crates.x0 - def.r - 0.12 && at.x < crates.x1 + def.r + 0.12 && at.y < crates.y1 + def.r && at.y > crates.y0 - def.r) {
        this.world.removeCollider(cask.crates, true);
        cask.crates = null;
        this.events.push({ type: "smash", x: (crates.x0 + crates.x1) / 2, y: (crates.y0 + crates.y1) / 2 });
      }
      // Over the pit it stops going along, and goes down; and at the bottom it stays.
      // (It is brought to the middle of it: a barrel to one side leaves a notch he would sit in.)
      if (Math.abs(at.x - def.pit.x) < 0.45 && at.y < def.pit.y + def.r + 0.3) {
        cask.body.setLinvel({ x: (def.pit.x - at.x) * 8, y: v.y, z: 0 }, true);
        if (at.y < def.pit.y - 0.3 && Math.abs(v.y) < 0.4) {
          cask.state = "sunk";
          cask.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
          // What is left of the crates comes down across the top of it: boards, flat, from one side of the pit to the other.
          this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(def.pit.w / 2 + 0.12, 0.04, 1).setTranslation(def.pit.x, def.pit.y + 0.03, 0).setFriction(0.8).setRestitution(0),
            this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),
          );
          this.events.push({ type: "bung", x: at.x, y: at.y });
        }
      }
    }
  }

  /** A bale that is no more: burst, or thrown off a brake. */
  private scrap(bale: Bale): void {
    this.soft.delete(bale.collider.handle);
    this.world.removeRigidBody(bale.body);
    this.live.splice(this.live.indexOf(bale), 1);
  }

  /**
   * A flap lets him up and not down. It stands open while he is under it and on his way up,
   * and it is shut again as soon as he is clear above it.
   */
  /**
   * A cistern. The sluice lets the water in; it rises to the lowest way out and runs out there.
   * A bale in it floats, and he can ride one up: at the way out it leans and he rolls off. One
   * with nobody on it does not wait for him: the water takes it out.
   */
  private flood(): void {
    const p = this.eggBody.translation();
    for (const tank of this.cisterns) {
      const def = tank.def;
      if (tank.openAt < 0) {
        let on = false;
        this.world.contactPairsWith(tank.pan, (other) => {
          if (!this.live.some((bale) => bale.collider.handle === other.handle)) return;
          this.world.contactPair(tank.pan, other, (manifold) => {
            if (manifold.numContacts() > 0) on = true;
          });
        });
        if (on) {
          tank.openAt = this.time;
          this.events.push({ type: "sluice", x: def.pan.x, y: def.pan.y });
        }
      }
      if (tank.openAt >= 0 && !tank.wet && this.time >= tank.openAt + RACE) {
        tank.wet = true;
        this.events.push({ type: "water", x: def.tap.x, y: def.tap.y });
      }

      // A bale stood in the mouth of the spout stops it, and stays where it is put.
      const side = def.spout.side;
      const face = side > 0 ? def.x1 : def.x0;
      if (tank.plug && !this.live.includes(tank.plug)) tank.plug = null;
      if (!tank.plug) {
        for (const bale of this.live) {
          if (bale.washed) continue;
          const at = bale.body.translation();
          const v = bale.body.linvel();
          const out = (at.x - face) * side;
          if (out < 0.05 || out > 0.75 || at.y < def.spout.lip || at.y > def.spout.top || Math.hypot(v.x, v.y) > 0.6) continue;
          tank.plug = bale;
          bale.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
          this.events.push({ type: "plug", id: bale.id, x: at.x, y: at.y });
          break;
        }
      }

      // The water comes up to the lowest way out, and no further.
      const out: "spout" | "weir" = tank.plug ? "weir" : "spout";
      const cap = (tank.plug ? def.weir : def.spout.lip) + 0.12;
      const before = tank.level;
      if (tank.wet) tank.level = tank.level < cap ? Math.min(cap, tank.level + RISE * STEP) : Math.max(cap, tank.level - RISE * 2 * STEP);
      tank.rising = tank.level !== before;
      const full = tank.wet && tank.level === cap;
      if (full && tank.over !== out) {
        tank.over = out;
        this.events.push({ type: "spill", over: out, x: out === "weir" ? (side > 0 ? def.x0 : def.x1) : face, y: cap });
      }
      if (!full) tank.over = null;

      // What is afloat: the top one rides at the top of the water, any others under it.
      const inside = this.live.filter((bale) => {
        if (bale.washed || bale === tank.plug) return false;
        const at = bale.body.translation();
        return at.x > def.x0 && at.x < def.x1 && at.y > def.floor && at.y < Math.max(def.weir, tank.level) + BALE_H;
      });
      for (const bale of inside) bale.tank = true;
      const afloat = inside.filter((bale) => bale.body.translation().y < tank.level + 0.35).sort((a, b) => b.body.translation().y - a.body.translation().y);
      const raft = afloat[0];
      const middle = (def.x0 + def.x1) / 2;
      const top = raft ? raft.body.translation().y + BALE_H / 2 : def.floor;
      tank.aboard = raft !== undefined && p.x > def.x0 - 0.2 && p.x < def.x1 + 0.2 && p.y > top - 0.2 && p.y < top + 1.5;
      // Towards the way out is down: he rolls off it and out.
      const way = out === "spout" ? side : -side;
      const lean = full && tank.aboard ? -way * RAFT_LEAN : 0;
      afloat.forEach((bale, under) => {
        const at = bale.body.translation();
        const want = tank.level - FLOAT_DEEP - under * (BALE_H + 0.02);
        if (want < def.floor + BALE_H / 2 + under * (BALE_H + 0.02)) return;
        const turn = turnOf(bale.body.rotation());
        const lay = under === 0 ? lean : 0;
        bale.body.setLinvel({ x: (middle - at.x) * 6, y: Math.max(-3, Math.min(1.6, (want - at.y) * 10)), z: 0 }, true);
        bale.body.setRotation(quat(turn + Math.max(-1.2 * STEP, Math.min(1.2 * STEP, lay - turn))), true);
        bale.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      });

      // Nobody on it, and the water running out past it: after a moment it goes too.
      if (tank.wash) {
        const going = tank.wash;
        if (this.time >= going.until || !this.live.includes(going.bale)) tank.wash = null;
        else going.bale.body.setLinvel({ x: going.way * 2.6, y: this.time < going.until - 0.75 ? 2.2 : 0, z: 0 }, true);
      }
      if (full && tank.aboard) tank.rode = true;
      tank.bob = full && raft && !tank.aboard && !tank.wash && !tank.rode ? tank.bob + STEP : 0;
      if (raft && tank.bob >= WASH) {
        const at = raft.body.translation();
        raft.washed = true;
        raft.tank = false;
        tank.wash = { bale: raft, until: this.time + 1, way };
        tank.bob = 0;
        this.events.push({ type: "wash", id: raft.id, over: out, x: at.x, y: at.y });
      }

      // Water is soft, and an egg does not float: he goes down in it slowly.
      const wading = tank.wet && tank.level > def.floor + 0.15 && p.x > def.x0 && p.x < def.x1 && p.y - 0.45 < tank.level && p.y > def.floor;
      if (wading) this.softUntil = Math.max(this.softUntil, this.time + 0.2);
      const under = wading && p.y < tank.level - 0.05;
      if (under) {
        const v = this.eggBody.linvel();
        this.eggBody.setLinvel({ x: v.x * 0.9, y: Math.max(v.y, -1.5), z: 0 }, true);
        if (!tank.under) this.events.push({ type: "splash", x: p.x, y: tank.level });
      }
      tank.under = under;
    }
  }

  private swing(): void {
    const p = this.eggBody.translation();
    const v = this.eggBody.linvel();
    for (const valve of this.valves) {
      const { x0, y0, x1, y1 } = valve.def;
      const within = p.x > Math.min(x0, x1) - 0.3 && p.x < Math.max(x0, x1) + 0.3;
      const top = y0 + ((y1 - y0) * (p.x - x0)) / (x1 - x0);
      if (!valve.open) {
        if (within && p.y < top - 0.25 && p.y > top - 2.5 && v.y > 2) valve.open = true;
      } else if (!within || p.y > top + 0.66 || (p.y < top - 0.25 && v.y <= 0)) {
        valve.open = false;
      }
      valve.collider.setEnabled(!valve.open);
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
        if (this.phase === "run") this.fling(plank.def, plank.hit > 0 ? (plank.def.throw ?? plank.hit * FLING_GAIN) : coming);
        if (plank.hit > 0 && plank.def.throw !== undefined && plank.lip) {
          // One with a seat that always throws alike stops dead when it has thrown.
          plank.body.setRotation(quat(plank.def.side * tip), true);
          plank.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        plank.hit = 0;
      }
      // (Its groups, not setEnabled: a collider switched off on a moving body keeps its contacts.)
      plank.lip?.setCollisionGroups(this.time > plank.threw + 0.7 ? 0xffffffff : 0);
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
    // Off the end of a cushion with no lip he is already on his way down: the plank comes up past him.
    if (along < 0.1 || along > def.seat + 0.5 || above < 0 || above > 1.6) return;
    // One that always throws alike may throw harder than a falling bale ever could.
    const speed = def.throw ?? Math.min(FLING_TOP, power);
    this.eggBody.setLinvel({ x: -def.side * Math.sin(def.cast) * speed, y: Math.cos(def.cast) * speed, z: 0 }, true);
    this.eggBody.setAngvel({ x: 0, y: 0, z: def.side * Math.min(6, speed * 0.6) }, true);
    this.eggBody.setLinearDamping(0);
    // One that always throws alike throws from the middle of its seat, wherever in it he had got to.
    if (def.throw !== undefined && !def.pass) {
      this.eggBody.setTranslation({ x: def.x + def.side * (def.seat - 0.5) * Math.cos(def.tip), y: p.y, z: 0 }, true);
    }
    // He is going somewhere now: the hook that was coming for him has to start again.
    this.idle = 0;
    this.warned = false;
    this.flungAt = this.time;
    this.softUntil = this.time + SOFT_GRACE * 2;
    this.events.push({ type: "fling", speed });
  }

  /**
   * On a cushion with no lip he goes outward at a crawl, whatever he was doing before: it has
   * him as soon as he is over it, so that one who comes in fast does not skip half of it.
   */
  private wallow(): void {
    const p = this.eggBody.translation();
    for (const mat of this.level.mats) {
      if (p.x < Math.min(mat.x0, mat.x1) - 0.05 || p.x > Math.max(mat.x0, mat.x1) + 0.05) continue;
      const fall = (mat.y1 - mat.y0) / (mat.x1 - mat.x0);
      const above = p.y - (mat.y0 + fall * (p.x - mat.x0));
      if (above < 0.2 || above > 0.85) continue;
      // Towards its low end.
      const way = (mat.y1 > mat.y0 ? -1 : 1) * Math.sign(mat.x1 - mat.x0);
      const v = this.eggBody.linvel();
      this.eggBody.setLinvel({ x: way * mat.crawl, y: Math.min(v.y, 0.5), z: 0 }, true);
      this.eggBody.setAngvel({ x: 0, y: 0, z: (-way * mat.crawl) / EGG.wide }, true);
      this.softUntil = Math.max(this.softUntil, this.time + SOFT_GRACE);
    }
    for (const plank of this.planks) {
      const def = plank.def;
      if (!def.pass) continue;
      const turn = turnOf(plank.body.rotation());
      const dx = p.x - def.x;
      const dy = p.y - def.y;
      const along = (dx * Math.cos(turn) + dy * Math.sin(turn)) * def.side;
      const above = -dx * Math.sin(turn) + dy * Math.cos(turn);
      if (along < -0.05 || along > def.seat + 0.1 || above < 0 || above > 1) continue;
      const v = this.eggBody.linvel();
      this.eggBody.setLinvel({ x: def.side * CRAWL * Math.cos(turn), y: Math.min(v.y, 0.5), z: 0 }, true);
      this.eggBody.setAngvel({ x: 0, y: 0, z: (-def.side * CRAWL) / EGG.wide }, true);
      this.softUntil = Math.max(this.softUntil, this.time + SOFT_GRACE);
    }
  }

  /** What he is touching that is soft, if anything; and which bales. */
  private touching(): { soft: boolean; seat: boolean; cushion: boolean; bales: Bale[] } {
    let soft = false;
    let seat = false;
    let cushion = false;
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
      if (this.cushions.has(other.handle)) cushion = true;
      const bale = this.live.find((candidate) => candidate.collider.handle === other.handle);
      if (bale) bales.push(bale);
    });
    return { soft, seat, cushion, bales };
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
    this.inSeat = held;
    this.eggBody.setLinearDamping(held ? 4 : 0);
    this.eggBody.setAngularDamping(held ? 6 : 0.15);
    // A cushion with no lip to it only slows him: he wallows across it and off the end.
    if (this.time > this.flungAt + 0.5) this.wallow();
    if (jolt < CRACK) return;

    if (this.time <= this.softUntil) {
      this.events.push({ type: "soft", jolt, x: p.x, y: p.y });
      for (const bale of jolt >= BURST ? touch.bales.filter((each) => !each.tank && !each.held) : []) {
        const at = bale.body.translation();
        this.events.push({ type: "burst", id: bale.id, x: at.x, y: at.y });
        this.scrap(bale);
        this.burst += 1;
        this.strawUntil = this.time + STRAW_GRACE;
      }
      return;
    }
    // A bale that burst under him a moment ago: he comes down on the floor in the middle of its straw.
    if (this.time <= this.strawUntil) {
      this.strawUntil = -1;
      this.events.push({ type: "soft", jolt, x: p.x, y: p.y });
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

    // In a cage there is nothing to wait for: the hook is on its way down as he goes in.
    void v;
    if (level.cages.some((cage) => p.x > cage.x0 && p.x < cage.x1 && p.y > cage.y0 && p.y < cage.y1)) {
      if (this.snared === 0) this.events.push({ type: "caged", x: p.x, y: p.y });
      this.snared += STEP;
      if (this.snared >= CAGE) {
        this.phase = "caught";
        this.events.push({ type: "caught" });
        return;
      }
    } else {
      this.snared = 0;
    }

    // Standing still, or rocking on the spot: either way he is getting nowhere. A door that is
    // carrying him round is taking him somewhere, however little he moves in it.
    const carried =
      this.gates.some((gate) => gate.state === "turning" && Math.hypot(p.x - gate.def.x, p.y - gate.def.y) < gate.def.r) ||
      this.cisterns.some((tank) => tank.aboard && tank.rising) ||
      this.hoists.some((hoist) => hoist.moving && (hoist.aboard || hoist.over));
    // In a dumbwaiter's car, or in the bucket under a barrel's run, the hook is as slow to come as it is to a see-saw's seat.
    this.waiting =
      this.inSeat ||
      this.hoists.some((hoist) => hoist.aboard) ||
      this.casks.some((cask) => p.x > cask.def.bucket.x0 && p.x < cask.def.bucket.x1 && p.y > cask.def.bucket.y0 && p.y < cask.def.bucket.y1);
    const still = !carried && Math.hypot(p.x - this.anchor.x, p.y - this.anchor.y) < STILL;
    if (!still) this.anchor = { x: p.x, y: p.y };
    this.idle = still ? this.idle + STEP : 0;
    if (!still) this.warned = false;
    if (this.idle >= (this.waiting ? SEAT_WARN : IDLE_WARN) && !this.warned) {
      this.warned = true;
      this.events.push({ type: "warn" });
    }
    if (this.idle >= (this.waiting ? SEAT_IDLE : IDLE)) {
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
