/**
 * The hill village, street by street. A street runs downhill along -Z: `d` is horizontal
 * distance from its crest, `x` is across it (positive is the player's right).
 *
 * A street is one contraption: something to set off, a chain that follows, and a moment to
 * arrive. Streets are ridden one after another: the gate at the bottom of one is the gate at
 * the top of the next, and the cart goes through with whatever it has left.
 */
export interface Piece {
  d0: number;
  d1: number;
  y0: number;
  y1: number;
  /** Where the street does not run from kerb to kerb: what is left of it, from x0 to x1. */
  x0?: number;
  x1?: number;
}

/**
 * The bell tower stands in the canal on what is left of the bridge, leaning out over the water
 * and held back by one rope. Let go, it falls away from the cart and lies from bank to bank:
 * its uphill face is the new bridge.
 */
export interface BellTowerDef {
  /** The near bank: the tower's foot is hinged here. */
  d: number;
  x0: number;
  x1: number;
  /** Foot to eaves. Exactly the span from bank to bank, so the fallen tower lies flush. */
  height: number;
  thick: number;
  /** How far it leans while the rope holds, in radians from upright. */
  lean: number;
  /** Radians from upright when it lies across the water. */
  rest: number;
}

export interface MobDef {
  id: number;
  rank: number;
  d: number;
  x: number;
  /** One of a shield wall: both hands on the biggest pot lid in the kitchen, so nothing is thrown. */
  shield?: boolean;
}

export type ClutterKind = "pot" | "barrel" | "coop" | "queen";

/**
 * Something in the village a thrown egg can set off: a flower basket hung over the street, a
 * barrel or a hen coop on the kerb, the Queen herself. None of it is needed to get home.
 */
export interface ClutterDef {
  id: number;
  kind: ClutterKind;
  d: number;
  x: number;
  /** Height above the street. */
  up: number;
  /** Cooks this close are knocked flat when it goes. */
  bowl: number;
  /** Cooks this close dive for the gutter. */
  fright: number;
}

/** Something his own people have left in the road: a basket of eggs, or a pyramid of shot. */
export interface PickupDef {
  id: number;
  kind: "eggs" | "shot";
  d: number;
  x: number;
}

/**
 * A powder keg. In the road it is a trap, and goes off when the cart comes near; on the kerb it
 * is one link of a powder train. Any keg goes off when something bursts beside it, and takes
 * its neighbours with it a moment later.
 */
export interface KegDef {
  id: number;
  d: number;
  x: number;
  /** Height of its foot above the street: 0 in the road, the kerb's height on the kerb. */
  up: number;
  /** In the road, with a slow match in it: it goes off when the cart comes near. */
  trap: boolean;
  /** The powder wagon: a much bigger bang, and the only thing that will shift a barricade. */
  big: boolean;
  /**
   * A charge with a long match: an egg lights it instead of bursting it, and it burns this
   * many seconds before it goes. Time enough to be somewhere else, or somewhere useful.
   */
  fuse?: number;
}

/**
 * The conduit cistern at the top of a street. Shoot it and what it holds goes down the road:
 * every keg it reaches is soaked and every cook it reaches is carried off, as far as it runs.
 */
export interface CisternDef {
  d: number;
  x: number;
  /** How far down the street its water gets. */
  reach: number;
}

/**
 * The windmill at the top of a street, with a millstone swung out on its hoist. Shoot the hoist
 * and the stone comes down in the road and goes on down the hill by itself, in one lane, as far
 * as there is street under it.
 */
export interface MillDef {
  d: number;
  /** The lane the stone runs in. */
  x: number;
  /** How high the stone hangs over the street. */
  drop: number;
}

/** A barricade across the whole street. A round, the powder wagon or a millstone will move it. */
export interface WallDef {
  id: number;
  d: number;
  height: number;
}

export interface CourseDef {
  name: string;
  /** Drivable width between the kerbs. */
  width: number;
  /** Street pieces in order. A space between one piece and the next is open water. */
  pieces: Piece[];
  tower: BellTowerDef | null;
  /** The capstan on the quay that holds the tower's rope. Shoot it and the tower goes. */
  windlass: { d: number; x: number } | null;
  /** The cheesemonger's wain, chocked on the far bank. Knock the chock out and it runs away down its side of the street. */
  wain: { d: number; x: number } | null;
  /** The well the runaway wain ends against. */
  well: { d: number; x: number } | null;
  /** The dyer's woolsacks, piled at the bottom of the bell's side of the street: where it stops. */
  sacks: { d: number; x: number } | null;
  /** The Queen's kitchen mob, across the street in ranks. */
  mob: MobDef[];
  clutter: ClutterDef[];
  pickups: PickupDef[];
  kegs: KegDef[];
  walls: WallDef[];
  mill: MillDef | null;
  cistern: CisternDef | null;
  /** Straw laid deep on the far side of a leap: a cart that comes down in it comes down soft. */
  straw: { d0: number; d1: number } | null;
  /** Crossing this line ends the street: the town gate, or on the last street the roost yard. */
  finish: number;
  /** Where the Empress Hen sits. Null when a gate leads on to the next street. */
  roost: number | null;
}

const SLOPE = 0.14;
const HALF = 5;
const KERB = HALF + 0.3;
const KERB_TOP = 0.75;
const HUNG = HALF - 0.6;

type Loose<T> = Omit<T, "id">;
const numbered = <T>(all: Array<Loose<T>>): T[] => all.map((one, id) => ({ id, ...one }) as T);

const pot = (d: number, x: number): Loose<ClutterDef> => ({ kind: "pot", d, x, up: 3.4, bowl: 1.3, fright: 0 });
const barrel = (d: number, x: number): Loose<ClutterDef> => ({ kind: "barrel", d, x, up: 1.55, bowl: 0, fright: 5.5 });
const coop = (d: number, x: number): Loose<ClutterDef> => ({ kind: "coop", d, x, up: 1.4, bowl: 0, fright: 5.5 });
const trap = (d: number, x: number): Loose<KegDef> => ({ d, x, up: 0, trap: true, big: false });
const link = (d: number, x: number): Loose<KegDef> => ({ d, x, up: KERB_TOP, trap: false, big: false });
/** A charge in the road with a long match in it. */
const charge = (d: number, x: number, fuse = 2.4): Loose<KegDef> => ({ d, x, up: 0, trap: false, big: false, fuse });
const ranks = (rows: Array<{ d: number; xs: number[]; shield?: boolean }>): MobDef[] => {
  let id = 0;
  return rows.flatMap((row, rank) => row.xs.map((x) => (row.shield ? { id: id++, rank, d: row.d, x, shield: true } : { id: id++, rank, d: row.d, x })));
};

interface Laid {
  pieces: Piece[];
  /** Where the hill runs out and the level ground at the bottom begins. */
  foot: number;
}

/**
 * Lay a street as runs of [length, slope], with a stretch of open water where one is named.
 * The last run is the ground at the bottom.
 */
function lay(runs: Array<[number, number] | [number, number, number, number] | { water: number; fall: number }>): Laid {
  const pieces: Piece[] = [];
  let d = -14;
  let y = 0;
  let foot = 0;
  for (const run of runs) {
    if (Array.isArray(run)) {
      const [length, slope, x0, x1] = run;
      foot = d;
      pieces.push({ d0: d, d1: d + length, y0: y, y1: y - length * slope, ...(x0 !== undefined && x1 !== undefined ? { x0, x1 } : {}) });
      d += length;
      y -= length * slope;
    } else {
      d += run.water;
      y -= run.water * run.fall;
    }
  }
  return { pieces, foot };
}

// ---------------------------------------------------------------- Bell Tower Street

const LIP = 66;
const CANAL = 12;
const FAR = LIP + CANAL;

const BELL = lay([
  [22, 0.01], // the crest: she crawls over it, and the whole street is in view
  [LIP + 14 - 22, SLOPE], // down to the canal
  { water: CANAL, fall: SLOPE }, // the bridge is gone; the far bank carries the street on at the same fall
  [58, SLOPE],
  [8, 0.07],
  [46, 0.02], // out through the town gate
]);

const BELL_TOWER_STREET: CourseDef = {
  name: "Bell Tower Street",
  width: HALF * 2,
  pieces: BELL.pieces,
  tower: {
    d: LIP,
    x0: -5.2,
    x1: 0.8,
    height: Math.hypot(CANAL, CANAL * SLOPE),
    thick: 3,
    lean: 0.14,
    rest: Math.PI / 2 + Math.atan(SLOPE),
  },
  windlass: { d: LIP - 1.2, x: 3 },
  wain: { d: FAR + 5, x: 3.3 },
  well: { d: FAR + 54, x: 3.3 },
  sacks: { d: FAR + 46, x: -2.6 },
  mob: ranks([0, 1, 2].map((rank) => ({ d: FAR + 16 + rank * 8, xs: [-4, -2, 0, 2, 4] }))),
  clutter: numbered<ClutterDef>([
    // Down to the water: nothing here is in his way, and all of it is fair game.
    pot(20, HUNG),
    barrel(28, -KERB),
    pot(36, -HUNG),
    coop(46, KERB),
    pot(52, HUNG),
    barrel(57, -KERB),
    // The far street: each of these is over or beside somebody.
    { kind: "queen", d: FAR + 10, x: HALF + 1.6, up: 4.6, bowl: 0, fright: 0 },
    pot(FAR + 16, HUNG),
    barrel(FAR + 20, KERB),
    pot(FAR + 24, -HUNG),
    coop(FAR + 28, -KERB),
    pot(FAR + 32, HUNG),
  ]),
  pickups: numbered<PickupDef>([
    { kind: "eggs", d: 24, x: 3.4 },
    { kind: "shot", d: 44, x: 3.5 },
    { kind: "eggs", d: FAR + 62, x: 0 },
  ]),
  // One of the Queen's little surprises, at the bottom of the wain's side of the street.
  kegs: numbered<KegDef>([trap(FAR + 40, 3.6)]),
  walls: [],
  mill: null,
  cistern: null,
  straw: null,
  finish: BELL.foot + 12,
  roost: null,
};

// ---------------------------------------------------------------- Powder Row

const WAGON = 90;

const POWDER = lay([
  [22, 0.03], // in under the gate, and the Queen's powder store laid out below
  [128 + 14 - 22, 0.13],
  [8, 0.07],
  [40, 0], // out through the town gate
]);

/**
 * The Queen's powder is stacked all down one kerb, a keg every few yards, as far as the wagon
 * drawn up against her barricade. Any one of them will set the rest going, a keg at a time,
 * down the hill and up it. The wagon takes the barricade with it. So will it take the cart.
 */
const POWDER_ROW: CourseDef = {
  name: "Powder Row",
  width: HALF * 2,
  pieces: POWDER.pieces,
  tower: null,
  windlass: null,
  wain: null,
  well: null,
  sacks: null,
  mob: ranks([
    { d: 64, xs: [-4, -2] }, // minding the powder
    { d: 106, xs: [-4, -2, 0, 2, 4] },
    { d: 114, xs: [-4, -2, 0, 2, 4] },
  ]),
  clutter: numbered<ClutterDef>([pot(18, HUNG), barrel(26, KERB), coop(40, KERB), pot(56, HUNG), barrel(76, KERB), pot(102, -HUNG), coop(110, KERB), pot(118, HUNG), barrel(122, -KERB)]),
  pickups: numbered<PickupDef>([
    { kind: "eggs", d: 12, x: -2.6 },
    { kind: "shot", d: 40, x: 2.8 },
    { kind: "eggs", d: 99, x: 0.5 },
  ]),
  kegs: numbered<KegDef>([
    // The powder train down the left kerb, and the wagon it ends at.
    ...Array.from({ length: 11 }, (_, index) => link(36 + index * 5, -KERB)),
    { d: WAGON, x: -2.4, up: 0, trap: false, big: true },
    // And the ones left in the road for him.
    trap(30, 2.6),
    trap(52, 0.8),
    trap(72, 3.4),
    trap(104, -1.5),
    trap(116, 2.5),
  ]),
  walls: [{ id: 0, d: WAGON + 3.2, height: 2.8 }],
  mill: null,
  cistern: null,
  straw: null,
  finish: POWDER.foot + 12,
  roost: null,
};

// ---------------------------------------------------------------- Pudding Lane

const PUDDING = lay([
  [30, 0.03], // in under the gate, with time to look at the cistern standing over the street
  [116, 0.13],
  [8, 0.07],
  [40, 0], // out through the town gate
]);

/**
 * Fire or water. The lane is sown with the Queen's kegs and held by her kitchen, and at the top
 * of it stands the cistern the whole quarter drinks from. Let the water go and it does for the
 * powder and the cooks alike, as far as it runs: the kegs in the road, the kitchen, and the one
 * charge that could have been useful. Keep the powder dry and it has to be got past, but the
 * charge at the bottom of the lane, lit and left behind, sends a cart through a shield wall
 * like a ball through skittles. Neither way is the right one.
 */
const PUDDING_LANE: CourseDef = {
  name: "Pudding Lane",
  width: HALF * 2,
  pieces: PUDDING.pieces,
  tower: null,
  windlass: null,
  wain: null,
  well: null,
  sacks: null,
  mob: ranks([
    { d: 66, xs: [-4, -2, 0, 2, 4] },
    // The shield wall: shoulder to shoulder, and no way round.
    { d: 115, xs: [-4.4, -2.6, -0.9, 0.9, 2.6, 4.4], shield: true },
    { d: 125, xs: [-3.5, -1.75, 0, 1.75, 3.5] },
  ]),
  clutter: numbered<ClutterDef>([pot(34, -HUNG), barrel(42, -KERB), coop(56, KERB), pot(66, HUNG), barrel(72, -KERB), pot(86, -HUNG), coop(100, -KERB), pot(115, HUNG), barrel(120, KERB), pot(125, -HUNG)]),
  pickups: numbered<PickupDef>([
    { kind: "eggs", d: 12, x: 0 },
    { kind: "shot", d: 94, x: -2.4 },
    { kind: "eggs", d: 95, x: 2.4 },
  ]),
  kegs: numbered<KegDef>([
    // Sown left and right by turns, so that there is a way to weave through for whoever looks for it.
    trap(38, -1.8),
    trap(48, 2.4),
    trap(58, -2.2),
    trap(74, 2.4),
    trap(85, -1.6),
    // And one with a long match, where the lane straightens for the shield wall.
    charge(105, 0),
  ]),
  walls: [],
  mill: null,
  // Its water gets as far as the charge and no further: the shield wall stays dry, and standing.
  cistern: { d: 28, x: KERB + 1.1, reach: 80 },
  straw: null,
  finish: PUDDING.foot + 12,
  roost: null,
};

// ---------------------------------------------------------------- Miller's Leap

const QUAY = 118;
const STUMP = 7;
const GORGE = 13;
const STONE_LANE = -3;

const LEAP = lay([
  [22, 0.03], // in under the gate, with the windmill on the left and its stone hung out over the road
  [QUAY + 14 - 22 - 8 - 28, 0.13],
  [28, 0.2], // the plunge to the water
  [8, 0.04], // the quay
  [STUMP, -0.09, -1, HALF], // what is left of the bridge: the right-hand half of its first arch, and it climbs
  { water: GORGE, fall: 5 / GORGE }, // the gorge: too wide for a cart by itself, and the far bank well below
  [14, 0.22], // the far bank falls away under him, deep in straw
  [8, 0.08],
  [44, 0], // the roost yard
]);

/**
 * The bridge over the gorge is down, all but the right-hand half of its first arch, which makes
 * a ramp for anything going fast enough. The Queen has a barricade across the hill and her
 * kitchen in front of it. The miller's stone, let go, runs down the left of the street through
 * all of it and off the quay into the gorge. The cart has to keep up, keep right, and jump:
 * and the gorge is wider than a cart can jump, unless the charge on the quay goes off behind it.
 */
const MILLERS_LEAP: CourseDef = {
  name: "Miller's Leap",
  width: HALF * 2,
  pieces: LEAP.pieces,
  tower: null,
  windlass: null,
  wain: null,
  well: null,
  sacks: null,
  mob: ranks([
    { d: 52, xs: [-4, -2, 0, 2, 4] },
    { d: 68, xs: [-4, -2, 2, 4] },
    { d: 84, xs: [-4, -2, 0, 2, 4] },
  ]),
  clutter: numbered<ClutterDef>([pot(30, HUNG), barrel(38, KERB), coop(47, KERB), pot(52, HUNG), barrel(63, KERB), pot(68, HUNG), coop(79, KERB), pot(84, HUNG), barrel(100, KERB)]),
  pickups: numbered<PickupDef>([
    // Nobody is sent at the mill with an empty gun: without one round there is no way down.
    { kind: "shot", d: 7, x: 0.6 },
    { kind: "eggs", d: 34, x: 2.4 },
    // In the stone's wake, for whoever follows it down.
    { kind: "shot", d: 58, x: STONE_LANE },
    { kind: "eggs", d: 86, x: STONE_LANE + 0.4 },
  ]),
  kegs: numbered<KegDef>([
    // In the stone's road: it will see to these.
    trap(44, STONE_LANE),
    trap(60, STONE_LANE + 0.4),
    trap(76, STONE_LANE - 0.4),
    // And in his.
    trap(46, 2.6),
    trap(74, 1.2),
    trap(101, 3.6),
    // The Queen's sappers meant this one for the bridge. It will do for getting over what is left of it.
    charge(QUAY - 4, 2),
  ]),
  walls: [{ id: 0, d: 92, height: 2.8 }],
  mill: { d: 20, x: STONE_LANE, drop: 5.5 },
  cistern: null,
  straw: { d0: QUAY + STUMP + GORGE, d1: QUAY + STUMP + GORGE + 22 },
  finish: LEAP.foot + 6,
  roost: LEAP.foot + 32,
};

/** The streets of a run, in the order they are ridden. */
export const STREETS: CourseDef[] = [BELL_TOWER_STREET, POWDER_ROW, PUDDING_LANE, MILLERS_LEAP];
export const COURSE: CourseDef = BELL_TOWER_STREET;

/** How much of the street a piece carries, from x0 to x1. */
export function spanOf(course: CourseDef, piece: Piece): { x0: number; x1: number } {
  return { x0: piece.x0 ?? -course.width / 2, x1: piece.x1 ?? course.width / 2 };
}

/** The piece under `d`; over the water, the piece just left. */
export function pieceAt(course: CourseDef, d: number): Piece {
  const pieces = course.pieces;
  for (let index = pieces.length - 1; index >= 0; index -= 1) {
    if (d >= pieces[index]!.d0) return pieces[index]!;
  }
  return pieces[0]!;
}

/** Height of the street at `d`. */
export function heightAt(course: CourseDef, d: number): number {
  const piece = pieceAt(course, d);
  const k = Math.min(1, Math.max(0, (d - piece.d0) / (piece.d1 - piece.d0)));
  return piece.y0 + (piece.y1 - piece.y0) * k;
}

/** Slope (drop per metre forward) at `d`. */
export function slopeAt(course: CourseDef, d: number): number {
  const piece = pieceAt(course, d);
  return (piece.y0 - piece.y1) / (piece.d1 - piece.d0);
}

/** The stretches with no street under them. */
export function chasms(course: CourseDef): Array<{ d0: number; d1: number; y: number }> {
  const out: Array<{ d0: number; d1: number; y: number }> = [];
  for (let index = 1; index < course.pieces.length; index += 1) {
    const before = course.pieces[index - 1]!;
    const after = course.pieces[index]!;
    if (after.d0 - before.d1 > 0.01) out.push({ d0: before.d1, d1: after.d0, y: Math.min(before.y1, after.y0) });
  }
  return out;
}

export function courseEnd(course: CourseDef): number {
  return course.pieces[course.pieces.length - 1]!.d1;
}
