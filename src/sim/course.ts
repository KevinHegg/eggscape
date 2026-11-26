/**
 * The gauntlet: a road running downhill along -Z. `d` is horizontal distance from the gate,
 * `x` is across the road (positive is the player's right).
 */
export interface Piece {
  d0: number;
  d1: number;
  y0: number;
  y1: number;
  /** Where the road is missing part of its width, the stretch across it that is still there. */
  x0?: number;
  x1?: number;
}

/** Hay and men are supplies; shot and kegs load the cart's gun. */
export type PickupKind = "hay" | "man" | "shot" | "keg";
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

export interface WallDef {
  id: string;
  d: number;
  x0: number;
  x1: number;
  rows: number;
}

export interface CourseDef {
  /** Drivable width between the kerbs. */
  width: number;
  /** Road pieces in order. A space between one piece and the next is a chasm. */
  pieces: Piece[];
  walls: WallDef[];
  towers: TowerDef[];
  oil: Array<{ d0: number; d1: number; x0: number; x1: number }>;
  pickups: Array<{ kind: PickupKind; d: number; x: number }>;
  /** Crossing this line is home. */
  finish: number;
  /** Where the Empress Hen sits. */
  roost: number;
}

const G = 9.81;

interface Road {
  pieces: Piece[];
  /** Where the stretch after the bridge begins, and where the roost yard begins. */
  afterBridge: number;
  yard: number;
}

function layRoad(): Road {
  const pieces: Piece[] = [];
  let d = -14;
  let y = 0;
  const run = (length: number, slope: number, span?: readonly [number, number]): void => {
    pieces.push({ d0: d, d1: d + length, y0: y, y1: y - length * slope, ...(span ? { x0: span[0], x1: span[1] } : {}) });
    d += length;
    y -= length * slope;
  };
  /**
   * A chasm and the hill beyond it. The hill is cut to the flight of a cart leaving the lip at
   * `speed`: it starts `clearance` under that flight, closes on it over `meet` metres, runs
   * alongside it for `hold` metres more, then eases out. Land where the hill is steep and it
   * is a kiss; fly long or fall short and it is a blow.
   */
  const leap = (speed: number, chasm: number, clearance: number, meet: number, hold: number, steepest: number): void => {
    const lip = pieces[pieces.length - 1]!;
    const rise = (lip.y1 - lip.y0) / (lip.d1 - lip.d0);
    const forward = speed / Math.hypot(1, rise);
    const lipY = y;
    const fall = (x: number): number => (G * x) / (forward * forward) - rise; // the flight's slope, as drop per metre
    d += chasm;
    y = lipY + rise * chasm - (G * chasm * chasm) / (2 * forward * forward) - clearance;
    let x = chasm;
    let slope = 0;
    for (; x < chasm + meet; x += 4) {
      slope = Math.max(-0.04, Math.min(steepest, fall(x + 2) - clearance / meet));
      run(4, slope);
    }
    for (; x < chasm + meet + hold; x += 4) {
      slope = Math.min(steepest, fall(x + 2));
      run(4, slope);
    }
    // Ease out a little at a time: a hollow in the road is a jolt, a brow is not.
    while (slope > 0.15) {
      slope = Math.max(0.14, slope - 0.045);
      run(2, slope);
    }
  };

  run(14, 0); // the castle gate
  run(52, 0.14);

  run(4, 0.04); // the hump: a kicker, a short drop, a landing ramp
  run(4, -0.08);
  y -= 0.7;
  run(14, 0.3);
  run(66, 0.14);

  run(3, 0.02); // the broken bridge: only its left half still stands
  run(3, -0.1, [-5, -0.4]);
  run(3, -0.2, [-5, -0.4]);
  leap(8.4, 4, 3, 20, 8, 0.95);
  run(24, 0.03); // a level stretch, to take the heat out of her after the hill
  const afterBridge = d;
  run(56, 0.14);
  run(20, 0.3); // the run-in: she gathers herself for the big one

  run(3, 0.02); // the great leap
  run(3, -0.1);
  run(3, -0.21, [0.4, 5]); // and of this one, only the right
  run(3, -0.32, [0.4, 5]);
  leap(9.6, 5, 4.6, 24, 10, 1.1);
  run(6, 0.07);
  const yard = d;
  run(56, 0); // the roost yard
  return { pieces, afterBridge, yard };
}

const ROAD = layRoad();
const C = ROAD.afterBridge;

export const COURSE: CourseDef = {
  width: 10,
  pieces: ROAD.pieces,
  walls: [
    { id: "w1", d: 30, x0: -4.4, x1: 0.4, rows: 2 },
    { id: "w2", d: 118, x0: -0.6, x1: 4.4, rows: 2 },
    { id: "w3", d: C + 36, x0: -4.4, x1: 1.4, rows: 2 },
  ],
  towers: [
    { id: "m1", kind: "mangonel", d: 64, side: 1, from: 14, to: 50 },
    { id: "a1", kind: "archers", d: 92, side: -1, from: 66, to: 92 },
    { id: "m2", kind: "mangonel", d: 112, side: 1, from: 72, to: 104 },
    { id: "m3", kind: "mangonel", d: 136, side: -1, from: 96, to: 126 },
    { id: "a2", kind: "archers", d: C + 16, side: 1, from: C - 14, to: C + 16 },
    { id: "m4", kind: "mangonel", d: C + 30, side: -1, from: C - 8, to: C + 22 },
    { id: "a3", kind: "archers", d: C + 52, side: -1, from: C + 24, to: C + 52 },
    { id: "m5", kind: "mangonel", d: C + 62, side: 1, from: C + 26, to: C + 54 },
  ],
  oil: [
    { d0: 82, d1: 94, x0: 0.2, x1: 4.8 },
    { d0: C + 48, d1: C + 60, x0: -4.8, x1: 0 },
  ],
  pickups: [
    { kind: "hay", d: 16, x: -2.6 },
    { kind: "shot", d: 42, x: 2.8 },
    { kind: "man", d: 100, x: 3 },
    { kind: "keg", d: 126, x: -3 },
    { kind: "hay", d: C + 8, x: -3 },
    { kind: "shot", d: C + 20, x: 3 },
    { kind: "man", d: C + 44, x: 3 },
  ],
  finish: ROAD.yard + 6,
  roost: ROAD.yard + 42,
};

/** The piece under `d`; over a chasm, the piece just left. */
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

/** The stretch across the road that exists at `d`: all of it, except where a bridge has lost a side. */
export function spanAt(course: CourseDef, d: number): [number, number] {
  const piece = pieceAt(course, d);
  return [piece.x0 ?? -course.width / 2, piece.x1 ?? course.width / 2];
}

/** Slope (drop per metre forward) at `d`. */
export function slopeAt(course: CourseDef, d: number): number {
  const piece = pieceAt(course, d);
  return (piece.y0 - piece.y1) / (piece.d1 - piece.d0);
}

/** The chasms: stretches with no road under them. */
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
