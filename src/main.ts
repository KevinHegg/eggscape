import "./style.css";
import { Sound } from "./audio";
import { View } from "./render/view";
import { steady } from "./sim/autoplay";
import { chasms } from "./sim/course";
import { Game, MAX_MEN, STEP, initPhysics, type GameEvent } from "./sim/game";
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
const held = new Map<number, number>();
const keys = new Set<string>();
let queue: PartId[] = [];
/** The Fire button was pressed and the sim has not yet heard. */
let trigger = false;
/** Seconds the world holds its breath after a big hit. */
let freeze = 0;
let felled = 0;
let flying = false;
let rounds = "";
const hinted = new Map<string, number>();
let leaned = false;

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
  queue = [];
  trigger = false;
  freeze = 0;
  felled = 0;
  flying = false;
  rounds = "?";
  held.clear();
  if (run) drawBar();
}

function drawBuild(): void {
  const slots = $("slots");
  slots.replaceChildren(
    ...Array.from({ length: SLOTS }, (_, index) => {
      const slot = document.createElement("div");
      const part = saved.build[index];
      slot.textContent = part ? PARTS[part].verb : "·";
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
      button.innerHTML = `<small>${def.machine}</small><strong>${def.verb}</strong><span>${def.blurb}</span>`;
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
  $("bar").replaceChildren(
    ...saved.build.map((id, index) => {
      const def = PARTS[id];
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.part = id;
      button.innerHTML = `<kbd>${index + 1}</kbd><strong>${def.verb}</strong><span>${def.machine}</span>`;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        queue.push(id);
      });
      return button;
    }),
    fireButton(),
  );
  const pips = (host: HTMLElement, count: number): void => host.replaceChildren(...Array.from({ length: count }, () => document.createElement("i")));
  pips($("crew"), MAX_MEN);
  pips($("hay"), 2);
  $("lean-hint").classList.toggle("gone", leaned);
}

function fireButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "fire";
  button.innerHTML = `<kbd>space</kbd><strong>Fire</strong><span id="rounds"></span>`;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    trigger = true;
  });
  return button;
}

function drawHud(current: Game): void {
  $("shell-fill").style.width = `${current.shell}%`;
  $("shell").className = `meter stage-${current.stage}`;
  [...$("crew").children].forEach((pip, index) => pip.classList.toggle("on", index < current.men));
  [...$("hay").children].forEach((pip, index) => pip.classList.toggle("on", index < current.hay));
  $("track-fill").style.width = `${current.progress * 100}%`;
  $("track-egg").style.left = `${current.progress * 100}%`;
  for (const button of $("bar").children as HTMLCollectionOf<HTMLButtonElement>) {
    const state = current.machine(button.dataset.part as PartId);
    if (!state) continue;
    const def = PARTS[state.part];
    button.style.setProperty("--cool", String(state.cooldown / def.cooldown));
    button.style.setProperty("--live", String(state.active / def.active));
    button.classList.toggle("cooling", state.cooldown > 0 && state.active <= 0);
    button.classList.toggle("active", state.active > 0);
  }
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
  host.append(line);
  while (host.children.length > 2) host.firstElementChild?.remove();
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
  const has = (part: PartId): boolean => current.build.includes(part);
  switch (event.type) {
    case "machine":
      if (event.part === "plane") sound.shield();
      else if (event.part === "wheel") sound.whoosh();
      else if (event.part === "screw") sound.hop();
      else if (event.part === "wedge") sound.smash();
      else if (event.part === "pulley") sound.brace();
      break;
    case "shoot":
      sound.cannon();
      break;
    case "bang":
      sound.bang(false);
      freeze = 0.05;
      if (event.hit === "wall") toast("Breach!");
      break;
    case "blast":
      sound.bang(true);
      freeze = 0.08;
      toast("Boom!");
      break;
    case "dry":
      sound.click();
      if (event.why === "empty") hint("dry", "No shot left: your people leave more by the road");
      else hint("aimless", "Nothing in range: Fire when a gold ring marks a target");
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
      if (has("lever")) hint("stone", "Stone coming: Swat as the ring fills");
      else if (has("plane")) hint("stone", "Stone coming: Shield as the ring fills");
      else hint("stone", "Stone coming: lean out of the red ring");
      break;
    case "aim":
      sound.windup();
      hint("archers", has("plane") ? "Archers: raise the Shield" : "Archers: they pick off your men");
      break;
    case "swat":
      sound.swat(true);
      toast("Swat!");
      break;
    case "whiff":
      sound.swat(false);
      toast("Whiff");
      break;
    case "towerDown":
      felled += 1;
      sound.rubble(8, 0.05);
      toast("Tower down!");
      break;
    case "deflect":
      sound.clang();
      toast("Glanced off!");
      break;
    case "volley":
      sound.twang();
      if (event.blocked) {
        sound.clang();
        toast("Arrows turned!");
      } else toast(event.lostMan ? "Man overboard!" : "Arrows!", "bad");
      break;
    case "pickup":
      sound.pickup(event.kind === "shot" || event.kind === "keg");
      toast({ hay: "Hay from the farmers!", man: "A volunteer!", shot: "Shot from the smith!", keg: "The Queen's own powder!" }[event.kind]);
      if (event.kind === "hay") hint("hay", "Hay takes the next knock for him");
      else if (event.kind === "man") hint("man", "More men, harder lean");
      else if (event.kind === "shot") hint("shot", "Two more rounds: Fire at the gold ring");
      else hint("keg", "A powder keg goes next, and goes big");
      break;
    case "hayLost":
      toast("Lost a bale");
      break;
    case "crack":
      sound.crack(true);
      if (event.stage < 3) toast("Crack!", "bad");
      break;
    case "jolt":
      if (event.amount + event.absorbed > 2) sound.bump(event.amount + event.absorbed);
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

function lean(): number {
  let value = 0;
  for (const side of held.values()) value += side;
  if (keys.has("ArrowLeft") || keys.has("a")) value -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) value += 1;
  return Math.max(-1, Math.min(1, value));
}

const stageHost = $("stage");
stageHost.addEventListener("pointerdown", (event) => {
  if (!running) return;
  held.set(event.pointerId, event.clientX < window.innerWidth / 2 ? -1 : 1);
  if (!leaned) {
    leaned = true;
    $("lean-hint").classList.add("gone");
  }
});
for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) {
  window.addEventListener(type, (event) => held.delete(event.pointerId));
}
stageHost.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.add(key);
  if (running && ["1", "2", "3"].includes(key)) {
    const part = saved.build[Number(key) - 1];
    if (part) queue.push(part);
  }
  if (running && (key === " " || key === "f" || key === "4")) {
    event.preventDefault();
    trigger = true;
  }
  if (key === "m") toggleSound();
  if (key === "r" && (running || resultShown)) void start();
});
window.addEventListener("keyup", (event) => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener("blur", () => {
  keys.clear();
  held.clear();
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
    const fire = queue;
    queue = [];
    const shoot = trigger;
    trigger = false;
    const input = auto ? steady(current) : { lean: lean(), fire, shoot };
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
    if (current.target && current.ammo.length > 0 && current.phase === "run") hint("fire", "Gold ring on a target: tap Fire");
    if (chasms(current.course).some((gap) => gap.d0 > current.distance && gap.d0 - current.distance < 42)) {
      hint("gap", current.build.includes("wheel") ? "Gap ahead: no Surge, or he overshoots the hill" : "Gap ahead: hold him straight");
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
    step(seconds: number, input: { lean?: number; fire?: PartId[]; shoot?: boolean } = {}) {
      if (!game) return null;
      const steps = Math.round(seconds / STEP);
      for (let index = 0; index < steps; index += 1) {
        game.step(auto ? steady(game) : { lean: input.lean ?? 0, fire: index === 0 ? (input.fire ?? []) : [], shoot: input.shoot ?? false });
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
