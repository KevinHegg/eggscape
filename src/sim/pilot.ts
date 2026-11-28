import { BUTTERY, CISTERN, LARDER, PANTRY, PASTRY, SCULLERY, STOREY, YARD, type Game, type Input, type LevelDef } from "./kitchen";

/** What a player does on a screen, as a list of things to wait for and where to put the bale. */
export interface Move {
  when: (game: Game) => boolean;
  x: number;
  y: number;
}

/** A bale for the room's mine, once the first thing in the room has been seen to. Its height is the house's own. */
function clear(level: LevelDef, after: number): Move[] {
  return level.mines.map((mine) => ({ when: (game: Game) => game.time > after, x: mine.x, y: mine.y + 0.3 }));
}

/** Whether he has come to rest in a see-saw's seat. */
export function seated(game: Game): boolean {
  const egg = game.egg;
  return game.seesaws.some(({ def }) => {
    const along = (egg.x - def.x) * def.side;
    return along > 0 && along < def.seat + 0.4 && Math.abs(egg.y - def.y) < 1;
  });
}
const settled = (game: Game): boolean => game.idle > 0.6 && seated(game);

/** How high over the see-saw a bale should be let go to throw him clean on to the flour sacks. */
export const GOOD_DROP = 24.2;

/**
 * The first screen played properly: a bale where he comes down, one in the hole to the pan,
 * one dropped on the see-saw once he is sitting in it, and one for the cat as soon as that
 * has woken her. `toy` as a number is how long after she wakes to throw hers; `at` is where.
 */
export function larderPlan(drop = GOOD_DROP, stopHole = true, toy: boolean | number = true, at?: { x: number; y: number }): Move[] {
  const cat = LARDER.cats[0]!;
  const awake = (game: Game): boolean => (game.cats[0]?.awake ?? -1) >= (toy === true ? 0 : Number(toy));
  return [
    { when: (game) => game.time > 1.2, x: 2.9, y: 22.8 },
    ...(stopHole ? [{ when: (game: Game) => game.time > 2, x: -1.1, y: 18.9 }] : []),
    { when: settled, x: 0, y: drop },
    ...(toy === false ? [] : [{ when: awake, x: at?.x ?? cat.x - 0.2, y: at?.y ?? cat.y + 0.5 }]),
  ];
}

/**
 * The second screen played properly: bridge the gap over the pan, a bale under the long drop,
 * one on the gold end of the see-saw as he comes to it, and one in the hole once he is thrown.
 * `toss` as a number is a time to throw that third bale at, whatever he is doing.
 * Heights are written as if the scullery stood where the larder does: it hangs a storey down.
 */
export function sculleryPlan(options: { bridge?: number | false; cushion?: boolean; toss?: number | false; stopHole?: boolean; mine?: number | false } = {}): Move[] {
  const { bridge = 0.5, cushion = true, toss, stopHole = true, mine = 1.3 } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY });
  // He has come down the long drop and is on his way to the see-saw.
  const coming = (game: Game): boolean => game.egg.x > -2.4 && game.egg.x < 0 && game.egg.y + STOREY < 25;
  return [
    ...(bridge === false ? [] : [at((game) => game.time > bridge, -0.9, 27.7)]),
    ...(mine === false ? [] : clear(SCULLERY, mine)),
    ...(cushion ? [at((game) => game.time > 3.2, -3.1, 24.3)] : []),
    ...(toss === false ? [] : [at(typeof toss === "number" ? (game) => game.time > toss : coming, -1.3, 23.5)]),
    ...(stopHole ? [at((game) => game.egg.x > 1.6 && game.egg.y + STOREY > 22, 0.6, 18.9)] : []),
  ];
}

/**
 * The third screen played properly: a bale on the sluice pan at once; then, while the wheel
 * has him, one under the long drop at the right wall and one in the hole in the bottom floor.
 * Heights are written as if the mill stood where the larder does: it hangs two storeys down.
 */
export function millPlan(options: { sluice?: number | false; cushion?: boolean | number; stopHole?: boolean } = {}): Move[] {
  const { sluice = 0.3, cushion = true, stopHole = true } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 2 });
  const riding = (game: Game): boolean => game.egg.x > -0.2 && game.wheels.some((wheel) => wheel.wet);
  return [
    ...(sluice === false ? [] : [at((game) => game.time > sluice, 1.75, 30)]),
    ...(cushion === false ? [] : [at(typeof cushion === "number" ? (game) => game.time > cushion : riding, 3.2, 21.2)]),
    ...(stopHole ? [at((game) => game.egg.x > 1.2, 0.6, 19.2)] : []),
  ];
}

/**
 * The fourth screen played properly. Brake at once, and the door stops at the right-hand
 * shutter; he goes out over the red board, which takes the bar off the left-hand one, and into
 * the seat of the see-saw. A bale on its gold end throws him back up to the door. The second
 * time round the brake goes on as the door carries him past the bottom, and he comes out on
 * the left. `first` is a time; `second` is how far round the door has gone (in quarters) since
 * he came back to it; `toss` as a number is a time to throw at, whatever he is doing.
 */
export function butteryPlan(options: { first?: number | false; toss?: boolean | number; second?: number | false; mine?: number | false } = {}): Move[] {
  const { first = 0.3, toss = true, second = 2.1, mine = 1.5 } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 3 });
  const round = (game: Game): number => -(game.doors[0]?.turn ?? 0) / (Math.PI / 2);
  // Back in the door after the see-saw: it is turning again, and has already been a quarter round.
  const again = (game: Game): boolean => game.doors[0]?.turning === true && round(game) > 1.001;
  return [
    ...(first === false ? [] : [at((game) => game.time > first, -0.7, 29.5)]),
    ...(mine === false ? [] : clear(BUTTERY, mine)),
    ...(toss === false ? [] : [at(toss === true ? settled : (game) => game.time > toss, 1.7, 20.4)]),
    ...(second === false ? [] : [at((game) => again(game) && round(game) - 1 >= second, -0.7, 29.5)]),
  ];
}

/**
 * The fifth screen played properly: a bale in the bottom of the cistern, one stood in the
 * spout, and then, once he has dropped in, one on the sluice pan. `sluice` as a number is a
 * time to throw that one at, whatever he is doing.
 */
export function cisternPlan(options: { raft?: number | false; plug?: number | false; sluice?: number | false; mine?: number | false } = {}): Move[] {
  const { raft = 1, plug = 2, sluice, mine = 3 } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 4 });
  const aboard = (game: Game): boolean => {
    const tank = game.tanks[0];
    return tank !== undefined && game.egg.x > tank.def.x0 && game.egg.x < tank.def.x1 && game.egg.y < tank.def.weir + 1;
  };
  return [
    ...(raft === false ? [] : [at((game) => game.time > raft, 0.6, 19)]),
    ...(plug === false ? [] : [at((game) => game.time > plug, -0.6, 19.5)]),
    ...(mine === false ? [] : clear(CISTERN, mine)),
    ...(sluice === false ? [] : [at(typeof sluice === "number" ? (game) => game.time > sluice : aboard, -1.5, 27.2)]),
  ];
}

/**
 * The sixth screen played properly: a bale on the pan at once, so that the car's roof is his
 * bridge; one on the roof when he is over and off it, to bring the car down to the gate; and
 * one more on the pan when he is in it. `fetch` and `up` as numbers are times to throw at,
 * whatever he is doing.
 */
export function serveryPlan(options: { bridge?: number | false; fetch?: boolean | number; up?: boolean | number } = {}): Move[] {
  const { bridge = 0.3, fetch = true, up = true } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 5 });
  const crossed = (game: Game): boolean => game.egg.x > 1.3 && game.egg.y + STOREY * 5 < 22.5;
  const aboard = (game: Game): boolean => game.lifts[0]?.aboard === true && !game.lifts[0].moving;
  return [
    ...(bridge === false ? [] : [at((game) => game.time > bridge, 2.9, 26.2)]),
    ...(fetch === false ? [] : [at(fetch === true ? crossed : (game) => game.time > fetch, 0, 22)]),
    ...(up === false ? [] : [at(up === true ? aboard : (game) => game.time > up, 2.9, 26.2)]),
  ];
}

/**
 * The seventh screen played properly: the barrel let go once he is in the bucket under its
 * run, and a bale under the end of the run once the barrel has been through the crates.
 * Either as a number is a time to throw at, whatever is going on.
 */
export function cellarPlan(options: { release?: boolean | number; cushion?: boolean | number } = {}): Move[] {
  const { release = true, cushion = true } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 6 });
  const bucketed = (game: Game): boolean => {
    const bucket = game.barrels[0]?.def.bucket;
    return bucket !== undefined && game.idle > 0.4 && game.egg.x > bucket.x0 && game.egg.x < bucket.x1 && game.egg.y > bucket.y0 && game.egg.y < bucket.y1;
  };
  const through = (game: Game): boolean => game.barrels[0]?.crates === false;
  return [
    ...(release === false ? [] : [at(release === true ? bucketed : (game) => game.time > release, 3.15, 28.6)]),
    ...(cushion === false ? [] : [at(cushion === true ? through : (game) => game.time > cushion, -2.75, 18)]),
  ];
}

/**
 * The eighth screen played properly: a bale in the tray of embers in the top shelf; one in the
 * kettle's fire once he is sitting on its lid; and one in the tray in the hob once the lid has
 * gone, and he with it. `boil` and `grill` as numbers are times to throw at, whatever he is doing.
 */
export function bakehousePlan(options: { tray?: number | false; boil?: boolean | number; grill?: boolean | number } = {}): Move[] {
  const { tray = 0.5, boil = true, grill = true } = options;
  const at = (when: Move["when"], x: number, y: number): Move => ({ when, x, y: y - STOREY * 7 });
  const onLid = (game: Game): boolean => game.idle > 0.4 && game.kettles[0]?.on === true;
  const blown = (game: Game): boolean => (game.kettles[0]?.blew ?? -1) >= 0;
  return [
    ...(tray === false ? [] : [at((game) => game.time > tray, -0.6, 28)]),
    ...(boil === false ? [] : [at(boil === true ? onLid : (game) => game.time > boil, -0.2, 23)]),
    ...(grill === false ? [] : [at(grill === true ? blown : (game) => game.time > grill, 0.9, 20.5)]),
  ];
}

/**
 * The ninth screen played properly: a bale in the last jelly, and one on the pie's gold pan
 * once he is sitting on the crust. `which` is the jelly, counting from the top; `open` as a
 * number is a time to throw at, whatever he is doing.
 */
export function pastryPlan(options: { set?: number | false; which?: number; open?: boolean | number } = {}): Move[] {
  const { set = 1, which = 2, open = true } = options;
  const jelly = PASTRY.jellies[which]!;
  const pie = PASTRY.pies[0]!;
  const onCrust = (game: Game): boolean => game.idle > 0.4 && game.pies[0]?.on === true;
  return [
    ...(set === false ? [] : [{ when: (game: Game) => game.time > set, x: jelly.x, y: jelly.y + 0.3 }]),
    ...(open === false ? [] : [{ when: open === true ? onCrust : (game: Game) => game.time > open, x: pie.pan.x, y: pie.pan.y + 0.5 }]),
  ];
}

/**
 * The tenth screen played properly: a bale in the egg trap, and one let fall in front of the
 * second glove once the first has hit him. `which` is the glove that is fed, counting from the
 * top; `feed` as a number is a time to throw at, whatever he is doing.
 */
export function pantryPlan(options: { trap?: number | false; feed?: boolean | number; which?: number } = {}): Move[] {
  const { trap = 1, feed = true, which = 1 } = options;
  const glove = PANTRY.gloves[which]!;
  const snare = PANTRY.traps[0]!;
  const punched = (game: Game): boolean => (game.gloves[0]?.hit ?? -1) >= 0;
  return [
    ...(trap === false ? [] : [{ when: (game: Game) => game.time > trap, x: (snare.x0 + snare.x1) / 2, y: snare.floor + 0.5 }]),
    ...(feed === false ? [] : [{ when: feed === true ? punched : (game: Game) => game.time > feed, x: glove.x + glove.side * 0.9, y: glove.y }]),
  ];
}

/** Whether a pot has come down in this place in the yard since he was let go, and at least this long after. */
const since = (game: Game, place: number, after = 0): boolean => (game.skies[place]?.last ?? -1) > game.sky - game.time + after;

/**
 * The eleventh screen played properly: a bale in the gap once a pot has gone through it, and
 * one on the pegs over the feather bed once a pot has come down on that. As numbers, they are
 * times to throw at, whatever the sky is doing.
 */
export function yardPlan(options: { bridge?: boolean | number; roof?: boolean | number } = {}): Move[] {
  const { bridge = true, roof = true } = options;
  const gap = YARD.sockets[0]!;
  const pegs = YARD.sockets[1]!;
  return [
    ...(bridge === false ? [] : [{ when: bridge === true ? (game: Game) => since(game, 1) : (game: Game) => game.time > bridge, x: gap.x, y: gap.seat!.y }]),
    ...(roof === false ? [] : [{ when: roof === true ? (game: Game) => since(game, 2, 1) : (game: Game) => game.time > roof, x: pegs.x, y: pegs.seat!.y }]),
  ];
}

/** When to let him go, in a room where that matters: in the yard, just after a pot has come down in front of him. */
export const LETS: Record<string, (game: Game) => boolean> = {
  yard: (game) => {
    const last = game.skies[0]?.last ?? -1;
    return last >= 0 && game.sky - last > 0.3 && game.sky - last < 0.5;
  },
};

/** Each room played properly, by its key. */
export const PLANS: Record<string, () => Move[]> = {
  larder: () => larderPlan(),
  scullery: () => sculleryPlan(),
  mill: () => millPlan(),
  buttery: () => butteryPlan(),
  cistern: () => cisternPlan(),
  servery: () => serveryPlan(),
  cellar: () => cellarPlan(),
  bakehouse: () => bakehousePlan(),
  pastry: () => pastryPlan(),
  pantry: () => pantryPlan(),
  yard: () => yardPlan(),
};

/** A driver for tests and `?auto`: makes each move, in order, as soon as its moment comes. */
export function pilot(plan: Move[]): (game: Game) => Input {
  let next = 0;
  return (game) => {
    const move = plan[next];
    if (!move || !move.when(game)) return {};
    next += 1;
    return { bale: { x: move.x, y: move.y } };
  };
}
