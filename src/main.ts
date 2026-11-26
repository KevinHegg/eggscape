import "./style.css";
import { Sound } from "./audio";
import { View } from "./render/view";
import { leanAt, leanToward, pilotFor, type Pilot } from "./sim/autoplay";
import { STREETS } from "./sim/course";
import { EGG_BASKET, Game, KEG_TRIP, MAX_AMMO, SHOT_PILE, START_HAY, STEP, initPhysics, type Carry, type EggAim, type GameEvent, type Input } from "./sim/game";

const STORAGE_KEY = "eggscape:v2";
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

interface Saved {
  best: number;
  muted: boolean;
}

function load(): Saved {
  const fallback: Saved = { best: 0, muted: false };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Saved> | null;
    return { best: Number(raw?.best) || 0, muted: raw?.muted === true };
  } catch {
    return fallback;
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage is a nicety; the game plays without it.
  }
}

const saved = load();
const query = new URLSearchParams(location.search);
const auto = query.has("auto");
/** `?street=2` starts on the second street with a fresh cart: for trying one street on its own. */
const firstStreet = Math.max(0, Math.min(STREETS.length - 1, (Number(query.get("street")) || 1) - 1));
const view = new View($("stage"));
const sound = new Sound();
sound.muted = saved.muted;
let game: Game | null = null;
/** Which street of the run he is on, and what he came into it with. */
let street = 0;
let entry: Carry | undefined;
/** What the streets behind him add to the telling: cooks bowled, cooks met, seconds spent. */
let before = { bowled: 0, cooks: 0, time: 0 };
/** The curtain is across between two streets, and the clock is stopped behind it. */
let handing = false;
let pilot: Pilot | null = null;
let running = false;
let resultShown = false;
let accumulator = 0;
/** The finger that is steering: where its stick is centred, and where it is now. */
interface Drag {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  since: number;
  moved: boolean;
}
let drag: Drag | null = null;
const keys = new Set<string>();
/** A shot was asked for and the sim has not yet heard: at a named target, or at whatever is next. */
let trigger: string | true | null = null;
/** An egg was asked for, and at what. */
let lobbed: EggAim | null = null;
/** What the cooks throw, by which of them threw it. */
const THROWN = ["Pan", "Rolling pin", "Egg beater", "Cabbage"] as const;
/** Seconds the world holds its breath after a big hit. */
let freeze = 0;
let flying = false;
let rounds = -1;
let eggs = -1;
const hinted = new Map<string, number>();
let steered = false;
let cushioned = 0;
/** What this run has to show for itself. */
let bowled = 0;
/** How the tower stood when he broke, for the telling of it. */
let towerAtEnd: NonNullable<Game["tower"]>["state"] = "held";
/** The last thing to go bang, in case it is the last thing he hears. */
let lastBoom = { big: false, time: -1 };

// ---------------------------------------------------------------- screens

function show(id: "title" | "result" | "run"): void {
  for (const card of ["title", "result"] as const) $(card).hidden = card !== id;
  $("hud").hidden = id === "title";
}

async function stage(run: boolean, index = 0, carry?: Carry): Promise<void> {
  await initPhysics();
  enter(run, index, carry);
}

/** Put the cart at the top of a street with what it brought. Physics must be up already. */
function enter(run: boolean, index: number, carry?: Carry): void {
  game?.dispose();
  street = index;
  entry = carry;
  if (index === 0 || !carry) before = { bowled: 0, cooks: 0, time: 0 };
  game = new Game(STREETS[index], carry);
  pilot = auto ? pilotFor(game.course) : null;
  view.mode = run ? "run" : "title";
  view.load(game, index);
  running = run;
  resultShown = false;
  accumulator = 0;
  trigger = null;
  lobbed = null;
  lastBoom = { big: false, time: -1 };
  freeze = 0;
  flying = false;
  rounds = -1;
  eggs = -1;
  drag = null;
  cushioned = 0;
  bowled = 0;
  towerAtEnd = "held";
  if (run) drawBar();
}

function drawBar(): void {
  $("hay").replaceChildren(...Array.from({ length: START_HAY }, () => document.createElement("i")));
  $("lean-hint").classList.toggle("gone", steered || auto);
}

function drawHud(current: Game): void {
  $("shell-fill").style.width = `${current.shell}%`;
  $("shell").className = `meter stage-${current.stage}`;
  [...$("hay").children].forEach((pip, index) => pip.classList.toggle("on", index < current.hay));
  const along = ((street + current.progress) / STREETS.length) * 100;
  $("track-fill").style.width = `${along}%`;
  $("track-egg").style.left = `${along}%`;
  $("brake").classList.toggle("on", current.braking > 0);
  // The gun: what is in the rack, and whether it has anything to shoot at.
  if (current.ammo !== rounds) {
    rounds = current.ammo;
    $("rounds").innerHTML = rounds > 0 ? Array.from({ length: MAX_AMMO }, (_, index) => `<i class="${index < rounds ? "" : "spent"}"></i>`).join("") : "empty";
  }
  if (current.eggs !== eggs) {
    const badge = $("basket");
    if (eggs >= 0 && current.eggs > eggs) {
      badge.classList.remove("more");
      void badge.offsetWidth;
      badge.classList.add("more");
    }
    eggs = current.eggs;
    $("eggs").textContent = String(eggs);
    badge.classList.toggle("empty", eggs === 0);
  }
  const fire = $("fire");
  fire.classList.toggle("empty", current.ammo === 0);
  fire.classList.toggle("ready", current.ammo > 0 && current.target !== null && current.phase === "run");
}

function toast(text: string, kind: "" | "hint" | "bad" = ""): void {
  const host = $("toast");
  const line = document.createElement("p");
  line.textContent = text;
  line.className = kind;
  // One thing said at a time: a new line pushes the old one off.
  host.replaceChildren(line);
  line.addEventListener("animationend", () => line.remove());
}

/** Say a teaching line the first couple of times its moment comes up. */
function hint(key: string, text: string): void {
  const count = hinted.get(key) ?? 0;
  if (count >= 2) return;
  hinted.set(key, count + 1);
  toast(text, "hint");
}

function narrate(event: GameEvent, current: Game): void {
  switch (event.type) {
    case "brake":
      sound.brake();
      break;
    case "shoot":
      sound.cannon();
      break;
    case "bang":
      sound.bang(false);
      freeze = 0.05;
      break;
    case "dry":
      sound.click();
      if (event.why === "empty") hint("dry", "The rack is empty: look for a pile of shot");
      else if (event.why === "eggs") hint("eggs", "Out of eggs: look for a basket");
      else if (event.why === "far") hint("far", "Too far to throw an egg");
      else hint("aimless", "Out of range: wait for a ring to turn gold");
      break;
    case "lob":
      sound.sling();
      break;
    case "splat":
      sound.egg();
      if (event.hit === "pan") {
        sound.clang();
        toast(`${THROWN[event.kind % 4]} down!`);
      } else if (event.hit === "cook") {
        sound.swat(false);
        toast("Egg on his face!");
      }
      break;
    case "fuse": {
      sound.fuse();
      const cart = current.position;
      if (Math.hypot(event.at.x - cart.x, event.at.z - cart.z) < KEG_TRIP + 0.6) toast("A slow match!", "bad");
      break;
    }
    case "boom":
      sound.boom(event.big);
      freeze = Math.max(freeze, event.big ? 0.1 : 0.04);
      if (event.big || lastBoom.time !== current.time || !lastBoom.big) lastBoom = { big: event.big, time: current.time };
      if (event.big) toast("There goes the powder!");
      break;
    case "breach":
      sound.rubble(9, 0.1);
      toast("The barricade's down!");
      break;
    case "pickup":
      sound.pickup(event.kind === "shot");
      toast(event.kind === "eggs" ? `${EGG_BASKET} more eggs` : `${SHOT_PILE} more rounds`);
      break;
    case "through":
      sound.gate();
      break;
    case "smash":
      if (event.kind === "coop") {
        sound.splinter();
        sound.cluck();
        toast("Hens loose!");
      } else if (event.kind === "barrel") {
        sound.smash();
        sound.splash();
        toast("The Queen's claret!");
      } else if (event.kind === "queen") {
        sound.clang();
        sound.lost();
        toast("Her crown!");
      } else {
        sound.crack(true);
        sound.rubble(3);
      }
      break;
    case "letGo":
      sound.groan();
      hint("brake", "It's going! Pull down to brake: let it land first");
      break;
    case "bellLoose":
      sound.toll(0.5);
      break;
    case "slam":
      sound.bang(true);
      freeze = 0.09;
      toast("A bridge!");
      break;
    case "toll":
      sound.toll(event.hard);
      break;
    case "bowled":
      bowled += 1;
      sound.swat(true);
      if (event.by === "cart") toast("Oof!", "bad");
      break;
    case "regroup":
      // Only worth saying while they are still between him and home.
      if (current.mob.some((one) => one.def.rank === event.rank && one.def.d > current.distance + 2)) toast("They're back on their feet", "bad");
      break;
    case "throw":
      sound.whoosh();
      hint("sling", "Tap what they throw to egg it out of the air");
      break;
    case "pan":
      if (event.hit) {
        sound.clang();
        toast(`${THROWN[event.kind % 4]}!`, "bad");
      } else sound.splinter();
      break;
    case "wainOff":
      sound.pickup(true);
      toast("Cheese away!");
      break;
    case "wainCrash":
      sound.smash();
      sound.splash();
      toast("Into the well!");
      break;
    case "air":
      if (event.time > 1) toast(`${event.distance.toFixed(0)} metres of air!`);
      break;
    case "broken":
      towerAtEnd = current.tower?.state ?? "down";
      sound.splat();
      if (event.cause === "fell") sound.splash();
      break;
    case "finish":
      sound.fanfare();
      break;
    case "hayLost":
      toast("A bale gone", "bad");
      break;
    case "crack":
      sound.crack(true);
      if (event.stage < 3) toast("Crack!", "bad");
      break;
    case "jolt":
      if (event.amount + event.absorbed > 2) sound.bump(event.amount + event.absorbed);
      if (event.absorbed > 3 && event.amount < 1 && current.time - cushioned > 2) {
        cushioned = current.time;
        hint("cushion", "The hay took that one");
      }
      if (event.amount > 1) {
        sound.crack(false);
        $("shell").classList.remove("hit");
        void $("shell").offsetWidth;
        $("shell").classList.add("hit");
      }
      break;
    default:
      break;
  }
}

/** How it ended, and the one thing worth knowing for the next go. */
function verdict(current: Game): { title: string; line: string } {
  const course = current.course;
  if (current.cause === "blast") {
    return lastBoom.big
      ? { title: "Devilled", line: "He was at the barricade when the powder wagon went up. Set it off from well back, and brake until it has gone." }
      : { title: "Devilled", line: "A keg in the road with a slow match in it. The red rings mark them: steer wide, or burst them with an egg from a distance." };
  }
  if (!course.tower || !current.tower) {
    // A street with no tower in it: the trouble is powder, a barricade, and the kitchen.
    const wall = current.walls.find((one) => one.state === "up");
    const held = wall !== undefined && wall.def.d - current.distance < 9;
    switch (current.cause) {
      case "mob":
        return { title: "Beaten", line: "The kitchen had him. An egg makes them duck; a round from the gun flattens a rank." };
      case "caught":
        return held
          ? { title: "Omelette", line: "The barricade held, and they came down for him. The powder wagon against it would shift it: an egg from well back, or a round at its ring." }
          : { title: "Omelette", line: "He stopped, and the Queen's cooks do not. Keep her rolling." };
      case "spilled":
        return { title: "Spilled", line: "The cart went over, and he went with it." };
      default:
        return held
          ? { title: "Scrambled", line: "Straight into the Queen's barricade. Her powder wagon is parked against it: set that off first." }
          : { title: "Scrambled", line: `He got ${Math.round(current.distance)} of ${course.finish} metres down ${course.name}.` };
    }
  }
  const lip = course.tower.d;
  const shot = current.tower.state !== "held";
  const atCanal = current.distance > lip - 6 && current.distance < lip + 16;
  switch (current.cause) {
    case "fell":
      return shot
        ? { title: "Poached", line: towerAtEnd === "down" ? "He went in beside the bridge. The tower fell on the left: cross on the left." : "He reached the water before the bridge did. Pull down to brake, and let the tower land." }
        : { title: "Poached", line: "The bridge is gone, but the bell tower would reach. One rope holds it, at the capstan on the quay." };
    case "mob":
      return { title: "Beaten", line: "The kitchen had him. The bell clears one side of the street; the cheese wain would clear the other." };
    case "caught":
      if (current.bell.body && current.speed < 1.2) {
        const bell = current.bell.body.translation();
        const cart = current.position;
        if (Math.hypot(bell.x - cart.x, bell.z - cart.z) < 3.4) return { title: "Omelette", line: "The bell stopped in the street, and so did he. Steer round it." };
      }
      return shot
        ? { title: "Omelette", line: "He stopped, and the Queen's cooks do not. Keep her rolling." }
        : { title: "Omelette", line: "He stopped at the water and they came down for him. Shoot the capstan when its ring turns gold." };
    case "spilled":
      return { title: "Spilled", line: "The cart went over, and he went with it." };
    default:
      return atCanal && towerAtEnd !== "down"
        ? { title: "Rang the bell", line: "He met the tower before it was down. Brake after the shot, and arrive as it lands." }
        : { title: "Scrambled", line: `He got ${Math.round(current.distance)} of ${course.finish} metres.` };
  }
}

function showResult(current: Game): void {
  resultShown = true;
  const won = current.phase === "won";
  const stars = current.stars;
  if (stars > saved.best) {
    saved.best = stars;
    save();
  }
  const told = verdict(current);
  $("result-eyebrow").textContent = won ? "Home to roost" : "The Queen sends for toast";
  $("result-title").textContent = won ? (["", "Home, just about", "Safe under her wing", "Not a mark on him"][stars] ?? "Home") : told.title;
  $("result-stars").innerHTML = Array.from({ length: 3 }, (_, index) => (index < stars ? "<b>★</b>" : "★")).join("");
  $("result-line").textContent = won
    ? stars === 3
      ? "The Empress Hen counts his cracks, finds none, and sits on him."
      : stars === 2
          ? "The Empress Hen tucks him in and glares up the hill."
          : "The Empress Hen takes one look at him and sends for glue."
    : told.line;
  const rows: Array<[string, string]> = [
    ["Shell", `${Math.round(current.shell)}%`],
    ["Cooks bowled over", `${before.bowled + bowled} of ${before.cooks + current.mob.length}`],
    ["Knocks taken", String(current.knocks)],
    ["Time", `${(before.time + current.time - current.after).toFixed(1)} s`],
  ];
  if (!won) rows.unshift(["Street", `${current.course.name} (${street + 1} of ${STREETS.length})`]);
  $("result-stats").innerHTML = rows.map(([label, value]) => `<li><span>${label}</span><span>${value}</span></li>`).join("");
  // Broken on a later street, he may have that street again as he came into it, or the whole hill.
  const midway = !won && street > 0 && entry !== undefined;
  $("again").textContent = midway ? `${current.course.name} again` : "Go again";
  $("top").hidden = !midway;
  show("result");
}

// ---------------------------------------------------------------- input

/** Pixels of sideways drag that put the lean hard over. */
function fullLean(): number {
  return 0.13 * Math.min(stageHost.clientWidth, 560);
}
/** Pixels the finger may wander before it counts as a lean. */
const SLACK = 7;

/**
 * Drag sideways and the cart goes that way, and keeps going until the finger lifts or comes
 * back: a little drag is a drift, a long one a swerve. Pull down and the brake comes on. Arrow
 * keys do the same from a keyboard.
 */
function steer(current: Game): { lean: number; brake: number } {
  let rate = 0;
  let brake = 0;
  if (drag) {
    const across = drag.x - drag.x0;
    rate = (Math.sign(across) * Math.max(0, Math.abs(across) - SLACK)) / (fullLean() - SLACK);
    brake = Math.max(0, Math.min(1, (drag.y - drag.y0 - 26) / 60));
  }
  if (keys.has("ArrowLeft") || keys.has("a")) rate -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) rate += 1;
  if (keys.has("ArrowDown") || keys.has("s")) brake = 1;
  return { lean: leanAt(current, Math.max(-1, Math.min(1, rate))), brake };
}

/** A touch on the street: a round at the gold ring under it, or an egg at whatever else is there. */
function tap(x: number, y: number): void {
  if (!game) return;
  const pick = view.pickAt(x, y, game);
  if ("shoot" in pick) trigger = pick.shoot;
  else lobbed = pick.egg;
}

/** What the hands are asking for this step, and nothing held over to the next. */
function hands(current: Game): Input {
  const input: Input = steer(current);
  if (trigger !== null) input.shoot = trigger;
  if (lobbed) input.egg = lobbed;
  trigger = null;
  lobbed = null;
  return input;
}

const stageHost = $("stage");
stageHost.addEventListener("pointerdown", (event) => {
  if (!running || !game || handing) return;
  // A second finger anywhere is a shot.
  if (drag) {
    tap(event.clientX, event.clientY);
    return;
  }
  drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, since: performance.now(), moved: false };
});
window.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  // The stick's centre trails a finger that has gone past full lean, so turning back bites at once.
  const full = fullLean();
  drag.x0 = Math.max(drag.x - full, Math.min(drag.x + full, drag.x0));
  // The brake is measured from the highest the finger has been, so it can be let off again.
  drag.y0 = Math.min(drag.y0, drag.y);
  if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > 12) {
    drag.moved = true;
    if (!steered) {
      steered = true;
      $("lean-hint").classList.add("gone");
    }
  }
});
for (const type of ["pointerup", "pointercancel"] as const) {
  window.addEventListener(type, (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    // A quick touch that went nowhere is a shot.
    if (type === "pointerup" && !drag.moved && performance.now() - drag.since < 280) tap(event.clientX, event.clientY);
    drag = null;
  });
}
stageHost.addEventListener("contextmenu", (event) => event.preventDefault());
$("fire").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (running) trigger = true;
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.add(key);
  if (running && (key === " " || key === "f" || key === "ArrowUp" || key === "w")) {
    event.preventDefault();
    trigger = true;
  }
  if (key === "m") toggleSound();
  if (key === "r" && (running || resultShown) && !handing) void start(street, entry);
});
window.addEventListener("keyup", (event) => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener("blur", () => {
  keys.clear();
  drag = null;
});

function toggleSound(): void {
  saved.muted = !saved.muted;
  save();
  sound.setMuted(saved.muted);
  drawSound();
}

function drawSound(): void {
  const button = $("sound");
  button.classList.toggle("off", saved.muted);
  button.setAttribute("aria-pressed", String(!saved.muted));
}

$("sound").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  sound.unlock();
  toggleSound();
});
drawSound();

/** What is said at the top of each street. */
const OPENING = ["The bridge is out. That tower would reach.", "The Queen's powder. Red rings are traps: egg them from well back."];

async function start(index = firstStreet, carry?: Carry): Promise<void> {
  sound.unlock();
  await stage(true, index, carry);
  show("run");
  hint(`start${index}`, OPENING[index] ?? "");
  if (auto) $("lean-hint").classList.add("gone");
}

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** Through the gate: tally the street behind, and come out at the top of the next with what is left. */
function next(current: Game): void {
  const carry = current.carry;
  const kept = { bowled: before.bowled + bowled, cooks: before.cooks + current.mob.length, time: before.time + current.time - current.after };
  enter(true, street + 1, carry);
  before = kept;
  show("run");
}

/** The same, with a curtain drawn across while the scenery is changed. */
async function handOver(current: Game): Promise<void> {
  if (handing) return;
  handing = true;
  const coming = STREETS[street + 1];
  const carry = current.carry;
  $("curtain-eyebrow").textContent = `Through the gate · street ${street + 2} of ${STREETS.length}`;
  $("curtain-title").textContent = coming?.name ?? "";
  $("curtain-line").textContent = `Shell ${Math.round(carry.shell)}% · ${carry.ammo} ${carry.ammo === 1 ? "round" : "rounds"} · ${carry.eggs} eggs`;
  $("curtain").classList.add("across");
  await wait(420);
  drag = null;
  next(current);
  if (game) {
    drawHud(game);
    view.sync(game, 0);
  }
  await wait(1100);
  $("curtain").classList.remove("across");
  handing = false;
  hint(`start${street}`, OPENING[street] ?? "");
}

$("roll-out").addEventListener("click", () => void start());
$("again").addEventListener("click", () => void (game?.phase === "won" ? start() : start(street, entry)));
$("top").addEventListener("click", () => void start(0));

// ---------------------------------------------------------------- the frame loop

function advance(current: Game, steps: number): void {
  for (let index = 0; index < steps; index += 1) {
    const asked = hands(current);
    current.step(pilot ? pilot(current) : asked);
    for (const event of current.takeEvents()) {
      view.handle(event, current);
      narrate(event, current);
    }
  }
}

/** The teaching lines that wait on the street rather than on an event. */
function coach(current: Game): void {
  if (current.phase !== "run") return;
  // The powder: said once the train is in sight, and again when the barricade is close.
  const wall = current.walls.find((one) => one.state === "up");
  if (wall) {
    const gap = wall.def.d - current.distance;
    const lit = current.kegs.some((keg) => keg.state === "lit" && !keg.def.trap);
    if (gap < 34 && gap > 12 && lit) hint("wait", "It's lit! Pull down to brake and let it go up");
    else if (gap < 60 && gap > 30 && !lit) hint("train", "One egg on a kerb keg sets the whole row off");
    else if (gap < 28 && gap > 10 && !lit) hint("wagon", "The barricade! Egg the powder wagon, and brake");
  }
  if (current.ammo === 0) return;
  const lit = current.target;
  if (!lit) return;
  const tower = current.tower?.state;
  if (lit.id === "windlass") hint("fire", "Gold ring on the capstan: tap it, or press Fire");
  else if (lit.id === "wain" && tower !== "held") hint("wain", "The cheese wain is only chocked: tap its ring");
  else if (lit.kind === "rank" && tower !== "held" && tower !== "falling") hint("rank", "A round into the cooks will scatter them");
}

view.app.on("update", (dt: number) => {
  const current = game;
  if (!current) return;
  if (running && !(handing && current.phase === "run")) {
    // A big hit stops the clock for a few frames, so it lands.
    freeze = Math.max(0, freeze - dt);
    if (freeze <= 0) accumulator += Math.min(dt, 0.1);
    const steps = Math.floor(accumulator / STEP);
    accumulator -= steps * STEP;
    advance(current, Math.min(steps, 6));
    drawHud(current);
    const airborne = current.airtime > 0.3 && current.phase === "run";
    if (airborne && !flying) sound.air();
    flying = airborne;
    sound.roll(current.speed, current.grounded, current.phase === "run");
    coach(current);
    if (current.phase === "through") {
      if (current.after > 0.9) void handOver(current);
    } else if (current.over && !resultShown && current.after > (current.phase === "won" ? 3.4 : 2.4)) showResult(current);
  }
  view.sync(current, dt);
});

void stage(false, firstStreet);

// For driving the game from a console or a hidden tab, where frames don't tick.
Object.assign(window, {
  __egg: {
    get game() {
      return game;
    },
    view,
    start,
    /** Simulate some seconds. Between streets it steps straight through the gate, without the curtain. */
    step(seconds: number, input: { lean?: number; goal?: number; brake?: number; shoot?: string | boolean; egg?: EggAim } = {}) {
      if (!game) return null;
      const steps = Math.round(seconds / STEP);
      for (let index = 0; index < steps; index += 1) {
        // With nothing said, whatever finger or key is down steers, as it would in a live frame.
        const asked = hands(game);
        if (input.goal !== undefined) asked.lean = leanToward(game, input.goal);
        else if (input.lean !== undefined) asked.lean = input.lean;
        if (input.brake !== undefined) asked.brake = input.brake;
        if (index === 0 && input.shoot) asked.shoot = input.shoot;
        if (index === 0 && input.egg) asked.egg = input.egg;
        game.step(pilot ? pilot(game) : asked);
        for (const event of game.takeEvents()) {
          view.handle(event, game);
          narrate(event, game);
        }
        view.sync(game, STEP);
        if (game.phase === "through" && game.after > 0.9 && !handing) next(game);
      }
      drawHud(game);
      coach(game);
      if (game.over && game.phase !== "through" && !resultShown && game.after > (game.phase === "won" ? 3.4 : 2.4)) showResult(game);
      return { street, d: Math.round(game.distance), v: Math.round(game.speed * 10) / 10, shell: Math.round(game.shell), hay: game.hay, ammo: game.ammo, eggs: game.eggs, phase: game.phase, cause: game.cause, tower: game.tower?.state ?? null };
    },
    handOver: () => (game ? handOver(game) : undefined),
  },
});
