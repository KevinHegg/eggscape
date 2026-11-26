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
/** The brake is on. It has its own button, and stays as it was left: dragging only steers. */
let slow = false;
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
/** How the charge with the long match went: unlit, thrown by it, held by the brake, in his face, or long past it. */
let charge: "unlit" | "lit" | "thrown" | "braked" | "early" | "late" | "wet" = "unlit";
/** What became of the see-saw: still set, she went over on it, the keg did, nobody did, or she was under the cauldron. */
let seesaw: "set" | "flown" | "keg" | "wasted" | "under" = "set";

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
  setSlow(false);
  lastBoom = { big: false, time: -1 };
  charge = "unlit";
  seesaw = "set";
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
  // The rolling pin, while it is behind her: how far behind.
  const pin = current.pin;
  const gap = pin ? current.distance - pin.d : 0;
  const chased = pin !== null && (pin.state === "falling" || pin.state === "rolling") && gap > 0 && current.phase === "run";
  $("chase").classList.toggle("gone", !chased);
  if (chased) {
    $("chase").classList.toggle("near", gap < 9);
    $("chase-pin").style.left = `${Math.max(0, Math.min(100, 100 - (gap / 26) * 100))}%`;
    $("chase-gap").textContent = `${Math.round(gap)} m`;
  }
  $("brake").classList.toggle("on", slow);
  $("brake").setAttribute("aria-pressed", String(slow));
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
      if (current.kegs.find((keg) => keg.def.id === event.id)?.def.fuse !== undefined) {
        charge = "lit";
        toast("It's lit!");
        hint("ride", slow ? "Brake off, and get past it before it goes!" : "Get past it before it goes!");
      } else if (Math.hypot(event.at.x - cart.x, event.at.z - cart.z) < KEG_TRIP + 0.6) toast("A slow match!", "bad");
      break;
    }
    case "kick":
      if (event.braked) {
        charge = "braked";
        toast("The brake held her!", "bad");
      } else if (event.gain > 1.5) {
        if (charge === "lit" || charge === "early") charge = "thrown";
        sound.whoosh();
        toast("Whoosh!");
      }
      break;
    case "flood":
      sound.smash();
      sound.splash();
      sound.rubble(7, 0.05);
      freeze = Math.max(freeze, 0.07);
      toast("There goes the cistern!");
      break;
    case "doused":
      sound.sizzle();
      if (current.kegs.find((keg) => keg.def.id === event.id)?.def.fuse !== undefined) {
        charge = "wet";
        hint("soaked", "Wet powder is no use to her, either");
      }
      break;
    case "boom":
      if (current.kegs.find((keg) => keg.def.id === event.id)?.def.fuse !== undefined && charge === "lit") {
        // Where was he when it went? Short of it, or so far past that it never touched him.
        charge = current.distance < -event.at.z + 0.3 ? "early" : "late";
      }
      sound.boom(event.big);
      freeze = Math.max(freeze, event.big ? 0.1 : 0.04);
      if (event.big || lastBoom.time !== current.time || !lastBoom.big) lastBoom = { big: event.big, time: current.time };
      if (event.big) toast("There goes the powder!");
      break;
    case "breach":
      sound.rubble(9, 0.1);
      toast(current.walls.find((wall) => wall.def.id === event.id)?.def.gate ? "The gate's open!" : "The barricade's down!");
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
    case "potLoose":
      sound.twang();
      sound.groan();
      break;
    case "tip":
      sound.thud(4);
      break;
    case "tossed":
      sound.whoosh();
      break;
    case "wham":
      sound.bang(true);
      sound.clang();
      freeze = 0.08;
      seesaw = event.flung === "cart" ? "flown" : event.hit ? "under" : event.flung === "keg" ? "keg" : "wasted";
      if (event.flung === "cart") {
        sound.whoosh();
        toast("Over she goes!");
      } else if (event.hit) toast("Under the cauldron!", "bad");
      else if (event.flung === "keg") toast("There goes her powder!");
      else {
        toast("Nobody on the plank!", "bad");
        hint("knock", "The see-saw is spent. There is still the gate: a round at its ring");
      }
      break;
    case "pinLoose":
      sound.twang();
      sound.groan();
      toast("Her rolling pin!", "bad");
      break;
    case "pinDown":
      sound.bang(true);
      sound.thud(2);
      freeze = Math.max(freeze, 0.07);
      hint("pin", "It has the whole street, and it does not stop. Keep ahead of it, or get out of its road");
      break;
    case "pinPast":
      sound.whoosh();
      toast("There it goes!");
      hint("after", "Brake off, and follow it down. It is flattening the hill for her");
      break;
    case "letGo":
      sound.groan();
      hint("brake", "It's going! Brake, and let it land first");
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
      else if (event.by === "ram") toast("Skittles!");
      else if (event.by === "flood") toast("Washed away!");
      else if (event.by === "pin") toast("Rolled out flat!");
      break;
    case "bash":
      sound.clang();
      sound.bang(false);
      toast("The shield wall!", "bad");
      hint("shields", "They won't budge. A round, an egg apiece, or powder behind her");
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
    case "stoneLoose":
      sound.groan();
      toast("Stone away!");
      hint("stone", "It keeps to the left. Follow it down");
      break;
    case "thud":
      sound.bang(true);
      freeze = Math.max(freeze, 0.07);
      break;
    case "plunge":
      sound.splash();
      toast("Into the gorge!");
      break;
    case "wainCrash":
      sound.smash();
      sound.splash();
      toast("Into the well!");
      break;
    case "air":
      if (event.time > 0.7) toast(`${event.distance.toFixed(0)} metres of air!`);
      if (current.course.straw && current.distance >= current.course.straw.d0 && current.distance <= current.course.straw.d1 + 4) sound.thud(4);
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
  if (current.cause === "blast" && charge === "early") {
    return { title: "Devilled", line: "The gilt keg went off in his face. Light it, then be past it when the red ring closes." };
  }
  if (current.cause === "blast") {
    return lastBoom.big
      ? { title: "Devilled", line: "He was at the barricade when the powder wagon went up. Set it off from well back, and brake until it has gone." }
      : { title: "Devilled", line: "A keg in the road with a slow match in it. The red rings mark them: steer wide, or burst them with an egg from a distance." };
  }
  if (!course.tower || !current.tower) {
    // A street with no tower in it: the trouble is powder, a barricade, and the kitchen.
    const wall = current.walls.find((one) => one.state === "up");
    const held = wall !== undefined && wall.def.d - current.distance < 9;
    const stump = course.pieces.find((piece) => piece.x0 !== undefined);
    if (course.seesaw) {
      // The kitchen wall: over it on the see-saw, or through its gate.
      const title = current.cause === "caught" ? "Omelette" : "Scrambled";
      if (current.cause === "crushed") return { title: "Coddled", line: "Under the Queen's cauldron when it came down. Cut the rope as she crosses the gold bar, and come at the plank on the brake." };
      if (held && seesaw === "wasted") return { title, line: "The cauldron came down with nobody on the plank. After that there is only the gate: a round at its gold ring." };
      if (held) return { title, line: "The kitchen wall, and the gate shut. Be on the plank when the cauldron lands and she goes over it. Or put a round into the gate." };
      if (current.cause === "mob") return { title: "Beaten", line: "The shield wall behind the gate had him. Over the wall misses them altogether. So does sending the keg over first." };
    }
    if (course.pin) {
      // The hill with the rolling pin on it: out of its road, or in front of it all the way down.
      const half = course.width / 2;
      const market = course.square;
      const leaving = market !== null && current.distance > market.d0 && current.distance < market.d1 + 6 && current.position.x * Math.sign(market.x) > half - 2.5;
      if (current.cause === "rolled") {
        if (held) return { title: "Pancake", line: "The barricade stopped her, and nothing stops the pin. A round at its gold ring, before she gets there." };
        if (leaving) return { title: "Pancake", line: "She came out of the bottom of the square as it came by. Turn in, brake, and stay in until it has gone past." };
        if (slow) return { title: "Pancake", line: "The Queen's rolling pin does not brake. On this hill the brake is for the market square, and nowhere else." };
        return { title: "Pancake", line: "The Queen's rolling pin has the whole street. Keep ahead of it all the way down, or turn in to the market square and let it by." };
      }
      if (held) return { title: current.cause === "caught" ? "Omelette" : "Scrambled", line: "The Queen's barricade. Her rolling pin would have gone through it for him. So would a round at its gold ring." };
      if (current.cause === "mob") return { title: "Beaten", line: "The kitchen had him. A round flattens a rank. So does her rolling pin, if he lets it go first." };
    }
    if (course.mill && stump) {
      // The hill with the mill on it: a stone, a barricade, and a bridge with most of it missing.
      const hung = current.stone?.state === "hung";
      if (current.cause === "fell") {
        if (current.position.x < (stump.x0 ?? 0) - 0.1) return { title: "Poached", line: "Only the right-hand half of the bridge is standing. Keep right for the leap." };
        if (charge === "braked") return { title: "Poached", line: "The powder went off behind him with the brake still on, and the brake won. Let it off before the red ring closes." };
        if (charge === "early") return { title: "Poached", line: "The gilt keg went off before he reached it. Light it from closer in, or come at it faster." };
        if (charge === "late") return { title: "Poached", line: "He was long past the gilt keg when it went. Light it sooner: an egg carries a good way." };
        if (charge === "thrown") return { title: "Poached", line: "Thrown, and not far enough. The nearer it is behind him when it goes, the harder the push." };
        return { title: "Poached", line: "The gorge is wider than a cart can jump. Egg the gilt keg on the quay, and let it go off behind him." };
      }
      if (held && (current.cause === "caught" || current.cause === "jolt")) {
        return hung
          ? { title: current.cause === "caught" ? "Omelette" : "Scrambled", line: "The Queen's barricade. The miller's stone would go through it like a pie crust: shoot the hoist at the top of the hill." }
          : { title: current.cause === "caught" ? "Omelette" : "Scrambled", line: "The Queen's barricade. A round at its ring would have shifted it." };
      }
      if (current.cause === "jolt" && current.stone?.body) {
        const at = current.stone.body.translation();
        if (Math.hypot(at.x - current.position.x, at.z - current.position.z) < 5) return { title: "Milled", line: "The stone has the left of the road and means to keep it. Give it room." };
      }
      if (current.cause === "jolt" && current.distance > stump.d1) {
        return charge === "braked"
          ? { title: "Scrambled", line: "So nearly over. The brake was on when the powder went, and took the best of the push." }
          : { title: "Scrambled", line: "So nearly over. The nearer the gilt keg is behind him when it goes, the harder the push." };
      }
    }
    switch (current.cause) {
      case "mob":
        return course.cistern
          ? { title: "Beaten", line: "The shield wall had him. A round opens it, an egg apiece ducks them, and the gilt keg going off behind him sends him clean through. If it is dry." }
          : { title: "Beaten", line: "The kitchen had him. An egg makes them duck; a round from the gun flattens a rank." };
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
        ? { title: "Poached", line: towerAtEnd === "down" ? "He went in beside the bridge. The tower fell on the left: cross on the left." : "He reached the water before the bridge did. Put the brake on, and let the tower land." }
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
 * back: a little drag is a drift, a long one a swerve. The brake is a button of its own. Arrow
 * keys do the same from a keyboard.
 */
function steer(current: Game): { lean: number; brake: number } {
  let rate = 0;
  let brake = 0;
  if (drag) {
    const across = drag.x - drag.x0;
    rate = (Math.sign(across) * Math.max(0, Math.abs(across) - SLACK)) / (fullLean() - SLACK);
  }
  if (slow) brake = 1;
  if (keys.has("ArrowLeft") || keys.has("a")) rate -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) rate += 1;
  return { lean: leanAt(current, Math.max(-1, Math.min(1, rate))), brake };
}

function setSlow(on: boolean): void {
  if (slow === on) return;
  slow = on;
  if (on && running) hint("slow", "Brake's on. Tap it again to let her run");
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
$("brake").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (running && !handing) setSlow(!slow);
});
$("fire").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (running) trigger = true;
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.add(key);
  if (running && (key === " " || key === "f")) {
    event.preventDefault();
    trigger = true;
  }
  if (running && (key === "ArrowDown" || key === "s" || key === "b")) setSlow(!slow);
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
const OPENING: Record<string, string> = {
  "Bell Tower Street": "The bridge is out. That tower would reach.",
  "Powder Row": "The Queen's powder. Red rings are traps: egg them from well back.",
  "Pudding Lane": "Kegs all down the lane, and a cistern over it. Fire, or water?",
  "Cauldron Gate": "A wall, a see-saw, and the Queen's cauldron on a rope over it.",
  "Rolling Pin Hill": "That is the Queen's rolling pin, slung over the street. It is for him.",
  "Miller's Leap": "The miller's stone hangs over the road. Shoot the hoist.",
};
const opening = (index: number): string => OPENING[STREETS[index]?.name ?? ""] ?? "";

async function start(index = firstStreet, carry?: Carry): Promise<void> {
  sound.unlock();
  await stage(true, index, carry);
  show("run");
  hint(`start${index}`, opening(index));
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
  hint(`start${street}`, opening(street));
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
  // The see-saw: what it is, what is on it, and when to cut the rope.
  const saw = current.course.seesaw;
  if (saw && current.seesaw) {
    const gap = saw.d - saw.near - current.distance;
    const gate = current.walls.find((one) => one.state === "up");
    if (current.seesaw.pot === "hung" && current.seesaw.state === "set") {
      const loaded = current.kegs.some((keg) => keg.state === "set" && Math.abs(keg.def.x - saw.x) <= saw.half && keg.def.d < saw.d && keg.def.d > saw.d - saw.near);
      if (gap < 62 && gap > 42) hint("seesaw", "A see-saw! What's on the plank when the cauldron lands goes over the wall");
      else if (gap < 38 && gap > 18 && loaded) hint("loaded", "Egg the keg off the plank and ride it yourself. Or leave it, and send it over");
      else if (gap < 16 && gap > 4) hint("cue", slow ? "Cut the rope as she crosses the gold bar" : "Brake! Then cut the rope as she crosses the gold bar");
    } else if (current.seesaw.pot === "down" && gate && current.grounded && !current.kegs.some((keg) => keg.state === "flying") && gate.def.d - current.distance > 4 && gate.def.d - current.distance < 24) hint("gate", "The gate's gold ring: a round opens it");
  }
  // The rolling pin: where to get out of its road, and what the brake is for on this hill.
  const pin = current.pin;
  const market = current.course.square;
  const chased = pin !== null && pin.state === "rolling" && pin.d < current.distance;
  if (pin && market && chased) {
    const out = current.position.x * Math.sign(market.x) > current.course.width / 2 + 0.9;
    const behind = current.distance - pin.d;
    if (current.distance > market.d0 - 26 && current.distance < market.d0 - 4) hint("market", `The market square, on the ${market.x > 0 ? "right" : "left"}! Turn in, and let it go by`);
    else if (out && !slow && current.distance < market.d1 - market.taper) hint("sit", "Brake! Wait here till it has gone by");
    else if (!out && slow && behind < 16) hint("pinBrake", "Brake off! It's right behind her");
    else if (!out && current.distance > market.d1 + 4 && current.distance < market.d1 + 30) hint("ahead", "No brake now. The powder it bursts behind her will throw her on");
  }
  // The powder: said once the train is in sight, and again when the barricade is close.
  const wall = current.walls.find((one) => one.state === "up");
  if (wall) {
    const gap = wall.def.d - current.distance;
    const lit = current.kegs.some((keg) => keg.state === "lit" && !keg.def.trap);
    const wagon = current.kegs.some((keg) => keg.def.big && keg.state !== "gone");
    if (!wagon) {
      // No powder against this one: the stone, or a round.
      if (gap < 30 && gap > 8 && (current.stone?.state === "hung" || chased)) hint("wall", "The barricade! Tap its gold ring");
    } else if (gap < 34 && gap > 12 && lit) hint("wait", "It's lit! Brake, and let it go up");
    else if (gap < 60 && gap > 30 && !lit) hint("train", "One egg on a kerb keg sets the whole row off");
    else if (gap < 28 && gap > 10 && !lit) hint("wagon", "The barricade! Egg the powder wagon, and brake");
  }
  // The leap: said in good time, on the last of the hill.
  const stump = current.course.pieces.find((piece) => piece.x0 !== undefined);
  // The charge with the long match: what it is for, then how to use it, then the one thing that spoils it.
  const keg = current.kegs.find((one) => one.def.fuse !== undefined && (one.state === "set" || one.state === "lit") && one.def.d > current.distance - 2);
  if (keg && !wall) {
    const gap = keg.def.d - current.distance;
    if (keg.state === "lit") {
      if (slow && gap < 14) hint("off", "Brake off, or the blast won't carry her!");
    } else if (stump && gap < 52 && gap > 38) hint("gap", "Too wide to jump! The gilt keg on the quay could throw her over");
    else if (gap < 36 && gap > 12 && current.flood?.state !== "running") hint("charge", "Egg the gilt keg, then be just past it when it blows");
  } else if (stump && charge !== "unlit" && current.distance > stump.d0 - 8 && current.distance < stump.d0) hint("leap", "Keep right for the bridge!");
  if (current.ammo === 0) return;
  const lit = current.target;
  if (!lit) return;
  if (lit.id === "hoist") hint("hoist", "Gold ring on the mill's hoist: tap it, or press Fire");
  if (lit.id === "cistern" && current.distance > 11) hint("cistern", "Shoot the cistern and the powder drowns. All of it");
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
