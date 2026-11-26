import * as pc from "playcanvas";
import { chasms, courseEnd, heightAt, spanOf, type CourseDef } from "../sim/course";
import { EGG_RANGE, KEG_TRIP, MEN, STONE_RADIUS, panAt, type EggAim, type Game, type GameEvent, type Prop, type Vec3 } from "../sim/game";

/** What a touch on the street means: a round from the gun at a ringed target, or an egg at anything else. */
export type Pick = { shoot: string } | { egg: EggAim };

/**
 * The water as it is seen: a gap in the street, and with it whatever broken length of bridge
 * still stands out over it on the near side.
 */
function gorges(course: CourseDef): Array<{ d0: number; d1: number; stump: boolean }> {
  return chasms(course).map((gap) => {
    let d0 = gap.d0;
    let stump = false;
    for (let index = course.pieces.length - 1; index >= 0; index -= 1) {
      const piece = course.pieces[index]!;
      if (piece.x0 !== undefined && Math.abs(piece.d1 - d0) < 0.01) {
        d0 = piece.d0;
        stump = true;
      }
    }
    return { d0, d1: gap.d1, stump };
  });
}

/** How many splashes of yolk lie about before the oldest is mopped up. */
const MESS = 28;

type Triple = readonly [number, number, number];
type Shape = "box" | "sphere" | "cylinder" | "cone" | "capsule";

/** An illuminated manuscript's paint box: vellum, lapis, vermilion, verdigris and gold leaf. */
const INK = {
  vellum: new pc.Color(0.93, 0.87, 0.72),
  vellumDark: new pc.Color(0.82, 0.74, 0.56),
  plaster: new pc.Color(0.9, 0.84, 0.7),
  plasterWarm: new pc.Color(0.88, 0.76, 0.58),
  plasterCool: new pc.Color(0.8, 0.8, 0.7),
  lapis: new pc.Color(0.14, 0.26, 0.6),
  vermilion: new pc.Color(0.82, 0.2, 0.12),
  verdigris: new pc.Color(0.22, 0.5, 0.42),
  gold: new pc.Color(0.93, 0.68, 0.14),
  bronze: new pc.Color(0.8, 0.56, 0.16),
  ink: new pc.Color(0.11, 0.08, 0.07),
  road: new pc.Color(0.66, 0.6, 0.5),
  roadDark: new pc.Color(0.56, 0.5, 0.41),
  kerb: new pc.Color(0.42, 0.37, 0.32),
  grass: new pc.Color(0.5, 0.6, 0.3),
  grassDark: new pc.Color(0.36, 0.48, 0.25),
  oak: new pc.Color(0.52, 0.33, 0.16),
  oakDark: new pc.Color(0.33, 0.2, 0.1),
  iron: new pc.Color(0.2, 0.2, 0.22),
  stone: new pc.Color(0.6, 0.58, 0.54),
  egg: new pc.Color(0.98, 0.94, 0.83),
  yolk: new pc.Color(1, 0.72, 0.1),
  hay: new pc.Color(0.92, 0.76, 0.32),
  hen: new pc.Color(0.99, 0.97, 0.92),
  skin: new pc.Color(0.86, 0.66, 0.5),
  blast: new pc.Color(1, 0.55, 0.1),
  smoke: new pc.Color(0.2, 0.18, 0.18),
  water: new pc.Color(0.2, 0.44, 0.62),
  canvas: new pc.Color(0.9, 0.86, 0.76),
  rope: new pc.Color(0.74, 0.62, 0.4),
};

interface Puff {
  entity: pc.Entity;
  life: number;
  total: number;
  velocity: pc.Vec3;
  size: number;
}

interface Pulse {
  entity: pc.Entity;
  life: number;
  total: number;
  from: number;
  to: number;
}

/** Someone who only stands and cheers. */
interface Folk {
  root: pc.Entity;
  arms: pc.Entity[];
  at: Triple;
  phase: number;
}

/** One of the Queen's kitchen mob, drawn from the sim's word on where they are and what state they are in. */
interface MobLook {
  root: pc.Entity;
  arms: pc.Entity[];
  x: number;
  phase: number;
  /** Counts down from 1 while the arm comes over. */
  throwing: number;
}

/** PlayCanvas presentation. It reads the simulation and never writes it. */
export class View {
  readonly app: pc.Application;
  private readonly canvas: HTMLCanvasElement;
  private readonly materials = new Map<string, pc.StandardMaterial>();
  private readonly camera: pc.Entity;
  private scene: pc.Entity;
  private readonly scenery: number;
  private readonly lively: number;
  private ringMesh: pc.Mesh | null = null;

  private cart: pc.Entity | null = null;
  private king: pc.Entity | null = null;
  private kingArms: pc.Entity[] = [];
  private cracks: pc.Entity[] = [];
  private wheels: Array<{ pivot: pc.Entity; hub: pc.Entity }> = [];
  private men: pc.Entity[] = [];
  private bales: pc.Entity[] = [];
  private gun: pc.Entity | null = null;
  private barrel: pc.Entity | null = null;
  private gunKick = 0;
  private yolk: pc.Entity | null = null;

  private tower: pc.Entity | null = null;
  private belfry: pc.Entity | null = null;
  private shoring: pc.Entity | null = null;
  private rope: pc.Entity | null = null;
  private capstan: pc.Entity | null = null;
  private bell: pc.Entity | null = null;
  private wain: pc.Entity | null = null;
  private stone: pc.Entity | null = null;
  private stoneRope: pc.Entity | null = null;
  private sails: pc.Entity | null = null;
  private stoneRoll = 0;
  /** Where the gorge's water lies, for the splash. */
  private waterY = 0;
  private chock: pc.Entity | null = null;
  private queen: pc.Entity | null = null;
  private readonly mob = new Map<number, MobLook>();
  private readonly pans = new Map<number, pc.Entity>();
  private readonly sights = new Map<string, pc.Entity>();
  private readonly props = new Map<number, pc.Entity>();
  private readonly shots = new Map<number, pc.Entity>();
  private readonly eggs = new Map<number, pc.Entity>();
  private readonly kegs = new Map<number, { root: pc.Entity; spark: pc.Entity; ring: pc.Entity | null }>();
  private readonly walls = new Map<number, pc.Entity>();
  private readonly pickups = new Map<number, pc.Entity>();
  private mess: pc.Entity[] = [];
  private messNext = 0;
  /** Which street of the run this is: the first comes out of the castle, the rest through a town gate. */
  private street = 0;
  /** The part of each piece of clutter that goes when it is hit. */
  private readonly clutter = new Map<number, pc.Entity>();

  private hen: { root: pc.Entity; head: pc.Entity; wings: pc.Entity[] } | null = null;
  private puffs: Puff[] = [];
  private pool: pc.Entity[] = [];
  private pulses: Pulse[] = [];
  private folk: Folk[] = [];
  private chicks: pc.Entity[] = [];
  private seed = 7;
  private frame = 0;
  private airLift = 0;

  private wobble = new pc.Vec3();
  private wobbleSpeed = new pc.Vec3();
  private shake = 0;
  private clock = 0;
  private eye = new pc.Vec3(0, 12, 14);
  private gaze = new pc.Vec3(0, 0, -8);
  private snap = true;
  /** "title" looks down the street from above the crest; "run" follows the cart. */
  mode: "run" | "title" = "run";

  constructor(host: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-label", "The Great Eggscape");
    host.replaceChildren(this.canvas);
    this.app = new pc.Application(this.canvas, {
      mouse: new pc.Mouse(this.canvas),
      touch: new pc.TouchDevice(this.canvas),
      graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: "high-performance" },
    });
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    const handheld = matchMedia("(pointer: coarse)").matches;
    this.app.graphicsDevice.maxPixelRatio = Math.max(1, Math.min(window.devicePixelRatio, handheld ? 1.5 : 2));
    this.app.scene.ambientLight = new pc.Color(0.62, 0.58, 0.5);
    this.app.scene.exposure = 1.05;
    const fog = (this.app.scene as unknown as { fog?: { type: string; color: pc.Color; start: number; end: number } }).fog;
    if (fog) {
      fog.type = pc.FOG_LINEAR;
      fog.color = INK.vellum;
      fog.start = 90;
      fog.end = 230;
    }
    this.scenery = this.app.batcher.addGroup("scenery", false, 400).id;
    this.lively = this.app.batcher.addGroup("lively", true, 80).id;

    this.camera = new pc.Entity("camera");
    this.camera.addComponent("camera", { clearColor: INK.vellum, nearClip: 0.3, farClip: 300, fov: 50 });
    this.app.root.addChild(this.camera);

    const key = new pc.Entity("key");
    key.setEulerAngles(56, 14, 0);
    key.addComponent("light", {
      type: "directional",
      color: new pc.Color(1, 0.93, 0.78),
      intensity: 1.5,
      castShadows: true,
      shadowDistance: 80,
      shadowResolution: handheld ? 1024 : 2048,
      shadowBias: 0.25,
      normalOffsetBias: 0.05,
    });
    this.app.root.addChild(key);

    this.scene = new pc.Entity("scene");
    this.app.root.addChild(this.scene);
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.app.start();
  }

  resize(): void {
    this.app.resizeCanvas();
    const component = this.camera.camera;
    if (!component) return;
    const portrait = this.canvas.clientHeight > this.canvas.clientWidth;
    // On a phone the width is what's scarce: fix the view across the street.
    component.horizontalFov = portrait;
    component.fov = portrait ? 46 : 52;
  }

  // ---------------------------------------------------------------- building blocks

  private paint(name: string, color: pc.Color, options: { gloss?: number; glow?: number; opacity?: number } = {}): pc.StandardMaterial {
    const existing = this.materials.get(name);
    if (existing) return existing;
    const material = new pc.StandardMaterial();
    material.name = name;
    material.diffuse = color;
    material.gloss = options.gloss ?? 0.15;
    material.metalness = 0;
    material.useMetalness = true;
    if (options.glow) material.emissive = new pc.Color(color.r * options.glow, color.g * options.glow, color.b * options.glow);
    if (options.opacity !== undefined) {
      material.opacity = options.opacity;
      material.blendType = pc.BLEND_NORMAL;
      material.depthWrite = false;
    }
    material.update();
    this.materials.set(name, material);
    return material;
  }

  private get m() {
    return {
      road: this.paint("road", INK.road),
      roadDark: this.paint("road-dark", INK.roadDark),
      kerb: this.paint("kerb", INK.kerb),
      grass: this.paint("grass", INK.grass),
      grassDark: this.paint("grass-dark", INK.grassDark),
      oak: this.paint("oak", INK.oak),
      oakDark: this.paint("oak-dark", INK.oakDark),
      iron: this.paint("iron", INK.iron, { gloss: 0.5 }),
      stone: this.paint("stone", INK.stone),
      egg: this.paint("egg", INK.egg, { gloss: 0.6 }),
      yolk: this.paint("yolk", INK.yolk, { gloss: 0.7, glow: 0.25 }),
      hay: this.paint("hay", INK.hay),
      hen: this.paint("hen", INK.hen, { gloss: 0.2 }),
      gold: this.paint("gold", INK.gold, { gloss: 0.8, glow: 0.3 }),
      bronze: this.paint("bronze", INK.bronze, { gloss: 0.85, glow: 0.18 }),
      lapis: this.paint("lapis", INK.lapis),
      vermilion: this.paint("vermilion", INK.vermilion),
      verdigris: this.paint("verdigris", INK.verdigris),
      ink: this.paint("ink", INK.ink),
      skin: this.paint("skin", INK.skin),
      plaster: this.paint("plaster", INK.plaster),
      plasterWarm: this.paint("plaster-warm", INK.plasterWarm),
      plasterCool: this.paint("plaster-cool", INK.plasterCool),
      blast: this.paint("blast", INK.blast, { glow: 1 }),
      dust: this.paint("dust", INK.vellum, { glow: 0.2 }),
      smoke: this.paint("smoke", INK.smoke, { opacity: 0.55 }),
      water: this.paint("water", INK.water, { gloss: 0.9 }),
      spray: this.paint("spray", new pc.Color(0.8, 0.9, 0.96), { glow: 0.3 }),
      canvas: this.paint("canvas", INK.canvas),
      rope: this.paint("rope", INK.rope),
      aim: this.paint("aim", INK.gold, { glow: 1.1 }),
      flash: this.paint("flash", new pc.Color(1, 0.86, 0.5), { glow: 1.2 }),
      albumen: this.paint("albumen", new pc.Color(0.97, 0.95, 0.88), { gloss: 0.8 }),
      danger: this.paint("danger", INK.vermilion, { glow: 0.9 }),
      spark: this.paint("spark", new pc.Color(1, 0.8, 0.3), { glow: 1.6 }),
    };
  }

  private group(name: string, parent: pc.Entity, position: Triple = [0, 0, 0], euler: Triple = [0, 0, 0]): pc.Entity {
    const entity = new pc.Entity(name);
    entity.setLocalPosition(position[0], position[1], position[2]);
    entity.setLocalEulerAngles(euler[0], euler[1], euler[2]);
    parent.addChild(entity);
    return entity;
  }

  /** `fixed` true batches it with the still scenery; a number names another batch group. */
  private shape(type: Shape, parent: pc.Entity, position: Triple, scale: Triple, material: pc.StandardMaterial, euler: Triple = [0, 0, 0], fixed: boolean | number = false): pc.Entity {
    const entity = new pc.Entity(type);
    entity.setLocalPosition(position[0], position[1], position[2]);
    entity.setLocalScale(scale[0], scale[1], scale[2]);
    entity.setLocalEulerAngles(euler[0], euler[1], euler[2]);
    entity.addComponent("render", { type, material, castShadows: true, receiveShadows: true, batchGroupId: fixed === true ? this.scenery : fixed === false ? -1 : fixed });
    parent.addChild(entity);
    return entity;
  }

  /** A thin hoop lying flat, one metre across before scaling. */
  private hoop(parent: pc.Entity, position: Triple, size: number, material: pc.StandardMaterial): pc.Entity {
    if (!this.ringMesh) {
      this.ringMesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, new pc.TorusGeometry({ tubeRadius: 0.03, ringRadius: 0.5, segments: 40, sides: 8 }));
      this.ringMesh.incRefCount(); // ours for good: it outlives every scene that borrows it
    }
    const entity = new pc.Entity("hoop");
    entity.setLocalPosition(position[0], position[1], position[2]);
    entity.setLocalScale(size, size, size);
    entity.addComponent("render", { meshInstances: [new pc.MeshInstance(this.ringMesh, material)], castShadows: false, receiveShadows: false });
    parent.addChild(entity);
    return entity;
  }

  /** The view's own dice. Nothing here reaches the simulation. */
  private chance(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** One of the King's men: a small figure in a helm. */
  private figure(parent: pc.Entity, position: Triple, coat: pc.StandardMaterial, fixed = false): pc.Entity {
    const root = this.group("figure", parent, position);
    this.shape("box", root, [0, 0.26, 0], [0.3, 0.44, 0.22], coat, [0, 0, 0], fixed);
    this.shape("sphere", root, [0, 0.6, 0], [0.26, 0.26, 0.26], this.m.skin, [0, 0, 0], fixed);
    this.shape("cone", root, [0, 0.76, 0], [0.3, 0.2, 0.3], this.m.iron, [0, 0, 0], fixed);
    return root;
  }

  /** A townsman or woman: coat, head, hat and two arms that can be swung. */
  private townsfolk(parent: pc.Entity, position: Triple, coat: pc.StandardMaterial, hat: "cap" | "straw" | "hood" | "crown"): { root: pc.Entity; arms: pc.Entity[] } {
    const m = this.m;
    const batch = this.lively;
    const root = this.group("person", parent, position);
    root.setLocalScale(1.5, 1.5, 1.5);
    this.shape("box", root, [0, 0.3, 0], [0.34, 0.52, 0.24], coat, [0, 0, 0], batch);
    this.shape("sphere", root, [0, 0.7, 0], [0.28, 0.28, 0.28], m.skin, [0, 0, 0], batch);
    if (hat === "cap") this.shape("sphere", root, [0, 0.86, 0], [0.34, 0.2, 0.34], m.canvas, [0, 0, 0], batch);
    else if (hat === "straw") this.shape("cylinder", root, [0, 0.85, 0], [0.48, 0.05, 0.48], m.hay, [0, 0, 0], batch);
    else if (hat === "hood") this.shape("cone", root, [0, 0.9, 0], [0.32, 0.28, 0.32], coat, [0, 0, 0], batch);
    else this.crownShape(this.group("crown", root, [0, 0.9, 0]));
    const arms = [-1, 1].map((hand) => {
      const arm = this.group("arm", root, [hand * 0.21, 0.5, 0], [0, 0, hand * -150]);
      this.shape("box", arm, [0, 0.2, 0], [0.08, 0.4, 0.08], coat, [0, 0, 0], batch);
      return arm;
    });
    return { root, arms };
  }

  /** A crown in a frame of its own, so it can be knocked off. */
  private crownShape(root: pc.Entity): void {
    const m = this.m;
    this.shape("cylinder", root, [0, 0, 0], [0.3, 0.12, 0.3], m.gold);
    for (let spike = 0; spike < 5; spike += 1) {
      const turn = (spike / 5) * Math.PI * 2;
      this.shape("cone", root, [Math.cos(turn) * 0.12, 0.12, Math.sin(turn) * 0.12], [0.08, 0.16, 0.08], m.gold);
    }
  }

  /** Something from the kitchen: a pan, a rolling pin, an egg beater or a cabbage. */
  private utensil(parent: pc.Entity, position: Triple, which: number, batch: boolean | number = false): pc.Entity {
    const m = this.m;
    const root = this.group("utensil", parent, position);
    const kind = ((which % 4) + 4) % 4;
    if (kind === 0) {
      this.shape("cylinder", root, [0, 0, 0], [0.36, 0.06, 0.36], m.iron, [0, 0, 0], batch);
      this.shape("box", root, [0.3, 0, 0], [0.3, 0.04, 0.06], m.iron, [0, 0, 0], batch);
    } else if (kind === 1) {
      this.shape("cylinder", root, [0, 0, 0], [0.12, 0.5, 0.12], m.oak, [0, 0, 90], batch);
    } else if (kind === 2) {
      this.shape("box", root, [0, 0, 0], [0.05, 0.36, 0.05], m.oakDark, [0, 0, 0], batch);
      this.shape("sphere", root, [0, 0.26, 0], [0.2, 0.26, 0.2], m.gold, [0, 0, 0], batch);
    } else {
      this.shape("sphere", root, [0, 0, 0], [0.32, 0.3, 0.32], m.grass, [0, 0, 0], batch);
    }
    return root;
  }

  // ---------------------------------------------------------------- the stage for one run

  load(game: Game, street = 0): void {
    this.street = street;
    this.scene.destroy();
    this.scene = new pc.Entity("scene");
    this.app.root.addChild(this.scene);
    this.props.clear();
    this.shots.clear();
    this.eggs.clear();
    this.kegs.clear();
    this.walls.clear();
    this.pickups.clear();
    this.mess = [];
    this.messNext = 0;
    this.tower = null;
    this.belfry = null;
    this.shoring = null;
    this.rope = null;
    this.capstan = null;
    this.wain = null;
    this.stone = null;
    this.stoneRope = null;
    this.sails = null;
    this.stoneRoll = 0;
    this.chock = null;
    this.queen = null;
    this.hen = null;
    this.clutter.clear();
    this.mob.clear();
    this.pans.clear();
    this.sights.clear();
    this.puffs = [];
    this.pool = [];
    this.pulses = [];
    this.men = [];
    this.bales = [];
    this.wheels = [];
    this.cracks = [];
    this.kingArms = [];
    this.folk = [];
    this.chicks = [];
    this.yolk = null;
    this.gun = null;
    this.barrel = null;
    this.bell = null;
    this.airLift = 0;
    this.wobble.set(0, 0, 0);
    this.wobbleSpeed.set(0, 0, 0);
    this.shake = 0;
    this.snap = true;

    this.buildStreet(game.course);
    this.buildHouses(game.course);
    this.buildCanal(game.course);
    this.buildYard(game.course);
    this.buildTower(game.course);
    this.buildWorks(game);
    this.buildMill(game);
    this.buildStraw(game.course);
    this.buildMob(game);
    this.buildPowder(game);
    this.buildPickups(game);
    this.buildClutter(game);
    this.buildCart();
    this.app.batcher.generate();
  }

  private buildStreet(course: CourseDef): void {
    const half = course.width / 2;
    const m = this.m;
    for (const piece of course.pieces) {
      const run = piece.d1 - piece.d0;
      const rise = piece.y1 - piece.y0;
      const length = Math.hypot(run, rise);
      const angle = Math.asin(rise / length);
      const degrees = (angle * 180) / Math.PI;
      const normal = { y: Math.cos(angle), z: Math.sin(angle) };
      const mid = { y: (piece.y0 + piece.y1) / 2, z: -(piece.d0 + piece.d1) / 2 };
      const tilt: Triple = [degrees, 0, 0];
      if (piece.x0 !== undefined) {
        this.buildStump(course, piece, tilt);
        continue;
      }
      this.shape("box", this.scene, [0, mid.y - normal.y * 0.3, mid.z - normal.z * 0.3], [course.width + 1.2, 0.6, length], m.road, tilt, true);
      for (const side of [-1, 1]) {
        this.shape("box", this.scene, [side * (half + 0.3), mid.y + normal.y * 0.3, mid.z + normal.z * 0.3], [0.6, 0.9, length], m.kerb, tilt, true);
        this.shape("box", this.scene, [side * (half + 45.6), mid.y - normal.y * 0.5, mid.z - normal.z * 0.5], [90, 0.6, length + 0.4], m.grass, tilt, true);
      }
      // Cobble bands, so speed can be seen.
      for (let d = Math.ceil(piece.d0 / 6) * 6; d < piece.d1; d += 6) {
        this.shape("box", this.scene, [0, heightAt(course, d) + 0.012, -d], [course.width, 0.03, 0.5], m.roadDark, tilt, true);
      }
    }
    if (this.street === 0) {
      // The castle gate he has just come out of.
      const gate = this.group("gate", this.scene, [0, 0, 13]);
      this.shape("box", gate, [0, 4.5, 0], [16, 9, 2.4], m.stone, [0, 0, 0], true);
      this.shape("box", gate, [0, 2.2, -1.25], [4.4, 4.4, 0.2], m.ink, [0, 0, 0], true);
      for (const side of [-1, 1]) {
        this.shape("cylinder", gate, [side * 8.5, 6, 0], [4.4, 12, 4.4], m.stone, [0, 0, 0], true);
        this.shape("cone", gate, [side * 8.5, 14, 0], [5.2, 4.4, 5.2], m.vermilion, [0, 0, 0], true);
      }
    } else {
      // The town gate he has just come through: the same one the last street ended at.
      this.townGate(course, -13);
    }
    // Bunting across the street: it is a feast day, and he is the feast.
    const flags = [m.vermilion, m.gold, m.lapis, m.verdigris];
    const lower = (course.tower?.d ?? 62) + 30;
    for (const d of [14, 32, lower, lower + 22]) {
      const y = heightAt(course, d) + 7.2;
      this.shape("box", this.scene, [0, y, -d], [course.width + 3, 0.04, 0.04], m.oakDark, [0, 0, 0], true);
      for (let flag = 0; flag < 11; flag += 1) {
        const x = (flag - 5) * 1.15;
        const sag = (1 - (x / 6.3) ** 2) * 0.5;
        this.shape("cone", this.scene, [x, y - 0.32 - sag, -d], [0.5, 0.6, 0.05], flags[flag % flags.length]!, [180, 0, 0], true);
      }
    }
  }

  /** What is left of a bridge: part of its first arch, standing out over the water with nothing beyond it. */
  private buildStump(course: CourseDef, piece: CourseDef["pieces"][number], tilt: Triple): void {
    const m = this.m;
    const half = course.width / 2;
    const span = spanOf(course, piece);
    const run = piece.d1 - piece.d0;
    const length = Math.hypot(run, piece.y1 - piece.y0);
    const angle = Math.asin((piece.y1 - piece.y0) / length);
    const normal = { y: Math.cos(angle), z: Math.sin(angle) };
    const mid = { y: (piece.y0 + piece.y1) / 2, z: -(piece.d0 + piece.d1) / 2 };
    const whole = (side: number): boolean => (side < 0 ? span.x0 <= -half : span.x1 >= half);
    const left = whole(-1) ? -half - 0.6 : span.x0;
    const right = whole(1) ? half + 0.6 : span.x1;
    const wide = right - left;
    const cx = (left + right) / 2;
    this.shape("box", this.scene, [cx, mid.y - normal.y * 0.3, mid.z - normal.z * 0.3], [wide, 0.6, length], m.road, tilt, true);
    // The arch under it, and the pier it stands on.
    this.shape("box", this.scene, [cx, mid.y - normal.y * 1.1, mid.z - normal.z * 1.1], [wide - 0.2, 1, length], m.stone, tilt, true);
    this.shape("box", this.scene, [cx, piece.y1 - 8, -(piece.d1 - 1.1)], [wide + 0.4, 15, 2.2], m.stone, [0, 0, 0], true);
    this.shape("box", this.scene, [cx, piece.y1 - 1.9, -(piece.d1 - 1.1)], [wide + 0.9, 0.5, 2.7], m.kerb, [0, 0, 0], true);
    for (let d = Math.ceil(piece.d0 / 3) * 3; d < piece.d1; d += 3) {
      this.shape("box", this.scene, [cx, heightAt(course, d) + 0.012, -d], [wide - 0.6, 0.03, 0.4], m.roadDark, tilt, true);
    }
    for (const side of [-1, 1]) {
      if (whole(side)) {
        // The parapet on the side that still has one.
        this.shape("box", this.scene, [side * (half + 0.3), mid.y + normal.y * 0.55, mid.z + normal.z * 0.55], [0.6, 1.4, length], m.kerb, tilt, true);
        continue;
      }
      // The broken edge: stones hanging out over nothing.
      const edge = side < 0 ? span.x0 : span.x1;
      for (let stone = 0; stone < 6; stone += 1) {
        const d = piece.d0 + 0.4 + (stone / 6) * run;
        const out = 0.15 + ((stone * 7) % 4) * 0.16;
        this.shape("box", this.scene, [edge + side * out, heightAt(course, d) - 0.2 - ((stone * 3) % 3) * 0.12, -d], [0.9, 0.5, 0.9], stone % 2 ? m.stone : m.kerb, [(stone * 11) % 16, (stone * 37) % 40, side * (8 + ((stone * 5) % 14))], true);
      }
    }
    // The King's people have been out with paint: this way, and do not stop.
    for (let arrow = 0; arrow < 3; arrow += 1) {
      const d = piece.d0 + 1.1 + arrow * 2.1;
      for (const lean of [-1, 1]) {
        this.shape("box", this.scene, [cx + lean * 0.62, heightAt(course, d) + 0.02, -d], [1.5, 0.03, 0.34], m.gold, [tilt[0], lean * 40, 0], true);
      }
    }
    for (const x of [left + 0.3, right - 0.9]) {
      this.shape("box", this.scene, [x, piece.y1 + 1.5, -(piece.d1 - 0.4)], [0.16, 3.2, 0.16], m.oakDark, [0, 0, 0], true);
      this.shape("cone", this.scene, [x + 0.5, piece.y1 + 2.7, -(piece.d1 - 0.4)], [0.6, 1.1, 0.06], m.gold, [0, 0, -90], true);
    }
    // The near bank beside it, where the rest of the bridge used to start.
    void left;
  }

  /** A gate across the street with room for a cart under it: where one street ends and the next begins. */
  private townGate(course: CourseDef, d: number): void {
    const m = this.m;
    const half = course.width / 2;
    const gate = this.group("town-gate", this.scene, [0, heightAt(course, d), -d]);
    for (const side of [-1, 1]) {
      this.shape("box", gate, [side * (half + 2.2), 4.5, 0], [3.4, 11, 3.4], m.stone, [0, 0, 0], true);
      this.shape("cone", gate, [side * (half + 2.2), 11.6, 0], [4.6, 3.6, 4.6], m.lapis, [0, 0, 0], true);
      this.shape("box", gate, [side * (half + 0.42), 2.6, 0], [0.3, 6.4, 3.6], m.kerb, [0, 0, 0], true);
      for (const y of [3, 6.5]) this.shape("box", gate, [side * (half + 2.2), y, -1.72], [0.5, 1.2, 0.06], m.ink, [0, 0, 0], true);
    }
    this.shape("box", gate, [0, 7.2, 0], [course.width + 1.2, 2.8, 3], m.stone, [0, 0, 0], true);
    this.shape("box", gate, [0, 5.72, 0], [course.width + 1, 0.3, 3.2], m.kerb, [0, 0, 0], true);
    for (let tooth = 0; tooth < 6; tooth += 1) this.shape("box", gate, [(tooth - 2.5) * 2.1, 9, 0], [1.1, 0.9, 3], m.stone, [0, 0, 0], true);
    // The portcullis, drawn up, and the Hen's colours hung out by whoever opened it.
    for (let bar = 0; bar < 9; bar += 1) this.shape("box", gate, [(bar - 4) * 1.15, 5.3, -0.6], [0.14, 0.9, 0.14], m.iron, [0, 0, 0], true);
    for (const face of [-1, 1]) {
      this.shape("box", gate, [0, 7.2, face * 1.53], [2.2, 2, 0.05], m.gold, [0, 0, 0], true);
      this.shape("sphere", gate, [0, 7.2, face * 1.58], [1.1, 1.4, 0.06], m.hen, [0, 0, 0], true);
    }
  }

  /** Timbered houses stepping down both sides of the street. */
  private buildHouses(course: CourseDef): void {
    const m = this.m;
    const half = course.width / 2;
    const plasters = [m.plaster, m.plasterWarm, m.plasterCool];
    const roofs = [m.vermilion, m.lapis, m.verdigris, m.oakDark];
    // Where no house stands: over the water, and where the town gate does.
    const gaps = gorges(course).map((gap) => ({ d0: gap.d0 - 0.6, d1: gap.d1 + 0.6 }));
    if (course.mill) gaps.push({ d0: course.mill.d - 6, d1: course.mill.d + 6 });
    if (course.roost === null) gaps.push({ d0: course.finish - 2.2, d1: course.finish + 2.2 });
    const yard = course.roost === null ? courseEnd(course) - 2 : course.finish - 8;
    for (const side of [-1, 1]) {
      let d = -8;
      let index = side < 0 ? 0 : 5;
      while (d < yard) {
        const unit = this.chance();
        const long = 6.4 + unit * 2.4;
        const deep = 5 + ((index * 7) % 3) * 0.7;
        const floors = 2 + ((index * 5 + (side < 0 ? 1 : 0)) % 2);
        index += 1;
        const gap = gaps.find((one) => d + long > one.d0 && d < one.d1);
        if (gap) {
          d = gap.d1 + 0.2;
          continue;
        }
        if (d + long > yard) break;
        const top = heightAt(course, d) + floors * 2.7 + 0.5;
        const base = heightAt(course, d + long) - 0.6;
        const tall = top - base;
        const front = side * (half + 1.15);
        const x = front + (side * deep) / 2;
        const z = -(d + long / 2);
        const wall = plasters[index % plasters.length]!;
        this.shape("box", this.scene, [x, base + tall / 2, z], [deep, tall, long], wall, [0, 0, 0], true);
        // The timber frame, on the face the street sees.
        const face = front - side * 0.06;
        for (const k of [0.04, 0.5, 0.96]) this.shape("box", this.scene, [face, base + tall / 2, -(d + long * k)], [0.14, tall, 0.22], m.oakDark, [0, 0, 0], true);
        for (let floor = 1; floor <= floors; floor += 1) {
          const y = heightAt(course, d + long / 2) + floor * 2.7 - 0.1;
          this.shape("box", this.scene, [face, y, z], [0.14, 0.22, long], m.oakDark, [0, 0, 0], true);
          for (const k of [0.27, 0.73]) {
            this.shape("box", this.scene, [face - side * 0.02, y - 1.25, -(d + long * k)], [0.08, 1.05, 0.9], m.ink, [0, 0, 0], true);
            if ((index + floor) % 2) this.shape("box", this.scene, [face - side * 0.2, y - 1.9, -(d + long * k)], [0.34, 0.2, 1.1], floor % 2 ? m.vermilion : m.verdigris, [0, 0, 0], true);
          }
        }
        this.shape("box", this.scene, [face - side * 0.02, heightAt(course, d + long * 0.5) + 0.95, -(d + long * 0.5)], [0.08, 1.9, 1], m.oak, [0, 0, 0], true);
        // A steep roof, ridge along the street.
        const pitch = 42;
        const slab = deep / 2 / Math.cos((pitch * Math.PI) / 180) + 0.35;
        const rise = (deep / 4) * Math.tan((pitch * Math.PI) / 180);
        const roof = roofs[(index * 3) % roofs.length]!;
        for (const lean of [-1, 1]) {
          this.shape("box", this.scene, [x + (lean * deep) / 4, top + rise, z], [slab, 0.22, long + 0.5], roof, [0, 0, -lean * pitch], true);
        }
        this.shape("box", this.scene, [x + side * deep * 0.2, top + rise * 2 + 0.3, -(d + long * 0.3)], [0.7, 1.7, 0.7], m.stone, [0, 0, 0], true);
        d += long + 0.25;
      }
    }
    // Hills behind the roofs, and a few trees on them.
    for (let d = 0; d < courseEnd(course) - 10; d += 13) {
      for (const side of [-1, 1]) {
        const jitter = Math.sin(d * 12.9898 + side * 78.233) * 43758.5453;
        const unit = jitter - Math.floor(jitter);
        const x = side * (half + 14 + unit * 22);
        const y = heightAt(course, d) - 0.2;
        const tall = 2.6 + unit * 2.8;
        this.shape("cylinder", this.scene, [x, y + 0.6, -d], [0.3, 1.2, 0.3], m.oakDark, [0, 0, 0], true);
        this.shape("cone", this.scene, [x, y + 1.1 + tall / 2, -d], [2, tall, 2], unit > 0.5 ? m.grassDark : m.verdigris, [0, 0, 0], true);
      }
    }
  }

  /** The canal that cuts the street in two, and the quays either side of it. */
  private buildCanal(course: CourseDef): void {
    const m = this.m;
    const half = course.width / 2;
    for (const gap of gorges(course)) {
      const lip = heightAt(course, gap.d0 - 0.01);
      const far = heightAt(course, gap.d1 + 0.01);
      const wide = gap.d1 - gap.d0;
      const water = Math.min(lip, far) - 9;
      this.waterY = water;
      this.shape("box", this.scene, [0, lip - 8.3, -(gap.d0 - 0.4)], [190, 16, 0.8], m.kerb, [0, 0, 0], true);
      this.shape("box", this.scene, [0, far - 8.3, -(gap.d1 + 0.4)], [190, 16, 0.8], m.kerb, [0, 0, 0], true);
      this.shape("box", this.scene, [0, water, -(gap.d0 + gap.d1) / 2], [190, 0.3, wide + 1], m.water, [0, 0, 0], true);
      // Quay stones along both edges, and mooring posts in the King's and the Queen's colours.
      for (const [d, y] of [[gap.d0 - 0.25, lip], [gap.d1 + 0.25, far]] as const) {
        for (const side of [-1, 1]) this.shape("box", this.scene, [side * (half + 20.6), y - 0.02, -d], [40, 0.5, 0.5], m.stone, [0, 0, 0], true);
      }
      for (const side of [-1, 1]) {
        this.shape("box", this.scene, [side * (half + 0.3), lip + 1.4, -(gap.d0 - 0.5)], [0.3, 3.2, 0.3], m.oakDark, [-8, 0, side * 6], true);
        this.shape("cone", this.scene, [side * (half + 0.3) - side * 0.5, lip + 2.6, -(gap.d0 - 0.5)], [0.6, 1.1, 0.08], m.vermilion, [0, 0, side * 90], true);
        this.shape("box", this.scene, [side * (half + 0.3), far + 1.2, -(gap.d1 + 0.6)], [0.3, 3, 0.3], m.oakDark, [10, 0, side * -6], true);
      }
      if (gap.stump) {
        // The far pier of the fallen arch, standing in the water by itself.
        this.shape("box", this.scene, [2, water + 3.4, -(gap.d1 - 2.2)], [6.4, 7, 2], m.stone, [0, 0, 3], true);
        this.shape("box", this.scene, [-3.2, water + 1.2, -(gap.d0 + wide * 0.5)], [3, 2.4, 2.4], m.stone, [14, 30, 20], true);
      } else {
        // What is left of the old bridge: splintered planks on the right, where nothing stands now.
        this.shape("box", this.scene, [2.9, lip - 0.02, -(gap.d0 + 0.5)], [2.4, 0.14, 1.6], m.oak, [5, 8, 0], true);
        this.shape("box", this.scene, [4.2, lip - 0.3, -(gap.d0 + 1)], [1.1, 0.14, 2.1], m.oakDark, [-24, -14, 0], true);
      }
      // A barge and a couple of rocks down on the water.
      const barge = this.group("barge", this.scene, [16, water + 0.5, -(gap.d0 + wide * 0.5)], [0, 12, 0]);
      this.shape("box", barge, [0, 0, 0], [7, 0.9, 2.6], m.oakDark, [0, 0, 0], true);
      this.shape("box", barge, [-1, 0.8, 0], [2.4, 0.9, 1.8], m.canvas, [0, 0, 0], true);
      for (const [x, z] of [[-14, 0.3], [9, 0.7], [-30, 0.6]] as const) {
        this.shape("sphere", this.scene, [x, water + 0.1, -(gap.d0 + wide * z)], [2.4, 1.4, 1.8], m.stone, [0, x * 9, 0], true);
      }
    }
  }

  /** Home: the finishing banner, the nest, the Empress Hen and the people out to see him in. */
  private buildYard(course: CourseDef): void {
    const m = this.m;
    const half = course.width / 2;
    const roostD = course.roost;
    if (roostD === null) {
      // Not home yet: the street goes on through the town gate.
      this.townGate(course, course.finish);
      return;
    }
    const lineY = heightAt(course, course.finish);
    for (const side of [-1, 1]) this.shape("cylinder", this.scene, [side * (half + 0.3), lineY + 3, -course.finish], [0.24, 6, 0.24], m.oakDark, [0, 0, 0], true);
    this.shape("box", this.scene, [0, lineY + 5.4, -course.finish], [course.width + 0.8, 1, 0.08], m.lapis, [0, 0, 0], true);
    this.shape("box", this.scene, [0, lineY + 4.8, -course.finish], [course.width + 0.8, 0.14, 0.1], m.gold, [0, 0, 0], true);

    const roostY = heightAt(course, roostD);
    const roost = this.group("roost", this.scene, [0, roostY, -roostD]);
    this.shape("cylinder", roost, [0, 0.35, 2.2], [9.5, 0.7, 7], m.oak, [0, 0, 0], true);
    this.shape("cylinder", roost, [0, 0.55, 2.2], [8.4, 0.7, 6], m.hay, [0, 0, 0], true);
    const hen = this.group("hen", roost, [0, 0.4, -1.6]);
    this.shape("sphere", hen, [0, 2.3, 0], [6, 4.8, 6.4], m.hen);
    this.shape("sphere", hen, [0, 3.2, -2.9], [2.2, 2.6, 2.8], m.hen, [-30, 0, 0]);
    const head = this.group("head", hen, [0, 5.3, 1.9]);
    this.shape("sphere", head, [0, 0, 0], [2.2, 2.3, 2.2], m.hen);
    this.shape("cone", head, [0, -0.1, 1.25], [0.7, 0.9, 0.7], m.gold, [90, 0, 0]);
    this.shape("sphere", head, [0, -0.75, 0.95], [0.4, 0.7, 0.36], m.vermilion);
    for (const side of [-1, 1]) this.shape("sphere", head, [side * 0.62, 0.3, 0.86], [0.26, 0.3, 0.2], m.ink);
    for (const [offset, tall] of [[-0.35, 0.6], [0.15, 0.8], [0.6, 0.55]] as const) this.shape("sphere", head, [0, 1.2, offset - 0.1], [0.34, tall, 0.5], m.vermilion);
    this.shape("cylinder", head, [0, 1.25, 0.45], [1.1, 0.22, 1.1], m.gold);
    for (let spike = 0; spike < 5; spike += 1) {
      const turn = (spike / 5) * Math.PI * 2;
      this.shape("cone", head, [Math.cos(turn) * 0.46, 1.52, 0.45 + Math.sin(turn) * 0.46], [0.2, 0.42, 0.2], m.gold);
    }
    const wings = [-1, 1].map((side) => {
      const wing = this.group("wing", hen, [side * 2.8, 2.6, 0.2]);
      this.shape("sphere", wing, [side * 0.5, -0.2, 0], [1.6, 3, 4.2], m.hen, [0, 0, side * -12]);
      return wing;
    });
    this.hen = { root: hen, head, wings };
    for (let index = 0; index < 7; index += 1) {
      const turn = (index / 7) * Math.PI * 1.3 - 0.2;
      const chick = this.group("chick", roost, [Math.cos(turn) * 5.6, 0.2, 3.4 + Math.sin(turn) * 3]);
      this.shape("sphere", chick, [0, 0.42, 0], [0.8, 0.76, 0.86], m.yolk, [0, 0, 0], this.lively);
      this.shape("sphere", chick, [0, 0.92, 0.26], [0.5, 0.5, 0.5], m.yolk, [0, 0, 0], this.lively);
      this.shape("cone", chick, [0, 0.9, 0.56], [0.16, 0.24, 0.16], m.vermilion, [90, 0, 0], this.lively);
      this.chicks.push(chick);
    }
    // His own people, out to see him home.
    const coats = [m.verdigris, m.hay, m.canvas, m.vermilion];
    for (let index = 0; index < 10; index += 1) {
      const side = index % 2 ? 1 : -1;
      const d = course.finish - 4 + Math.floor(index / 2) * 5;
      const at: Triple = [side * (half + 1.5 + (index % 3) * 0.5), heightAt(course, d) - 0.2, -d];
      const look = this.townsfolk(this.scene, at, coats[index % coats.length]!, index % 3 ? "straw" : "hood");
      this.folk.push({ root: look.root, arms: look.arms, at, phase: index * 1.7 });
    }
  }

  /** The bell tower, hinged at its foot on the near bank, drawn in its own frame so it can fall as one piece. */
  private buildTower(course: CourseDef): void {
    const m = this.m;
    const def = course.tower;
    const post = course.windlass;
    if (!def || !post) return;
    const wide = def.x1 - def.x0;
    const tall = def.height;
    const deep = def.thick;
    const lip = heightAt(course, def.d - 0.01);
    const centre = (def.x0 + def.x1) / 2;
    const root = this.group("belltower", this.scene, [centre, lip, -def.d]);
    this.tower = root;
    this.shape("box", root, [0, tall / 2, -deep / 2], [wide, tall, deep], m.stone);
    // Its uphill face will be the street: courses of darker stone, which read as cobble bands once it is down.
    for (let y = 1.2; y < tall - 0.4; y += 2.4) this.shape("box", root, [0, y, 0.012], [wide - 0.72, 0.5, 0.03], m.roadDark);
    for (const side of [-1, 1]) {
      this.shape("box", root, [side * (wide / 2 - 0.18), tall / 2, 0.2], [0.36, tall, 0.4], m.kerb);
      for (const y of [3.4, 7, 10.2]) this.shape("box", root, [side * (wide / 2 + 0.02), y, -deep / 2], [0.06, 1.5, 0.7], m.ink);
    }
    this.shape("box", root, [0, 1.25, 0.03], [1.5, 2.5, 0.05], m.oakDark);
    this.shape("cylinder", root, [0, 2.5, 0.03], [1.5, 0.05, 1.5], m.oakDark, [90, 0, 0]);
    // The clock, which has not told the right time in years.
    this.shape("cylinder", root, [0, tall - 2.3, 0.03], [2.3, 0.05, 2.3], m.canvas, [90, 0, 0]);
    this.shape("box", root, [0, tall - 2, 0.07], [0.1, 0.8, 0.03], m.ink);
    this.shape("box", root, [0.3, tall - 2.3, 0.07], [0.7, 0.1, 0.03], m.ink);

    // The belfry is what breaks when the bell goes: four posts, a steep cap, and the bell between.
    const belfry = this.group("belfry", root, [0, tall, -deep / 2]);
    this.belfry = belfry;
    this.shape("box", belfry, [0, 0.15, 0], [wide + 0.3, 0.3, deep + 0.3], m.kerb);
    for (const x of [-1, 1]) for (const z of [-1, 1]) this.shape("box", belfry, [x * (wide / 2 - 0.3), 1.5, z * (deep / 2 - 0.3)], [0.4, 2.4, 0.4], m.stone);
    this.shape("box", belfry, [0, 2.8, 0], [wide + 0.5, 0.3, deep + 0.5], m.kerb);
    this.shape("cone", belfry, [0, 4.5, 0], [wide + 1, 3.2, deep + 1.6], m.vermilion);
    this.shape("sphere", belfry, [0, 6.3, 0], [0.4, 0.4, 0.4], m.gold);
    this.bellShape(this.group("hung", belfry, [0, 1.5, 0]));

    // Under it, the stump of the old bridge pier and the timber that keeps the tower on it.
    const water = Math.min(lip, heightAt(course, def.d + 13)) - 9;
    this.shape("box", this.scene, [centre, (lip - 3.7 + water) / 2, -(def.d + deep / 2)], [wide - 0.8, lip - 3.7 - water, deep - 0.4], m.kerb, [0, 0, 0], true);
    const shoring = this.group("shoring", this.scene, [centre, lip, -def.d]);
    this.shoring = shoring;
    for (const x of [-1, 0, 1]) {
      for (const z of [-0.5, -2.4]) this.shape("box", shoring, [(x * (wide - 1.2)) / 2, -1.9, z], [0.3, 3.7, 0.3], m.oak, [0, 0, x * 5]);
      this.shape("box", shoring, [(x * (wide - 1.2)) / 2, -1.9, -1.45], [0.16, 0.16, 2.9], m.oakDark, [38, 0, 0]);
    }
    this.shape("box", shoring, [0, -0.25, -1.45], [wide - 0.6, 0.3, 0.3], m.oakDark);

    // The capstan on the quay, and the one rope that holds the lot.
    const capstan = this.group("capstan", this.scene, [post.x, heightAt(course, post.d), -post.d]);
    this.capstan = capstan;
    this.shape("cylinder", capstan, [0, 0.2, 0], [1.4, 0.4, 1.4], m.stone);
    this.shape("cylinder", capstan, [0, 0.85, 0], [0.7, 1.1, 0.7], m.oak);
    this.shape("cylinder", capstan, [0, 1.05, 0], [0.78, 0.3, 0.78], m.rope);
    this.shape("cylinder", capstan, [0, 1.5, 0], [0.85, 0.16, 0.85], m.gold);
    for (const turn of [0, 60, 120]) this.shape("box", capstan, [0, 1.36, 0], [2.3, 0.1, 0.1], m.oakDark, [0, turn, 0]);
    this.rope = this.shape("box", this.scene, [0, 0, 0], [0.16, 0.16, 1], m.rope);
  }

  /** A bronze bell in a frame of its own: the same shape hangs in the belfry and rolls down the street. */
  private bellShape(root: pc.Entity): void {
    const m = this.m;
    this.shape("sphere", root, [0, 0.25, 0], [1.3, 1.2, 1.3], m.bronze);
    this.shape("cone", root, [0, -0.1, 0], [1.75, 1.3, 1.75], m.bronze);
    this.shape("cylinder", root, [0, -0.7, 0], [1.78, 0.14, 1.78], m.gold);
    this.shape("cylinder", root, [0, 0.9, 0], [0.3, 0.3, 0.3], m.iron);
    this.shape("sphere", root, [0, -0.72, 0], [0.4, 0.4, 0.4], m.iron);
  }

  /** The wain and its chock, the well, the woolsacks, and the Queen on her balcony. */
  private buildWorks(game: Game): void {
    const m = this.m;
    const course = game.course;
    const half = course.width / 2;
    this.buildQueen(game);
    const well = course.well;
    const sacks = course.sacks;
    if (!game.wain || !well || !sacks) return;

    const wain = this.group("wain", this.scene);
    this.wain = wain;
    this.shape("box", wain, [0, 0.05, 0], [1.7, 0.3, 2.6], m.oak);
    for (const side of [-1, 1]) this.shape("box", wain, [side * 0.82, 0.45, 0], [0.08, 0.6, 2.6], m.oakDark);
    this.shape("box", wain, [0, 0.45, 1.28], [1.7, 0.6, 0.08], m.oakDark);
    // Wheels of cheese, stacked like the wheels they are.
    for (const [x, y, z] of [[-0.4, 0.42, -0.6], [0.4, 0.42, -0.5], [0, 0.42, 0.4], [-0.2, 0.86, -0.5], [0.2, 0.86, 0.3]] as const) {
      this.shape("cylinder", wain, [x, y, z], [0.8, 0.4, 0.8], m.yolk);
    }
    for (const side of [-1, 1]) for (const z of [-0.85, 0.85]) {
      this.shape("cylinder", wain, [side * 0.95, -0.2, z], [0.86, 0.14, 0.86], m.oakDark, [0, 0, 90]);
      this.shape("cylinder", wain, [side * 0.98, -0.2, z], [0.3, 0.16, 0.3], m.gold, [0, 0, 90]);
    }
    const parked = game.wain.body.translation();
    this.chock = this.shape("box", this.scene, [parked.x, parked.y - 0.5, parked.z - 1.45], [1.5, 0.3, 0.45], m.gold, [-20, 0, 0]);

    const wellRoot = this.group("well", this.scene, [well.x, heightAt(course, well.d), -well.d]);
    this.shape("cylinder", wellRoot, [0, 0.7, 0], [2.3, 1.4, 2.3], m.stone, [0, 0, 0], true);
    this.shape("cylinder", wellRoot, [0, 1.36, 0], [1.7, 0.1, 1.7], m.water, [0, 0, 0], true);
    for (const side of [-1, 1]) this.shape("box", wellRoot, [side * 1, 2.2, 0], [0.16, 2, 0.16], m.oakDark, [0, 0, 0], true);
    this.shape("box", wellRoot, [0, 3.3, 0], [2.6, 0.14, 1.5], m.vermilion, [0, 0, 0], true);
    this.shape("cylinder", wellRoot, [0, 2.9, 0], [0.24, 2, 0.24], m.oak, [0, 0, 90], true);

    const pile = this.group("sacks", this.scene, [sacks.x, heightAt(course, sacks.d), -sacks.d]);
    for (const [x, y, z, turn] of [[-0.6, 0.4, -0.3, 10], [0.55, 0.4, -0.2, -14], [0, 0.4, 0.6, 30], [-0.3, 1.1, -0.1, -8], [0.4, 1.1, 0.2, 22], [0, 1.75, 0, 4]] as const) {
      this.shape("sphere", pile, [x, y, z], [1.25, 0.8, 1], m.canvas, [0, turn, 0], true);
    }
    this.shape("box", pile, [0, 0.1, 0], [2.6, 0.2, 2.4], m.oakDark, [0, 0, 0], true);
    void half;
  }

  /** The Queen, on a balcony over the street, with her best frying pan. Only where she is in the cast. */
  private buildQueen(game: Game): void {
    const m = this.m;
    const course = game.course;
    const half = course.width / 2;
    const cast = course.clutter.find((one) => one.kind === "queen");
    if (!cast) return;
    const queenD = cast.d;
    const balcony = this.group("balcony", this.scene, [half + 1.7, heightAt(course, queenD) + 3.1, -queenD]);
    this.shape("box", balcony, [0, 0, 0], [1.6, 0.2, 3.2], m.oakDark, [0, 0, 0], true);
    this.shape("box", balcony, [-0.75, 0.5, 0], [0.1, 0.9, 3.2], m.oak, [0, 0, 0], true);
    this.shape("box", balcony, [-0.9, 0.2, 0], [0.06, 1.2, 2.2], m.lapis, [0, 0, 0], true);
    const queen = this.townsfolk(balcony, [-0.1, 0.1, 0], m.lapis, "crown");
    queen.root.setLocalScale(2, 2, 2);
    queen.root.setLocalEulerAngles(0, -90, 0);
    this.utensil(queen.arms[1]!, [0, 0.5, 0], 0, this.lively).setLocalScale(1.6, 1.6, 1.6);
    queen.arms[1]!.setLocalEulerAngles(0, 0, -30);
    this.queen = queen.root;
  }

  /** What a stone can set off: baskets hung over the street, barrels and hen coops on the kerb. */
  private stoneShape(root: pc.Entity): void {
    const m = this.m;
    const size = STONE_RADIUS * 2;
    // A wheel on its edge, facing down the street, with the eye cut square through it.
    this.shape("cylinder", root, [0, 0, 0], [size, 0.8, size], m.stone, [0, 0, 90]);
    this.shape("cylinder", root, [0, 0, 0], [size * 0.86, 0.84, size * 0.86], m.kerb, [0, 0, 90]);
    this.shape("box", root, [0, 0, 0], [0.9, 0.44, 0.44], m.ink);
    for (let groove = 0; groove < 8; groove += 1) {
      const turn = (groove / 8) * 360;
      for (const side of [-1, 1]) this.shape("box", this.group("groove", root, [0, 0, 0], [turn, 0, 0]), [side * 0.425, STONE_RADIUS * 0.56, 0], [0.02, STONE_RADIUS * 0.62, 0.1], m.roadDark);
    }
  }

  /** The windmill at the top of the street, with the miller's stone swung out over the road on its hoist. */
  private buildMill(game: Game): void {
    const m = this.m;
    const course = game.course;
    const def = course.mill;
    const stone = game.stone;
    if (!def || !stone) return;
    const half = course.width / 2;
    const side = def.x <= 0 ? -1 : 1;
    const ground = heightAt(course, def.d);
    const mill = this.group("mill", this.scene, [side * (half + 5.4), ground, -def.d]);
    // A tower mill: a tapering stone drum, a turning cap, and four sails facing up the street.
    this.shape("cylinder", mill, [0, 1.2, 0], [7.8, 2.4, 7.8], m.stone, [0, 0, 0], true);
    this.shape("cylinder", mill, [0, 4.4, 0], [7, 4, 7], m.plaster, [0, 0, 0], true);
    this.shape("cylinder", mill, [0, 8.4, 0], [6.2, 4, 6.2], m.plasterWarm, [0, 0, 0], true);
    this.shape("cylinder", mill, [0, 12.2, 0], [5.4, 3.6, 5.4], m.plaster, [0, 0, 0], true);
    this.shape("cylinder", mill, [0, 6.4, 0], [8.4, 0.3, 8.4], m.oakDark, [0, 0, 0], true);
    this.shape("cone", mill, [0, 15.8, 0], [6.4, 3.6, 6.4], m.vermilion, [0, 0, 0], true);
    this.shape("box", mill, [-side * 3.1, 2.6, 0.4], [0.2, 2.6, 1.3], m.oakDark, [0, 0, 0], true);
    for (const y of [5, 8.6]) this.shape("box", mill, [-side * (2.9 - y * 0.12), y, 0], [0.2, 1, 0.7], m.ink, [0, 0, 0], true);
    const sails = this.group("sails", mill, [0, 13, 3.2]);
    this.shape("cylinder", sails, [0, 0, -0.6], [0.5, 1.6, 0.5], m.oakDark, [90, 0, 0]);
    for (let sail = 0; sail < 4; sail += 1) {
      const arm = this.group("arm", sails, [0, 0, 0], [0, 0, sail * 90]);
      this.shape("box", arm, [0, 3.1, 0], [0.2, 6.2, 0.2], m.oakDark);
      this.shape("box", arm, [0.75, 3.7, 0.05], [1.4, 4.6, 0.06], m.canvas, [0, 8, 0]);
      for (let bar = 0; bar < 5; bar += 1) this.shape("box", arm, [0.75, 1.6 + bar * 1, 0.1], [1.4, 0.08, 0.08], m.oakDark);
    }
    this.sails = sails;
    // The hoist: a beam out of the loading door, a brace under it, and the stone on a rope.
    const beamY = stone.at.y + STONE_RADIUS + 1.6 - ground;
    const reach = Math.abs(stone.at.x - side * (half + 5.4)) + 0.8;
    this.shape("box", mill, [-side * (reach / 2 + 0.6), beamY, 0], [reach + 1.2, 0.34, 0.34], m.oakDark, [0, 0, 0], true);
    this.shape("box", mill, [-side * (reach * 0.42), beamY - 1.5, 0], [reach * 0.72, 0.22, 0.22], m.oak, [0, 0, side * 28], true);
    this.shape("box", mill, [-side * 2.6, beamY - 0.6, 0], [1.6, 2.4, 1.8], m.oakDark, [0, 0, 0], true);
    this.shape("cylinder", mill, [-side * (reach - 0.2), beamY + 0.1, 0], [0.7, 0.4, 0.7], m.iron, [90, 0, 0], true);
    this.stoneRope = this.shape("box", this.scene, [stone.at.x, stone.at.y + STONE_RADIUS + 0.8, stone.at.z], [0.14, 1.7, 0.14], m.rope);
    const look = this.group("millstone", this.scene, [stone.at.x, stone.at.y, stone.at.z]);
    this.stoneShape(look);
    this.stone = look;
    // The miller, at his door, who has not been asked.
    this.townsfolk(mill, [-side * 4.4, 0, 2.6], m.plasterCool, "cap").root.setLocalEulerAngles(0, side * -70, 0);
    for (const [x, z] of [[-side * 4.6, -2.2], [-side * 4.1, -3.1], [-side * 4.9, -3.4]] as const) this.shape("sphere", mill, [x, 0.45, z], [1.1, 0.9, 0.8], m.canvas, [0, x * 40, 0], true);
  }

  private syncMill(game: Game, dt: number): void {
    if (this.sails) this.sails.rotateLocal(0, 0, dt * 24);
    const stone = game.stone;
    const look = this.stone;
    if (!stone || !look) return;
    look.enabled = stone.state !== "gone";
    if (this.stoneRope) this.stoneRope.enabled = stone.state === "hung";
    if (!stone.body) {
      // Hung out over the road, it turns a little on its rope.
      look.setPosition(stone.at.x, stone.at.y, stone.at.z);
      look.setEulerAngles(0, Math.sin(this.clock * 0.9) * 9, 0);
      return;
    }
    const p = stone.body.translation();
    const v = stone.body.linvel();
    this.stoneRoll += (-v.z * dt * 180) / (Math.PI * STONE_RADIUS);
    look.setPosition(p.x, p.y, p.z);
    look.setEulerAngles(-this.stoneRoll, 0, 0);
    // It tears the cobbles up as it goes.
    if (stone.state === "rolling" && this.frame % 3 === 0 && -v.z > 3) {
      this.puff({ x: p.x + this.chance() * 1.4 - 0.7, y: p.y - STONE_RADIUS + 0.2, z: p.z + 0.8 }, this.m.dust, 0.9, 0.5, [this.chance() * 2 - 1, 1.5, 2]);
    }
  }

  /** Straw laid deep where he is meant to come down, and the carts it came in. */
  private buildStraw(course: CourseDef): void {
    const m = this.m;
    const straw = course.straw;
    if (!straw) return;
    const half = course.width / 2;
    for (const piece of course.pieces) {
      const d0 = Math.max(piece.d0, straw.d0);
      const d1 = Math.min(piece.d1, straw.d1);
      if (d1 - d0 < 0.5) continue;
      const slope = (piece.y1 - piece.y0) / (piece.d1 - piece.d0);
      const degrees = (Math.atan(slope) * 180) / Math.PI;
      const length = Math.hypot(d1 - d0, (d1 - d0) * slope);
      const mid = (d0 + d1) / 2;
      const bed = this.shape("box", this.scene, [0, heightAt(course, mid) + 0.07, -mid], [course.width, 0.16, length], m.hay, [degrees, 0, 0], true);
      if (bed.render) bed.render.castShadows = false;
    }
    for (let heap = 0; heap < 26; heap += 1) {
      const d = straw.d0 + 0.8 + this.chance() * (straw.d1 - straw.d0 - 1.6);
      const x = (this.chance() * 2 - 1) * (half - 0.4);
      const size = 1 + this.chance() * 1.6;
      const lump = this.shape("sphere", this.scene, [x, heightAt(course, d) + 0.05, -d], [size, 0.34 + this.chance() * 0.3, size * 0.8], m.hay, [0, this.chance() * 180, 0], true);
      if (lump.render) lump.render.castShadows = false;
    }
    // Ricks along both kerbs, and a hay cart tipped up empty.
    for (const side of [-1, 1]) {
      for (const along of [0.12, 0.45, 0.8]) {
        const d = straw.d0 + (straw.d1 - straw.d0) * along + side;
        this.shape("sphere", this.scene, [side * (half + 1.7), heightAt(course, d) + 0.9, -d], [3, 3.2, 3.4], m.hay, [0, along * 200, 0], true);
        this.shape("cone", this.scene, [side * (half + 1.7), heightAt(course, d) + 2.6, -d], [2.2, 1.4, 2.4], m.hay, [0, 0, 0], true);
      }
    }
  }

  private buildClutter(game: Game): void {
    const m = this.m;
    const course = game.course;
    const half = course.width / 2;
    for (const thing of game.clutter) {
      const def = thing.def;
      const side = Math.sign(def.x) || 1;
      const at: Triple = [thing.at.x, thing.at.y, thing.at.z];
      if (def.kind === "queen") {
        const crown = this.queen?.findByName("crown");
        if (crown instanceof pc.Entity) this.clutter.set(def.id, crown);
        continue;
      }
      if (def.kind === "pot") {
        // A bracket out from the house front, a chain, and a basket of flowers on the end of it.
        const wall = side * (half + 1.1);
        this.shape("box", this.scene, [(wall + def.x) / 2, at[1] + 1.05, at[2]], [Math.abs(wall - def.x) + 0.3, 0.12, 0.12], m.oakDark, [0, 0, 0], true);
        this.shape("box", this.scene, [wall - side * 0.5, at[1] + 0.6, at[2]], [0.1, 1.1, 0.1], m.oakDark, [0, 0, side * 40], true);
        this.shape("box", this.scene, [def.x, at[1] + 0.8, at[2]], [0.05, 0.5, 0.05], m.iron, [0, 0, 0], true);
        const basket = this.group("basket", this.scene, at);
        basket.setLocalScale(1.6, 1.6, 1.6);
        this.shape("sphere", basket, [0, 0, 0], [1, 0.8, 1], m.oak);
        this.shape("cylinder", basket, [0, 0.14, 0], [0.96, 0.1, 0.96], m.grassDark);
        for (let bloom = 0; bloom < 6; bloom += 1) {
          const turn = (bloom / 6) * Math.PI * 2 + def.id;
          this.shape("sphere", basket, [Math.cos(turn) * 0.3, 0.32 + (bloom % 2) * 0.1, Math.sin(turn) * 0.3], [0.3, 0.3, 0.3], [m.vermilion, m.gold, m.egg][bloom % 3]!);
        }
        this.clutter.set(def.id, basket);
      } else if (def.kind === "barrel") {
        const barrel = this.group("barrel", this.scene, at);
        barrel.setLocalScale(1.45, 1.45, 1.45);
        this.shape("cylinder", barrel, [0, 0, 0], [0.95, 1.1, 0.95], m.oak);
        this.shape("sphere", barrel, [0, 0, 0], [1.08, 0.9, 1.08], m.oak);
        for (const y of [-0.34, 0.34]) this.shape("cylinder", barrel, [0, y, 0], [1.06, 0.08, 1.06], m.iron);
        this.shape("cylinder", barrel, [0, 0.56, 0], [0.8, 0.03, 0.8], m.oakDark);
        this.clutter.set(def.id, barrel);
      } else {
        const coop = this.group("coop", this.scene, at);
        coop.setLocalScale(1.4, 1.4, 1.4);
        this.shape("box", coop, [0, 0, 0], [1.1, 0.9, 1.3], m.oak);
        for (const z of [-0.4, 0, 0.4]) this.shape("box", coop, [-side * 0.56, 0, z], [0.04, 0.8, 0.1], m.oakDark);
        this.shape("box", coop, [0, 0.62, 0], [1.4, 0.12, 1.6], m.vermilion, [0, 0, side * 14]);
        // One of the inmates, looking out at the street.
        this.shape("sphere", coop, [-side * 0.6, 0.1, 0.2], [0.32, 0.32, 0.32], m.hen);
        this.shape("cone", coop, [-side * 0.78, 0.08, 0.2], [0.1, 0.16, 0.1], m.gold, [0, 0, side * 90]);
        this.shape("sphere", coop, [-side * 0.6, 0.28, 0.2], [0.1, 0.14, 0.18], m.vermilion);
        this.clutter.set(def.id, coop);
      }
    }
  }

  private buildMob(game: Game): void {
    const m = this.m;
    const coats = [m.canvas, m.plasterWarm, m.verdigris, this.vellum, m.lapis];
    for (const one of game.mob) {
      const hat = one.def.id % 3 === 0 ? "hood" : one.def.id % 3 === 1 ? "cap" : "straw";
      const look = this.townsfolk(this.scene, [one.pos.x, one.pos.y, one.pos.z], coats[one.def.id % coats.length]!, hat);
      // An apron, and something from the kitchen in the right hand.
      this.shape("box", look.root, [0, 0.26, 0.13], [0.3, 0.4, 0.02], m.egg, [0, 0, 0], this.lively);
      this.utensil(look.arms[1]!, [0, 0.44, 0], one.def.id, this.lively);
      this.mob.set(one.def.id, { root: look.root, arms: look.arms, x: one.pos.x, phase: one.def.id * 2.3, throwing: 0 });
    }
  }

  private get vellum(): pc.StandardMaterial {
    return this.paint("vellum", INK.vellumDark);
  }

  private buildCart(): void {
    const m = { ...this.m, vellum: this.vellum };
    const cart = this.group("cart", this.scene);
    this.cart = cart;
    this.shape("box", cart, [0, 0, 0], [1.4, 0.4, 2.3], m.oak);
    this.shape("box", cart, [0, 0.24, 0], [1.5, 0.08, 2.4], m.oakDark);
    for (const side of [-1, 1]) this.shape("box", cart, [side * 0.72, 0.42, 0], [0.08, 0.3, 2.3], m.vermilion);
    this.shape("box", cart, [0, 0.42, 1.14], [1.44, 0.3, 0.08], m.vermilion);
    for (let index = 0; index < 4; index += 1) {
      const pivot = this.group("wheel", cart);
      const hub = this.group("hub", pivot);
      this.shape("cylinder", hub, [0, 0, 0], [0.8, 0.16, 0.8], m.oakDark, [0, 0, 90]);
      this.shape("cylinder", hub, [0, 0, 0], [0.86, 0.1, 0.86], m.iron, [0, 0, 90]);
      this.shape("box", hub, [0, 0, 0], [0.2, 0.7, 0.1], m.gold);
      this.shape("box", hub, [0, 0, 0], [0.2, 0.1, 0.7], m.gold);
      this.wheels.push({ pivot, hub });
    }

    // The Egg King rides facing backwards, so he can see what's coming for him. So can you.
    const king = this.group("king", cart, [0, 0.28, 0.15]);
    this.king = king;
    this.shape("cylinder", king, [0, 0.08, 0], [0.7, 0.16, 0.7], m.lapis);
    this.shape("sphere", king, [0, 0.62, 0], [0.86, 1.06, 0.86], m.egg);
    this.shape("cylinder", king, [0, 0.42, 0], [0.9, 0.12, 0.9], m.vermilion);
    this.shape("box", king, [0, 0.42, 0.44], [0.16, 0.16, 0.06], m.gold);
    for (const side of [-1, 1]) {
      this.shape("sphere", king, [side * 0.15, 0.78, 0.36], [0.12, 0.15, 0.08], m.ink);
      this.shape("box", king, [side * 0.16, 0.92, 0.35], [0.16, 0.035, 0.05], m.ink, [0, 0, side * 16]);
      const arm = this.group("arm", king, [side * 0.42, 0.55, 0.05]);
      this.shape("box", arm, [side * 0.18, 0, 0], [0.36, 0.08, 0.08], m.egg);
      this.shape("sphere", arm, [side * 0.38, 0, 0], [0.14, 0.14, 0.14], m.egg);
      this.kingArms.push(arm);
    }
    this.shape("sphere", king, [0, 0.62, 0.4], [0.16, 0.07, 0.06], m.ink);
    this.shape("cylinder", king, [0, 1.16, 0], [0.42, 0.14, 0.42], m.gold);
    for (let spike = 0; spike < 5; spike += 1) {
      const turn = (spike / 5) * Math.PI * 2;
      this.shape("cone", king, [Math.cos(turn) * 0.17, 1.31, Math.sin(turn) * 0.17], [0.1, 0.2, 0.1], m.gold);
    }
    const crackAt: Array<[Triple, Triple, Triple]> = [
      [[0.12, 0.95, 0.3], [0.035, 0.3, 0.03], [0, 0, 28]],
      [[0.25, 0.83, 0.26], [0.035, 0.22, 0.03], [0, 0, -40]],
      [[-0.2, 0.62, 0.34], [0.035, 0.34, 0.03], [0, 0, -24]],
      [[-0.32, 0.5, 0.25], [0.035, 0.24, 0.03], [0, 0, 44]],
      [[0.02, 0.28, 0.36], [0.035, 0.3, 0.03], [0, 0, 62]],
    ];
    for (const [position, scale, euler] of crackAt) {
      const crack = this.shape("box", king, position, scale, m.ink, euler);
      crack.enabled = false;
      this.cracks.push(crack);
    }

    const posts: Triple[] = [[-0.52, 0.28, 0.9], [0.52, 0.28, 0.9], [-0.52, 0.28, -0.8]];
    for (const position of posts) this.men.push(this.figure(cart, position, m.vermilion));
    // Hay packed round him: the first thing a knock has to get through. Each bale lost is one fewer.
    const packed: Array<[Triple, Triple]> = [
      [[-0.5, 0.52, 0.12], [0.36, 0.5, 0.74]],
      [[0.5, 0.52, 0.12], [0.36, 0.5, 0.74]],
    ];
    for (const [position, scale] of packed) {
      const bale = this.group("bale", cart, position);
      this.shape("box", bale, [0, 0, 0], scale, m.hay);
      this.shape("box", bale, [0, 0, 0], [scale[0] * 1.03, scale[1] * 1.03, 0.05], m.oakDark);
      this.bales.push(bale);
    }

    // The bombard: a swivel gun on a post at the front, turned on whatever is next in range.
    this.shape("cylinder", cart, [0, 0.52, -0.62], [0.2, 0.56, 0.2], m.oakDark);
    const gun = this.group("gun", cart, [0, 0.86, -0.62]);
    const barrel = this.group("barrel", gun);
    this.shape("cylinder", barrel, [0, 0, -0.3], [0.3, 1, 0.3], m.iron, [90, 0, 0]);
    this.shape("cylinder", barrel, [0, 0, -0.8], [0.38, 0.1, 0.38], m.gold, [90, 0, 0]);
    this.shape("cylinder", barrel, [0, 0, 0.12], [0.4, 0.16, 0.4], m.gold, [90, 0, 0]);
    this.gun = gun;
    this.barrel = barrel;
  }

  // ---------------------------------------------------------------- every frame

  sync(game: Game, dt: number): void {
    this.clock += dt;
    this.frame += 1;
    const p = game.position;
    const q = game.rotation;
    const cart = this.cart;
    if (!cart) return;
    cart.setPosition(p.x, p.y, p.z);
    cart.setRotation(q.x, q.y, q.z, q.w);
    for (let index = 0; index < this.wheels.length; index += 1) {
      const wheel = game.wheel(index);
      const look = this.wheels[index]!;
      look.pivot.setLocalPosition(wheel.x, wheel.y, wheel.z);
      look.pivot.setLocalEulerAngles(0, (wheel.steer * 180) / Math.PI, 0);
      look.hub.setLocalEulerAngles((-wheel.spin * 180) / Math.PI, 0, 0);
    }

    // The King wobbles on a spring: knocked by every jolt, thrown by every lean.
    const kick = Math.min(3, game.jolt) * 9;
    this.wobbleSpeed.x += (Math.sin(this.clock * 31) * kick - this.wobble.x * 90 - this.wobbleSpeed.x * 7) * dt;
    this.wobbleSpeed.z += (Math.cos(this.clock * 27) * kick - game.lean * 520 - this.wobble.z * 90 - this.wobbleSpeed.z * 7) * dt;
    this.wobble.x += this.wobbleSpeed.x * dt;
    this.wobble.z += this.wobbleSpeed.z * dt;
    const broken = game.phase === "broken";
    const leap = game.phase === "won" ? Math.min(1, Math.max(0, (game.after - 0.9) / 0.9)) : 0;
    if (this.king) {
      this.king.enabled = !broken;
      this.king.setLocalPosition(0, 0.28, 0.15);
      this.king.setLocalEulerAngles(clampDeg(this.wobble.x, 24), 0, clampDeg(this.wobble.z, 26));
      const panic = 20 + Math.min(60, game.speed * 2.5) + Math.sin(this.clock * 18) * (10 + game.stage * 12);
      this.kingArms.forEach((arm, index) => arm.setLocalEulerAngles(0, 0, (index === 0 ? -1 : 1) * panic));
      const shown = [0, 2, 4, 5][game.stage] ?? 5;
      this.cracks.forEach((crack, index) => (crack.enabled = index < shown));
      if (leap > 0) {
        const roostD = game.course.roost ?? game.course.finish;
        const roostY = heightAt(game.course, roostD);
        const from = cart.getPosition();
        const to = new pc.Vec3(0, roostY + 0.9, -roostD + 5.2);
        const at = new pc.Vec3().lerp(from, to, leap);
        at.y += Math.sin(leap * Math.PI) * 3.4;
        this.king.setPosition(at);
        this.king.setEulerAngles(leap < 1 ? leap * 720 : 0, 180, 0);
      }
    }
    if (broken && !this.yolk) {
      this.yolk = this.group("yolk", cart, [0, 0.3, 0.15]);
      this.shape("cylinder", this.yolk, [0, 0, 0], [1.5, 0.05, 1.3], this.paint("albumen", new pc.Color(0.97, 0.95, 0.88), { gloss: 0.8 }));
      this.shape("sphere", this.yolk, [0.1, 0.1, 0], [0.6, 0.3, 0.6], this.m.yolk);
    }
    this.men.forEach((man, index) => {
      man.enabled = index < Math.min(MEN, game.men);
      // They lean to steer her, and haul back when the brake is on.
      man.setLocalEulerAngles(game.braking * 22, 0, -game.lean * 32);
    });
    if (game.braking > 0 && this.frame % 3 === 0) {
      const back = rotate3(q, 0, -0.35, 1.05);
      for (const side of [-1, 1]) {
        const out = rotate3(q, side * 0.9, 0, 0);
        this.puff({ x: p.x + back.x + out.x, y: p.y + back.y, z: p.z + back.z + out.z }, this.frame % 2 ? this.m.dust : this.m.flash, 0.45, 0.3, [side * 0.8, 1.2, 2.5]);
      }
    }
    this.bales.forEach((bale, index) => (bale.enabled = index < game.hay));
    this.syncTower(game);
    this.syncWorks(game);
    this.syncMill(game, dt);
    this.syncMob(game, dt);
    this.syncPans(game);
    this.syncEggs(game);
    this.syncPowder(game);
    this.syncPickups(game);
    this.syncClutter(game);
    this.syncProps(game);
    this.syncGun(game, dt);
    this.syncSights(game);
    this.syncShots(game);
    for (const folk of this.folk) {
      const near = Math.abs(-folk.at[2] - game.distance) < 50;
      const beat = near ? Math.abs(Math.sin(this.clock * 8 + folk.phase)) : 0;
      folk.root.setLocalPosition(folk.at[0], folk.at[1] + beat * 0.4, folk.at[2]);
      const wave = near ? 30 + Math.sin(this.clock * 11 + folk.phase) * 28 : 150;
      folk.arms[0]!.setLocalEulerAngles(0, 0, wave);
      folk.arms[1]!.setLocalEulerAngles(0, 0, -wave);
    }
    this.syncEffects(dt);
    if (this.hen) {
      const home = game.phase === "won";
      const settled = leap >= 1;
      const beat = home ? Math.sin(this.clock * (settled ? 3 : 9)) : Math.sin(this.clock * 1.6) * 0.2;
      this.hen.root.setLocalPosition(0, 0.4 + (home && !settled ? Math.abs(beat) * 0.5 : 0), settled ? -0.6 : -1.6);
      this.hen.head.setLocalEulerAngles(home ? 14 + beat * 10 : beat * 14, beat * 8, 0);
      this.hen.wings.forEach((wing, index) => wing.setLocalEulerAngles(0, 0, (index === 0 ? 1 : -1) * (home ? 35 + beat * 35 : 0)));
      const near = (game.course.roost ?? 0) - game.distance < 70;
      this.chicks.forEach((chick, index) => {
        const at = chick.getLocalPosition();
        const hop = near ? Math.abs(Math.sin(this.clock * (home ? 11 : 6) + index * 1.9)) * (home ? 0.9 : 0.35) : 0;
        chick.setLocalPosition(at.x, 0.2 + hop, at.z);
      });
    }
    this.follow(game, dt);
  }

  /** The tower is one piece, turned about its foot to wherever the sim says it has got to. */
  private syncTower(game: Game): void {
    const tower = game.tower;
    const def = game.course.tower;
    const post = game.course.windlass;
    if (!this.tower || !tower || !def || !post) return;
    // While the rope holds it sways a hair in the wind, to show how little is holding it.
    const sway = tower.state === "held" ? Math.sin(this.clock * 1.3) * 0.25 : 0;
    this.tower.setLocalEulerAngles((-tower.angle * 180) / Math.PI - sway, 0, 0);
    if (this.belfry) this.belfry.enabled = game.bell.state === "hung";
    if (this.shoring) this.shoring.enabled = tower.angle < def.lean + 0.12;
    if (this.capstan) this.capstan.enabled = !game.targets.find((target) => target.id === "windlass")?.done || tower.state === "held";
    if (this.rope) {
      this.rope.enabled = tower.state === "held";
      if (this.rope.enabled) {
        const from = new pc.Vec3(post.x, heightAt(game.course, post.d) + 1.1, -post.d);
        const to = this.tower.getWorldTransform().transformPoint(new pc.Vec3((def.x1 - def.x0) / 2 - 0.2, def.height - 0.4, 0.05));
        const middle = new pc.Vec3().lerp(from, to, 0.5);
        this.rope.setPosition(middle);
        this.rope.lookAt(to);
        this.rope.setLocalScale(0.16, 0.16, from.distance(to));
      }
    }
    if (tower.state === "falling" && this.frame % 2 === 0) {
      // Dust and mortar shaken out of it all the way down.
      const top = this.tower.getWorldTransform().transformPoint(new pc.Vec3((this.chance() - 0.5) * 5, def.height * (0.3 + this.chance() * 0.7), -def.thick * this.chance()));
      this.puff({ x: top.x, y: top.y, z: top.z }, this.m.dust, 0.9, 0.7, [0, -1, 1]);
    }
  }

  private syncWorks(game: Game): void {
    const bell = game.bell.body;
    if (bell && !this.bell) {
      this.bell = this.group("bell", this.scene);
      this.bellShape(this.bell);
    }
    if (bell && this.bell) {
      const p = bell.translation();
      const q = bell.rotation();
      this.bell.setPosition(p.x, p.y, p.z);
      this.bell.setRotation(q.x, q.y, q.z, q.w);
      if (game.bell.state === "loose" && game.bell.landed && this.frame % 3 === 0) this.puff({ x: p.x, y: p.y - 0.7, z: p.z + 0.6 }, this.m.dust, 0.9, 0.5, [0, 1, 1.5]);
    }
    if (this.wain && game.wain) {
      const p = game.wain.body.translation();
      const q = game.wain.body.rotation();
      this.wain.setPosition(p.x, p.y, p.z);
      this.wain.setRotation(q.x, q.y, q.z, q.w);
      if (game.wain.state === "wrecked") this.wain.setLocalEulerAngles(-18, 9, 14);
      if (game.wain.state === "away" && this.frame % 3 === 0) this.puff({ x: p.x, y: p.y - 0.5, z: p.z + 1.2 }, this.m.dust, 0.7, 0.4, [0, 0.8, 1.5]);
    }
    if (this.chock) this.chock.enabled = game.wain?.state === "chocked" && !game.targets.find((target) => target.id === "wain")?.done;
    if (this.queen) {
      // She hops with rage whenever her mob is on the ground.
      const cross = game.standing < game.mob.length ? 1 : 0.3;
      this.queen.setLocalPosition(-0.1, 0.1 + Math.abs(Math.sin(this.clock * (4 + cross * 6))) * 0.2 * cross, 0);
    }
  }

  private syncMob(game: Game, dt: number): void {
    const half = game.course.width / 2;
    const cart = game.position;
    for (const one of game.mob) {
      const look = this.mob.get(one.def.id);
      if (!look) continue;
      look.root.enabled = one.state !== "out";
      if (!look.root.enabled) continue;
      const down = one.state === "down";
      // Dived into the nearer gutter, they stay small until it has gone by.
      const side = one.pos.x === 0 ? 1 : Math.sign(one.pos.x);
      const goal = down ? side * (half - 0.3) : one.pos.x;
      look.x += (goal - look.x) * Math.min(1, dt * (down ? 10 : 2.5));
      const near = Math.abs(one.pos.z - cart.z) < 60;
      const beat = down || !near ? 0 : Math.abs(Math.sin(this.clock * 7 + look.phase));
      look.root.setLocalPosition(look.x + (down ? Math.sin(this.clock * 40 + look.phase) * 0.03 : 0), one.pos.y + beat * 0.45, one.pos.z);
      look.root.setLocalScale(1.9, down ? 0.9 : 1.9, 1.9);
      look.root.setLocalEulerAngles(down ? 35 : 0, 0, 0);
      look.throwing = Math.max(0, look.throwing - dt * 3.2);
      const shake = 150 - Math.abs(Math.sin(this.clock * 9 + look.phase)) * 110;
      look.arms[0]!.setLocalEulerAngles(0, 0, down ? 170 : shake);
      // The arm with the pan in it: brandished, then brought right over when it throws.
      look.arms[1]!.setLocalEulerAngles(down ? 0 : look.throwing > 0 ? -200 + look.throwing * 260 : -20 + Math.sin(this.clock * 9 + look.phase) * 14, 0, down ? -170 : -8);
    }
  }

  /** Whatever the mob has thrown, on its way. */
  private syncPans(game: Game): void {
    const alive = new Set<number>();
    for (const pan of game.pans) {
      alive.add(pan.id);
      let look = this.pans.get(pan.id);
      if (!look) {
        look = this.utensil(this.scene, [0, 0, 0], pan.by);
        look.setLocalScale(1.7, 1.7, 1.7);
        this.pans.set(pan.id, look);
      }
      const at = panAt(pan);
      look.setPosition(at.x, at.y, at.z);
      look.rotateLocal(19, 7, 23);
    }
    for (const [id, look] of this.pans) {
      if (alive.has(id)) continue;
      look.destroy();
      this.pans.delete(id);
    }
  }

  /** Eggs in the air: lobbed, tumbling, and about to make a mess. */
  private syncEggs(game: Game): void {
    const alive = new Set<number>();
    for (const egg of game.eggFlights) {
      alive.add(egg.id);
      let look = this.eggs.get(egg.id);
      if (!look) {
        look = this.shape("sphere", this.scene, [0, 0, 0], [0.34, 0.44, 0.34], this.m.egg);
        this.eggs.set(egg.id, look);
      }
      const k = Math.min(1, egg.t / egg.total);
      const reach = Math.hypot(egg.to.x - egg.from.x, egg.to.z - egg.from.z);
      look.setPosition(egg.from.x + (egg.to.x - egg.from.x) * k, egg.from.y + (egg.to.y - egg.from.y) * k + Math.sin(k * Math.PI) * (0.4 + reach * 0.04), egg.from.z + (egg.to.z - egg.from.z) * k);
      look.rotateLocal(23, 0, 17);
    }
    for (const [id, look] of this.eggs) {
      if (alive.has(id)) continue;
      look.destroy();
      this.eggs.delete(id);
    }
  }

  /** Where an egg burst: a fried egg on the cobbles, until there are too many and the oldest goes. */
  private splatter(at: Vec3, course: CourseDef): void {
    const ground = heightAt(course, -at.z);
    if (Math.abs(at.x) > course.width / 2 + 0.2 || at.y - ground > 1.6 || at.y < ground - 1) return;
    let mark = this.mess[this.messNext];
    if (!mark) {
      mark = this.group("mess", this.scene);
      const white = this.shape("cylinder", mark, [0, 0, 0], [1.7, 0.03, 1.4], this.m.albumen);
      const blob = this.shape("cylinder", mark, [0.5, 0, 0.3], [0.8, 0.03, 0.7], this.m.albumen);
      const yolk = this.shape("sphere", mark, [0.1, 0.04, 0], [0.6, 0.16, 0.6], this.m.yolk);
      for (const part of [white, blob, yolk]) if (part.render) part.render.castShadows = false;
      this.mess[this.messNext] = mark;
    }
    this.messNext = (this.messNext + 1) % MESS;
    const tilt = (Math.atan2(heightAt(course, -at.z - 0.5) - heightAt(course, -at.z + 0.5), 1) * 180) / Math.PI;
    mark.setPosition(at.x, ground + 0.03, at.z);
    mark.setEulerAngles(-tilt, this.chance() * 360, 0);
    const size = 0.8 + this.chance() * 0.5;
    mark.setLocalScale(size, 1, size);
  }

  // ---------------------------------------------------------------- powder, walls and what his people left

  private kegShape(root: pc.Entity, big: boolean): void {
    const m = this.m;
    const tall = big ? 1 : 1.1;
    this.shape("cylinder", root, [0, 0, 0], [0.8, tall, 0.8], m.oakDark);
    this.shape("sphere", root, [0, 0, 0], [0.92, tall * 0.84, 0.92], m.oakDark);
    for (const y of [-0.32, 0.32]) this.shape("cylinder", root, [0, y, 0], [0.9, 0.09, 0.9], m.vermilion);
    this.shape("cylinder", root, [0, tall / 2, 0], [0.66, 0.04, 0.66], m.ink);
  }

  /** The Queen's powder: kegs on the kerb, traps in the road, the wagon, and the barricade it is parked against. */
  private buildPowder(game: Game): void {
    const m = this.m;
    const course = game.course;
    const half = course.width / 2;
    for (const keg of game.kegs) {
      const def = keg.def;
      const root = this.group("keg", this.scene, [keg.at.x, keg.at.y, keg.at.z]);
      let fuseAt: Triple = [0.12, 0.74, 0];
      if (def.big) {
        // The powder wagon: a flat cart, loaded to the rails.
        this.shape("box", root, [0, -0.45, 0], [2.2, 0.3, 3.2], m.oak);
        for (const side of [-1, 1]) for (const z of [-1, 1]) this.shape("cylinder", root, [side * 1.2, -0.5, z], [0.9, 0.16, 0.9], m.oakDark, [0, 0, 90]);
        for (const [x, y, z] of [[-0.55, 0.2, -0.9], [0.55, 0.2, -0.9], [-0.55, 0.2, 0.2], [0.55, 0.2, 0.2], [0, 0.2, 1.1], [0, 1.2, -0.35]] as const) {
          this.kegShape(this.group("cask", root, [x, y, z]), true);
        }
        this.shape("box", root, [0.95, 1.4, 1.4], [0.08, 2.6, 0.08], m.oakDark);
        this.shape("cone", root, [0.5, 2.3, 1.4], [0.7, 1, 0.06], m.vermilion, [0, 0, -90]);
        fuseAt = [0, 1.95, -0.35];
      } else {
        this.kegShape(root, false);
        this.shape("box", root, [0.06, 0.64, 0], [0.04, 0.22, 0.04], m.rope, [0, 0, -24]);
      }
      const spark = this.shape("sphere", root, fuseAt, [0.16, 0.16, 0.16], m.spark);
      if (spark.render) spark.render.castShadows = false;
      // A trap says so: a red ring on the road as wide as its temper.
      let ring: pc.Entity | null = null;
      if (def.trap) {
        const tilt = (Math.atan(-(heightAt(course, def.d + 0.5) - heightAt(course, def.d - 0.5))) * 180) / Math.PI;
        ring = this.hoop(this.scene, [keg.at.x, heightAt(course, def.d) + 0.08, keg.at.z], KEG_TRIP * 2, m.danger);
        ring.setLocalEulerAngles(-tilt, 0, 0);
      }
      this.kegs.set(def.id, { root, spark, ring });
    }
    for (const wall of game.walls) {
      const def = wall.def;
      const root = this.group("barricade", this.scene, [0, heightAt(course, def.d), -def.d]);
      // Sharpened stakes, lashed to two rails, and the Queen's colours nailed to the middle of it.
      const stakes = 13;
      for (let stake = 0; stake < stakes; stake += 1) {
        const x = -half + (stake + 0.5) * ((half * 2) / stakes);
        const tall = def.height + ((stake * 7) % 3) * 0.25;
        this.shape("box", root, [x, tall / 2, 0], [0.5, tall, 0.5], stake % 2 ? m.oak : m.oakDark, [0, (stake * 37) % 20, 0]);
        this.shape("cone", root, [x, tall + 0.3, 0], [0.56, 0.7, 0.56], m.oakDark);
      }
      for (const y of [0.8, def.height - 0.5]) this.shape("box", root, [0, y, 0.3], [half * 2 + 0.6, 0.26, 0.2], m.oakDark);
      for (const side of [-1, 1]) this.shape("box", root, [side * 2.6, 1.3, 1.1], [0.24, 3, 0.24], m.oak, [-40, 0, 0]);
      this.shape("box", root, [0, def.height * 0.62, 0.42], [2, 1.5, 0.05], m.vermilion);
      this.shape("cylinder", root, [0, def.height * 0.62, 0.46], [0.9, 0.04, 0.9], m.gold, [90, 0, 0]);
      this.walls.set(def.id, root);
    }
  }

  private syncPowder(game: Game): void {
    for (const keg of game.kegs) {
      const look = this.kegs.get(keg.def.id);
      if (!look) continue;
      const here = keg.state !== "gone";
      look.root.enabled = here;
      if (look.ring) {
        look.ring.enabled = here && this.mode === "run";
        const beat = 1 + Math.sin(this.clock * (keg.state === "lit" ? 30 : 5) + keg.def.id) * 0.05;
        look.ring.setLocalScale(KEG_TRIP * 2 * beat, KEG_TRIP * 2 * beat, KEG_TRIP * 2 * beat);
      }
      if (!here) continue;
      // A slow match glows; a lit fuse spits.
      const lit = keg.state === "lit";
      const glow = lit ? 0.3 + Math.abs(Math.sin(this.clock * 40)) * 0.3 : keg.def.trap ? 0.12 + Math.abs(Math.sin(this.clock * 4 + keg.def.id)) * 0.1 : 0.01;
      look.spark.setLocalScale(glow, glow, glow);
      if (lit && this.frame % 2 === 0) {
        const at = look.spark.getPosition();
        this.puff({ x: at.x, y: at.y, z: at.z }, this.frame % 4 ? this.m.spark : this.m.smoke, 0.3, 0.3, [this.chance() * 3 - 1.5, 2 + this.chance() * 2, this.chance() * 3 - 1.5]);
      }
    }
    for (const wall of game.walls) {
      const look = this.walls.get(wall.def.id);
      if (look) look.enabled = wall.state === "up";
    }
  }

  /** Baskets of eggs and pyramids of shot, each in a gold ring so it reads as his and not hers. */
  private buildPickups(game: Game): void {
    const m = this.m;
    for (const one of game.pickups) {
      const root = this.group("pickup", this.scene, [one.at.x, one.at.y - 0.5, one.at.z]);
      const spin = this.group("spin", root);
      if (one.def.kind === "eggs") {
        this.shape("cylinder", spin, [0, 0.3, 0], [1.3, 0.6, 1.3], m.oak);
        this.shape("cylinder", spin, [0, 0.6, 0], [1.4, 0.1, 1.4], m.hay);
        for (let egg = 0; egg < 7; egg += 1) {
          const turn = (egg / 6) * Math.PI * 2;
          const out = egg === 6 ? 0 : 0.36;
          this.shape("sphere", spin, [Math.cos(turn) * out, egg === 6 ? 0.95 : 0.76, Math.sin(turn) * out], [0.36, 0.46, 0.36], m.egg);
        }
        this.shape("box", spin, [0, 1.25, 0], [1.3, 0.08, 0.08], m.oakDark);
        for (const side of [-1, 1]) this.shape("box", spin, [side * 0.62, 0.95, 0], [0.08, 0.7, 0.08], m.oakDark);
      } else {
        for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as const) this.shape("sphere", spin, [x, 0.3, z], [0.6, 0.6, 0.6], m.iron);
        this.shape("sphere", spin, [0, 0.76, 0], [0.6, 0.6, 0.6], m.iron);
        this.shape("box", spin, [0, 0.04, 0], [1.5, 0.08, 1.5], m.oakDark);
      }
      const ring = this.hoop(root, [0, 0.1, 0], 2.6, m.aim);
      ring.name = "ring";
      this.pickups.set(one.def.id, root);
    }
  }

  private syncPickups(game: Game): void {
    for (const one of game.pickups) {
      const look = this.pickups.get(one.def.id);
      if (!look) continue;
      look.enabled = !one.taken;
      if (one.taken) continue;
      const bob = Math.abs(Math.sin(this.clock * 3 + one.def.id * 1.7)) * 0.25;
      look.children[0]?.setLocalPosition(0, bob, 0);
      (look.children[0] as pc.Entity | undefined)?.setLocalEulerAngles(0, this.clock * 50, 0);
      const pulse = 2.6 * (1 + Math.sin(this.clock * 6 + one.def.id) * 0.08);
      (look.children[1] as pc.Entity | undefined)?.setLocalScale(pulse, pulse, pulse);
    }
  }

  private syncClutter(game: Game): void {
    for (const thing of game.clutter) {
      const look = this.clutter.get(thing.def.id);
      if (!look) continue;
      look.enabled = !thing.done;
      // Baskets swing a little on their chains: the village is not nailed down.
      if (thing.def.kind === "pot" && !thing.done) look.setLocalEulerAngles(Math.sin(this.clock * 1.7 + thing.def.id) * 7, 0, Math.cos(this.clock * 1.3 + thing.def.id) * 5);
    }
  }

  private syncGun(game: Game, dt: number): void {
    const target = game.target;
    const running = this.mode === "run" && game.phase === "run";
    if (!this.gun) return;
    if (target && running) this.gun.lookAt(target.at.x, target.at.y + 1.2, target.at.z);
    else this.gun.setLocalEulerAngles(14, 0, 0);
    this.gunKick = Math.max(0, this.gunKick - dt * 5);
    this.barrel?.setLocalPosition(0, 0, this.gunKick * 0.4);
  }

  /**
   * A ring on everything the gun could be laid on. Faint and small while it is out of range,
   * so the street can be read from the crest; gold and turning once a round will reach it.
   */
  private syncSights(game: Game): void {
    const running = this.mode === "run" && game.phase === "run";
    for (const target of game.targets) {
      let look = this.sights.get(target.id);
      if (!look) {
        const sight = this.paint("sight", INK.gold, { glow: 1.1 });
        // Drawn over everything, so a target is never hidden behind its own wall.
        sight.depthTest = false;
        sight.update();
        look = this.group("sight", this.scene);
        this.hoop(look, [0, 0, 0], 1, sight);
        this.hoop(look, [0, 0, 0], 0.5, sight);
        for (let tick = 0; tick < 4; tick += 1) {
          const turn = (tick / 4) * Math.PI * 2;
          const mark = this.shape("box", look, [Math.cos(turn) * 0.56, 0, Math.sin(turn) * 0.56], [0.22, 0.03, 0.05], sight, [0, (-turn * 180) / Math.PI, 0]);
          if (mark.render) mark.render.castShadows = false;
        }
        this.sights.set(target.id, look);
      }
      const show = running && !target.done && !target.doomed && game.ammo > 0 && (target.kind !== "rank" || target.lit);
      look.enabled = show;
      if (!show) continue;
      const big = target.kind === "rank" ? 2.6 : target.kind === "wall" ? 4.4 : 3.4;
      const size = target.lit ? big * (1 + Math.sin(this.clock * 9) * 0.1) : big * 0.42;
      look.setPosition(target.at.x, target.at.y + 0.3, target.at.z);
      look.setLocalScale(size, size, size);
      look.lookAt(this.camera.getPosition());
      look.rotateLocal(90, 0, 0);
      if (target.lit) look.rotateLocal(0, this.clock * 70, 0);
    }
  }

  /**
   * Which lit target, if any, is under a touch at these page coordinates. A thumb is not a
   * needle: the nearest ring within a generous reach counts.
   */
  pick(clientX: number, clientY: number, game: Game, within = 0): string | null {
    const camera = this.camera.camera;
    if (!camera) return null;
    const box = this.canvas.getBoundingClientRect();
    let best: string | null = null;
    let nearest = within || Math.max(64, box.width * 0.17);
    const screen = new pc.Vec3();
    for (const target of game.targets) {
      if (!target.lit) continue;
      camera.worldToScreen(new pc.Vec3(target.at.x, target.at.y + 0.3, target.at.z), screen);
      if (screen.z < 0) continue;
      const away = Math.hypot(screen.x + box.left - clientX, screen.y + box.top - clientY);
      if (away < nearest) {
        nearest = away;
        best = target.id;
      }
    }
    return best;
  }

  /**
   * What a touch at these page coordinates is meant for. A gold ring under the thumb is a round
   * from the gun; anything else is a stone: at whatever is thrown, standing or loose there, and
   * failing all of those at the spot of ground itself.
   */
  pickAt(clientX: number, clientY: number, game: Game): Pick {
    const ring = this.pick(clientX, clientY, game, Math.max(46, this.canvas.clientWidth * 0.12));
    const camera = this.camera.camera;
    const box = this.canvas.getBoundingClientRect();
    if (!camera) return ring ? { shoot: ring } : { egg: { at: game.position } };
    const cart = game.position;
    const hand = { x: cart.x - 0.5, y: cart.y + 1.2, z: cart.z - 0.8 };
    const screen = new pc.Vec3();
    const reach = Math.max(44, box.width * 0.115);
    let best: EggAim | null = null;
    let nearest = Infinity;
    const offer = (at: Vec3, aim: EggAim, within: number, weight: number): void => {
      if (Math.hypot(at.x - hand.x, at.y - hand.y, at.z - hand.z) > EGG_RANGE - 0.5) return;
      camera.worldToScreen(new pc.Vec3(at.x, at.y, at.z), screen);
      if (screen.z < 0) return;
      const away = Math.hypot(screen.x + box.left - clientX, screen.y + box.top - clientY);
      if (away > within || away * weight >= nearest) return;
      nearest = away * weight;
      best = aim;
    };
    // What is in the air is small, fast and urgent: it gets the widest reach and first call.
    for (const pan of game.pans) if (!pan.doomed) offer(panAt(pan), { pan: pan.id }, reach * 1.5, 0.5);
    if (!best && ring) return { shoot: ring };
    for (const one of game.mob) if (one.state === "stand") offer({ x: one.pos.x, y: one.pos.y + 1.1, z: one.pos.z }, { cook: one.def.id }, reach, 1);
    for (const thing of game.clutter) if (!thing.done) offer(thing.at, { clutter: thing.def.id }, reach, 1);
    for (const keg of game.kegs) if (keg.state !== "gone") offer(keg.at, { keg: keg.def.id }, reach * (keg.def.big ? 1.4 : 1.1), 0.9);
    if (best) return { egg: best };
    // Nothing there: the stone goes where the thumb pointed, as far as the street under it.
    const x = clientX - box.left;
    const y = clientY - box.top;
    const from = camera.screenToWorld(x, y, camera.nearClip);
    const to = camera.screenToWorld(x, y, 90);
    const at = new pc.Vec3();
    for (let k = 0; k <= 1; k += 1 / 90) {
      at.lerp(from, to, k);
      if (at.y <= heightAt(game.course, -at.z)) break;
    }
    return { egg: { at: { x: at.x, y: at.y, z: at.z } } };
  }

  /** Rounds from the cart's gun, lobbed along the line the sim gave them. */
  private syncShots(game: Game): void {
    const m = this.m;
    const alive = new Set<number>();
    for (const flight of game.flights) {
      alive.add(flight.id);
      let look = this.shots.get(flight.id);
      if (!look) {
        look = this.group("shot", this.scene);
        this.shape("sphere", look, [0, 0, 0], [0.5, 0.5, 0.5], m.iron);
        this.shots.set(flight.id, look);
      }
      const k = Math.min(1, flight.t / flight.total);
      const reach = Math.hypot(flight.to.x - flight.from.x, flight.to.z - flight.from.z);
      const at = {
        x: flight.from.x + (flight.to.x - flight.from.x) * k,
        y: flight.from.y + (flight.to.y - flight.from.y) * k + Math.sin(k * Math.PI) * (0.8 + reach * 0.06),
        z: flight.from.z + (flight.to.z - flight.from.z) * k,
      };
      look.setPosition(at.x, at.y, at.z);
      this.puff(at, m.smoke, 0.4, 0.3, [0, 0.5, 0]);
    }
    for (const [id, look] of this.shots) {
      if (alive.has(id)) continue;
      look.destroy();
      this.shots.delete(id);
    }
  }

  /** A hoop spreading over the ground from `at`. */
  private pulse(at: Vec3, material: pc.StandardMaterial, from: number, to: number, life: number): void {
    const entity = this.hoop(this.scene, [0, 0, 0], from, material);
    entity.setPosition(at.x, at.y + 0.12, at.z);
    this.pulses.push({ entity, life, total: life, from, to });
  }

  private syncProps(game: Game): void {
    const alive = new Set<number>();
    for (const prop of game.props) {
      alive.add(prop.id);
      let look = this.props.get(prop.id);
      if (!look) {
        look = this.buildProp(prop);
        this.props.set(prop.id, look);
      }
      const p = prop.body.translation();
      const q = prop.body.rotation();
      look.setPosition(p.x, p.y, p.z);
      look.setRotation(q.x, q.y, q.z, q.w);
    }
    for (const [id, look] of this.props) {
      if (alive.has(id)) continue;
      look.destroy();
      this.props.delete(id);
    }
  }

  private buildProp(prop: Prop): pc.Entity {
    const m = this.m;
    const root = this.group(prop.kind, this.scene);
    const s = prop.size;
    if (prop.kind === "hay") this.shape("box", root, [0, 0, 0], [s.x * 2, s.y * 2, s.z * 2], m.hay);
    else if (prop.kind === "beam") this.shape("box", root, [0, 0, 0], [s.x * 2, s.y * 2, s.z * 2], m.oakDark);
    else if (prop.kind === "block") this.shape("box", root, [0, 0, 0], [s.x * 2, s.y * 2, s.z * 2], prop.id % 3 ? m.stone : m.kerb);
    else if (prop.kind === "folk") {
      // Bowled clean over, pan and all.
      const coats = [m.canvas, m.plasterWarm, m.verdigris, this.vellum, m.lapis];
      const look = this.townsfolk(root, [0, -0.6, 0], coats[prop.id % coats.length]!, prop.id % 2 ? "cap" : "straw");
      look.arms.forEach((arm, index) => arm.setLocalEulerAngles(0, 0, index ? -30 : 30));
    } else if (prop.kind === "shard") {
      this.shape("box", root, [0, 0, 0], [s.x * 2, s.y * 2, s.z * 2], prop.id % 2 ? m.oak : m.vermilion);
    } else if (prop.kind === "hen") {
      // Out of the coop and not going back.
      this.shape("sphere", root, [0, 0, 0], [0.5, 0.44, 0.6], m.hen);
      this.shape("sphere", root, [0, 0.26, 0.24], [0.26, 0.26, 0.26], m.hen);
      this.shape("cone", root, [0, 0.24, 0.42], [0.1, 0.14, 0.1], m.gold, [90, 0, 0]);
      this.shape("sphere", root, [0, 0.4, 0.22], [0.08, 0.12, 0.16], m.vermilion);
      for (const side of [-1, 1]) this.shape("sphere", root, [side * 0.28, 0.06, 0], [0.12, 0.3, 0.44], m.hen, [0, 0, side * 40]);
    } else if (prop.kind === "crown") {
      const crown = this.group("crown", root);
      crown.setLocalScale(2, 2, 2);
      this.crownShape(crown);
    } else {
      this.shape("sphere", root, [0, 0, 0], [0.8, 0.5, 0.8], m.egg);
      this.shape("sphere", root, [0, 0.08, 0], [0.5, 0.3, 0.5], m.yolk);
    }
    return root;
  }

  private syncEffects(dt: number): void {
    for (let index = this.puffs.length - 1; index >= 0; index -= 1) {
      const puff = this.puffs[index]!;
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.entity.enabled = false;
        this.pool.push(puff.entity);
        this.puffs.splice(index, 1);
        continue;
      }
      const k = 1 - puff.life / puff.total;
      const size = puff.size * Math.sin(Math.min(1, k * 1.15) * Math.PI) + 0.01;
      puff.entity.translate(puff.velocity.x * dt, puff.velocity.y * dt, puff.velocity.z * dt);
      puff.velocity.y -= 2 * dt;
      puff.entity.setLocalScale(size, size, size);
    }
    for (let index = this.pulses.length - 1; index >= 0; index -= 1) {
      const pulse = this.pulses[index]!;
      pulse.life -= dt;
      if (pulse.life <= 0) {
        pulse.entity.destroy();
        this.pulses.splice(index, 1);
        continue;
      }
      const k = 1 - pulse.life / pulse.total;
      const size = pulse.from + (pulse.to - pulse.from) * (1 - (1 - k) * (1 - k));
      pulse.entity.setLocalScale(size, size * (1 - k) + 0.2, size);
    }
  }

  private follow(game: Game, dt: number): void {
    const p = game.position;
    const course = game.course;
    const portrait = this.canvas.clientHeight > this.canvas.clientWidth;
    let eye: pc.Vec3;
    let gaze: pc.Vec3;
    if (this.mode === "title") {
      // High over the crest, looking the whole street down to the water.
      const drift = Math.sin(this.clock * 0.25) * 2;
      const focus = course.tower?.d ?? 66;
      eye = new pc.Vec3(4 + drift, heightAt(course, 26) + (portrait ? 25 : 16), -24);
      gaze = new pc.Vec3(-1, heightAt(course, focus) - (portrait ? 26 : 2), -focus - (portrait ? 0 : 6));
    } else if (game.phase === "won" && game.after > 0.4 && course.roost !== null) {
      const roostY = heightAt(course, course.roost);
      eye = new pc.Vec3(portrait ? 2.5 : 7, roostY + (portrait ? 7 : 5), -course.roost + (portrait ? 16.5 : 15));
      gaze = new pc.Vec3(0, roostY + (portrait ? 0.5 : 2.6), -course.roost + 3);
    } else {
      // At the crest the camera stands tall, so the street can be read; it comes down to the cart as she gathers way.
      const crest = Math.min(1, Math.max(0, 1 - game.distance / 24));
      const over = crest * crest * (3 - 2 * crest);
      // In the air the camera hangs back and up, so the drop and the landing are both in view.
      this.airLift += ((game.airtime > 0.15 ? 1 : 0) - this.airLift) * Math.min(1, dt * 3.5);
      const lift = this.airLift;
      eye = new pc.Vec3(p.x * 0.55, p.y + (portrait ? 9.4 : 6.4) + lift * 2.6 + over * 7, p.z + 9.5 + lift * 4 + over * 3);
      gaze = new pc.Vec3(p.x * 0.75, p.y + 0.6 - lift * 1.5 - over * 3, p.z - (portrait ? 3.5 : 7) - lift * 4 - over * 26);
      // Lean a little towards whatever the gun could reach, so it is on the screen to be tapped.
      const target = game.target;
      if (target && game.phase === "run") gaze.x += (target.at.x - p.x) * 0.22;
      // Never let the hill behind come between the camera and the cart.
      eye.y = Math.max(eye.y, heightAt(course, -eye.z) + 3.4);
      if (game.cause === "fell") {
        // He has gone in: the camera stays on the bank and does not follow him under.
        eye = this.eye.clone();
        gaze = this.gaze.clone();
      }
    }
    const k = this.snap ? 1 : Math.min(1, dt * (game.phase === "won" ? 2.2 : this.mode === "title" ? 2 : 7));
    this.snap = false;
    this.eye.lerp(this.eye, eye, k);
    this.gaze.lerp(this.gaze, gaze, Math.min(1, k * 0.6 + (k >= 1 ? 1 : 0)));
    this.shake = Math.max(0, this.shake - dt * 3.5);
    const jitter = this.shake * this.shake * 0.5;
    this.camera.setPosition(this.eye.x + Math.sin(this.clock * 71) * jitter, this.eye.y + Math.cos(this.clock * 83) * jitter, this.eye.z);
    this.camera.lookAt(this.gaze);
  }

  // ---------------------------------------------------------------- effects

  private puff(at: Vec3, material: pc.StandardMaterial, size: number, life: number, velocity: Triple): void {
    let entity = this.pool.pop();
    if (!entity) {
      entity = new pc.Entity("puff");
      entity.addComponent("render", { type: "sphere", material, castShadows: false, receiveShadows: false });
      this.scene.addChild(entity);
    }
    if (entity.render) entity.render.material = material;
    entity.enabled = true;
    entity.setPosition(at.x, at.y, at.z);
    entity.setLocalScale(0.01, 0.01, 0.01);
    this.puffs.push({ entity, life, total: life, velocity: new pc.Vec3(velocity[0], velocity[1], velocity[2]), size });
  }

  private burst(at: Vec3, material: pc.StandardMaterial, count: number, size: number, speed: number): void {
    for (let index = 0; index < count; index += 1) {
      const turn = (index / count) * Math.PI * 2 + this.clock;
      this.puff({ x: at.x, y: at.y + 0.3, z: at.z }, material, size * (0.6 + ((index * 7) % 5) / 6), 0.5 + ((index * 3) % 4) / 8, [Math.cos(turn) * speed, 1.5 + ((index * 5) % 3), Math.sin(turn) * speed]);
    }
  }

  handle(event: GameEvent, game: Game): void {
    const m = this.m;
    const cart = game.position;
    if (event.type === "jolt") this.shake = Math.min(1.2, this.shake + (event.amount + event.absorbed) / 18);
    // Straw flies whenever the hay takes a knock for him.
    if (event.type === "jolt" && event.absorbed > 1.5) this.burst({ x: cart.x, y: cart.y + 0.9, z: cart.z }, m.hay, Math.min(9, 3 + Math.round(event.absorbed / 4)), 0.22, 4);
    if (event.type === "jolt" && event.amount + event.absorbed > 12) this.burst({ x: cart.x, y: cart.y + 0.3, z: cart.z }, m.dust, 5, 0.6, 3);
    if (event.type === "crack") this.burst({ x: cart.x, y: cart.y + 1.2, z: cart.z }, m.egg, 6, 0.22, 4);
    if (event.type === "hayLost") this.burst({ x: cart.x, y: cart.y + 1, z: cart.z }, m.hay, 12, 0.3, 5);
    if (event.type === "broken") {
      this.shake = 1.4;
      this.burst({ x: cart.x, y: cart.y + 1, z: cart.z }, m.yolk, 9, 0.4, 5);
      this.burst({ x: cart.x, y: cart.y + 1, z: cart.z }, m.egg, 9, 0.3, 6);
      if (event.cause === "fell") {
        // Into the canal.
        const water = { x: cart.x, y: cart.y - 3.5, z: cart.z };
        this.burst(water, m.spray, 14, 1.2, 6);
        this.burst(water, m.water, 8, 0.8, 4);
        this.puff({ x: water.x, y: water.y + 1, z: water.z }, m.spray, 4, 0.8, [0, 7, 0]);
      }
    }
    if (event.type === "shoot" && this.gun) {
      const mouth = this.gun.getPosition().clone().add(this.gun.forward.clone().mulScalar(1.1));
      const at = { x: mouth.x, y: mouth.y, z: mouth.z };
      this.gunKick = 1;
      this.shake = Math.min(1.2, this.shake + 0.3);
      this.puff(at, m.flash, 1.5, 0.14, [0, 0, 0]);
      this.burst(at, m.smoke, 5, 0.6, 2.5);
      this.burst(at, m.blast, 4, 0.25, 5);
    }
    if (event.type === "bang") {
      this.shake = Math.min(1.2, this.shake + 0.4);
      this.puff({ x: event.at.x, y: event.at.y + 0.4, z: event.at.z }, m.flash, 3.4, 0.24, [0, 1, 0]);
      this.burst(event.at, m.blast, 8, 0.8, 7);
      this.burst(event.at, m.dust, 8, 1.2, 5);
      this.pulse({ x: event.at.x, y: event.at.y - 0.9, z: event.at.z }, m.flash, 1.5, 9, 0.45);
    }
    const def = game.course.tower;
    if (event.type === "letGo" && def) {
      // The rope whips free: a line of dust from the quay up to the tower's head.
      if (this.tower) {
        const top = this.tower.getWorldTransform().transformPoint(new pc.Vec3((def.x1 - def.x0) / 2, def.height, 0));
        for (let k = 0; k <= 6; k += 1) {
          this.puff({ x: event.at.x + (top.x - event.at.x) * (k / 6), y: event.at.y + (top.y - event.at.y) * (k / 6), z: event.at.z + (top.z - event.at.z) * (k / 6) }, m.rope, 0.5, 0.5, [1.5, 1, 0]);
        }
      }
      this.burst({ x: (def.x0 + def.x1) / 2, y: event.at.y - 1, z: -def.d - 1.5 }, m.dust, 10, 1.1, 4);
    }
    if (event.type === "bellLoose") {
      this.burst(event.at, m.dust, 12, 1.4, 6);
      this.burst(event.at, m.vermilion, 8, 0.5, 7);
    }
    if (event.type === "slam" && def) {
      this.shake = 1.5;
      for (let k = 0; k <= 4; k += 1) {
        const d = def.d + (def.height * k) / 4;
        const y = heightAt(game.course, def.d - 0.01) - ((d - def.d) * (heightAt(game.course, def.d - 0.01) - event.at.y)) / def.height;
        for (const x of [def.x0, def.x1]) this.burst({ x, y, z: -d }, m.dust, 5, 1.8, 5);
      }
      this.burst(event.at, m.dust, 14, 2.2, 8);
      this.pulse(event.at, m.dust, 2, 16, 0.6);
    }
    if (event.type === "toll") {
      this.shake = Math.min(1.5, this.shake + 0.5);
      this.burst(event.at, m.dust, 10, 1.3, 6);
      this.burst(event.at, m.gold, 8, 0.35, 8);
      this.pulse({ x: event.at.x, y: event.at.y - 0.9, z: event.at.z }, m.aim, 1.5, 12, 0.6);
    }
    if (event.type === "bowled") {
      this.shake = Math.min(1.2, this.shake + 0.2);
      this.burst({ x: event.at.x, y: event.at.y + 0.8, z: event.at.z }, m.dust, 7, 0.8, 5);
      this.burst({ x: event.at.x, y: event.at.y + 1.2, z: event.at.z }, event.by === "wain" ? m.yolk : m.gold, 5, 0.3, 7);
      if (event.by === "bell") this.pulse(event.at, m.aim, 1, 6, 0.4);
    }
    if (event.type === "panic") {
      const look = this.mob.get(event.id);
      if (look) this.burst({ x: look.x, y: game.mob.find((one) => one.def.id === event.id)?.pos.y ?? 0, z: look.root.getPosition().z }, m.dust, 3, 0.5, 3);
    }
    if (event.type === "throw") {
      const look = this.mob.get(event.id);
      if (look) look.throwing = 1;
    }
    if (event.type === "pan") {
      if (event.hit) {
        this.burst({ x: cart.x, y: cart.y + 1.2, z: cart.z }, m.iron, 4, 0.25, 6);
        this.puff({ x: cart.x, y: cart.y + 1.4, z: cart.z }, m.flash, 1.2, 0.14, [0, 0, 0]);
      } else {
        this.burst({ x: event.at.x, y: event.at.y - 0.8, z: event.at.z }, m.dust, 3, 0.4, 3);
      }
    }
    if (event.type === "splat") {
      // Yolk everywhere, and a fried egg left where it landed.
      this.burst(event.at, m.yolk, 9, 0.34, 5);
      this.burst(event.at, m.albumen, 6, 0.26, 6);
      this.puff(event.at, m.yolk, 1.5, 0.16, [0, 0.5, 0]);
      this.splatter(event.at, game.course);
      if (event.hit === "pan") {
        this.puff(event.at, m.flash, 1.1, 0.12, [0, 0, 0]);
        this.burst(event.at, m.iron, 5, 0.22, 6);
      }
    }
    if (event.type === "fuse") this.burst(event.at, m.spark, 5, 0.2, 4);
    if (event.type === "boom") {
      const size = event.big ? 2.4 : 1;
      this.shake = Math.min(1.6, this.shake + (event.big ? 1.3 : 0.5));
      this.puff(event.at, m.flash, 4.5 * size, 0.2, [0, 1, 0]);
      this.burst(event.at, m.blast, Math.round(9 * size), 1 * size, 8 * size);
      this.burst(event.at, m.spark, 8, 0.3, 12 * size);
      this.burst({ x: event.at.x, y: event.at.y + 1, z: event.at.z }, m.smoke, Math.round(7 * size), 1.6 * size, 3 * size);
      this.puff({ x: event.at.x, y: event.at.y + 1.5, z: event.at.z }, m.smoke, 3.5 * size, 1.1, [0, 4, 0]);
      this.pulse({ x: event.at.x, y: heightAt(game.course, -event.at.z), z: event.at.z }, m.blast, 1.5, event.big ? 22 : 10, event.big ? 0.7 : 0.45);
    }
    if (event.type === "stoneLoose") {
      this.shake = Math.max(this.shake, 0.5);
      this.burst({ x: event.at.x, y: event.at.y + STONE_RADIUS + 1.2, z: event.at.z }, m.dust, 6, 0.6, 4);
    }
    if (event.type === "thud") {
      this.shake = Math.max(this.shake, 1.3);
      const at = { x: event.at.x, y: event.at.y - STONE_RADIUS + 0.2, z: event.at.z };
      this.burst(at, m.dust, 12, 1.4, 7);
      this.burst(at, m.stone, 8, 0.4, 9);
      this.pulse(at, m.dust, 1.5, 9, 0.5);
    }
    if (event.type === "plunge") {
      const at = { x: event.at.x, y: this.waterY + 0.3, z: event.at.z };
      this.shake = Math.max(this.shake, 0.9);
      this.burst(at, m.albumen, 16, 1.2, 14);
      this.burst(at, m.water, 12, 1, 10);
      this.puff({ x: at.x, y: at.y + 2, z: at.z }, m.albumen, 5, 0.6, [0, 14, 0]);
      this.puff({ x: at.x, y: at.y + 1, z: at.z }, m.water, 6, 0.9, [0, 6, 0]);
      this.pulse(at, m.albumen, 2, 16, 0.9);
    }
    if (event.type === "air" && game.course.straw && game.distance >= game.course.straw.d0 && game.distance <= game.course.straw.d1 + 4) {
      // Down in the straw, and most of it goes up.
      const cart = game.position;
      this.burst({ x: cart.x, y: cart.y, z: cart.z }, m.hay, 22, 0.5, 9);
      this.burst({ x: cart.x, y: cart.y + 0.4, z: cart.z - 1 }, m.hay, 12, 0.9, 5);
      this.shake = Math.max(this.shake, 0.6);
    }
    if (event.type === "breach") {
      this.shake = 1.6;
      for (let k = -2; k <= 2; k += 1) this.burst({ x: k * 2.2, y: event.at.y, z: event.at.z }, m.dust, 6, 1.8, 7);
      this.burst(event.at, m.oak, 12, 0.6, 10);
    }
    if (event.type === "pickup") {
      this.burst({ x: event.at.x, y: event.at.y + 0.6, z: event.at.z }, event.kind === "eggs" ? m.egg : m.iron, 8, 0.3, 5);
      this.burst({ x: event.at.x, y: event.at.y + 0.6, z: event.at.z }, m.gold, 8, 0.22, 7);
      this.pulse({ x: event.at.x, y: event.at.y - 0.4, z: event.at.z }, m.aim, 1, 6, 0.4);
    }
    if (event.type === "through") {
      const cart = game.position;
      for (const side of [-1, 1]) this.burst({ x: side * 3, y: cart.y + 5, z: cart.z }, side < 0 ? m.gold : m.hen, 10, 0.4, 5);
    }
    if (event.type === "smash") {
      this.shake = Math.min(1.2, this.shake + 0.15);
      this.puff(event.at, m.flash, 1.4, 0.12, [0, 0, 0]);
      if (event.kind === "pot") {
        this.burst(event.at, m.vermilion, 6, 0.3, 4);
        this.burst(event.at, m.grassDark, 5, 0.3, 3);
        this.burst({ x: event.at.x, y: event.at.y - 3, z: event.at.z }, m.dust, 5, 0.6, 3);
      } else if (event.kind === "barrel") {
        this.burst(event.at, m.oak, 8, 0.4, 6);
        this.burst(event.at, m.vermilion, 10, 0.5, 5);
        this.pulse({ x: event.at.x, y: event.at.y - 0.6, z: event.at.z }, m.vermilion, 0.8, 7, 0.5);
      } else if (event.kind === "coop") {
        this.burst(event.at, m.hen, 14, 0.3, 6);
        this.burst(event.at, m.oak, 5, 0.3, 4);
      } else {
        this.burst(event.at, m.gold, 10, 0.3, 6);
      }
    }
    if (event.type === "wainOff") this.burst({ x: event.at.x, y: event.at.y - 0.4, z: event.at.z - 1.4 }, m.gold, 7, 0.35, 6);
    if (event.type === "wainCrash") {
      this.shake = Math.min(1.4, this.shake + 0.6);
      this.burst(event.at, m.yolk, 12, 0.7, 8);
      this.burst(event.at, m.oak, 8, 0.5, 6);
      this.burst(event.at, m.spray, 8, 0.8, 5);
      this.pulse({ x: event.at.x, y: event.at.y - 0.6, z: event.at.z }, m.dust, 1.5, 10, 0.5);
    }
    if (event.type === "finish" && game.course.roost !== null) {
      const roost = { x: 0, y: heightAt(game.course, game.course.roost) + 6, z: -game.course.roost };
      for (let index = 0; index < 4; index += 1) this.burst({ x: roost.x + (index - 1.5) * 2.5, y: roost.y, z: roost.z + 2 }, index % 2 ? m.gold : m.hen, 9, 0.45, 5);
    }
  }
}

/** A point in the cart's own frame, turned to the world's. */
function rotate3(q: { x: number; y: number; z: number; w: number }, x: number, y: number, z: number): { x: number; y: number; z: number } {
  const out = new pc.Quat(q.x, q.y, q.z, q.w).transformVector(new pc.Vec3(x, y, z));
  return { x: out.x, y: out.y, z: out.z };
}

function clampDeg(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}
