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
export const DOOR_TURN = Math.PI / 3;
const QUARTER = Math.PI / 2;
/** How many times round it will carry him before the clockwork has run down. */
export const DOOR_LAPS = 3;
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
  wheels: WheelDef[];
  doors: DoorDef[];
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
    doors: level.doors.map((door) => ({ ...door, y: door.y - by, pan: { ...door.pan, y: door.pan.y - by } })),
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
  pits: [
    { x: GAP.x, y: rackAt(GAP.x) - GAP_DEEP, w: GAP.w, pan: rackAt(GAP.x) - GAP_DEEP - GAP.hang, hung: true },
    { x: DRAIN.x, y: DRAIN_Y - BALE_H, w: DRAIN.w, pan: FLOOR + 0.7, hung: false },
  ],
  cages: [{ x0: CAGE_BOX.x0, x1: CAGE_BOX.x1, y0: CAGE_BOX.floor, y1: TIP.y - 0.2 }],
  sockets: [
    { x: GAP.x, y0: rackAt(GAP.x) - 1.2, y1: rackAt(GAP.x) + 1.4, reach: 1, seat: { y: rackAt(GAP.x) - GAP_DEEP / 2 + 0.08, turn: RACK_TURN } },
    // Over the gold end, a bale is always let go from the same height: here it is when, not how hard.
    { x: TIP.x - 0.82, y0: TIP.y - 0.3, y1: TIP.y + 3.1, reach: 0.9, seat: { y: TIP.y + 0.8, turn: -TIP.tip } },
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
const TURN = { x: 0, y: 26.3, r: 1.5 };
const DRUM = TURN.r + 0.06 + DOOR_WALL;
/** The shelf he comes in on, which falls to the right and stops at the slot in the top of the drum. */
const LEAD = { x: -DRUM * Math.sin((DOOR_SLOT * Math.PI) / 180) - 0.02, y: TURN.y + DRUM + 0.2 };
const leadAt = (x: number): number => LEAD.y + 0.36 * (LEAD.x - x);
/** The shelves under the two side doors: each begins at the lip of its shutter and falls away from the drum. */
const SILL = { x: 1.1, y: TURN.y - 1.32, end: 2.7 };
const sillAt = (x: number): number => SILL.y - 0.36 * (Math.abs(x) - SILL.x);
/** The pan on the brake lever, up to the right of the drum. */
const BRAKE = { x: 2.75, y: 28.3, w: 1.5 };
const SPOUT = { x: 0.4, w: 1.1 };
const SPOUT_WELL = { x0: SPOUT.x - PLUG.well / 2, x1: SPOUT.x + PLUG.well / 2 };

/**
 * The fourth screen, written as if it stood where the first does. He comes in through the hatch
 * at the top left and drops into a revolving door, which begins to turn and carries him round
 * past three shutters. A bale on the brake stops it at the next quarter, and he comes out of
 * whichever he is against: the right, early, on to a shelf with a long drop and a hole after it;
 * the bottom, into a pan; or the left, late, with nothing between him and the nest but air.
 * So it is one bale for whoever can wait, and three for whoever cannot. Four bales.
 */
const BUTTERY_HERE: LevelDef = {
  key: "buttery",
  name: "The Buttery",
  ends: "nest",
  hatch: true,
  left: -4,
  right: 4,
  top: 31,
  bottom: 13,
  start: { x: -3.5, y: 30.2 },
  shove: 3,
  bales: 4,
  spare: 2,
  blocks: [
    box(-4.8, 12.6, -4, 31.4, "wall"),
    box(4, 12.6, 4.8, 31.4, "wall"),
    box(-4, 13.4, 4, FLOOR, "stone"),

    // The shelf under the hatch, and the board across the slot that brings him down into it.
    slab(-4, leadAt(-4), LEAD.x, LEAD.y, 0.3, "wood"),
    box(0.6, TURN.y + DRUM - 0.1, 0.75, TURN.y + DRUM + 1.5, "board"),
    // The shelves under the side doors. The one on the left is short: beyond it there is nothing.
    slab(SILL.x, sillAt(SILL.x), SILL.end, sillAt(SILL.end), 0.3, "wood"),
    slab(-SILL.end, sillAt(SILL.end), -SILL.x, sillAt(SILL.x), 0.3, "wood"),
    // The tray under the bottom door.
    box(-1.05, TURN.y - DRUM - 1.05, 1.05, TURN.y - DRUM - 0.85, "iron"),

    // The bottom floor with the hole in it, and the flue to the pan.
    slab(SPOUT_WELL.x1, baseAt(SPOUT_WELL.x1), 4, baseAt(4), 0.5, "stone"),
    slab(SPOUT_WELL.x0 - 0.12, baseAt(SPOUT_WELL.x0 - 0.12) - PLUG_DEEP, SPOUT.x - SPOUT.w / 2, baseAt(SPOUT.x - SPOUT.w / 2) - PLUG_DEEP, 0.4, "stone"),
    slab(SPOUT.x + SPOUT.w / 2, baseAt(SPOUT.x + SPOUT.w / 2) - PLUG_DEEP, SPOUT_WELL.x1 + 0.12, baseAt(SPOUT_WELL.x1 + 0.12) - PLUG_DEEP, 0.4, "stone"),
    slab(-1.9, baseAt(-1.9), SPOUT_WELL.x0 - 0.04, baseAt(SPOUT_WELL.x0 - 0.04), 0.5, "stone"),
    box(SPOUT.x - SPOUT.w / 2 - 0.25, FLOOR + 1.9, SPOUT.x - SPOUT.w / 2, baseAt(SPOUT.x) - PLUG_DEEP - 0.7, "iron"),
    box(SPOUT.x + SPOUT.w / 2, FLOOR + 1.9, SPOUT.x + SPOUT.w / 2 + 0.25, baseAt(SPOUT.x) - PLUG_DEEP - 0.5, "iron"),

    // The Empress Hen's nest, bottom left, with straw banked high up the wall behind it.
    box(-4, FLOOR, -1.5, FLOOR + 0.5, "nest", true),
    box(-1.5, FLOOR, -1.2, FLOOR + 1, "nest", true),
    box(-4, FLOOR, -3.7, FLOOR + 3.8, "nest", true),
  ],
  seesaws: [],
  wheels: [],
  doors: [{ x: TURN.x, y: TURN.y, r: TURN.r, pan: BRAKE }],
  pits: [
    { x: TURN.x, y: TURN.y - DRUM + 0.05, w: 2.1, pan: TURN.y - DRUM - 0.8, hung: true },
    { x: SPOUT.x, y: baseAt(SPOUT.x) - PLUG_DEEP, w: SPOUT.w, pan: FLOOR + 0.7, hung: false },
  ],
  cages: [],
  sockets: [
    { x: BRAKE.x, y0: BRAKE.y - 0.7, y1: 31, reach: 1.25, seat: { y: BRAKE.y + BALE_H / 2 + 0.02, turn: 0 } },
    { x: MILL_CATCH, y0: baseAt(MILL_CATCH) - 0.4, y1: baseAt(MILL_CATCH) + 2.8, reach: 0.95 },
    { x: SPOUT.x, y0: baseAt(SPOUT.x) - 1.2, y1: baseAt(SPOUT.x) + 1.4, reach: 1, seat: { y: baseAt(SPOUT.x) - PLUG_DEEP / 2 + 0.08, turn: SINK_TURN } },
  ],
  nest: { x0: -3.7, x1: -1.5, y0: FLOOR + 0.4, y1: FLOOR + 1.9 },
};

export const BUTTERY: LevelDef = lowered(BUTTERY_HERE, STOREY * 3);

/** The house, from the top down. Each room is a game of its own; the roost between two is a waypoint. */
export const LEVELS: LevelDef[] = [LARDER, SCULLERY, MILLROOM, BUTTERY];

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
  | { type: "port"; port: Port; x: number; y: number }
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
    target: number;
    braked: boolean;
    open: Port | null;
  }> = [];
  /** The padded seats: he sinks into one and stays put. And the cushions he only wallows across. */
  private readonly seats = new Set<number>();
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
      this.soft.add(pad.handle);
      if (def.pass) {
        // Nothing to keep him on it: he goes off the low end unless he is thrown first.
        this.cushions.add(pad.handle);
      } else {
        const lip = this.world.createCollider(
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
      this.planks.push({ body, def, hit: 0, up: false, spin: 0 });
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
      this.world.createCollider(RAPIER.ColliderDesc.ball(WHEEL_BALL).setDensity(WHEEL_DENSITY).setCollisionGroups(0), body);
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
        for (const port of ["right", "bottom", "left"] as const) {
          if (mid > SHUTTER[port][0] && mid < SHUTTER[port][1]) shutters[port].push(stave);
        }
      }
      const pan = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.pan.w / 2, 0.05, 0.6).setTranslation(def.pan.x, def.pan.y - 0.05, 0).setFriction(1).setRestitution(0),
        ground,
      );
      this.gates.push({ body, def, pan, shutters, state: "still", turned: 0, target: -1, braked: false, open: null });
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
  get doors(): Array<Pose & { def: DoorDef; turning: boolean; braked: boolean; open: Port | null; stopped: boolean }> {
    return this.gates.map((gate) => ({
      x: gate.def.x,
      y: gate.def.y,
      turn: 0 - gate.turned,
      def: gate.def,
      turning: gate.state === "turning",
      braked: gate.braked,
      open: gate.open,
      stopped: gate.state === "stopped",
    }));
  }

  /** He is in a cage. */
  get caged(): boolean {
    return this.snared > 0;
  }

  /** How far down the Queen's hook has come for him: 0 not let down yet, 1 it has him. */
  get hook(): number {
    if (this.phase === "caught") return 1;
    if (this.phase !== "run") return 0;
    const patience = this.inSeat ? SEAT_IDLE : IDLE;
    const warn = this.inSeat ? SEAT_WARN : IDLE_WARN;
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
    return this.world.intersectionWithShape({ x, y, z: 0 }, quat(turn), shape) === null;
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
    this.world.step();
    this.time += STEP;
    this.weigh();
    this.sluice();
    this.brake();
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
        plank.hit = Math.max(plank.hit, bale.fall, 0.01);
        // A see-saw that is to be timed goes over at once, wherever on it he is sitting.
        if (plank.def.pass) plank.body.setAngvel({ x: 0, y: 0, z: plank.def.side * SNAP }, true);
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
        const port = PORTS[Math.round(gate.target / QUARTER) % 4]!;
        gate.open = port;
        if (port !== "top") for (const stave of gate.shutters[port]) stave.setEnabled(false);
        this.events.push({ type: "port", port, x: gate.def.x, y: gate.def.y });
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
          gate.target = Math.max(QUARTER, Math.ceil((gate.turned + 0.03) / QUARTER) * QUARTER);
          this.events.push({ type: "brake", x: gate.def.pan.x, y: gate.def.pan.y });
        }
      }
      // Left to itself the clockwork runs down, and it runs down with him at the top.
      if (!gate.braked && gate.turned >= DOOR_LAPS * 4 * QUARTER - 0.03) {
        gate.braked = true;
        gate.target = DOOR_LAPS * 4 * QUARTER;
      }
      if (gate.state === "still" && this.phase === "run" && Math.hypot(p.x - gate.def.x, p.y - gate.def.y) < 0.95) {
        gate.state = "turning";
        this.events.push({ type: "turning", x: gate.def.x, y: gate.def.y });
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
        if (this.phase === "run") this.fling(plank.def, plank.hit > 0 ? (plank.def.throw ?? plank.hit * FLING_GAIN) : coming);
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
    // Off the end of a cushion with no lip he is already on his way down: the plank comes up past him.
    if (along < 0.1 || along > def.seat + 0.5 || above < 0 || above > 1.6) return;
    const speed = Math.min(FLING_TOP, power);
    this.eggBody.setLinvel({ x: -def.side * Math.sin(def.cast) * speed, y: Math.cos(def.cast) * speed, z: 0 }, true);
    this.eggBody.setAngvel({ x: 0, y: 0, z: def.side * Math.min(6, speed * 0.6) }, true);
    this.eggBody.setLinearDamping(0);
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
      for (const bale of jolt >= BURST ? touch.bales : []) {
        const at = bale.body.translation();
        this.events.push({ type: "burst", id: bale.id, x: at.x, y: at.y });
        this.soft.delete(bale.collider.handle);
        this.world.removeRigidBody(bale.body);
        this.live.splice(this.live.indexOf(bale), 1);
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
    const carried = this.gates.some((gate) => gate.state === "turning" && Math.hypot(p.x - gate.def.x, p.y - gate.def.y) < gate.def.r);
    const still = !carried && Math.hypot(p.x - this.anchor.x, p.y - this.anchor.y) < STILL;
    if (!still) this.anchor = { x: p.x, y: p.y };
    this.idle = still ? this.idle + STEP : 0;
    if (!still) this.warned = false;
    if (this.idle >= (this.inSeat ? SEAT_WARN : IDLE_WARN) && !this.warned) {
      this.warned = true;
      this.events.push({ type: "warn" });
    }
    if (this.idle >= (this.inSeat ? SEAT_IDLE : IDLE)) {
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
