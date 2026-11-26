import "./style.css";
import { View } from "./render/view";
import { steady } from "./sim/autoplay";
import { Game, MAX_MEN, STEP, initPhysics, type GameEvent } from "./sim/game";
import { PARTS, PART_IDS, SLOTS, type PartId } from "./sim/parts";

const STORAGE_KEY = "eggscape:v1";
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

interface Saved {
  build: PartId[];
  best: number;
}

function load(): Saved {
  const fallback: Saved = { build: ["lever", "plane", "wedge"], best: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Saved> | null;
    const build = (raw?.build ?? []).filter((part): part is PartId => PART_IDS.includes(part as PartId));
    return { build: build.length === SLOTS ? build : fallback.build, best: Number(raw?.best) || 0 };
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
let game: Game | null = null;
let running = false;
let resultShown = false;
let accumulator = 0;
const held = new Map<number, number>();
const keys = new Set<string>();
let queue: PartId[] = [];
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
  );
  const pips = (host: HTMLElement, count: number): void => host.replaceChildren(...Array.from({ length: count }, () => document.createElement("i")));
  pips($("crew"), MAX_MEN);
  pips($("hay"), 2);
  $("lean-hint").classList.toggle("gone", leaned);
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
    button.classList.toggle("cooling", state.cooldown > 0);
    button.classList.toggle("active", state.active > 0);
  }
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
    case "windup":
      if (has("lever")) hint("stone", "Stone coming: Swat as the ring fills");
      else if (has("plane")) hint("stone", "Stone coming: Shield as the ring fills");
      else hint("stone", "Stone coming: lean out of the red ring");
      break;
    case "aim":
      hint("archers", has("plane") ? "Archers: raise the Shield" : "Archers: they pick off your men");
      break;
    case "swat":
      toast("Swat!");
      break;
    case "whiff":
      toast("Whiff");
      break;
    case "towerDown":
      toast("Tower down!");
      break;
    case "deflect":
      toast("Glanced off!");
      break;
    case "volley":
      if (event.blocked) toast("Arrows turned!");
      else toast(event.lostMan ? "Man overboard!" : "Arrows!", "bad");
      break;
    case "pickup":
      toast(event.kind === "hay" ? "Hay!" : event.kind === "man" ? "All aboard!" : "Boom!");
      break;
    case "hayLost":
      toast("Lost a bale");
      break;
    case "crack":
      if (event.stage < 3) toast("Crack!", "bad");
      break;
    case "jolt":
      if (event.amount > 1) {
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
  if (key === "r" && (running || resultShown)) void start();
});
window.addEventListener("keyup", (event) => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener("blur", () => {
  keys.clear();
  held.clear();
});

async function start(): Promise<void> {
  await stage(true);
  show("run");
}

$("to-build").addEventListener("click", () => {
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
    const input = auto ? steady(current) : { lean: lean(), fire };
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
    accumulator += Math.min(dt, 0.1);
    const steps = Math.floor(accumulator / STEP);
    accumulator -= steps * STEP;
    advance(current, Math.min(steps, 6));
    drawHud(current);
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
    step(seconds: number, input: { lean?: number; fire?: PartId[] } = {}) {
      if (!game) return null;
      const steps = Math.round(seconds / STEP);
      for (let index = 0; index < steps; index += 1) {
        game.step(auto ? steady(game) : { lean: input.lean ?? 0, fire: index === 0 ? (input.fire ?? []) : [] });
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
