import "./style.css";
import { Sound } from "./audio";
import { Stage } from "./render/stage";
import { Game, IDLE, LARDER, STEP, loadPhysics, type GameEvent, type Input } from "./sim/kitchen";
import { larderPlan, pilot } from "./sim/pilot";

const STORAGE_KEY = "eggscape:kitchen:v1";
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

interface Saved {
  best: number;
  muted: boolean;
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Saved>;
    return { best: Number(raw.best) || 0, muted: Boolean(raw.muted) };
  } catch {
    return { best: 0, muted: false };
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
const stage = new Stage($("stage"));
const sound = new Sound();
sound.muted = saved.muted;

let game: Game | null = null;
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

function show(id: "title" | "result" | "run"): void {
  $("title").hidden = id !== "title";
  $("result").hidden = id !== "result";
  $("hud").hidden = id === "title";
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
  $("shell-word").textContent = current.phase === "broken" ? "Broken" : current.cracks === 0 ? "Whole" : current.cracks === 1 ? "Cracked" : "One more";
}

function drawSound(): void {
  $("sound").classList.toggle("off", sound.muted);
}

function fresh(): void {
  game?.dispose();
  game = new Game(LARDER);
  driver = auto ? pilot(larderPlan()) : null;
  stage.load(game);
  stage.aim(null);
  pending = null;
  aiming = false;
  resultAt = -1;
  resultShown = false;
  flung = false;
  accumulator = 0;
  $("toast").replaceChildren();
  drawHud(game);
}

function begin(): void {
  if (!game || game.phase !== "ready") return;
  runs += 1;
  show("run");
  game.start();
  hint("catch", "Tap where he will come down. A bale takes a moment to get there");
}

function restart(): void {
  fresh();
  begin();
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
      toast("Caught!");
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
    case "fling":
      flung = true;
      sound.seesaw();
      if (current.level.sockets.some((socket) => socket.seat && !current.bales.some((bale) => Math.hypot(bale.x - socket.x, bale.y - socket.seat!.y) < 0.5))) {
        hint("hole", "Now stop that hole, before he rolls into it");
      }
      break;
    case "warn":
      toast("A cook is coming!", "bad");
      sound.click();
      break;
    case "broken":
      sound.splat();
      break;
    case "fried":
      sound.fry();
      break;
    case "caught":
      sound.lost();
      sound.clang();
      break;
    case "home":
      sound.fanfare();
      break;
    default:
      break;
  }
}

/** Whether he is sitting in a see-saw's seat. */
function seated(current: Game): boolean {
  const egg = current.egg;
  return current.seesaws.some(({ def }) => {
    const along = (egg.x - def.x) * def.side;
    return along > 0 && along < def.seat + 0.4 && Math.abs(egg.y - def.y) < 1;
  });
}

function coach(current: Game): void {
  if (current.phase !== "run") return;
  if (!flung && current.idle > 0.5 && seated(current)) {
    hint("seesaw", "Drop a bale on the gold end of the plank. The higher it falls from, the harder he is thrown");
  }
}

function verdict(current: Game): { eyebrow: string; title: string; line: string } {
  switch (current.phase) {
    case "home":
      if (current.stars === 3) return { eyebrow: "Home", title: "Not a mark on him", line: "Into the nest, whole, and with straw to spare. The Empress Hen has counted him twice." };
      if (current.cracks > 0) return { eyebrow: "Home", title: "Home, and cracked", line: flung && lastKnock > 0 ? "He met something harder than straw on the way. A gentler throw, or a bale where he hit." : "He is home, with a crack to show his mother." };
      return { eyebrow: "Home", title: "Home", line: "Whole, but it took most of the straw in the kitchen. Three bales will do it." };
    case "broken":
      return { eyebrow: "A great fall", title: "Humpty Dumpty", line: overAt < 4 ? "A long drop, and nothing under him. Tap the floor where he will come down, and do it early: the bale takes a moment." : "That was harder than a shell can take. Straw and sacks are soft; wood, stone and iron are not." };
    case "fried":
      return { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "Down the hole and into her pan. A bale dropped in the hole stops it: tap it before he gets there." };
    case "caught":
      return seated(current)
        ? { eyebrow: "Too slow", title: "Caught", line: flung ? "The plank tipped, but not hard enough to throw him. Let the bale fall from higher." : "He sat in the see-saw until a cook found him. Drop a bale on the gold end of the plank." }
        : { eyebrow: "Too slow", title: "Caught", line: "He stopped, and a cook had him. Keep him moving." };
    default:
      return { eyebrow: "", title: "", line: "" };
  }
}

function showResult(current: Game): void {
  resultShown = true;
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
  $("result-stars").hidden = current.phase !== "home";
  const stats: Array<[string, string]> = [
    ["Bales thrown", `${current.level.bales - current.balesLeft} of ${current.level.bales}`],
    ["Time", `${overAt.toFixed(1)} s`],
  ];
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
  if (stars > saved.best) {
    saved.best = stars;
    save();
  }
  show("result");
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
    if (current.over && resultAt < 0) resultAt = current.time + (current.phase === "fried" ? 1.9 : current.phase === "home" ? 2.2 : 1.5);
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

function toggleSound(): void {
  sound.unlock();
  sound.setMuted(!sound.muted);
  saved.muted = sound.muted;
  save();
  drawSound();
}

$("go").addEventListener("click", () => {
  sound.unlock();
  begin();
});
$("again").addEventListener("click", () => {
  sound.unlock();
  restart();
});
$("redo").addEventListener("click", () => {
  sound.unlock();
  restart();
});
$("sound").addEventListener("click", toggleSound);
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === "r") restart();
  else if (key === "m") toggleSound();
  else if ((key === " " || key === "enter") && game?.phase === "ready") begin();
});

// ------------------------------------------------------------------ the loop

stage.app.on("update", (dt: number) => {
  const current = game;
  if (!current) return;
  accumulator = Math.min(0.1, accumulator + dt);
  const steps = Math.floor(accumulator / STEP);
  accumulator -= steps * STEP;
  if (current.phase !== "ready") advance(current, steps);
  coach(current);
  drawHud(current);
  stage.sync(current, dt);
  if (current.over && !resultShown && resultAt >= 0 && current.time >= resultAt) showResult(current);
});

await loadPhysics();
fresh();
drawSound();
show("title");
if (auto) begin();

/** For driving the game where frames do not tick (a hidden tab): `__egg.step(seconds, { x, y })`. */
(window as unknown as { __egg: unknown }).__egg = {
  get game() {
    return game;
  },
  stage,
  IDLE,
  begin,
  restart,
  step(seconds: number, bale?: { x: number; y: number }) {
    if (!game) return null;
    if (bale) pending = bale;
    advance(game, Math.round(seconds / STEP));
    coach(game);
    drawHud(game);
    stage.sync(game, seconds);
    if (game.over && !resultShown && resultAt >= 0 && game.time >= resultAt) showResult(game);
    return { phase: game.phase, time: game.time, egg: game.egg, cracks: game.cracks, bales: game.balesLeft };
  },
};
