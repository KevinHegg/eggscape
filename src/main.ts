import "./style.css";
import { Sound } from "./audio";
import { Stage } from "./render/stage";
import { Game, IDLE, LEVELS, STEP, loadPhysics, type GameEvent, type Input } from "./sim/kitchen";
import { PLANS, pilot, seated } from "./sim/pilot";

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
    return { stars, reached: Math.min(LEVELS.length - 1, Math.max(0, Number(raw.reached) || 0)), muted: Boolean(raw.muted) };
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
/** He is being shown coming down from the roost above, and cannot be let go until he has landed. */
let arriving = false;

/** What is said as each room begins: the one thing in it that will not wait. */
const OPENING: Record<string, [string, string]> = {
  larder: ["catch", "Tap where he will come down. A bale takes a moment to get there"],
  scullery: ["bridge", "Quick: a bale in that gap, or he is in the pan under it"],
  mill: ["sluice", "The wheel is dry. A bale on the gold pan by the tank lets the water in"],
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
  if (game) $("ready-name").textContent = game.level.name;
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
  $("room").textContent = `${current.level.name} · room ${room + 1} of ${LEVELS.length}`;
}

function drawSound(): void {
  $("sound").classList.toggle("off", sound.muted);
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
  accumulator = 0;
  $("toast").replaceChildren();
  drawHud(game);
}

function begin(): void {
  if (!game || game.phase !== "ready" || stage.arriving) return;
  runs += 1;
  game.start();
  show("run");
  const opening = OPENING[game.level.key];
  if (opening) hint(opening[0], opening[1]);
}

/** The same room again, at once: from the shelf, or from the roost above it. */
function restart(): void {
  fresh(room);
  begin();
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
      sound.mill();
      break;
    case "fling":
      flung = true;
      sound.seesaw();
      if (holeOpen(current)) hint("hole", "Now stop that hole, before he rolls into it");
      break;
    case "warn":
      toast("A cook is coming!", "bad");
      sound.click();
      break;
    case "broken":
      sound.splat();
      break;
    case "fried":
      friedHung = current.level.pits.some((pit) => pit.hung && Math.abs(pit.x - event.x) < 0.1 && Math.abs(pit.pan - event.y) < 0.1);
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

/** Whether the hole in the bottom floor, the one over the stove, still has no bale in it. */
function holeOpen(current: Game): boolean {
  return current.level.pits.some(
    (pit) => !pit.hung && !current.bales.some((bale) => Math.abs(bale.x - pit.x) < 0.5 && Math.abs(bale.y - pit.y) < 0.9),
  );
}

function coach(current: Game): void {
  if (current.phase !== "run") return;
  if (!flung && current.idle > 0.5 && seated(current)) {
    hint("seesaw", "Drop a bale on the gold end of the plank. The higher it falls from, the harder he is thrown");
  }
  // In the scullery, once he is over the gap, the long drop at the far wall is next.
  const egg = current.egg;
  if (current.level.key === "scullery" && egg.x < 0.3 && egg.x > -1.6 && egg.y > current.level.top - 4.5) {
    hint("drop", "A long drop at the wall. Get a bale under it");
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
      if (current.stars === 3) return { eyebrow: "Home", title: "Not a mark on him", line: "Into the nest, whole, and with straw to spare. The Empress Hen has counted him twice." };
      if (current.cracks > 0) return { eyebrow: "Home", title: "Home, and cracked", line: flung && lastKnock > 0 ? "He met something harder than straw on the way. A gentler throw, or a bale where he hit." : "He is home, with a crack to show his mother." };
      return { eyebrow: "Home", title: "Home", line: `Whole, but it took all the straw in the room. Keep ${spare === 1 ? "one bale" : `${spare} bales`} back for the third star.` };
    case "broken":
      return { eyebrow: "A great fall", title: "Humpty Dumpty", line: overAt < 4 ? "A long drop, and nothing under him. Tap the floor where he will come down, and do it early: the bale takes a moment." : "That was harder than a shell can take. Straw and sacks are soft; wood, stone and iron are not." };
    case "fried":
      if (friedHung && current.level.wheels.length > 0) {
        return { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "The wheel was dry, and it gave under him. A bale on the gold pan by the tank lets the water in: do it as he is let go, because the water takes a moment to come down." };
      }
      return friedHung
        ? { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "Through the gap and into the pan hung under it. Bridge the gap with a bale, and do it as soon as he is let go." }
        : { eyebrow: "The Queen's breakfast", title: "Sunny side up", line: "Down the hole and into her pan. A bale dropped in the hole stops it: tap it before he gets there." };
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
    stage.hold(last ? current.level.nest.y0 - 1.4 : LEVELS[room + 1]!.start.y - 1.9, cover);
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
  begin();
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
  if (auto) begin();
}

await loadPhysics();
fresh(0);
drawSound();
if (saved.reached > 0) {
  const resume = $("resume");
  resume.textContent = `From the roost above ${LEVELS[saved.reached]!.name.replace(/^The /, "the ")}`;
  resume.hidden = false;
}
show("title");
if (auto) begin();

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
    coach(game);
    drawHud(game);
    stage.sync(game, seconds);
    landed();
    if (game.over && !resultShown && resultAt >= 0 && game.time >= resultAt) showResult(game);
    return { phase: game.phase, time: game.time, egg: game.egg, cracks: game.cracks, bales: game.balesLeft };
  },
};
