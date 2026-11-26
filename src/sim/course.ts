/**
 * The gauntlet: a road running downhill along -Z. `d` is horizontal distance from the gate,
 * `x` is across the road (positive is the player's right).
 */
export interface Piece {
  d0: number;
  d1: number;
  y0: number;
  y1: number;
}

export type PickupKind = "hay" | "man" | "keg";
export type TowerKind = "mangonel" | "archers";

export interface TowerDef {
  id: string;
  kind: TowerKind;
  d: number;
  side: -1 | 1;
  /** The tower fires while the cart's distance is inside this window. */
  from: number;
  to: number;
}

export interface CourseDef {
  /** Drivable width between the kerbs. */
  width: number;
  pieces: Piece[];
  barricades: Array<{ d: number; x0: number; x1: number; rows: number }>;
  towers: TowerDef[];
  oil: Array<{ d0: number; d1: number; x0: number; x1: number }>;
  pickups: Array<{ kind: PickupKind; d: number; x: number }>;
  /** Crossing this line is home. */
  finish: number;
  /** Where the Empress Hen sits. */
  roost: number;
}

function layRoad(): Piece[] {
  const pieces: Piece[] = [];
  let d = -14;
  let y = 0;
  const run = (length: number, slope: number): void => {
    pieces.push({ d0: d, d1: d + length, y0: y, y1: y - length * slope });
    d += length;
    y -= length * slope;
  };
  const drop = (height: number): void => {
    y -= height;
  };
  run(14, 0); // the castle gate
  run(165, 0.14);
  drop(1.3); // the broken step
  run(124, 0.14);
  run(6, -0.06); // the lip
  drop(1.1);
  run(21, 0.1);
  run(34, 0); // the roost yard
  return pieces;
}

export const COURSE: CourseDef = {
  width: 10,
  pieces: layRoad(),
  barricades: [
    { d: 50, x0: -4.4, x1: 0.6, rows: 2 },
    { d: 228, x0: -4.4, x1: 4.4, rows: 2 },
  ],
  towers: [
    { id: "m1", kind: "mangonel", d: 105, side: 1, from: 60, to: 96 },
    { id: "a1", kind: "archers", d: 152, side: -1, from: 128, to: 152 },
    { id: "m2", kind: "mangonel", d: 200, side: -1, from: 168, to: 196 },
    { id: "a2", kind: "archers", d: 250, side: 1, from: 232, to: 252 },
    { id: "m3", kind: "mangonel", d: 266, side: 1, from: 238, to: 262 },
    { id: "m4", kind: "mangonel", d: 274, side: -1, from: 246, to: 270 },
  ],
  oil: [
    { d0: 116, d1: 130, x0: -4.8, x1: 0.8 },
    { d0: 262, d1: 274, x0: -1.5, x1: 4.8 },
  ],
  pickups: [
    { kind: "hay", d: 62, x: 3 },
    { kind: "man", d: 137, x: -3.2 },
    { kind: "hay", d: 186, x: -3 },
    { kind: "keg", d: 222, x: 2.8 },
    { kind: "man", d: 256, x: 3.2 },
  ],
  finish: 318,
  roost: 336,
};

/** The piece under `d`; at a step, the lower (later) piece. */
export function pieceAt(course: CourseDef, d: number): Piece {
  const pieces = course.pieces;
  for (let index = pieces.length - 1; index >= 0; index -= 1) {
    if (d >= pieces[index]!.d0) return pieces[index]!;
  }
  return pieces[0]!;
}

/** Height of the road surface at `d`. */
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

export function courseEnd(course: CourseDef): number {
  return course.pieces[course.pieces.length - 1]!.d1;
}
