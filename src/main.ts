import "./style.css";
import { Sound } from "./audio";
import { View } from "./render/view";
import { leanToward, steady } from "./sim/autoplay";
import { Game, MAX_HAY, MAX_MEN, STEP, initPhysics, type GameEvent } from "./sim/game";
import { PARTS, PART_IDS, SLOTS, type PartId } from "./sim/parts";

const STORAGE_KEY = "eggscape:v1";
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

interface Saved {
  build: PartId[];
  best: number;
  muted: boolean;
}

function load(): Saved {
  const fallback: Saved = { build: ["lever", "plane", "wedge"], best: 0, muted: false };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Saved> | null;
    const build = (raw?.build ?? []).filter((part): part is PartId => PART_IDS.includes(part as PartId));
    return { build: build.length === SLOTS ? build : fallback.build, best: Number(raw?.best) || 0, muted: raw?.muted === true };
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
view.onStray = (distance) => sound.thud(distance);
let game: Game | null = null;
let running = false;
let resultShown = false;
let accumulator = 0;
/** The finger that is steering: where it went down, where it is, and where the cart was then. */
interface Drag {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  cartX: number;
  since: number;
  moved: boolean;
}
let drag: Drag | null = null;
const keys = new Set<string>();
/** A shot was asked for and the sim has not yet heard. */
let trigger = false;
/** Seconds the world holds its breath after a big hit. */
let freeze = 0;
let felled = 0;
let flying = false;
let rounds = "";
const hinted = new Map<string, number>();
let steered = false;
let cushioned = 0;

// ---------------------------------------------------------------- screens

function show(id: "title" | "build" | "result" | "run"): void {
  for (const card of ["title", "build", "result"] as const) $(card).hidden = card !== id;
  $("hud").hidden = id !== "run" && id !== "result";
}

async function stage(run: boolean): Promise<void> {
  await initPhysics();
  game?.dispose();
  game = new Game(saved.build);
  view.mode = run ? "run" : "preview";
  view.load(game);
  running = run;
  resultShown = false;
  accumulator = 0;
  trigger = false;
  freeze = 0;
  felled = 0;
  flying = false;
  rounds = "?";
  drag = null;
  cushioned = 0;
  if (run) drawBar();
}

function drawBuild(): void {
  const slots = $("slots");
  slots.replaceChildren(
    ...Array.from({ length: SLOTS }, (_, index) => {
      const slot = document.createElement("div");
      const part = saved.build[index];
      slot.textContent = part ? PARTS[part].name : "·";
      slot.className = part ? "full" : "";
      return slot;
    }),
  );
  $("parts").replaceChildren(
    ...PART_IDS.map((id) => {
      const def = PARTS[id];
      const button = document.createElement("button");
      button.type = "button";
      button.className = saved.build.includes(id) ? "chosen" : "";
      button.setAttribute("aria-pressed", String(saved.build.includes(id)));
      button.innerHTML = `<small>${def.machine}</small><strong>${def.name}</strong><span>${def.blurb}</span>`;
      button.addEventListener("click", () => {
        if (saved.build.includes(id)) saved.build = saved.build.filter((part) => part !== id);
        else saved.build = [...saved.build, id].slice(-SLOTS);
        save();
        drawBuild();
        void stage(false);
      });
      return button;
    }),
  );
  $<HTMLButtonElement>("roll-out").disabled = saved.build.length !== SLOTS;
}

function drawBar(): void {
  $("chips").replaceChildren(
    ...saved.build.map((id) => {
      const chip = document.createElement("span");
      chip.dataset.part = id;
      chip.textContent = PARTS[id].verb;
      return chip;
    }),
  );
  const pips = (host: HTMLElement, count: number): void => host.replaceChildren(...Array.from({ length: count }, () => document.createElement("i")));
  pips($("crew"), MAX_MEN);
  pips($("hay"), MAX_HAY);
  $("lean-hint").classList.toggle("gone", steered);
}

function drawHud(current: Game): void {
  $("shell-fill").style.width = `${current.shell}%`;
  $("shell").className = `meter stage-${current.stage}`;
  [...$("crew").children].forEach((pip, index) => pip.classList.toggle("on", index < current.men));
  [...$("hay").children].forEach((pip, index) => pip.classList.toggle("on", index < current.hay));
  $("track-fill").style.width = `${current.progress * 100}%`;
  $("track-egg").style.left = `${current.progress * 100}%`;
  for (const chip of $("chips").children as HTMLCollectionOf<HTMLElement>) {
    const state = current.machine(chip.dataset.part as PartId);
    if (!state) continue;
    const def = PARTS[state.part];
    chip.style.setProperty("--cool", String(def.cooldown > 0 ? state.cooldown / def.cooldown : 0));
    chip.classList.toggle("active", state.active > 0);
    chip.classList.toggle("spent", state.charges <= 0);
    if (def.charges !== undefined) {
      const left = String(Math.max(0, state.charges));
      if (chip.dataset.left !== left) {
        chip.dataset.left = left;
        chip.innerHTML = `${def.verb}<b>${left}</b>`;
      }
    }
  }
  $("brake").classList.toggle("on", current.braking > 0);
  // The gun: what is in the rack, next round first, and whether it has anything to shoot at.
  const rack = current.ammo.join(",");
  if (rack !== rounds) {
    rounds = rack;
    $("rounds").innerHTML = current.ammo.length ? current.ammo.map((kind) => `<i class="${kind}"></i>`).join("") : "empty";
  }
  const fire = $("fire");
  fire.classList.toggle("empty", current.ammo.length === 0);
  fire.classList.toggle("ready", current.ammo.length > 0 && current.target !== null);
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
    case "machine":
      if (event.part === "pulley") sound.brace();
      break;
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
    case "blast":
      sound.bang(true);
      freeze = 0.08;
      break;
    case "dry":
      sound.click();
      if (event.why === "empty") hint("dry", "No shot left: your people leave more by the road");
      else hint("aimless", "Nothing in range: fire when a gold ring marks a target");
      break;
    case "air":
      if (event.time > 1) toast(`${event.distance.toFixed(0)} metres of air!`);
      break;
    case "launch":
      sound.swat(false);
      break;
    case "land":
      sound.bump(10);
      break;
    case "plough":
      sound.splinter();
      break;
    case "manLost":
      sound.lost();
      break;
    case "broken":
      sound.splat();
      break;
    case "finish":
      sound.fanfare();
      break;
    case "windup":
      sound.windup();
      hint("stone", "Stone coming: get out of the red ring, or brake and let it land ahead");
      break;
    case "aim":
      sound.windup();
      hint("archers", "Archers: get out of the wide ring before it fills");
      break;
    case "swat":
      sound.swat(true);
      toast("Batted back!");
      break;
    case "towerDown":
      felled += 1;
      sound.rubble(8, 0.05);
      break;
    case "deflect":
      sound.clang();
      toast("Off the roof!");
      break;
    case "volley":
      sound.twang();
      if (event.blocked) {
        sound.clang();
        toast("Off the roof!");
      } else if (event.hit) toast(event.lostMan ? "Man overboard!" : "Arrows!", "bad");
      break;
    case "pickup":
      sound.pickup(event.kind === "shot" || event.kind === "keg");
      toast({ hay: "Hay from the farmers!", man: "A volunteer!", shot: "Shot from the smith!", keg: "The Queen's own powder!" }[event.kind]);
      if (event.kind === "hay") hint("hay", "Hay takes the knocks before his shell does");
      else if (event.kind === "man") hint("man", "More men, harder lean");
      else if (event.kind === "shot") hint("shot", "Two more rounds for the gun");
      else hint("keg", "A powder keg goes next, and goes big");
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

function showResult(current: Game): void {
  resultShown = true;
  const won = current.phase === "won";
  const stars = current.stars;
  if (stars > saved.best) {
    saved.best = stars;
    save();
  }
  $("result-eyebrow").textContent = won ? "Home to roost" : "The Queen sends for toast";
  $("result-title").textContent = won
    ? ["", "Home, just about", "Safe under her wing", "Not a mark on him"][stars] ?? "Home"
    : { jolt: "Scrambled", spilled: "Spilled", fell: "Over the edge" }[current.cause ?? "jolt"];
  $("result-stars").innerHTML = Array.from({ length: 3 }, (_, index) => (index < stars ? "<b>★</b>" : "★")).join("");
  $("result-line").textContent = won
    ? stars === 3
      ? "The Empress Hen counts his cracks, finds none, and sits on him."
      : stars === 2
        ? "The Empress Hen tucks him in and glares up the hill."
        : "The Empress Hen takes one look at him and sends for glue."
    : `He got ${Math.round(current.distance)} of ${current.course.finish} metres. Change a machine and send him again.`;
  const rows: Array<[string, string]> = [
    ["Shell", `${Math.round(current.shell)}%`],
    ["King's men aboard", `${current.men} of ${MAX_MEN}`],
    ["Towers brought down", `${felled} of ${current.towers.length}`],
    ["Time", `${(current.time - current.after).toFixed(1)} s`],
  ];
  $("result-stats").innerHTML = rows.map(([label, value]) => `<li><span>${label}</span><span>${value}</span></li>`).join("");
  show("result");
}

// ---------------------------------------------------------------- input

/** Metres the cart should move across the road for each pixel the finger does. */
function reach(): number {
  return 12 / Math.min(stageHost.clientWidth, 560);
}

/**
 * The cart goes where the finger goes: drag sideways and it follows across the road, pull down
 * and the brake comes on. Arrow keys do the same from a keyboard.
 */
function steer(current: Game): { lean: number; brake: number } {
  let lean = 0;
  let brake = 0;
  if (drag) {
    const edge = current.course.width / 2 - 0.9;
    const goal = Math.max(-edge, Math.min(edge, drag.cartX + (drag.x - drag.x0) * reach()));
    lean = leanToward(current, goal);
    brake = Math.max(0, Math.min(1, (drag.y - drag.y0 - 26) / 60));
  }
  if (keys.has("ArrowLeft") || keys.has("a")) lean -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) lean += 1;
  if (keys.has("ArrowDown") || keys.has("s")) brake = 1;
  return { lean: Math.max(-1, Math.min(1, lean)), brake };
}

const stageHost = $("stage");
stageHost.addEventListener("pointerdown", (event) => {
  if (!running || !game) return;
  // A second finger anywhere is the gun.
  if (drag) {
    trigger = true;
    return;
  }
  drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, cartX: game.position.x, since: performance.now(), moved: false };
});
window.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
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
    if (type === "pointerup" && !drag.moved && performance.now() - drag.since < 280) trigger = true;
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
  hint("start", "Friends leave gifts by the road: steer into them");
  if (auto) $("lean-hint").classList.add("gone");
}

$("to-build").addEventListener("click", () => {
  sound.unlock();
  drawBuild();
  show("build");
});
$("roll-out").addEventListener("click", () => void start());
$("again").addEventListener("click", () => void start());
$("change").addEventListener("click", () => {
  drawBuild();
  show("build");
  void stage(false);
});

// ---------------------------------------------------------------- the frame loop

function advance(current: Game, steps: number): void {
  for (let index = 0; index < steps; index += 1) {
    const shoot = trigger;
    trigger = false;
    const input = auto ? steady(current) : { ...steer(current), shoot };
    current.step(input);
    for (const event of current.takeEvents()) {
      view.handle(event, current);
      narrate(event, current);
    }
  }
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
    if (current.target && current.ammo.length > 0 && current.phase === "run") hint("fire", "Gold ring on a target: tap, or press Fire");
    // A bridge with a side gone: say which side is left, in time to get onto it.
    const bridge = current.course.pieces.find((piece) => (piece.x0 !== undefined || piece.x1 !== undefined) && piece.d0 > current.distance && piece.d0 - current.distance < 48);
    if (bridge && current.phase === "run") {
      const left = (bridge.x1 ?? 9) < current.course.width / 2;
      hint(left ? "bridge-left" : "bridge-right", left ? "Bridge half gone: keep LEFT, and let her run" : "Bridge half gone: keep RIGHT, and let her run");
    }
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
    step(seconds: number, input: { lean?: number; goal?: number; brake?: number; shoot?: boolean } = {}) {
      if (!game) return null;
      const steps = Math.round(seconds / STEP);
      for (let index = 0; index < steps; index += 1) {
        // With nothing said, whatever finger or key is down steers, as it would in a live frame.
        const hands = steer(game);
        const lean = input.goal !== undefined ? leanToward(game, input.goal) : (input.lean ?? hands.lean);
        const shoot = ((input.shoot ?? false) || trigger) && index === 0;
        trigger = false;
        game.step(auto ? steady(game) : { lean, brake: input.brake ?? hands.brake, shoot });
        for (const event of game.takeEvents()) {
          view.handle(event, game);
          narrate(event, game);
        }
      }
      drawHud(game);
      view.sync(game, 1 / 60);
      return { d: Math.round(game.distance), shell: Math.round(game.shell), men: game.men, phase: game.phase };
    },
  },
});
