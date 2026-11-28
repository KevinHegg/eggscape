import "./style.css";
import { Sound } from "./audio";
import { Stage } from "./render/stage";
import { BOIL, Game, IDLE, LEVELS, STEP, loadPhysics, type GameEvent, type Input, type LevelDef } from "./sim/kitchen";
import { LETS, PLANS, pilot, seated } from "./sim/pilot";

const STORAGE_KEY = "eggscape:kitchen:v2";
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

interface Saved {
  /** The best stars for each room, by its key. */
  stars: Record<string, number>;
  /** The lowest roost he has been got to: the room that can be started from. */
  reached: number;
  muted: boolean;
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Saved>;
    const stars: Record<string, number> = {};
    for (const level of LEVELS) stars[level.key] = Math.min(3, Math.max(0, Number(raw.stars?.[level.key]) || 0));
    let reached = Math.min(LEVELS.length - 1, Math.max(0, Number(raw.reached) || 0));
    // A room that has been done is a roost reached, even if the house has grown under it since.
    LEVELS.forEach((level, index) => {
      if ((stars[level.key] ?? 0) > 0) reached = Math.max(reached, Math.min(LEVELS.length - 1, index + 1));
    });
    return { stars, reached, muted: Boolean(raw.muted) };
  } catch {
    return { stars: {}, reached: 0, muted: false };
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // A private window: nothing is kept, and nothing needs to be.
  }
}

const saved = load();
const auto = new URLSearchParams(location.search).has("auto");
/** `?room=6` opens the house at that room, counting from one, and takes it as reached. */
const asked = Math.floor(Number(new URLSearchParams(location.search).get("room")));
if (asked >= 1 && asked <= LEVELS.length && asked - 1 > saved.reached) {
  saved.reached = asked - 1;
  save();
}
const stage = new Stage($("stage"));
const sound = new Sound();
sound.muted = saved.muted;

let game: Game | null = null;
/** Which room of the house is being played, from the top. */
let room = 0;
/** The stars won in each room on this way down. */
const won: number[] = [];
let driver: ((game: Game) => Input) | null = null;
let accumulator = 0;
/** The bale the player has asked for, waiting for the next step. */
let pending: { x: number; y: number } | null = null;
/** A finger is down and has not let go: the bale is shown where it would land. */
let aiming = false;
let resultAt = -1;
/** When the run ended, in the game's own time. */
let overAt = 0;
let resultShown = false;
let runs = 0;
/** What the player has been told, and how often, so nobody is nagged. */
const told = new Map<string, number>();
let flung = false;
let lastKnock = 0;
/** The pan he went into hangs under a gap, not the one on the stove. */
let friedHung = false;
/** Where the revolving door stopped, if it has, and whether that shutter stayed shut; what else has happened to it. */
let stoppedAt: string | null = null;
let stoppedShut = false;
let unbarred = false;
let reentered = false;
/** In the cistern: the spout is stopped, the raft has gone without him and which way, and he is under water. */
let plugged = false;
let washed: "spout" | "weir" | null = null;
let sunk = false;
/** In the cellar: the barrel has him; the treadle went, and whether it threw him; and a bale was in the barrel's way. */
let flattened = false;
let trodden: "threw" | "empty" | null = null;
let crushed = false;
/** A mine went off under him. */
let mined = false;
/** In the bakehouse: he is in the embers; where bales have burned away; and whether the kettle has blown, and with him on it. */
let toasted = false;
let ashes: number[] = [];
let blown: "threw" | "empty" | null = null;
/** In the pastry: the blackbirds are out, and whether they took him. */
let flown: "took" | "empty" | null = null;
/** In the pantry: which gloves have hit him, whether the first hit a bale instead, and what the egg trap went for. */
let punches: number[] = [];
let fedFirst = false;
let snapped: "egg" | "bale" | null = null;
/** In the larder: whether the cat has had him, whether straw was lying on her floor when she did, and whether the bale she took was the one in the hole. */
let clawed = false;
let stale = false;
let stolen = false;
/** In the yard: where a pot came down on him (-1 if none has), and where one has gone through a bale. */
let crowned = -1;
let potted: number[] = [];
/** In the granary: the mice had a bale he had not yet got to; and the fan put him behind the floor. */
let nibbled = false;
let winnowed = false;
/** He is being shown coming down from the roost above, and cannot be let go until he has landed. */
let arriving = false;

/** What is said as each room begins: the one thing in it that will not wait. */
const OPENING: Record<string, [string, string]> = {
  larder: ["catch", "Tap where he will come down. A bale takes a moment to get there"],
  scullery: ["bridge", "A bale in the gap in the shelf, before he gets to it"],
  mill: ["sluice", "The wheel is dry. A bale on the gold pan by the tank lets the water in"],
  buttery: ["door", "The left shutter is barred. A bale on the gold pan stops the door at the next shutter it comes to"],
  cistern: ["raft", "The cistern is dry. A bale in the bottom of it, before he drops in"],
  servery: ["hoist", "The lift is at the bottom. A bale on the gold pan hauls it up a landing, and its roof is his bridge"],
  cellar: ["barrel", "Not yet. Once he is down in the bucket, a bale on the gold pan lets the barrel go"],
  bakehouse: ["embers", "Straw burns: on embers a bale lasts four seconds. One in the tray in his shelf, now"],
  pastry: ["jelly", "Each jelly throws him to the next, and the last throws him in the pan. A bale in a jelly stops it"],
};

/** What is said while he sits ready, in a room where there is something to watch for before he goes. */
const BRIEF: Record<string, [string, string]> = {
  granary: ["Learn the room: he knocks the light out.", " In the dark, mice eat a bale in five seconds"],
  yard: ["Pots fall in three places, every four seconds.", " Let him go just after one hits the straw below him"],
};

/**
 * The yard, by the clock: how long after he is let go he is over the gap, and on to the feather
 * bed; and how long a pot takes to get down to the gap, and to the pegs.
 */
const YARD_TIMES = { across: 3.7, bed: 3.3, toGap: 1.37, toPegs: 1.07 };

/** What each room has in it, for the map. */
const FEATURE: Record<string, string> = {
  larder: "A see-saw and a cat",
  scullery: "A see-saw that will not wait",
  mill: "A water wheel",
  buttery: "A revolving door",
  cistern: "A raft",
  servery: "A dumbwaiter",
  cellar: "A barrel",
  bakehouse: "Embers and a kettle",
  pastry: "Jellies and a pie",
  pantry: "Boxing gloves and a hen",
  granary: "A light switch, mice and a fan",
  yard: "A falling sky",
};

function show(id: "title" | "result" | "run"): void {
  $("title").hidden = id !== "title";
  $("result").hidden = id !== "result";
  $("hud").hidden = id === "title";
  drawReady();
}

/** The bar that waits for him to be let go: there whenever he is sitting ready and nothing else is up. */
function drawReady(): void {
  const waiting = Boolean(game) && game!.phase === "ready" && $("title").hidden && $("result").hidden && !driver && !stage.arriving;
  $("ready").hidden = !waiting;
  // A room with a mine in it says so while there is time to look: twice in a sitting, and then no more.
  const brief = $("brief");
  const said = waiting ? BRIEF[game!.level.key] : undefined;
  const mine = waiting && game!.level.mines.length > 0 && (told.get("mine") ?? 0) < 2;
  const warn = mine || (said !== undefined && (told.get(`brief:${game!.level.key}`) ?? 0) < 4);
  if (warn && brief.hidden) {
    const red = document.createElement("b");
    red.textContent = said ? said[0] : "The red plate with the pennant is a mine.";
    brief.replaceChildren(red, said ? said[1] : " A bale dropped on it sets it off: do that before he gets near it");
  }
  brief.hidden = !warn;
  if (game) {
    $("ready-name").textContent = game.level.name;
    $("ready-sub").textContent = `${room + 1} of ${LEVELS.length} · ${game.level.bales} bales`;
  }
}

function toast(text: string, kind: "" | "hint" | "bad" = ""): void {
  const host = $("toast");
  const line = document.createElement("p");
  line.textContent = text;
  if (kind) line.className = kind;
  host.append(line);
  while (host.children.length > 2) host.firstElementChild?.remove();
  setTimeout(() => line.remove(), kind === "hint" ? 3400 : 1500);
}

/** A hint is said at most twice in a sitting. */
function hint(key: string, text: string): void {
  const times = told.get(key) ?? 0;
  if (times >= 2 || told.get(`${key}:run`) === runs) return;
  told.set(key, times + 1);
  told.set(`${key}:run`, runs);
  toast(text, "hint");
}

function drawHud(current: Game): void {
  const bales = $("bales");
  if (bales.children.length !== current.level.bales) {
    bales.replaceChildren(...Array.from({ length: current.level.bales }, () => document.createElement("i")));
  }
  Array.from(bales.children).forEach((pip, index) => pip.classList.toggle("gone", index >= current.balesLeft));
  const shell = $("shell");
  shell.classList.toggle("cracked", current.cracks === 1);
  shell.classList.toggle("cracked-2", current.cracks >= 2);
  // Nothing is shown over the room but this, and this only while he is on his way down it.
  $("tally").hidden = current.phase === "ready" || !$("title").hidden || !$("result").hidden;
}

function drawSound(): void {
  for (const button of Array.from(document.querySelectorAll("button.sound"))) button.classList.toggle("off", sound.muted);
}

/** Set a room up with him sitting ready in it. With `arrive`, he is seen coming down into it from there. */
function fresh(index = room, arrive: { x: number; y: number; turn: number } | null = null): void {
  room = Math.min(LEVELS.length - 1, Math.max(0, index));
  const level = LEVELS[room]!;
  game?.dispose();
  game = new Game(level);
  driver = auto ? pilot(PLANS[level.key]?.() ?? []) : null;
  stage.load(game, LEVELS, arrive);
  stage.aim(null);
  pending = null;
  aiming = false;
  resultAt = -1;
  resultShown = false;
  flung = false;
  friedHung = false;
  stoppedAt = null;
  stoppedShut = false;
  unbarred = false;
  reentered = false;
  plugged = false;
  washed = null;
  sunk = false;
  flattened = false;
  trodden = null;
  crushed = false;
  mined = false;
  toasted = false;
  ashes = [];
  blown = null;
  flown = null;
  punches = [];
  fedFirst = false;
  snapped = null;
  clawed = false;
  stale = false;
  stolen = false;
  crowned = -1;
  potted = [];
  nibbled = false;
  winnowed = false;
  accumulator = 0;
  $("toast").replaceChildren();
  drawHud(game);
}

function begin(): void {
  if (!game || game.phase !== "ready" || stage.arriving) return;
  if (!$("brief").hidden) {
    const key = BRIEF[game.level.key] ? `brief:${game.level.key}` : "mine";
    told.set(key, (told.get(key) ?? 0) + 1);
  }
  runs += 1;
  game.start();
  show("run");
  const opening = OPENING[game.level.key];
  if (opening) hint(opening[0], opening[1]);
}

/** The same room again, from the shelf or from the roost above it: he sits ready, and the room can be looked over first. */
function restart(): void {
  fresh(room);
  show("run");
}

/** Off the roost and down into the next room, where he sits on the hatch until he is let go. */
function descend(): void {
  if (!game || game.phase !== "home" || room >= LEVELS.length - 1) return;
  const egg = game.egg;
  fresh(room + 1, { x: egg.x, y: egg.y, turn: egg.turn });
  arriving = true;
  show("run");
  sound.cluck();
}

/** The whole house again, from the larder shelf. */
function fromTop(): void {
  won.length = 0;
  fresh(0);
  show("run");
}

function narrate(event: GameEvent, current: Game): void {
  switch (event.type) {
    case "throw":
      sound.toss();
      break;
    case "empty":
      sound.click();
      $("bales").classList.remove("out");
      void $("bales").offsetWidth;
      $("bales").classList.add("out");
      toast("No bales left", "bad");
      break;
    case "bale":
      sound.bale();
      break;
    case "burst":
      sound.straw();
      toast("Saved!");
      break;
    case "soft":
      sound.bump(event.jolt);
      break;
    case "knock":
      lastKnock = event.jolt;
      sound.bump(event.jolt * 2);
      break;
    case "crack":
      sound.crack(true);
      toast(event.cracks >= 2 ? "One more and he's done" : "Cracked!", "bad");
      $("shell").classList.remove("hit");
      void $("shell").offsetWidth;
      $("shell").classList.add("hit");
      break;
    case "sluice":
      sound.sluice();
      // It is not dry any more: stop saying so.
      for (const line of Array.from($("toast").querySelectorAll("p.hint"))) line.remove();
      break;
    case "water":
      if (current.level.tanks.length > 0) {
        sound.splash();
        if (!plugged) hint("spout", "The spout in the cistern's left wall runs to the pan. Stand a bale in its mouth");
      } else {
        sound.mill();
      }
      break;
    case "plug":
      plugged = true;
      for (const line of Array.from($("toast").querySelectorAll("p.hint"))) line.remove();
      break;
    case "spill":
      sound.splash();
      break;
    case "wash":
      washed = event.over;
      sound.splash();
      toast("The raft has gone without him", "bad");
      break;
    case "splash":
      sunk = true;
      sound.splash();
      break;
    case "hoist":
      sound.clockwork();
      for (const line of Array.from($("toast").querySelectorAll("p.hint"))) line.remove();
      break;
    case "landing":
      sound.thud(12);
      sound.shutter();
      break;
    case "roll":
      sound.groan();
      for (const line of Array.from($("toast").querySelectorAll("p.hint"))) line.remove();
      break;
    case "tread":
      trodden = event.threw ? "threw" : "empty";
      sound.seesaw();
      toast(event.threw ? "Thrown clear!" : "The bucket was empty", event.threw ? "" : "bad");
      break;
    case "crush":
      crushed = true;
      sound.straw();
      toast("Flattened!", "bad");
      break;
    case "smash":
      sound.smash();
      sound.rubble(8);
      // Not before: a bale in the barrel's way is flattened.
      if (trodden === "threw") hint("under", "The barrel has gone by. Now a bale under the end of the run, before he comes off it");
      break;
    case "bung":
      sound.boom(false);
      break;
    case "flat":
      flattened = true;
      break;
    case "blast":
      if (event.by === "egg") {
        mined = true;
        sound.boom(true);
      } else {
        sound.boom(false);
        sound.straw();
        toast(event.near ? "Too close!" : "Boom!", event.near ? "bad" : "");
      }
      break;
    case "kindle":
      sound.fuse();
      if (event.kettle) sound.whistle(BOIL);
      break;
    case "ash":
      ashes.push(event.x);
      sound.sizzle();
      break;
    case "toast":
      toasted = true;
      break;
    case "blow":
      blown = event.threw ? "threw" : "empty";
      sound.pop();
      if (event.threw) hint("grill", "Now, while he is in the air: a bale in the embers ahead of him");
      else toast("It blew without him", "bad");
      break;
    case "boing":
      sound.boing();
      break;
    case "set":
      sound.squelch();
      break;
    case "birds":
      flown = event.took ? "took" : "empty";
      sound.birds();
      if (!event.took) toast("They have flown without him", "bad");
      break;
    case "drop":
      sound.cluck();
      break;
    case "unbar":
      unbarred = true;
      sound.shutter();
      toast("The bar is off!");
      break;
    case "release":
      reentered = true;
      sound.straw();
      hint("again", "Round again. Brake as he passes the bottom, and it stops at the left");
      break;
    case "fling":
      flung = true;
      sound.seesaw();
      // (A jelly's throw is a fling too, and no bale stops the pan it ends in.)
      if (holeOpen(current) && current.level.jellies.length === 0 && current.level.kettles.length === 0) hint("hole", "Now stop that hole, before he rolls into it");
      break;
    case "turning":
      sound.clockwork();
      break;
    case "brake":
      sound.brake();
      for (const line of Array.from($("toast").querySelectorAll("p.hint"))) line.remove();
      break;
    case "port":
      sound.shutter();
      stoppedAt = event.port;
      stoppedShut = event.shut;
      if (event.port === "top") toast("No way out at the top", "bad");
      else if (event.shut) toast("Barred!", "bad");
      break;
    case "caged":
      sound.shutter();
      toast("Caged!", "bad");
      break;
    case "punch":
      sound.pow();
      if (event.what === "egg") {
        punches.push(event.glove);
        toast("Pow!");
        // The first one is his way across. The next one is not.
        if (event.glove === 0 && current.level.gloves.length > 1) hint("feed", "Now a bale in front of the other glove takes the punch. It winds back for four seconds");
      } else {
        if (event.glove === 0) fedFirst = true;
        sound.straw();
        toast(event.glove === 0 ? "That was the glove he needed" : "It took the punch", event.glove === 0 ? "bad" : "");
        for (const line of Array.from($("toast").querySelectorAll("p.hint"))) line.remove();
      }
      break;
    case "wound":
      sound.click();
      break;
    case "lure":
      sound.tin();
      break;
    case "wake":
      sound.mew();
      for (const line of Array.from($("toast").querySelectorAll("p.hint"))) line.remove();
      hint("cat", "That woke the cat! Throw her a bale of her own, quick");
      break;
    case "leap":
      if (event.at === "egg") sound.yowl();
      break;
    case "fetch": {
      stolen = current.level.pits.some((pit) => Math.abs(pit.x - event.x) < pit.w / 2 + 0.3 && event.y < pit.y + 0.7);
      sound.straw();
      sound.purr();
      toast(stolen ? "She has the bale out of the hole!" : "She would rather have the straw", stolen ? "bad" : "");
      for (const line of Array.from($("toast").querySelectorAll("p.hint"))) line.remove();
      break;
    }
    case "pounce": {
      clawed = true;
      const cat = current.cats[0]?.def;
      stale = !!cat && current.bales.some((bale) => bale.x > cat.x0 && bale.x < cat.x1 && bale.y > cat.y0 && bale.y < cat.y1 && !current.level.pits.some((pit) => Math.abs(pit.x - bale.x) < pit.w / 2 + 0.3));
      break;
    }
    case "dark":
      sound.lightsOut();
      // Unless that bale went while the light was on.
      if (!current.level.sockets[0] || ![...current.bales, ...current.incoming].some((bale) => Math.abs(bale.x - current.level.sockets[0]!.x) < 0.6)) {
        hint("dark", "Lights out! A bale in the first gap, from memory");
      }
      break;
    case "gnawed": {
      sound.squeak();
      // Was it one he still wanted? The gap in the loft, the fan's mouth, the gap in the floor.
      const egg = current.egg;
      const [loft, mouth, floor] = current.level.sockets;
      const fan = current.level.fans[0];
      const near = (socket: typeof loft): boolean => socket?.seat !== undefined && Math.abs(event.x - socket.x) < 0.6 && Math.abs(event.y - socket.seat.y) < 0.6;
      const above = fan !== undefined && egg.y > fan.y + fan.tall;
      const wanted = (near(loft) && above && egg.x > loft!.x + 0.3) || (near(mouth) && above) || (near(floor) && (above || egg.x < floor!.x + 0.3));
      if (wanted && current.phase === "run") {
        nibbled = true;
        toast("The mice had that one too soon", "bad");
      }
      break;
    }
    case "fan":
      sound.fan(event.on);
      if (!event.on && current.phase === "run") toast("That has stopped the fan");
      break;
    case "snap":
      snapped = event.by;
      sound.snap();
      if (event.by === "bale") {
        sound.straw();
        toast("Snap! And the bar is a bridge");
      }
      break;
    case "pot":
      if (current.phase === "ready") {
        // Before he is let go they are only keeping time.
        sound.crash(false, event.hit === "pan");
        break;
      }
      if (event.hit === "egg") {
        crowned = event.column;
        sound.crash(true);
      } else if (event.hit === "bale") {
        potted.push(event.column);
        sound.crash(true);
        sound.straw();
        // The roof is there to be hit. The bridge is not.
        const roofed = event.column === 2 && Math.abs(current.egg.x - event.x) < 1;
        if (current.phase === "run") toast(roofed ? "The roof took it!" : event.column === 1 ? "There goes the bridge" : "Straw took it", roofed || event.column !== 1 ? "" : "bad");
      } else {
        sound.crash(false, event.hit === "pan");
      }
      break;
    case "warn":
      toast("The hook!", "bad");
      sound.ratchet();
      break;
    case "broken":
      sound.splat();
      break;
    case "fried":
      friedHung = current.level.pits.some((pit) => pit.hung && Math.abs(pit.x - event.x) < 0.1 && Math.abs(pit.pan - event.y) < 0.1);
      winnowed = current.level.fans.length > 0 && event.x < current.level.left + 1.4;
      sound.fry();
      break;
    case "caught":
      sound.winch();
      break;
    case "home":
      sound.fanfare();
      break;
    default:
      break;
  }
}

/** Whether the hole in the bottom floor, the one over the stove, still has no bale in it. */
function holeOpen(current: Game): boolean {
  return current.level.pits.some(
    (pit) => !pit.hung && !current.bales.some((bale) => Math.abs(bale.x - pit.x) < 0.5 && Math.abs(bale.y - pit.y) < 0.9),
  );
}

/** He is down in the bucket under the barrel's rails. */
function inBucket(current: Game): boolean {
  const egg = current.egg;
  return current.barrels.some(({ def }) => egg.x > def.bucket.x0 && egg.x < def.bucket.x1 && egg.y > def.bucket.y0 && egg.y < def.bucket.y1 + 0.3);
}

function coach(current: Game): void {
  if (current.phase !== "run") return;
  const waits = current.level.seesaws.some((saw) => !saw.pass);
  if (waits && !flung && current.idle > 0.5 && seated(current)) {
    if (current.level.seesaws.some((saw) => !saw.pass && saw.throw !== undefined)) hint("back", "A bale on the gold end of the plank throws him back up to the door");
    else hint("seesaw", "Drop a bale on the gold end of the plank. The higher it falls from, the harder he is thrown");
  }
  // In the cistern, once he is sitting on his bale, the water is next.
  const vat = current.tanks[0];
  if (vat && !vat.open && current.egg.x > vat.def.x0 && current.egg.x < vat.def.x1 && current.egg.y < vat.def.weir + 1.2 && current.idle > 0.3) {
    hint("tap", "Now the water: a bale on the gold pan lets it in");
  }
  // And while he is still on the shelves, the spout wants stopping.
  if (vat && !plugged && current.egg.y < current.level.top - 4.5 && current.egg.y > vat.def.weir + 2) {
    hint("spout", "The spout in the cistern's left wall runs to the pan. Stand a bale in its mouth");
  }
  const egg = current.egg;
  // In the servery, the car is wanted in three places, one after another.
  const lift = current.lifts[0];
  if (lift) {
    const def = lift.def;
    if (lift.floor > 0 && !lift.aboard && egg.x > def.x + def.half + 0.4 && egg.y < def.floor + def.storey + def.tall) {
      hint("fetch", "He is over. Now a bale on the roof of the car brings it down to him: the gate is shut until it comes");
    }
    if (lift.aboard && !lift.moving && lift.floor === 0) hint("up", "He is aboard. A bale on the gold pan, and up he goes to the way out");
  }
  // In the cellar, the barrel is let go when he is in the bucket, and not before.
  const barrel = current.barrels[0];
  if (barrel && barrel.state === "chocked" && inBucket(current) && current.idle > 0.3) hint("release", "Now: a bale on the gold pan, and the barrel goes over his head");
  // In the bakehouse, the kettle wants its fire once he is on the lid, and not before.
  const kettle = current.kettles[0];
  if (kettle && kettle.on && kettle.heat === 0 && current.idle > 0.3) hint("boil", "He is on the lid. A bale in the fire under the kettle, and it will boil");
  // In the pastry, the pie is opened once he is on the crust.
  const pie = current.pies[0];
  if (pie && pie.on && current.idle > 0.3) hint("pie", "He is on the pie. A bale on the gold pan lets the blackbirds out");
  // In the scullery, once the gap is bridged, the long drop at the far wall is next; and then
  // the see-saw, which does not wait for him.
  if (current.level.key === "scullery") {
    const gap = current.level.pits.find((pit) => pit.hung);
    const bridged = gap !== undefined && current.bales.some((bale) => Math.abs(bale.x - gap.x) < 0.6 && Math.abs(bale.y - gap.y) < 0.9);
    if (bridged && egg.y > current.level.top - 4.5) hint("drop", "Next, a long drop at the left wall. Get a bale under it");
    if (!flung && egg.x < -2.2 && egg.y < current.level.top - 5.5) hint("timed", "This plank will not wait: a bale on its gold end while he is on the red");
  }
  // In the granary, each bale is wanted just before he gets to its place, and not sooner.
  if (current.level.key === "granary" && current.dark) {
    const [loft, mouth, floor] = current.level.sockets;
    const fan = current.level.fans[0];
    const laid = (socket: typeof loft): boolean => socket?.seat !== undefined && [...current.bales, ...current.incoming].some((bale) => Math.abs(bale.x - socket.x) < 0.5 && Math.abs(bale.y - socket.seat!.y) < 0.5);
    if (fan && loft && egg.y > fan.y + fan.tall && egg.x < loft.x - 0.9 && !laid(mouth)) hint("mouth", "Now the fan: a bale in its mouth, under the lamp, before he drops");
    if (fan && egg.y < fan.y - 2 && egg.x < -1 && !laid(floor)) hint("floor", "Now the gap in the floor, ahead of him");
  }
  // In the yard, each bale goes after its own pot: as soon as the next one there cannot come before he is past.
  if (current.level.key === "yard") {
    const [, gap, bed] = current.skies;
    const laid = (socket: number): boolean => {
      const place = current.level.sockets[socket];
      return place?.seat !== undefined && current.bales.some((bale) => Math.abs(bale.x - place.x) < 0.5 && Math.abs(bale.y - place.seat!.y) < 0.5);
    };
    const falling = (column: number): boolean => current.pots.some((pot) => pot.column === column);
    if (gap && current.time < 2.2 && !laid(0) && !falling(1) && gap.next - current.sky + YARD_TIMES.toGap > YARD_TIMES.across - current.time) hint("bridge", "Now: a bale in the gap. The next pot there will come too late to burst it");
    if (bed && current.time > 1.2 && current.time < 6 && !laid(1) && !falling(2) && bed.next - current.sky + YARD_TIMES.toPegs > YARD_TIMES.bed - current.time && (laid(0) || egg.x < -1)) {
      hint("roof", "Now: a bale across the two pegs is a roof over the feather bed");
    }
  }
  // In the mill, the time the wheel has him is the time to get ready for what comes after it.
  const wheel = current.wheels[0];
  if (wheel && wheel.wet && Math.hypot(egg.x - wheel.x, egg.y - wheel.y) < wheel.def.r && egg.x > wheel.x - 0.6) {
    hint("ahead", "While the wheel has him: a bale under the drop at the wall, and one in the hole");
  }
}

function verdict(current: Game): { eyebrow: string; title: string; line: string } {
  const last = room === LEVELS.length - 1;
  const spare = current.level.spare;
  switch (current.phase) {
    case "home":
      if (!last) {
        const below = LEVELS[room + 1]!.name.replace(/^The /, "the ");
        if (current.stars === 3) return { eyebrow: "Safe on the roost", title: current.level.name, line: `Whole, and with straw to spare. The hen will keep him: whatever happens in ${below}, he starts again from here.` };
        if (current.cracks > 0) return { eyebrow: "Safe on the roost", title: current.level.name, line: `Cracked, but the hen will sit on him until he is mended. Whatever happens in ${below}, he starts again from here.` };
        return { eyebrow: "Safe on the roost", title: current.level.name, line: `Whole, though it took most of the straw. Whatever happens in ${below}, he starts again from here.` };
      }
      if (current.stars === 3) return { eyebrow: "Home", title: "Not a mark on him", line: "Out of the kitchen with the whole of it thrown after him, and not a mark on him. The Empress Hen has counted him twice." };
      if (current.cracks > 0) return { eyebrow: "Home", title: "Home, and cracked", line: flung && lastKnock > 0 ? "He met something harder than straw on the way. A gentler throw, or a bale where he hit." : "He is home, with a crack to show his mother." };
      return { eyebrow: "Home", title: "Home", line: `Whole, but it took all the straw in the room. Keep ${spare === 1 ? "one bale" : `${spare} bales`} back for the third star.` };
    case "broken":
      if (clawed) {
        return {
          eyebrow: "A great fall",
          title: "The cat has him",
          line: stale
            ? "Straw that was lying there before she woke is nothing to the cat. Throw hers once the see-saw has gone off: she has the first bale that lands on her floor after that, and not him."
            : "The see-saw wakes the cat, and she takes a couple of seconds to get up. A bale thrown down on her floor in that time and she has that, and not him.",
        };
      }
      if (snapped === "egg") {
        return { eyebrow: "A great fall", title: "Taken in", line: "That hen is painted wood, and her nest is an egg trap. A bale in it sets the trap off instead: then its bar lies across the nest, and is his bridge to the real roost." };
      }
      if (crowned >= 0) {
        return {
          eyebrow: "A great fall",
          title: "Crowned",
          line:
            crowned === 0
              ? "A pot came down on him as he came off the top shelf. One falls there every four seconds: let him go just after it has landed."
              : crowned === 1
                ? "A pot came down the gap as he was crossing it. Let him go just after one has landed in front of him, and the gap's own pot is out of the way in time."
                : "A pot came down on him on the feather bed, where he is slow. A bale laid across the two pegs over it is a roof: lay it after a pot has come down there, and it takes the next.",
        };
      }
      if (mined) {
        return { eyebrow: "A great fall", title: "Scrambled", line: "He rolled on to the mine, and it went off under him. A bale dropped on the red plate sets it off first: any time will do, so long as he is not near it." };
      }
      if (flattened) {
        return { eyebrow: "A great fall", title: "Flattened", line: "The barrel goes down its run whatever is on it, and he was on it. Let it go only when he is down in the bucket, under the rails: then it passes over his head." };
      }
      if (trodden === "threw") {
        return crushed
          ? { eyebrow: "A great fall", title: "Humpty Dumpty", line: "The barrel flattened that bale on its way to the crates, and he came off the end of the run with nothing under him. Throw it after the barrel has gone by: there is time." }
          : { eyebrow: "A great fall", title: "Humpty Dumpty", line: "Off the end of the run, and nothing under him. A bale under the end of it, once the barrel has gone by." };
      }
      return { eyebrow: "A great fall", title: "Humpty Dumpty", line: overAt < 4 ? "A long drop, and nothing under him. Tap the floor where he will come down, and do it early: the bale takes a moment." : "That was harder than a shell can take. Straw and sacks are soft; wood, stone and iron are not." };
    case "fried":
      if (current.level.fans.length > 0) {
        if (winnowed) {
          return nibbled
            ? { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "The mice had the bale out of the fan's mouth before he dropped past it. They eat one in five seconds: throw it when he is nearly at the end of the loft." }
            : { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "The fan blew him to the wall and down behind the floor. A bale in its mouth stops the wind: its lamp shows in the dark, and goes red when it is stopped." };
        }
        return nibbled
          ? { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "The mice had that bale before he got to it. They eat one in five seconds, wherever it is: throw each when he is nearly there, not before." }
          : { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "Into a gap in the dark. There is one in the loft and one in the floor: learn where they are before he is let go, and tap there from memory." };
      }
      if (stolen) {
        return { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "The cat took the bale out of the hole: she has the first one that lands on her floor once she is awake. Stop the hole before the see-saw goes off, and throw her another." };
      }
      if (current.level.gloves.length > 0) {
        if (punches.includes(1)) {
          return { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "The second glove put him in the pan. It punches whatever drops in front of it, and a bale will do: after that it is four seconds winding itself back, and he drops past." };
        }
        return fedFirst
          ? { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "The first glove was the one he needed, and it was still winding back from the bale when he came to it. It is the second glove that wants feeding." }
          : { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "Into the pan. The first glove is his way across the room: leave that one alone." };
      }
      if (current.level.skies.length > 0) {
        return potted.includes(1)
          ? { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "A pot went through his bridge before he got to it. Throw that bale just after a pot has gone down the gap: then the next comes too late." }
          : { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "The gap in the long shelf wants a bale in it. Throw it after a pot has gone down the gap, not before: a pot goes through straw." };
      }
      if (toasted) {
        const egg = current.egg;
        return ashes.some((x) => Math.abs(x - egg.x) < 1.2)
          ? { eyebrow: "The Queen's breakfast", title: "Roasted", line: "That bale had burned away before he was over it. Straw lasts four seconds on embers: throw it when he is nearly there, not before." }
          : { eyebrow: "The Queen's breakfast", title: "Roasted", line: "Into the embers. A bale in the tray is a floor for as long as it burns, which is four seconds: long enough, if it is thrown as he comes to it." };
      }
      if (current.level.jellies.length > 0) {
        return current.jellies.some((jelly) => jelly.set)
          ? { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "A jelly that is stopped only lets him down on to the next one, and the last one still threw him in the pan. It is the last one that wants the bale." }
          : { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "The last jelly threw him clean over the pie and into the pan. A bale in that jelly stops it: then he only rolls off it, on to the pie." };
      }
      if (friedHung && stoppedAt === "bottom") {
        return {
          eyebrow: "The Queen's breakfast",
          title: "Sunny side up",
          line: reentered
            ? "The door stopped with him at the bottom, and the bottom is over the pan. The second time round, wait until he is passing the bottom: then it stops at the left."
            : "The door stopped with him at the bottom, and the bottom is over the pan. Brake at once and it stops at the right-hand shutter, which is the way to the red board.",
        };
      }
      if (friedHung && current.level.tanks.length > 0) {
        return { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "Out of the spout with the bathwater, and the spout runs to the pan. Stand a bale in its mouth before the water gets that high." };
      }
      if (friedHung && current.level.wheels.length > 0) {
        return { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "The wheel was dry, and it gave under him. A bale on the gold pan by the tank lets the water in: do it as he is let go, because the water takes a moment to come down." };
      }
      return friedHung
        ? { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "Through the gap and into the pan hung under it. Bridge the gap with a bale, and do it as soon as he is let go." }
        : { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "Down the hole and into her pan. A bale dropped in the hole stops it: tap it before he gets there." };
    case "caught":
      if (current.caged) {
        return { eyebrow: "The Queen's hook", title: "Caged", line: flung ? "The plank went over, but he was not on the red when it did. The bale takes a moment to come down: throw it as he comes on to the cushion." : "He wallowed off the end of the cushion and into the cage. That plank will not wait for him: a bale on its gold end while he is still on the red." };
      }
      if (stoppedAt === "top") {
        return current.balesLeft === current.level.bales
          ? { eyebrow: "The Queen's hook", title: "Hooked", line: "The clockwork ran down with him at the top, where there is no way out. A bale on the gold pan stops the door at the next shutter it comes to." }
          : reentered
            ? { eyebrow: "The Queen's hook", title: "Hooked", line: "Round he went a second time, and back to the top, where there is no way out. Brake as he passes the bottom, and it stops at the left." }
            : { eyebrow: "The Queen's hook", title: "Hooked", line: "The door stopped with him at the top, where there is no way out. Brake sooner: it stops at the next shutter it comes to." };
      }
      if (stoppedAt === "left" && stoppedShut && !unbarred) {
        return { eyebrow: "The Queen's hook", title: "Barred", line: "The door stopped at the left-hand shutter, and that one is barred. The bar is roped to the red board outside the right-hand shutter: he has to go out that way first, and come back." };
      }
      if (stoppedAt === "right" && reentered) {
        return { eyebrow: "The Queen's hook", title: "Hooked", line: "Out on the right again, and the see-saw has thrown already. The second time round, brake as he passes the bottom: the bar is off the left-hand shutter now." };
      }
      if (current.kettles.length > 0 && current.kettles[0]!.on) {
        return blown === "empty"
          ? { eyebrow: "The Queen's hook", title: "Hooked", line: "The kettle boiled before he was on it, and blew its lid at nothing. Light the fire once he is sitting on the lid: it takes two seconds to boil." }
          : { eyebrow: "The Queen's hook", title: "Hooked", line: "He sat on the kettle's lid until the hook came down. A bale in the fire under it, and in two seconds the lid goes, and he with it." };
      }
      if (current.pies.length > 0 && flown === "empty") {
        return { eyebrow: "The Queen's hook", title: "Baked in a pie", line: "The pie was opened before he was on it, and the blackbirds went without him. Wait until he is sitting on the crust, and then the gold pan." };
      }
      if (current.pies.length > 0 && current.pies[0]!.on) {
        return { eyebrow: "The Queen's hook", title: "Hooked", line: "He sat on the pie until the hook came down. A bale on the gold pan opens it, and the blackbirds do the rest." };
      }
      if (current.lifts.length > 0) {
        const lift = current.lifts[0]!;
        const def = lift.def;
        const out = current.egg.x - def.x;
        const thrown = current.level.bales - current.balesLeft;
        if (lift.aboard) {
          return lift.floor === 0
            ? { eyebrow: "The Queen's hook", title: "Hooked", line: "He sat in the car at the bottom landing until the hook came down. The way out is one landing up: a bale on the gold pan." }
            : { eyebrow: "The Queen's hook", title: "Hooked", line: "Too far: the car is at the top landing, and the way out is from the one below. A bale on its roof brings it down one." };
        }
        if (Math.abs(out) < def.half + 0.2) {
          return thrown === 0
            ? { eyebrow: "The Queen's hook", title: "Hooked", line: "Down the shaft, and on to the roof of the car at the bottom of it. A bale on the gold pan hauls the car up a landing, and then its roof is his bridge: do it as he is let go." }
            : { eyebrow: "The Queen's hook", title: "Hooked", line: "Down the shaft and on to the roof of the car. It has to be one landing up as he comes to it, and no more: one bale on the gold pan, and nothing on the roof until he is over." };
        }
        if (out > 0 && current.egg.y < def.floor + def.storey) {
          return { eyebrow: "The Queen's hook", title: "Hooked", line: "Over the roof, and down to a gate that is shut, because the car is not there. A bale on the roof of the car brings it down to him." };
        }
        return { eyebrow: "The Queen's hook", title: "Hooked", line: "He came to the shaft, and the car was not there to be walked over. One bale on the gold pan, at once: its roof is his bridge when it is one landing up." };
      }
      if (current.barrels.length > 0 && inBucket(current)) {
        return current.barrels[0]!.state === "chocked"
          ? { eyebrow: "The Queen's hook", title: "Hooked", line: "He sat in the bucket until the hook came down. A bale on the gold pan lets the barrel go: it passes over him on the rails, and the treadle beyond throws him out." }
          : { eyebrow: "The Queen's hook", title: "Hooked", line: "The barrel went by before he was in the bucket, so the treadle threw nothing. Wait until he is down in it, and then the gold pan." };
      }
      if (current.level.tanks.length > 0) {
        const vat = current.tanks[0]!;
        const inside = current.egg.x > vat.def.x0 && current.egg.x < vat.def.x1 && current.egg.y < vat.def.weir + 1.5;
        if (washed) {
          return { eyebrow: "The Queen's hook", title: "Hooked", line: `The water came up before he was aboard, and took his raft ${washed === "weir" ? "over the wall" : "down the spout"} without him. Keep it back until he is nearly there.` };
        }
        if (inside && sunk) return { eyebrow: "The Queen's hook", title: "Fished out", line: "An egg does not float. He wants a bale in the cistern under him, and it has to be there before he drops in." };
        if (inside && !vat.open) {
          return current.cracks > 0
            ? { eyebrow: "The Queen's hook", title: "Hooked", line: "He came down in a dry cistern with nothing under him. A bale in the bottom of it, before he drops in." }
            : { eyebrow: "The Queen's hook", title: "Hooked", line: "He sat on his bale in a dry cistern until the hook came down. A bale on the gold pan lets the water in, and the bale is a raft." };
        }
      }
      if (current.level.gloves.length > 0 && fedFirst && punches.length === 0) {
        return { eyebrow: "The Queen's hook", title: "Hooked", line: "The first glove is his way across the room, and it was winding back from the bale. Leave that one alone: it is the second that wants feeding." };
      }
      return seated(current) && current.level.seesaws.some((saw) => !saw.pass)
        ? { eyebrow: "The Queen's hook", title: "Hooked", line: flung ? "The plank tipped, but not hard enough to throw him. Let the bale fall from higher." : "He sat in the see-saw until the hook came down for him. Drop a bale on the gold end of the plank." }
        : { eyebrow: "The Queen's hook", title: "Hooked", line: "He stopped, and the hook came down for him. Keep him moving." };
    default:
      return { eyebrow: "", title: "", line: "" };
  }
}

function showResult(current: Game): void {
  resultShown = true;
  const last = room === LEVELS.length - 1;
  const home = current.phase === "home";
  const { eyebrow, title, line } = verdict(current);
  $("result-eyebrow").textContent = eyebrow;
  $("result-title").textContent = title;
  $("result-line").textContent = line;
  const stars = current.stars;
  $("result-stars").replaceChildren(
    ...[0, 1, 2].map((index) => {
      const star = document.createElement(index < stars ? "b" : "span");
      star.textContent = "★";
      return star;
    }),
  );
  $("result-stars").hidden = !home;
  if (home) {
    won[room] = stars;
    saved.stars[current.level.key] = Math.max(saved.stars[current.level.key] ?? 0, stars);
    if (!last) saved.reached = Math.max(saved.reached, room + 1);
    save();
  }
  const stats: Array<[string, string]> = [
    ["Bales thrown", `${current.level.bales - current.balesLeft} of ${current.level.bales}`],
    ["Time", `${overAt.toFixed(1)} s`],
  ];
  if (home && last) {
    const total = LEVELS.reduce((sum, level, index) => sum + (won[index] ?? saved.stars[level.key] ?? 0), 0);
    stats.push(["The whole house", `★ ${total} of ${LEVELS.length * 3}`]);
  }
  $("result-stats").replaceChildren(
    ...stats.map(([label, value]) => {
      const item = document.createElement("li");
      const a = document.createElement("span");
      a.textContent = label;
      const b = document.createElement("span");
      b.textContent = value;
      item.append(a, b);
      return item;
    }),
  );
  // What the two buttons do depends on where he is: on a roost, home, or in pieces.
  const again = $("again");
  const other = $("other");
  if (home && !last) {
    again.textContent = "Down he goes";
    again.dataset.does = "descend";
    other.textContent = `${current.level.name} again`;
    other.dataset.does = "restart";
    other.hidden = false;
  } else if (home) {
    again.textContent = "From the top";
    again.dataset.does = "top";
    other.textContent = `${current.level.name} again`;
    other.dataset.does = "restart";
    other.hidden = false;
  } else {
    again.textContent = room > 0 ? "Again, from the roost" : "Go again";
    again.dataset.does = "restart";
    other.hidden = true;
  }
  show("result");
  if (home) {
    // The card sits over the bottom of the screen, which is where the nest is. Look lower, so
    // that he is seen on it; and from a roost, the hatch he is about to drop to as well.
    const card = $("result").getBoundingClientRect();
    const cover = card.width > window.innerWidth * 0.7 ? Math.max(0, window.innerHeight - card.top) : 0;
    stage.hold(last ? current.level.nest.y0 - 1.4 : LEVELS[room + 1]!.start.y - 1.9, cover, current.egg.y + 1.5);
  }
}

function advance(current: Game, steps: number): void {
  for (let index = 0; index < steps; index += 1) {
    const input: Input = driver ? driver(current) : pending ? { bale: pending } : {};
    pending = null;
    current.step(input);
    for (const event of current.drain()) {
      stage.handle(event, current);
      narrate(event, current);
    }
    if (current.over && resultAt < 0) overAt = current.time;
    if (current.over && resultAt < 0) resultAt = current.time + (current.phase === "fried" ? 1.9 : current.phase === "home" ? 2.2 : current.phase === "caught" ? 1.7 : 1.5);
  }
}

// ------------------------------------------------------------------ hands

const host = $("stage");

function point(event: PointerEvent): void {
  if (!game || game.phase !== "run" || driver) return;
  const at = stage.pickPoint(event.clientX, event.clientY);
  stage.aim(at ? game.aim(at.x, at.y) : null);
}

host.addEventListener("pointerdown", (event) => {
  sound.unlock();
  if (!$("map").hidden) {
    closeMap();
    return;
  }
  // Sitting ready, a tap anywhere in the kitchen lets him go.
  if (game && game.phase === "ready" && !$("ready").hidden) {
    begin();
    return;
  }
  if (!game || game.phase !== "run" || driver) return;
  aiming = true;
  host.setPointerCapture(event.pointerId);
  point(event);
});

host.addEventListener("pointermove", (event) => {
  if (aiming) point(event);
});

host.addEventListener("pointerup", (event) => {
  if (!aiming) return;
  aiming = false;
  stage.aim(null);
  if (!game || game.phase !== "run") return;
  pending = stage.pickPoint(event.clientX, event.clientY);
});

host.addEventListener("pointercancel", () => {
  aiming = false;
  stage.aim(null);
});

// ------------------------------------------------------------------ the map

const SVG = "http://www.w3.org/2000/svg";
const MAP_INK: Record<string, string> = { stone: "#8d8a84", wood: "#7a4e22", board: "#7a4e22", iron: "#33333a", bed: "#e0a92a", nest: "#e0a92a" };

function mark(parent: Element, name: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  parent.append(element);
  return element;
}

/** One room of the house in section: its shelves and straw, what it has in it, the pans and the hen. */
function drawRoom(g: Element, level: LevelDef, index: number): void {
  const line = { fill: "none", "stroke-linecap": "butt", "vector-effect": "non-scaling-stroke" };
  mark(g, "rect", { x: -4.4, y: level.bottom, width: 8.8, height: level.top - level.bottom, fill: index === room ? "#f6ecd0" : index <= saved.reached ? "#e9dcb8" : "#cdbf9d" });
  for (const tank of level.tanks) mark(g, "rect", { x: tank.x0, y: tank.floor, width: tank.x1 - tank.x0, height: tank.weir - tank.floor, fill: "#9cc0ee" });
  for (const lift of level.lifts) {
    mark(g, "rect", { x: lift.x - lift.half - 0.15, y: lift.floor - 0.35, width: lift.half * 2 + 0.3, height: lift.head - lift.floor + 0.35, fill: "#b9a57c" });
    mark(g, "rect", { x: lift.x - lift.half, y: lift.floor, width: lift.half * 2, height: lift.tall, fill: "#7a4e22" });
  }
  for (const block of level.blocks) {
    if (block.look === "wall" || block.look === "bare") continue;
    const ink = MAP_INK[block.look] ?? "#8d8a84";
    if (block.h <= 0.6 && block.w > block.h) {
      const dx = (Math.cos(block.turn) * block.w) / 2;
      const dy = (Math.sin(block.turn) * block.w) / 2;
      mark(g, "line", { ...line, x1: block.x - dx, y1: block.y - dy, x2: block.x + dx, y2: block.y + dy, stroke: ink, "stroke-width": 2.4 });
    } else {
      mark(g, "rect", { x: block.x - block.w / 2, y: block.y - block.h / 2, width: block.w, height: block.h, fill: ink });
    }
  }
  for (const saw of level.seesaws) {
    mark(g, "line", { ...line, x1: saw.x - saw.side * saw.load, y1: saw.y, x2: saw.x + saw.side * saw.seat, y2: saw.y, stroke: "#4a2f14", "stroke-width": 2.4 });
    mark(g, "line", { ...line, x1: saw.x - saw.side * saw.load, y1: saw.y, x2: saw.x - saw.side * (saw.load - 0.9), y2: saw.y, stroke: "#e9ac22", "stroke-width": 3.4 });
  }
  for (const wheel of level.wheels) mark(g, "ellipse", { ...line, cx: wheel.x, cy: wheel.y, rx: wheel.r, ry: wheel.r, stroke: "#24439a", "stroke-width": 2.4 });
  for (const door of level.doors) mark(g, "ellipse", { ...line, cx: door.x, cy: door.y, rx: door.r, ry: door.r, stroke: "#4a2f14", "stroke-width": 2.4 });
  for (const barrel of level.barrels) mark(g, "ellipse", { cx: barrel.x, cy: barrel.y, rx: barrel.r, ry: barrel.r, fill: "#7a4e22" });
  for (const pit of level.pits) mark(g, "rect", { x: pit.x - pit.w / 2, y: pit.pan - 0.5, width: pit.w, height: 0.9, fill: "#cf3420" });
  // Embers, a kettle, jellies and a pie.
  for (const hearth of level.hearths) {
    const dx = (Math.cos(hearth.turn) * hearth.w) / 2;
    const dy = (Math.sin(hearth.turn) * hearth.w) / 2;
    mark(g, "line", { ...line, x1: hearth.x - dx, y1: hearth.y - dy, x2: hearth.x + dx, y2: hearth.y + dy, stroke: "#e2571c", "stroke-width": 3.4 });
  }
  for (const kettle of level.kettles) mark(g, "ellipse", { cx: kettle.x, cy: kettle.y - 0.9, rx: 0.95, ry: 0.95, fill: "#b5651d" });
  level.jellies.forEach((jelly, each) => mark(g, "ellipse", { cx: jelly.x, cy: jelly.y - 0.3, rx: jelly.w / 2, ry: 0.55, fill: ["#d8283c", "#5fb84a", "#8a4fc0"][each % 3]! }));
  for (const pie of level.pies) {
    mark(g, "rect", { x: pie.x - pie.w / 2 - 0.15, y: pie.y - pie.deep, width: pie.w + 0.3, height: pie.deep, fill: "#24439a" });
    mark(g, "ellipse", { cx: pie.x, cy: pie.y, rx: pie.w / 2, ry: 0.4, fill: "#c98a3a" });
  }
  // Boxing gloves, the egg trap, and where the sky falls.
  for (const glove of level.gloves) {
    mark(g, "rect", { x: Math.min(glove.x, glove.x - glove.side * 0.7), y: glove.y - 0.6, width: 0.7, height: 1.2, fill: "#4a2f14" });
    mark(g, "ellipse", { cx: glove.x + glove.side * 0.55, cy: glove.y, rx: 0.55, ry: 0.75, fill: "#cf3420" });
  }
  for (const trap of level.traps) {
    mark(g, "line", { ...line, x1: trap.x0, y1: trap.y0, x2: trap.x0 - 0.5, y2: trap.y0 + 1.8, stroke: "#33333a", "stroke-width": 2 });
    mark(g, "ellipse", { cx: (trap.x0 + trap.x1) / 2, cy: trap.floor + 0.9, rx: 0.6, ry: 1, fill: "#e9c04a", stroke: "#1d1512", "stroke-width": 1, "vector-effect": "non-scaling-stroke" });
  }
  for (const cat of level.cats) {
    mark(g, "ellipse", { cx: cat.x, cy: cat.y + 0.55, rx: 0.8, ry: 0.55, fill: "#26242b" });
    mark(g, "path", { d: `M${cat.x - 0.75} ${cat.y + 0.8} l0.15 0.75 l0.3 -0.5 l0.3 0.5 l0.15 -0.75 z`, fill: "#26242b" });
  }
  for (const sky of level.skies) {
    mark(g, "line", { ...line, x1: sky.x, y1: level.top - 0.4, x2: sky.x, y2: level.top - 4.2, stroke: "#33333a", "stroke-width": 1.4, "stroke-dasharray": "3 3" });
    mark(g, "rect", { x: sky.x - 0.45, y: level.top - 5.4, width: 0.9, height: 1.2, fill: "#b5651d" });
  }
  for (const each of level.switches) mark(g, "rect", { x: each.side < 0 ? each.x - 0.5 : each.x, y: each.y - 0.5, width: 0.5, height: 1, fill: "#e9ac22", stroke: "#1d1512", "stroke-width": 1, "vector-effect": "non-scaling-stroke" });
  for (const fan of level.fans) {
    mark(g, "ellipse", { cx: fan.x + fan.side * 0.2, cy: fan.y, rx: 0.45, ry: 0.95, fill: "#33333a" });
    mark(g, "line", { ...line, x1: fan.x + fan.side * 0.9, y1: fan.y, x2: fan.x + fan.side * 3.4, y2: fan.y, stroke: "#33333a", "stroke-width": 1.4, "stroke-dasharray": "3 3" });
  }
  // A mine: its pennant.
  for (const mine of level.mines) {
    mark(g, "path", { d: `M${mine.x} ${mine.y} V${mine.y + 2.6} L${mine.x + 1.1} ${mine.y + 2} L${mine.x} ${mine.y + 1.4}`, fill: "#cf3420", stroke: "#1d1512", "stroke-width": 1, "vector-effect": "non-scaling-stroke" });
  }
  // The hen at the bottom of it, and the hatch at the top.
  const nest = level.nest;
  mark(g, "ellipse", { cx: (nest.x0 + nest.x1) / 2, cy: nest.y0 + 1, rx: 0.8, ry: 1.3, fill: level.ends === "nest" ? "#e9ac22" : "#fffaf0", stroke: "#1d1512", "stroke-width": 1, "vector-effect": "non-scaling-stroke" });
  const safe = game?.phase === "home";
  if (index === room) mark(g, "ellipse", { cx: safe ? (nest.x0 + nest.x1) / 2 + 1.1 : level.start.x, cy: safe ? nest.y0 + 1.6 : level.start.y - 0.2, rx: 0.75, ry: 1.5, fill: "#fff6e6", stroke: "#cf3420", "stroke-width": 2, "vector-effect": "non-scaling-stroke" });
}

function drawMap(): void {
  const host = $("floors");
  const top = LEVELS[0]!.top;
  const bottom = LEVELS[LEVELS.length - 1]!.bottom;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `-4.4 ${-top} 8.8 ${top - bottom}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const g = mark(svg, "g", { transform: "scale(1,-1)" });
  LEVELS.forEach((level, index) => drawRoom(g, level, index));
  const rows = LEVELS.map((level, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = index === room ? "floor here" : "floor";
    row.disabled = index > saved.reached;
    const name = document.createElement("b");
    name.textContent = level.name;
    const sub = document.createElement("span");
    const stars = saved.stars[level.key] ?? 0;
    const tally = document.createElement("i");
    tally.textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    sub.append(tally, ` ${index > saved.reached ? "Not reached yet" : (FEATURE[level.key] ?? "")}`);
    row.append(name, sub);
    row.addEventListener("click", () => {
      sound.unlock();
      closeMap();
      won.length = 0;
      fresh(index);
      show("run");
    });
    return row;
  });
  host.replaceChildren(svg, ...rows);
}

function openMap(): void {
  sound.unlock();
  drawMap();
  $("app").classList.add("mapping");
  $("map").hidden = false;
}

function closeMap(): void {
  $("app").classList.remove("mapping");
  $("map").hidden = true;
}

function toggleSound(): void {
  sound.unlock();
  sound.setMuted(!sound.muted);
  saved.muted = sound.muted;
  save();
  drawSound();
}

function act(does: string | undefined): void {
  sound.unlock();
  if (does === "descend") descend();
  else if (does === "top") fromTop();
  else restart();
}

$("go").addEventListener("click", () => {
  sound.unlock();
  won.length = 0;
  if (room !== 0) fresh(0);
  show("run");
});
$("resume").addEventListener("click", () => {
  sound.unlock();
  fresh(saved.reached);
  show("run");
});
$("let-go").addEventListener("click", () => {
  sound.unlock();
  begin();
});
$("again").addEventListener("click", () => act($("again").dataset.does));
$("other").addEventListener("click", () => act($("other").dataset.does));
for (const button of Array.from(document.querySelectorAll("button.sound"))) button.addEventListener("click", toggleSound);
for (const button of Array.from(document.querySelectorAll("button.map"))) button.addEventListener("click", openMap);
$("map-back").addEventListener("click", closeMap);
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (!$("map").hidden) {
    if (key === "escape" || key === "enter" || key === " ") closeMap();
    return;
  }
  if (key === "r") restart();
  else if (key === "m") toggleSound();
  else if ((key === " " || key === "enter") && game?.phase === "ready" && $("result").hidden && $("title").hidden) begin();
});

// ------------------------------------------------------------------ the loop

stage.app.on("update", (dt: number) => {
  const current = game;
  if (!current) return;
  accumulator = Math.min(0.1, accumulator + dt);
  const steps = Math.floor(accumulator / STEP);
  accumulator -= steps * STEP;
  if (current.phase !== "ready") advance(current, steps);
  else idle(current, steps);
  coach(current);
  drawHud(current);
  stage.sync(current, dt);
  landed();
  if (current.over && !resultShown && resultAt >= 0 && current.time >= resultAt) {
    showResult(current);
    // The scripted player does not stop to read: off the roost and on down.
    if (auto && current.phase === "home" && room < LEVELS.length - 1) descend();
  }
});

/** He has come down on the hatch: now he can be let go. */
function landed(): void {
  if (!arriving || stage.arriving) return;
  arriving = false;
  sound.bale();
  drawReady();
}

/** While he sits ready the sky keeps time; and the scripted player lets him go when its moment comes. */
function idle(current: Game, steps: number): void {
  for (let index = 0; index < steps; index += 1) {
    current.wait();
    for (const event of current.drain()) {
      stage.handle(event, current);
      if ($("title").hidden && $("map").hidden) narrate(event, current);
    }
    if (auto && !arriving && !stage.arriving && $("result").hidden && (LETS[current.level.key]?.(current) ?? true)) {
      begin();
      return;
    }
  }
}

await loadPhysics();
fresh(0);
drawSound();
if (saved.reached > 0) {
  const resume = $("resume");
  resume.textContent = `From the roost above ${LEVELS[saved.reached]!.name.replace(/^The /, "the ")}`;
  resume.hidden = false;
}
if (asked >= 1 && asked <= LEVELS.length) {
  fresh(asked - 1);
  show("run");
} else {
  show("title");
}

/** For driving the game where frames do not tick (a hidden tab): `__egg.step(seconds, { x, y })`. */
(window as unknown as { __egg: unknown }).__egg = {
  get game() {
    return game;
  },
  get room() {
    return room;
  },
  stage,
  IDLE,
  begin,
  restart,
  descend,
  enter(index: number) {
    fresh(index);
    show("run");
  },
  step(seconds: number, bale?: { x: number; y: number }) {
    if (!game) return null;
    if (bale) pending = bale;
    if (game.phase !== "ready") advance(game, Math.round(seconds / STEP));
    else idle(game, Math.round(seconds / STEP));
    coach(game);
    drawHud(game);
    stage.sync(game, seconds);
    landed();
    if (game.over && !resultShown && resultAt >= 0 && game.time >= resultAt) showResult(game);
    return { phase: game.phase, time: game.time, egg: game.egg, cracks: game.cracks, bales: game.balesLeft };
  },
};
