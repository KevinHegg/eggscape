import "./style.css";
import { Sound } from "./audio";
import { View } from "./render/view";
import { leanAt, leanToward, steady } from "./sim/autoplay";
import { Game, START_AMMO, START_HAY, STEP, initPhysics, type GameEvent, type Input, type SlingAim } from "./sim/game";

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
const auto = new URLSearchParams(location.search).has("auto");
const view = new View($("stage"));
const sound = new Sound();
sound.muted = saved.muted;
let game: Game | null = null;
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
/** A stone was asked for, and at what. */
let slung: SlingAim | null = null;
/** What the cooks throw, by which of them threw it. */
const THROWN = ["Pan", "Rolling pin", "Egg beater", "Cabbage"] as const;
/** Seconds the world holds its breath after a big hit. */
let freeze = 0;
let flying = false;
let rounds = -1;
let stones = -1;
const hinted = new Map<string, number>();
let steered = false;
let cushioned = 0;
/** What this run has to show for itself. */
let bowled = 0;
/** How the tower stood when he broke, for the telling of it. */
let towerAtEnd: Game["tower"]["state"] = "held";

// ---------------------------------------------------------------- screens

function show(id: "title" | "result" | "run"): void {
  for (const card of ["title", "result"] as const) $(card).hidden = card !== id;
  $("hud").hidden = id === "title";
}

async function stage(run: boolean): Promise<void> {
  await initPhysics();
  game?.dispose();
  game = new Game();
  view.mode = run ? "run" : "title";
  view.load(game);
  running = run;
  resultShown = false;
  accumulator = 0;
  trigger = null;
  slung = null;
  freeze = 0;
  flying = false;
  rounds = -1;
  stones = -1;
  drag = null;
  cushioned = 0;
  bowled = 0;
  towerAtEnd = "held";
  if (run) drawBar();
}

function drawBar(): void {
  $("hay").replaceChildren(...Array.from({ length: START_HAY }, () => document.createElement("i")));
  $("lean-hint").classList.toggle("gone", steered);
}

function drawHud(current: Game): void {
  $("shell-fill").style.width = `${current.shell}%`;
  $("shell").className = `meter stage-${current.stage}`;
  [...$("hay").children].forEach((pip, index) => pip.classList.toggle("on", index < current.hay));
  $("track-fill").style.width = `${current.progress * 100}%`;
  $("track-egg").style.left = `${current.progress * 100}%`;
  $("brake").classList.toggle("on", current.braking > 0);
  // The gun: what is in the rack, and whether it has anything to shoot at.
  if (current.ammo !== rounds) {
    rounds = current.ammo;
    $("rounds").innerHTML = rounds > 0 ? Array.from({ length: START_AMMO }, (_, index) => `<i class="${index < rounds ? "" : "spent"}"></i>`).join("") : "empty";
  }
  if (current.stones !== stones) {
    stones = current.stones;
    $("stones").textContent = String(stones);
    $("sling").classList.toggle("empty", stones === 0);
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
      if (event.why === "empty") hint("dry", "Three rounds were all he had");
      else if (event.why === "stones") hint("stones", "The bag is empty");
      else if (event.why === "far") hint("far", "Too far for a stone");
      else hint("aimless", "Out of range: wait for a ring to turn gold");
      break;
    case "sling":
      sound.sling();
      break;
    case "ping":
      if (event.what === "pan") {
        sound.clang();
        toast(`${THROWN[event.kind % 4]} down!`);
      } else if (event.what === "cook") {
        sound.swat(false);
        toast("Ow!");
      } else sound.splinter();
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
      hint("sling", "Tap what they throw to knock it down");
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
      towerAtEnd = current.tower.state;
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
  const lip = current.course.tower.d;
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
        : { title: "Scrambled", line: `He got ${Math.round(current.distance)} of ${current.course.finish} metres.` };
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
      : current.knocks > 0 && current.targets.find((target) => target.id === "wain")?.done !== true
        ? "The Empress Hen picks a cabbage leaf off him. That cheese wain on the far bank was only chocked."
        : stars === 2
          ? "The Empress Hen tucks him in and glares up the hill."
          : "The Empress Hen takes one look at him and sends for glue."
    : told.line;
  const rows: Array<[string, string]> = [
    ["Shell", `${Math.round(current.shell)}%`],
    ["Cooks bowled over", `${bowled} of ${current.mob.length}`],
    ["Knocks taken", String(current.knocks)],
    ["Time", `${(current.time - current.after).toFixed(1)} s`],
  ];
  $("result-stats").innerHTML = rows.map(([label, value]) => `<li><span>${label}</span><span>${value}</span></li>`).join("");
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

/** A touch on the street: a round at the gold ring under it, or a stone at whatever else is there. */
function tap(x: number, y: number): void {
  if (!game) return;
  const pick = view.pickAt(x, y, game);
  if ("shoot" in pick) trigger = pick.shoot;
  else slung = pick.sling;
}

/** What the hands are asking for this step, and nothing held over to the next. */
function hands(current: Game): Input {
  const input: Input = steer(current);
  if (trigger !== null) input.shoot = trigger;
  if (slung) input.sling = slung;
  trigger = null;
  slung = null;
  return input;
}

const stageHost = $("stage");
stageHost.addEventListener("pointerdown", (event) => {
  if (!running || !game) return;
  // A second finger anywhere is the gun.
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
  if (key === "r" && (running || resultShown)) void start();
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

async function start(): Promise<void> {
  sound.unlock();
  await stage(true);
  show("run");
  hint("start", "The bridge is out. That tower would reach.");
  if (auto) $("lean-hint").classList.add("gone");
}

$("roll-out").addEventListener("click", () => void start());
$("again").addEventListener("click", () => void start());

// ---------------------------------------------------------------- the frame loop

function advance(current: Game, steps: number): void {
  for (let index = 0; index < steps; index += 1) {
    const asked = hands(current);
    current.step(auto ? steady(current) : asked);
    for (const event of current.takeEvents()) {
      view.handle(event, current);
      narrate(event, current);
    }
  }
}

/** The teaching lines that wait on the street rather than on an event. */
function coach(current: Game): void {
  if (current.phase !== "run" || current.ammo === 0) return;
  const lit = current.target;
  if (!lit) return;
  if (lit.id === "windlass") hint("fire", "Gold ring on the capstan: tap it, or press Fire");
  else if (lit.id === "wain" && current.tower.state !== "held") hint("wain", "The cheese wain is only chocked: tap its ring");
  else if (current.tower.state === "down") hint("rank", "A round into the cooks will scatter them");
}

view.app.on("update", (dt: number) => {
  const current = game;
  if (!current) return;
  if (running) {
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
    if (current.over && !resultShown && current.after > (current.phase === "won" ? 3.4 : 2.4)) showResult(current);
  }
  view.sync(current, dt);
});

void stage(false);

// For driving the game from a console or a hidden tab, where frames don't tick.
Object.assign(window, {
  __egg: {
    get game() {
      return game;
    },
    view,
    start,
    step(seconds: number, input: { lean?: number; goal?: number; brake?: number; shoot?: string | boolean; sling?: SlingAim } = {}) {
      if (!game) return null;
      const steps = Math.round(seconds / STEP);
      for (let index = 0; index < steps; index += 1) {
        // With nothing said, whatever finger or key is down steers, as it would in a live frame.
        const asked = hands(game);
        if (input.goal !== undefined) asked.lean = leanToward(game, input.goal);
        else if (input.lean !== undefined) asked.lean = input.lean;
        if (input.brake !== undefined) asked.brake = input.brake;
        if (index === 0 && input.shoot) asked.shoot = input.shoot;
        if (index === 0 && input.sling) asked.sling = input.sling;
        game.step(auto ? steady(game) : asked);
        for (const event of game.takeEvents()) {
          view.handle(event, game);
          narrate(event, game);
        }
        view.sync(game, STEP);
      }
      drawHud(game);
      coach(game);
      if (game.over && !resultShown && game.after > (game.phase === "won" ? 3.4 : 2.4)) showResult(game);
      return { d: Math.round(game.distance), v: Math.round(game.speed * 10) / 10, shell: Math.round(game.shell), hay: game.hay, ammo: game.ammo, stones: game.stones, phase: game.phase, cause: game.cause, tower: game.tower.state };
    },
  },
});
