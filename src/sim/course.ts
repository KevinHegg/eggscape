/**
 * A street of the hill village, running downhill along -Z. `d` is horizontal distance from the
 * crest, `x` is across the street (positive is the player's right).
 *
 * A street is one contraption: something to set off, a chain that follows, and a moment to
 * arrive. This one is Bell Tower Street.
 */
export interface Piece {
  d0: number;
  d1: number;
  y0: number;
  y1: number;
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
}

export type ClutterKind = "pot" | "barrel" | "coop" | "queen";

/**
 * Something in the village a slung stone can set off: a flower basket hung over the street, a
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

export interface CourseDef {
  name: string;
  /** Drivable width between the kerbs. */
  width: number;
  /** Street pieces in order. A space between one piece and the next is open water. */
  pieces: Piece[];
  tower: BellTowerDef;
  /** The capstan on the quay that holds the tower's rope. Shoot it and the tower goes. */
  windlass: { d: number; x: number };
  /** The cheesemonger's wain, chocked on the far bank. Knock the chock out and it runs away down its side of the street. */
  wain: { d: number; x: number };
  /** The well the runaway wain ends against. */
  well: { d: number; x: number };
  /** The dyer's woolsacks, piled at the bottom of the bell's side of the street: where it stops. */
  sacks: { d: number; x: number };
  /** The Queen's kitchen mob, across the far street in ranks. */
  mob: MobDef[];
  clutter: ClutterDef[];
  /** Crossing this line is home. */
  finish: number;
  /** Where the Empress Hen sits. */
  roost: number;
}

const SLOPE = 0.14;
const LIP = 66;
const CANAL = 12;

function layStreet(): { pieces: Piece[]; yard: number } {
  const pieces: Piece[] = [];
  let d = -14;
  let y = 0;
  const run = (length: number, slope: number): void => {
    pieces.push({ d0: d, d1: d + length, y0: y, y1: y - length * slope });
    d += length;
    y -= length * slope;
  };
  run(22, 0.01); // the crest: she crawls over it, and the whole street is in view
  run(LIP - d, SLOPE); // down to the canal
  d += CANAL; // the bridge is gone
  y -= CANAL * SLOPE; // the far bank carries the street on at the same fall
  run(58, SLOPE);
  run(8, 0.07);
  const yard = d;
  run(56, 0); // the roost yard
  return { pieces, yard };
}

const STREET = layStreet();
const FAR = LIP + CANAL;

const HALF = 5;
const KERB = HALF + 0.3;
const HUNG = HALF - 0.6;

/** Baskets hang out over the edge of the street; barrels and coops stand on the kerb. */
function layClutter(): ClutterDef[] {
  const pot = (d: number, x: number): Omit<ClutterDef, "id"> => ({ kind: "pot", d, x, up: 3.4, bowl: 1.3, fright: 0 });
  const barrel = (d: number, x: number): Omit<ClutterDef, "id"> => ({ kind: "barrel", d, x, up: 1.55, bowl: 0, fright: 5.5 });
  const coop = (d: number, x: number): Omit<ClutterDef, "id"> => ({ kind: "coop", d, x, up: 1.4, bowl: 0, fright: 5.5 });
  const all: Array<Omit<ClutterDef, "id">> = [
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
  ];
  return all.map((one, id) => ({ id, ...one }));
}

export const COURSE: CourseDef = {
  name: "Bell Tower Street",
  width: HALF * 2,
  pieces: STREET.pieces,
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
  mob: [0, 1, 2].flatMap((rank) => [-4, -2, 0, 2, 4].map((x, index) => ({ id: rank * 5 + index, rank, d: FAR + 16 + rank * 8, x }))),
  clutter: layClutter(),
  finish: STREET.yard + 6,
  roost: STREET.yard + 42,
};

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
