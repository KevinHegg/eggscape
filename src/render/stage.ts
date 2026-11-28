import * as pc from "playcanvas";
import {
  BALE_H,
  BALE_W, CAT_LEAP, CAT_STIR,
  DOOR_SLOT,
  DOOR_WALL,
  EGG,
  LIFT_TILT,
  PORTS,
  SHUTTER,
  eggOutline,
  type BarrelDef,
  type Block,
  type DoorDef,
  type Game,
  type GameEvent,
  type LevelDef,
  type LiftDef,
  type Port,
  type TankDef,
  type WheelDef,
} from "../sim/kitchen";

/**
 * The kitchen as it is seen: a doll's house with its front off. Everything in the simulation
 * lies in the plane z = 0; the view gives it depth, a back wall and a camera a little above.
 * It reads the game and never writes it.
 */

type Triple = readonly [number, number, number];
type Shape = "box" | "sphere" | "cylinder" | "cone" | "capsule";

/** How deep the kitchen is, front to back, and where its back wall stands. */
const DEPTH = 2.2;
const BACK = -1.25;
/** Metres of kitchen across the screen, and from top to bottom when the screen is wide. */
const SHOW_W = 9.3;
const SHOW_H = 19.5;
const FOV = 24;
const RAD = 180 / Math.PI;
/** How far back on her floor the cat keeps, so that he goes by in front of her. */
const CAT_Z = -0.66;
/** The top of the first room: the others are written as if they stood there. */
const LARDER_TOP = 31;

/** The blocks of a room that lie under a place, from above: the top face of the first one, there. */
function under(level: LevelDef, x: number): { y: number; turn: number } | null {
  let best: { y: number; turn: number } | null = null;
  for (const block of level.blocks) {
    if (block.look === "wall" || Math.abs(x - block.x) > (block.w / 2) * Math.cos(block.turn)) continue;
    const y = block.y + (x - block.x) * Math.tan(block.turn) + block.h / 2 / Math.cos(block.turn);
    if (!best || y > best.y) best = { y, turn: block.turn };
  }
  return best;
}

/** Where something let fall here comes down: the height of it, unless that is a pan. */
function landing(level: LevelDef, x: number): number | null {
  const floor = under(level, x);
  if (!floor || level.pits.some((pit) => Math.abs(x - pit.x) < pit.w / 2 && pit.pan > floor.y)) return null;
  return floor.y;
}

function slope(level: LevelDef, x: number): number {
  return under(level, x)?.turn ?? 0;
}
/** The brake's shoe and rod stand this far back; and every shelf in the house falls this much in one across. */
const SHOE_Z = -0.62;
const SHELF_FALL = 0.36;

/** An illuminated manuscript's paint box: vellum, lapis, vermilion, verdigris and gold leaf. */
const INK = {
  vellum: new pc.Color(0.93, 0.87, 0.72),
  plaster: new pc.Color(0.9, 0.84, 0.7),
  plasterWarm: new pc.Color(0.86, 0.75, 0.58),
  lapis: new pc.Color(0.14, 0.26, 0.6),
  vermilion: new pc.Color(0.82, 0.2, 0.12),
  verdigris: new pc.Color(0.22, 0.5, 0.42),
  gold: new pc.Color(0.93, 0.68, 0.14),
  copper: new pc.Color(0.78, 0.45, 0.22),
  ink: new pc.Color(0.11, 0.08, 0.07),
  oak: new pc.Color(0.52, 0.33, 0.16),
  oakDark: new pc.Color(0.33, 0.2, 0.1),
  iron: new pc.Color(0.2, 0.2, 0.22),
  stone: new pc.Color(0.62, 0.6, 0.56),
  stoneDark: new pc.Color(0.46, 0.45, 0.44),
  egg: new pc.Color(0.98, 0.94, 0.83),
  yolk: new pc.Color(1, 0.72, 0.1),
  hay: new pc.Color(0.92, 0.76, 0.32),
  hayDark: new pc.Color(0.78, 0.6, 0.22),
  hen: new pc.Color(0.99, 0.97, 0.92),
  skin: new pc.Color(0.86, 0.66, 0.5),
  canvas: new pc.Color(0.9, 0.86, 0.76),
  fire: new pc.Color(1, 0.5, 0.1),
  water: new pc.Color(0.26, 0.52, 0.9),
};

/** The Queen's hook: how far up it waits, how far in front of the house it hangs, and how it takes him away. */
const HOOK = { up: 13, front: 1.55, grip: 0.4, lift: 18 };
type Side = Exclude<Port, "top">;

/** The drop from a roost to the hatch below it: a wriggle, the fall, and a moment to land. */
const ARRIVE = { wait: 0.4, fall: 0.95, land: 0.25 };

interface Puff {
  entity: pc.Entity;
  life: number;
  total: number;
  velocity: pc.Vec3;
  size: number;
}

export class Stage {
  readonly app: pc.Application;
  private readonly canvas: HTMLCanvasElement;
  private readonly materials = new Map<string, pc.StandardMaterial>();
  private readonly camera: pc.Entity;
  private scene: pc.Entity;
  private readonly scenery: number;
  private eggMesh: pc.Mesh | null = null;
  private ringMesh: pc.Mesh | null = null;

  private level: LevelDef | null = null;
  private king: pc.Entity | null = null;
  private cracks: pc.Entity[] = [];
  private arms: pc.Entity[] = [];
  private readonly bales = new Map<number, pc.Entity>();
  private readonly flying = new Map<number, { bale: pc.Entity; ring: pc.Entity }>();
  private planks: pc.Entity[] = [];
  private ghost: pc.Entity | null = null;
  private sockets: Array<{ entity: pc.Entity; x: number; y: number }> = [];
  /** Every hen in the house; `here` is the one this room ends at. */
  private hens: Array<{ head: pc.Entity; wings: pc.Entity[]; here: boolean }> = [];
  private chicks: Array<{ entity: pc.Entity; base: number; here: boolean }> = [];
  private cooks: Array<{ root: pc.Entity; arms: pc.Entity[] }> = [];
  /** The trapdoor he comes in by, and how far open it is (0 shut, 1 open). */
  private flaps: Array<{ entity: pc.Entity; side: number }> = [];
  private hatch = 0;
  private hatchOpen = false;
  /** He is on his way down from the roost above: where from, and for how long. */
  private arrival: { from: { x: number; y: number; turn: number }; t: number; gone: boolean } | null = null;
  /** Where the camera has been told to look while a card is up, and a request to work that out. */
  private held: number | null = null;
  private holdAsk: { lowest: number; cover: number; highest: number | null } | null = null;
  /** The water wheels of the room being played, and how far open each sluice is drawn. */
  private mills: Array<{ def: WheelDef; wheel: pc.Entity; lever: pc.Entity; gate: pc.Entity; gateY: number; stream: pc.Entity; reach: number; fall: pc.Entity; k: number; drip: number }> = [];
  /** The revolving doors of the room being played: the leaves, and each shutter with how far open it is drawn. */
  private turns: Array<{
    def: DoorDef;
    rotor: pc.Entity;
    lever: pc.Entity;
    shoe: pc.Entity;
    k: number;
    shutters: Record<Side, { root: pc.Entity; staves: pc.Entity[]; k: number; lit: boolean }>;
    /** The bar across the shutter that is barred, where it hangs, and how far off it has dropped. */
    bar: { root: pc.Entity; x: number; y: number; turn: number; k: number } | null;
  }> = [];
  /** The flaps in the shelves of the room being played, and how far up each is drawn. */
  private valves: Array<{ root: pc.Entity; tilt: number; k: number }> = [];
  /** The cisterns of the room being played: the water in each, and where it comes in and goes out. */
  private vats: Array<{ def: TankDef; lever: pc.Entity; water: pc.Entity; stream: pc.Entity; spout: pc.Entity; weir: pc.Entity; k: number; drip: number }> = [];
  /** The dumbwaiter: its car, its ropes, its doors and gates, and the outlines of where a bale goes. */
  private hoists: Array<{
    def: LiftDef;
    car: pc.Entity;
    rope: pc.Entity;
    pan: pc.Entity;
    panRope: pc.Entity;
    drum: pc.Entity;
    doors: pc.Entity[];
    gates: Array<{ entity: pc.Entity; k: number }>;
    marks: pc.Entity[];
  }> = [];
  /** The barrel, its chock and pan, the treadle's lever, the crates, and what is left of them. */
  /** The mines: each as it stands, and the scorch it leaves. */
  private charges: Array<{ root: pc.Entity; scorch: pc.Entity; spark: pc.Entity }> = [];
  /** The trays of embers: the flames over each, which show while a bale burns there. */
  private fires: Array<{ flames: pc.Entity[]; x: number; y: number }> = [];
  /** The black that creeps up a burning bale. */
  private chars = new Map<number, pc.Entity>();
  private boilers: Array<{ pot: pc.Entity; lid: pc.Entity; x: number; y: number }> = [];
  private jells: Array<{ dome: pc.Entity; straw: pc.Entity }> = [];
  private pasties: Array<{ crust: pc.Entity; crumbs: pc.Entity; x: number; y: number }> = [];
  /** The blackbirds: where they are gathered, and since when they have been on their own. */
  private birds: Array<{ root: pc.Entity; wings: pc.Entity[]; seed: number }> = [];
  private flock = { x: 0, y: 0, loose: -1 };
  /** The boxing gloves: each one's fist, the bars of its lazy-tongs, its key and its lamp. */
  private fists: Array<{ fist: pc.Entity; bars: pc.Entity[]; key: pc.Entity; lamp: pc.Entity; side: number; was: number }> = [];
  /** The egg traps: the bar, the painted hen, and the straw that is under the bar once a bale has set it off. */
  private snares: Array<{ bar: pc.Entity; hen: pc.Entity; straw: pc.Entity }> = [];
  /** What is falling out of the sky, by its number. */
  private pots = new Map<number, pc.Entity>();
  private mousers: Array<{ root: pc.Entity; body: pc.Entity; head: pc.Entity; tail: pc.Entity; legs: pc.Entity[]; lids: pc.Entity[]; straw: pc.Entity; faces: number; was: number }> = [];
  private kegs: Array<{ def: BarrelDef; keg: pc.Entity; chock: pc.Entity; pan: pc.Entity; lever: pc.Entity; crates: pc.Entity; lid: pc.Entity; kick: number; k: number }> = [];
  private flames: pc.Entity[] = [];
  private fried: pc.Entity | null = null;
  private mess: pc.Entity | null = null;
  /** The hook, its three prongs, and how far down it has been let (0 away, 1 on him). */
  private claw: { root: pc.Entity; prongs: pc.Entity[] } | null = null;
  private reach = 0;
  /** Pixels at the top of the screen that the bar of the HUD covers. */
  private coverTop = 0;
  /** How the run ended, as it is being played out on screen. */
  private ending: { kind: "fried" | "broken" | "caught" | "home"; t: number; from: { x: number; y: number; turn: number }; to: { x: number; y: number } } | null = null;

  private puffs: Puff[] = [];
  private pool: pc.Entity[] = [];
  private shake = 0;
  private clock = 0;
  private lookY = 22;
  private snap = true;

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
    this.app.scene.ambientLight = new pc.Color(0.6, 0.56, 0.5);
    this.app.scene.exposure = 1.05;
    this.scenery = this.app.batcher.addGroup("scenery", false, 400).id;

    this.camera = new pc.Entity("camera");
    this.camera.addComponent("camera", { clearColor: new pc.Color(0.2, 0.15, 0.12), nearClip: 1, farClip: 200, fov: FOV });
    this.app.root.addChild(this.camera);

    // The light comes in through the missing wall, from above the audience's left shoulder.
    const key = new pc.Entity("key");
    key.setEulerAngles(52, -22, 0);
    key.addComponent("light", {
      type: "directional",
      color: new pc.Color(1, 0.94, 0.8),
      intensity: 1.45,
      castShadows: true,
      shadowDistance: 90,
      shadowResolution: handheld ? 1024 : 2048,
      shadowBias: 0.3,
      normalOffsetBias: 0.06,
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
    this.snap = true;
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
      plaster: this.paint("plaster", INK.plaster),
      plasterWarm: this.paint("plaster-warm", INK.plasterWarm),
      russet: this.paint("russet", new pc.Color(0.62, 0.36, 0.2), { gloss: 0.2 }),
      oak: this.paint("oak", INK.oak),
      oakDark: this.paint("oak-dark", INK.oakDark),
      iron: this.paint("iron", INK.iron, { gloss: 0.5 }),
      copper: this.paint("copper", INK.copper, { gloss: 0.8, glow: 0.12 }),
      stone: this.paint("stone", INK.stone),
      stoneDark: this.paint("stone-dark", INK.stoneDark),
      egg: this.paint("egg", INK.egg, { gloss: 0.6 }),
      yolk: this.paint("yolk", INK.yolk, { gloss: 0.7, glow: 0.25 }),
      albumen: this.paint("albumen", new pc.Color(0.97, 0.95, 0.88), { gloss: 0.8 }),
      hay: this.paint("hay", INK.hay),
      hayDark: this.paint("hay-dark", INK.hayDark),
      hen: this.paint("hen", INK.hen, { gloss: 0.2 }),
      gold: this.paint("gold", INK.gold, { gloss: 0.8, glow: 0.3 }),
      lapis: this.paint("lapis", INK.lapis),
      vermilion: this.paint("vermilion", INK.vermilion),
      verdigris: this.paint("verdigris", INK.verdigris),
      ink: this.paint("ink", INK.ink),
      skin: this.paint("skin", INK.skin),
      canvas: this.paint("canvas", INK.canvas),
      fire: this.paint("fire", INK.fire, { glow: 1.2 }),
      dust: this.paint("dust", INK.vellum, { glow: 0.2 }),
      aim: this.paint("aim", INK.gold, { glow: 1.1 }),
      ghost: this.paint("ghost", INK.hay, { opacity: 0.45, glow: 0.4 }),
      socket: this.paint("socket", INK.hay, { opacity: 0.2, glow: 0.3 }),
      steam: this.paint("steam", new pc.Color(0.95, 0.95, 0.95), { opacity: 0.5 }),
      vellum: this.paint("vellum", INK.vellum),
      ember: this.paint("ember", new pc.Color(0.7, 0.2, 0.08), { glow: 0.7 }),
      char: this.paint("char", new pc.Color(0.09, 0.07, 0.06)),
      glove: this.paint("glove", new pc.Color(0.8, 0.1, 0.09), { gloss: 0.7, glow: 0.12 }),
      gloveDark: this.paint("glove-dark", new pc.Color(0.5, 0.06, 0.06), { gloss: 0.5 }),
      woodHen: this.paint("wood-hen", new pc.Color(0.93, 0.74, 0.3), { gloss: 0.85, glow: 0.1 }),
      sky: this.paint("sky", new pc.Color(0.6, 0.78, 0.92), { glow: 0.25 }),
      cat: this.paint("cat", new pc.Color(0.2, 0.19, 0.22), { gloss: 0.35 }),
      cloud: this.paint("cloud", new pc.Color(0.98, 0.98, 0.96), { glow: 0.35 }),
      grass: this.paint("grass", new pc.Color(0.42, 0.6, 0.28)),
      crust: this.paint("crust", new pc.Color(0.8, 0.56, 0.26), { gloss: 0.35 }),
      crustDark: this.paint("crust-dark", new pc.Color(0.55, 0.33, 0.14), { gloss: 0.3 }),
      china: this.paint("china", new pc.Color(0.9, 0.9, 0.86), { gloss: 0.8 }),
      jellyRed: this.paint("jelly-red", new pc.Color(0.86, 0.16, 0.24), { gloss: 0.95, glow: 0.35, opacity: 0.86 }),
      jellyGreen: this.paint("jelly-green", new pc.Color(0.38, 0.74, 0.3), { gloss: 0.95, glow: 0.35, opacity: 0.86 }),
      jellyPlum: this.paint("jelly-plum", new pc.Color(0.56, 0.28, 0.78), { gloss: 0.95, glow: 0.35, opacity: 0.86 }),
      water: this.paint("water", INK.water, { gloss: 0.9, glow: 0.45, opacity: 0.88 }),
      pool: this.paint("pool", INK.water, { gloss: 0.9, glow: 0.12, opacity: 0.36 }),
      spray: this.paint("spray", new pc.Color(0.8, 0.9, 1), { glow: 0.5 }),
    };
  }

  private group(name: string, parent: pc.Entity, position: Triple = [0, 0, 0], euler: Triple = [0, 0, 0]): pc.Entity {
    const entity = new pc.Entity(name);
    entity.setLocalPosition(position[0], position[1], position[2]);
    entity.setLocalEulerAngles(euler[0], euler[1], euler[2]);
    parent.addChild(entity);
    return entity;
  }

  /** `fixed` batches it with the still scenery. */
  private shape(type: Shape, parent: pc.Entity, position: Triple, scale: Triple, material: pc.StandardMaterial, euler: Triple = [0, 0, 0], fixed = false): pc.Entity {
    const entity = new pc.Entity(type);
    entity.setLocalPosition(position[0], position[1], position[2]);
    entity.setLocalScale(scale[0], scale[1], scale[2]);
    entity.setLocalEulerAngles(euler[0], euler[1], euler[2]);
    entity.addComponent("render", { type, material, castShadows: true, receiveShadows: true, batchGroupId: fixed ? this.scenery : -1 });
    parent.addChild(entity);
    return entity;
  }

  /** A thin hoop facing the audience, one metre across before scaling. */
  private hoop(parent: pc.Entity, position: Triple, material: pc.StandardMaterial): pc.Entity {
    if (!this.ringMesh) {
      this.ringMesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, new pc.TorusGeometry({ tubeRadius: 0.035, ringRadius: 0.5, segments: 36, sides: 8 }));
      this.ringMesh.incRefCount();
    }
    const entity = new pc.Entity("hoop");
    entity.setLocalPosition(position[0], position[1], position[2]);
    entity.setLocalEulerAngles(90, 0, 0);
    entity.addComponent("render", { meshInstances: [new pc.MeshInstance(this.ringMesh, material)], castShadows: false, receiveShadows: false });
    parent.addChild(entity);
    return entity;
  }

  /** The egg's own shape, turned on a lathe from the same outline the simulation uses. */
  private eggShape(parent: pc.Entity, material: pc.StandardMaterial): pc.Entity {
    if (!this.eggMesh) {
      const outline = eggOutline(18);
      const around = 24;
      const positions: number[] = [];
      const indices: number[] = [];
      for (const { y, r } of outline) {
        for (let step = 0; step < around; step += 1) {
          const lon = (step / around) * Math.PI * 2;
          positions.push(Math.cos(lon) * r, y, Math.sin(lon) * r);
        }
      }
      for (let ring = 0; ring < outline.length - 1; ring += 1) {
        for (let step = 0; step < around; step += 1) {
          const a = ring * around + step;
          const b = (ring + 1) * around + step;
          const c = ring * around + ((step + 1) % around);
          const d = (ring + 1) * around + ((step + 1) % around);
          indices.push(a, b, c, b, d, c);
        }
      }
      const geometry = new pc.Geometry();
      geometry.positions = positions;
      geometry.indices = indices;
      geometry.normals = pc.calculateNormals(positions, indices);
      this.eggMesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, geometry);
      this.eggMesh.incRefCount();
    }
    const entity = new pc.Entity("egg");
    entity.addComponent("render", { meshInstances: [new pc.MeshInstance(this.eggMesh, material)], castShadows: true, receiveShadows: true });
    parent.addChild(entity);
    return entity;
  }

  private person(parent: pc.Entity, position: Triple, coat: pc.StandardMaterial): { root: pc.Entity; arms: pc.Entity[] } {
    const m = this.m;
    const root = this.group("person", parent, position);
    root.setLocalScale(1.7, 1.7, 1.7);
    this.shape("box", root, [0, 0.3, 0], [0.34, 0.52, 0.24], coat);
    this.shape("box", root, [0, 0.26, 0.13], [0.26, 0.4, 0.02], m.canvas);
    this.shape("sphere", root, [0, 0.7, 0], [0.28, 0.28, 0.28], m.skin);
    this.shape("sphere", root, [0, 0.9, 0], [0.3, 0.3, 0.3], m.canvas);
    this.shape("cylinder", root, [0, 0.8, 0], [0.3, 0.08, 0.3], m.canvas);
    const arms = [-1, 1].map((hand) => {
      const arm = this.group("arm", root, [hand * 0.21, 0.5, 0], [0, 0, hand * -150]);
      this.shape("box", arm, [0, 0.2, 0], [0.08, 0.4, 0.08], coat);
      return arm;
    });
    return { root, arms };
  }

  private pan(parent: pc.Entity, position: Triple, size: number): pc.Entity {
    const m = this.m;
    const root = this.group("pan", parent, position);
    this.shape("cylinder", root, [0, 0, 0], [size, 0.1, size], m.iron);
    this.shape("cylinder", root, [0, 0.04, 0], [size * 0.86, 0.06, size * 0.86], m.stoneDark);
    this.shape("box", root, [size * 0.8, 0.02, 0.2], [size * 0.7, 0.07, 0.12], m.iron, [0, -18, 0]);
    return root;
  }

  private baleShape(parent: pc.Entity, material?: pc.StandardMaterial): pc.Entity {
    const m = this.m;
    const root = this.group("bale", parent);
    this.shape("box", root, [0, 0, 0], [BALE_W, BALE_H, 0.9], material ?? m.hay);
    if (!material) {
      for (const side of [-1, 1]) this.shape("box", root, [side * 0.42, 0, 0], [0.07, BALE_H * 1.04, 0.93], m.oakDark);
      this.shape("box", root, [0, BALE_H * 0.5, 0], [BALE_W * 0.96, 0.05, 0.84], m.hayDark);
    }
    return root;
  }

  // ---------------------------------------------------------------- the kitchen

  /**
   * Build the whole house, with `game`'s room as the one being played. With `arrive`, he is
   * shown dropping in from there, and the camera travels down to the room instead of cutting.
   */
  load(game: Game, house: LevelDef[] = [game.level], arrive: { x: number; y: number; turn: number } | null = null): void {
    this.scene.destroy();
    this.scene = new pc.Entity("scene");
    this.app.root.addChild(this.scene);
    this.level = game.level;
    this.bales.clear();
    this.flying.clear();
    this.planks = [];
    this.sockets = [];
    this.cracks = [];
    this.arms = [];
    this.hens = [];
    this.chicks = [];
    this.cooks = [];
    this.flaps = [];
    this.flames = [];
    this.puffs = [];
    this.pool = [];
    this.fried = null;
    this.mess = null;
    this.claw = null;
    this.reach = 0;
    this.turns = [];
    this.ending = null;
    this.shake = 0;
    this.hatch = 0;
    this.hatchOpen = false;
    this.arrival = arrive ? { from: arrive, t: 0, gone: false } : null;
    this.mills = [];
    this.valves = [];
    this.vats = [];
    this.hoists = [];
    this.kegs = [];
    this.charges = [];
    this.fires = [];
    this.chars.clear();
    this.boilers = [];
    this.jells = [];
    this.pasties = [];
    this.birds = [];
    this.flock = { x: 0, y: 0, loose: -1 };
    this.fists = [];
    this.snares = [];
    this.mousers = [];
    this.pots.clear();
    this.holdAsk = null;
    if (!arrive) {
      this.snap = true;
      this.held = null;
    }

    for (const level of house.includes(game.level) ? house : [game.level]) {
      const here = level === game.level;
      this.buildRoom(level);
      for (const block of level.blocks) this.buildBlock(block);
      this.buildSeesaws(level, here);
      this.buildWheels(level, here);
      this.buildDoors(level, here);
      this.buildFlaps(level, here);
      this.buildTanks(level, here);
      this.buildLifts(level, here);
      this.buildBarrels(level, here);
      this.buildMines(level, here);
      this.buildHearths(level, here);
      this.buildKettles(level, here);
      this.buildJellies(level, here);
      this.buildPies(level, here);
      this.buildGloves(level, here);
      this.buildTraps(level, here);
      this.buildCats(level, here);
      this.buildCages(level);
      this.buildPans(level);
      this.buildNest(level, here);
      if (level.hatch) this.buildHatch(level, here);
    }
    this.buildKing();
    this.buildClaw();

    const m = this.m;
    this.ghost = this.baleShape(this.scene, m.ghost);
    this.ghost.enabled = false;
    for (const socket of game.level.sockets) {
      if (!socket.seat) continue;
      if (game.level.jellies.some((jelly) => Math.hypot(jelly.x - socket.x, jelly.y - socket.seat!.y) < 0.8)) continue;
      if (game.level.gloves.some((glove) => Math.abs(glove.y - socket.seat!.y) < 0.1 && Math.abs(glove.x - socket.x) < 1.2)) continue;
      const entity = this.baleShape(this.scene, m.socket);
      entity.setLocalPosition(socket.x, socket.seat.y, 0);
      entity.setLocalEulerAngles(0, 0, socket.seat.turn * RAD);
      this.sockets.push({ entity, x: socket.x, y: socket.seat.y });
    }
    this.sync(game, 0);
  }

  private buildRoom(level: LevelDef): void {
    const m = this.m;
    const midX = (level.left + level.right) / 2;
    const midY = (level.top + level.bottom) / 2;
    const wide = level.right - level.left;
    const tall = level.top - level.bottom;
    if (level.skies.length > 0) {
      // Out of doors: sky, a few clouds, a garden wall with grass at the foot of it, and no ceiling
      // but a porch over the hatch. What comes down comes from the kitchen above.
      this.shape("box", this.scene, [midX, midY, BACK - 0.2], [wide + 2, tall + 2, 0.4], m.sky, [0, 0, 0], true);
      for (const [x, y, size] of [[-2.2, 27.6, 1.5], [1.2, 23.2, 1.1], [-0.6, 19.4, 1.3]] as const) {
        const at = y - (LARDER_TOP - level.top);
        this.shape("sphere", this.scene, [x, at, BACK + 0.02], [size * 1.6, size * 0.5, 0.08], m.cloud, [0, 0, 0], true);
        this.shape("sphere", this.scene, [x + size * 0.5, at + size * 0.2, BACK + 0.03], [size, size * 0.5, 0.08], m.cloud, [0, 0, 0], true);
        this.shape("sphere", this.scene, [x - size * 0.5, at + size * 0.12, BACK + 0.03], [size * 0.8, size * 0.4, 0.08], m.cloud, [0, 0, 0], true);
      }
      this.shape("box", this.scene, [midX, level.bottom + 2.9, BACK + 0.02], [wide, 3.6, 0.06], m.stone, [0, 0, 0], true);
      this.shape("box", this.scene, [midX, level.bottom + 4.75, BACK + 0.04], [wide, 0.16, 0.12], m.stoneDark, [0, 0, 0], true);
      for (let row = 0; row < 4; row += 1) {
        for (let x = level.left + 0.5 + (row % 2) * 0.5; x < level.right; x += 1) this.shape("box", this.scene, [x, level.bottom + 1.5 + row * 0.8, BACK + 0.06], [0.04, 0.7, 0.02], m.stoneDark, [0, 0, 0], true);
      }
      this.shape("box", this.scene, [midX, level.bottom + 1.25, BACK + 0.1], [wide, 0.3, 0.1], m.grass, [0, 0, 0], true);
      this.shape("box", this.scene, [level.start.x, level.top + 0.2, 0], [2.2, 0.5, DEPTH + 0.6], m.oakDark, [0, 0, 0], true);
      // The rack's pegs stand on iron posts at the back of their shelf.
      for (const block of level.blocks) {
        if (block.look !== "iron" || block.w > 0.3 || block.h > 0.2) continue;
        this.shape("box", this.scene, [block.x, block.y - 0.8, BACK + 0.42], [0.09, 1.6, 0.09], m.iron, [0, 0, 0], true);
        this.shape("sphere", this.scene, [block.x, block.y, 0.78], [0.2, 0.2, 0.12], m.gold, [0, 0, 0], true);
      }
      // A pile of what has come down already, in each place it comes down.
      for (const sky of level.skies) {
        const y = landing(level, sky.x);
        if (y === null) continue;
        const lean = slope(level, sky.x);
        const heap = this.group("heap", this.scene, [sky.x, y, 0], [0, 0, lean * RAD]);
        this.shape("box", heap, [-0.22, 0.03, 0.72], [0.22, 0.05, 0.16], m.china, [0, 25, 0], true);
        this.shape("box", heap, [0.18, 0.03, 0.8], [0.16, 0.05, 0.12], m.iron, [0, -30, 0], true);
        this.shape("box", heap, [0.02, 0.03, -0.8], [0.2, 0.05, 0.14], m.china, [0, 50, 0], true);
        this.shape("cylinder", heap, [0, 0.015, 0], [0.9, 0.02, 0.9], m.stoneDark, [0, 0, 0], true);
      }
      return;
    }
    this.shape("box", this.scene, [midX, midY, BACK - 0.2], [wide + 2, tall + 2, 0.4], m.plaster, [0, 0, 0], true);
    // Timbers across the back wall, and a dado of warmer plaster low down.
    for (let y = level.bottom + 4.2; y < level.top; y += 4.4) this.shape("box", this.scene, [midX, y, BACK + 0.06], [wide, 0.28, 0.12], m.oakDark, [0, 0, 0], true);
    for (const x of [level.left + 2.6, level.right - 2.6]) this.shape("box", this.scene, [x, midY, BACK + 0.05], [0.22, tall, 0.1], m.oakDark, [0, 0, 0], true);
    this.shape("box", this.scene, [midX, level.bottom + 2.6, BACK + 0.02], [wide, 3, 0.04], m.plasterWarm, [0, 0, 0], true);
    this.shape("box", this.scene, [midX, level.top + 0.2, 0], [wide + 1.6, 0.5, DEPTH + 0.6], m.oakDark, [0, 0, 0], true);

    // A rail of copper pans along the top, and a window the daylight does not come from. The
    // scullery is dressed the other way round, to keep them clear of what happens in it.
    const larder = level.key === "larder";
    const flip = larder ? 1 : -1;
    const railY = level.top - 1.1;
    const rail = level.wheels.length === 0 && level.doors.length === 0 && level.tanks.length === 0;
    if (rail) this.shape("box", this.scene, [midX + flip * 1.6, railY, BACK + 0.12], [3.4, 0.08, 0.08], m.iron, [0, 0, 0], true);
    for (let index = 0; rail && index < 5; index += 1) {
      const x = midX + flip * (0.2 + index * 0.7);
      const size = 0.5 - (index % 3) * 0.08;
      this.shape("cylinder", this.scene, [x, railY - 0.2 - size / 2, BACK + 0.16], [size, 0.07, size], m.copper, [90, 0, 0], true);
      this.shape("box", this.scene, [x, railY - 0.1, BACK + 0.16], [0.05, 0.22, 0.05], m.iron, [0, 0, 0], true);
    }
    const window = this.group("window", this.scene, [midX - flip * (wide / 2 - 1.5), level.top - 6.6, BACK + 0.04]);
    this.shape("box", window, [0, 0, 0], [1.5, 2, 0.08], m.oakDark, [0, 0, 0], true);
    this.shape("box", window, [0, 0, 0.03], [1.26, 1.76, 0.06], m.lapis, [0, 0, 0], true);
    this.shape("box", window, [0, 0, 0.06], [0.08, 1.76, 0.05], m.oakDark, [0, 0, 0], true);
    this.shape("box", window, [0, 0, 0.06], [1.26, 0.08, 0.05], m.oakDark, [0, 0, 0], true);
    if (!larder) {
      // A plate rack on the back wall, where there is room for one.
      const rack = this.group("rack", this.scene, [level.left + 1.7, level.bottom + (rail ? 6.9 : 7.6), BACK + 0.2]);
      this.shape("box", rack, [0, 0, 0], [2.4, 0.1, 0.4], m.oakDark, [0, 0, 0], true);
      for (let index = 0; index < 3; index += 1) {
        const x = -0.78 + index * 0.78;
        this.shape("cylinder", rack, [x, 0.4, 0.05], [0.68, 0.05, 0.68], m.canvas, [78, 0, 0], true);
        this.shape("cylinder", rack, [x, 0.4, 0.09], [0.4, 0.05, 0.4], index % 2 ? m.verdigris : m.lapis, [78, 0, 0], true);
      }
      return;
    }
    // Jars along the back of the larder shelf, strings of onions under it.
    for (let index = 0; index < 4; index += 1) {
      const x = level.left + 0.6 + index * 0.55;
      const y = 28.9 - ((x + 4) * 1.5) / 4.2;
      this.shape("cylinder", this.scene, [x, y + 0.26, BACK + 0.5], [0.34, 0.5, 0.34], index % 2 ? m.verdigris : m.canvas, [0, 0, 0], true);
      this.shape("cylinder", this.scene, [x, y + 0.54, BACK + 0.5], [0.26, 0.08, 0.26], m.oak, [0, 0, 0], true);
    }
    for (let index = 0; index < 5; index += 1) this.shape("sphere", this.scene, [level.right - 1 + (index % 2) * 0.12, 26.2 - index * 0.26, BACK + 0.25], [0.26, 0.26, 0.26], index % 2 ? m.gold : m.plasterWarm, [0, 0, 0], true);
  }

  private buildBlock(block: Block): void {
    const m = this.m;
    // A machine draws its own.
    if (block.look === "bare") return;
    const root = this.group(block.look, this.scene, [block.x, block.y, 0], [0, 0, block.turn * RAD]);
    if (block.look === "wall") {
      this.shape("box", root, [0, 0, -0.15], [block.w, block.h, DEPTH + 0.5], m.stoneDark, [0, 0, 0], true);
      return;
    }
    if (block.look === "bed") {
      // A bed of straw: bales laid end to end, bound like the ones he is thrown, with a ragged
      // top of stalks. What is gold and strapped is soft; nothing round, which read as eggs.
      const deep = DEPTH - 0.5;
      this.shape("box", root, [0, 0, -0.05], [block.w, block.h, deep], m.hay, [0, 0, 0], true);
      this.shape("box", root, [0, block.h * 0.5, -0.05], [block.w * 0.98, 0.06, deep - 0.08], m.hayDark, [0, 0, 0], true);
      const lengths = Math.max(1, Math.round(block.w / BALE_W));
      for (let index = 0; index < lengths; index += 1) {
        const mid = -block.w / 2 + ((index + 0.5) * block.w) / lengths;
        for (const side of [-1, 1]) this.shape("box", root, [mid + (side * block.w) / lengths / 4, 0, -0.05], [0.07, block.h * 1.04, deep + 0.03], m.oakDark, [0, 0, 0], true);
        if (index > 0) this.shape("box", root, [mid - block.w / lengths / 2, 0, -0.05], [0.03, block.h * 1.01, deep + 0.01], m.hayDark, [0, 0, 0], true);
      }
      const stalks = Math.max(6, Math.round(block.w / 0.13));
      for (let index = 0; index < stalks; index += 1) {
        const x = -block.w / 2 + ((index + 0.5) * block.w) / stalks;
        const z = deep / 2 - 0.12 - ((index * 7) % 5) * 0.34;
        const tall = 0.16 + ((index * 5) % 4) * 0.05;
        this.shape("box", root, [x, block.h * 0.5 + tall * 0.4, z], [0.035, tall, 0.035], index % 3 ? m.hay : m.hayDark, [((index * 3) % 5) * 12 - 24, 0, ((index * 7) % 9) * 9 - 36], true);
      }
      return;
    }
    if (block.look === "board") {
      this.shape("box", root, [0, 0, -0.1], [block.w, block.h, 1.5], m.oak, [0, 0, 0], true);
      for (const along of [-0.42, 0.42]) this.shape("box", root, [0, along * block.h, -0.1], [block.w + 0.04, 0.1, 1.54], m.iron, [0, 0, 0], true);
      return;
    }
    if (block.look === "nest") {
      this.shape("box", root, [0, 0, -0.1], [block.w, block.h, DEPTH - 0.2], m.hay, [0, 0, 0], true);
      // Loose straw: stalks standing out of it at all angles, along its top or up its face.
      const upright = block.h > block.w;
      const stalks = Math.max(6, Math.round(Math.max(block.w, block.h) / 0.12));
      for (let index = 0; index < stalks; index += 1) {
        const along = (index + 0.5) / stalks - 0.5;
        const z = 0.8 - ((index * 7) % 6) * 0.3;
        const tall = 0.2 + ((index * 5) % 4) * 0.06;
        const lean = ((index * 7) % 9) * 10 - 40;
        const face = block.x > 0 ? -1 : 1;
        this.shape(
          "box",
          root,
          upright ? [face * (block.w / 2 + tall * 0.3), along * block.h, z] : [along * block.w, block.h / 2 + tall * 0.35, z],
          [0.04, tall, 0.04],
          index % 3 ? m.hay : m.hayDark,
          [((index * 3) % 5) * 12 - 24, 0, upright ? face * -90 + lean : lean],
          true,
        );
      }
      return;
    }
    if (block.look === "iron") {
      this.shape("box", root, [0, 0, 0], [block.w, block.h, 1.5], m.iron, [0, 0, 0], true);
      return;
    }
    const face = block.look === "wood" ? m.oak : m.stone;
    const edge = block.look === "wood" ? m.oakDark : m.stoneDark;
    this.shape("box", root, [0, 0, 0], [block.w, block.h, DEPTH], face, [0, 0, 0], true);
    this.shape("box", root, [0, -block.h * 0.3, 0.02], [block.w, block.h * 0.42, DEPTH], edge, [0, 0, 0], true);
    if (block.look === "wood") {
      // Brackets under a shelf.
      for (const along of [-0.3, 0.3]) this.shape("box", root, [along * block.w, -block.h * 0.5 - 0.25, BACK + 0.5], [0.16, 0.5, 0.5], m.oakDark, [0, 0, 0], true);
    }
  }

  private buildSeesaws(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.seesaws) {
      // The trestle stands still; the plank, its cushion and its lip turn.
      for (const z of [-0.7, 0.7]) {
        this.shape("box", this.scene, [def.x - 0.16, def.y - 0.26, z], [0.12, 0.6, 0.12], m.oakDark, [0, 0, -22], true);
        this.shape("box", this.scene, [def.x + 0.16, def.y - 0.26, z], [0.12, 0.6, 0.12], m.oakDark, [0, 0, 22], true);
      }
      this.shape("cylinder", this.scene, [def.x, def.y - 0.02, 0], [0.16, 1.7, 0.16], m.iron, [90, 0, 0], true);
      const plank = this.group("plank", this.scene, [def.x, def.y, 0], [0, 0, -def.side * def.tip * RAD]);
      const whole = def.seat + def.load;
      const mid = (def.side * (def.seat - def.load)) / 2;
      this.shape("box", plank, [mid, 0, 0], [whole, 0.12, 1.5], m.oak);
      // The cushion lies on the seat arm; he sinks a little way into it.
      this.shape("box", plank, [(def.side * def.seat) / 2, 0.07, 0], [def.seat - 0.04, 0.06, 1.3], m.vermilion);
      this.shape("box", plank, [(def.side * def.seat) / 2, 0.1, 0], [def.seat - 0.3, 0.02, 1.1], m.gold);
      // A lip keeps him in a seat that waits for him. One he only crosses has none.
      if (!def.pass) this.shape("box", plank, [def.side * (def.seat - 0.06), 0.3, 0], [0.12, 0.4, 1.3], m.vermilion);
      // The end that wants a bale: painted so it reads as a target.
      const gold = def.pass ? def.load - 0.3 : 0.9;
      this.shape("box", plank, [-def.side * (def.load - 0.1 - gold / 2), 0.065, 0], [gold, 0.02, 1.2], m.gold);
      if (here) this.planks.push(plank);
    }
  }

  /** A water wheel on its axle, the cistern over it, the sluice lever with its pan, and the trough between. */
  private buildWheels(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.wheels) {
      // The axle comes out of the back wall on a stout bracket.
      this.shape("cylinder", this.scene, [def.x, def.y, -0.2], [0.26, DEPTH + 0.2, 0.26], m.iron, [90, 0, 0], true);
      this.shape("box", this.scene, [def.x, def.y - 0.5, BACK + 0.2], [0.5, 1.4, 0.4], m.oakDark, [0, 0, 0], true);
      for (const side of [-1, 1]) this.shape("box", this.scene, [def.x + side * 0.55, def.y - 0.75, BACK + 0.2], [0.2, 1.5, 0.3], m.oakDark, [0, 0, side * 38], true);

      const wheel = this.group("wheel", this.scene, [def.x, def.y, 0]);
      this.shape("cylinder", wheel, [0, 0, 0], [def.drum * 2, 1.36, def.drum * 2], m.oakDark, [90, 0, 0]);
      this.shape("cylinder", wheel, [0, 0, 0.72], [0.5, 0.1, 0.5], m.iron, [90, 0, 0]);
      // A plate across the back of it, so that each pair of paddles reads as a bucket; the
      // front is open, and he is seen sitting in one.
      this.shape("cylinder", wheel, [0, 0, -0.74], [def.r * 2 - 0.16, 0.08, def.r * 2 - 0.16], m.oakDark, [90, 0, 0]);
      this.shape("cylinder", wheel, [0, 0, -0.7], [def.r * 2 - 0.5, 0.04, def.r * 2 - 0.5], m.oak, [90, 0, 0]);
      const rim = this.hoop(wheel, [0, 0, -0.7], m.iron);
      rim.setLocalScale(def.r * 2 - 0.12, 2, def.r * 2 - 0.12);
      const from = def.drum * 0.6;
      for (let index = 0; index < def.paddles; index += 1) {
        const turn = 90 + (index / def.paddles) * 360;
        const blade = this.group("blade", wheel, [0, 0, 0], [0, 0, turn]);
        this.shape("box", blade, [(from + def.r) / 2, 0, 0], [def.r - from, 0.14, 1.5], m.oak);
        this.shape("box", blade, [def.r - 0.06, 0, 0], [0.12, 0.2, 1.56], m.verdigris);
        this.shape("box", blade, [(from + def.r) / 2, 0, 0.76], [def.r - from, 0.16, 0.04], m.oakDark);
      }

      // The cistern, bound with iron and full to the brim.
      const tank = def.tank;
      const tx = (tank.x0 + tank.x1) / 2;
      const ty = (tank.y0 + tank.y1) / 2;
      const tw = tank.x1 - tank.x0;
      const th = tank.y1 - tank.y0;
      this.shape("box", this.scene, [tx, ty, -0.1], [tw, th, 1.7], m.oak, [0, 0, 0], true);
      for (const up of [-0.3, 0.3]) this.shape("box", this.scene, [tx, ty + up * th, -0.1], [tw + 0.04, 0.09, 1.74], m.iron, [0, 0, 0], true);
      this.shape("box", this.scene, [tx, tank.y1 + 0.01, -0.1], [tw - 0.16, 0.04, 1.54], m.water, [0, 0, 0], true);
      // Its sign, for anyone in doubt what is in it.
      this.shape("cylinder", this.scene, [tx, ty, 0.76], [0.62, 0.04, 0.62], m.vellum, [90, 0, 0], true);
      this.shape("sphere", this.scene, [tx, ty - 0.06, 0.79], [0.34, 0.34, 0.06], m.lapis, [0, 0, 0], true);
      this.shape("cone", this.scene, [tx, ty + 0.14, 0.79], [0.26, 0.3, 0.05], m.lapis, [0, 0, 0], true);
      this.shape("box", this.scene, [tank.x0 - 0.02, tank.y0 + 0.28, 0], [0.06, 0.46, 0.7], m.ink, [0, 0, 0], true);
      const gateY = tank.y0 + 0.3;
      const gate = this.shape("box", this.scene, [tank.x0 - 0.07, gateY, 0], [0.08, 0.6, 0.86], m.iron);

      // The trough from the sluice to over the wheel, and the water that runs down it.
      const mouth = { x: tank.x0, y: tank.y0 + 0.14 };
      const run = Math.hypot(mouth.x - def.spout.x, mouth.y - def.spout.y);
      const tilt = Math.atan2(mouth.y - def.spout.y, mouth.x - def.spout.x) * RAD;
      const trough = this.group("trough", this.scene, [def.spout.x, def.spout.y, 0], [0, 0, tilt]);
      this.shape("box", trough, [run / 2, -0.05, 0], [run + 0.1, 0.07, 0.8], m.oak, [0, 0, 0], true);
      // The board on the audience's side is low, so that the water is seen running in it.
      this.shape("box", trough, [run / 2, 0.06, -0.4], [run + 0.1, 0.26, 0.07], m.oakDark, [0, 0, 0], true);
      this.shape("box", trough, [run / 2, -0.02, 0.4], [run + 0.1, 0.1, 0.07], m.oakDark, [0, 0, 0], true);
      for (const along of [0.3, 0.75]) this.shape("box", this.scene, [def.spout.x + (mouth.x - def.spout.x) * along, def.spout.y + (mouth.y - def.spout.y) * along + 0.9, BACK + 0.3], [0.09, 1.9, 0.09], m.iron, [0, 0, 0], true);
      const stream = this.shape("box", trough, [run, 0.07, 0], [0.01, 0.16, 0.7], m.water);
      stream.enabled = false;
      const top = def.y + def.r * 0.8;
      const fall = this.shape("box", this.scene, [def.spout.x - 0.12, (def.spout.y + top) / 2, 0], [0.34, def.spout.y - top + 0.1, 0.7], m.water);
      fall.enabled = false;

      // The sluice lever: a beam on a post, the gold pan on its long end and the gate on its short one.
      const pivot = { x: tank.x0 - 0.42, y: def.pan.y - 0.02 };
      this.shape("box", this.scene, [pivot.x, (pivot.y + mouth.y) / 2, 0.52], [0.1, pivot.y - mouth.y + 0.2, 0.1], m.iron, [0, 0, 0], true);
      const lever = this.group("lever", this.scene, [pivot.x, pivot.y, 0], [0, 0, -7]);
      const long = pivot.x - (def.pan.x - def.pan.w / 2);
      this.shape("box", lever, [(0.36 - long) / 2, -0.07, 0.52], [long + 0.36, 0.09, 0.1], m.oakDark);
      this.shape("box", lever, [def.pan.x - pivot.x, -0.03, 0], [def.pan.w, 0.07, 1.15], m.gold);
      for (const side of [-1, 1]) this.shape("box", lever, [def.pan.x - pivot.x + (side * def.pan.w) / 2, 0.02, 0], [0.06, 0.16, 1.15], m.gold);
      this.shape("box", lever, [0.34, -0.3, 0.52], [0.05, 0.5, 0.05], m.iron);

      if (here) this.mills.push({ def, wheel, lever, gate, gateY, stream, reach: run, fall, k: 0, drip: 0 });
    }
  }

  /** A revolving door: the drum with its shutters, the quilted leaves, and the brake lever with its pan. */
  private buildDoors(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.doors) {
      const ring = def.r + 0.06 + DOOR_WALL / 2;
      this.shape("cylinder", this.scene, [def.x, def.y, BACK + 0.3], [(ring + 0.2) * 2, 0.1, (ring + 0.2) * 2], m.oakDark, [90, 0, 0], true);
      this.shape("cylinder", this.scene, [def.x, def.y, BACK + 0.36], [def.r * 2, 0.06, def.r * 2], m.plasterWarm, [90, 0, 0], true);
      this.shape("cylinder", this.scene, [def.x, def.y, -0.2], [0.22, DEPTH, 0.22], m.iron, [90, 0, 0], true);

      const shutters = {} as Record<Side, { root: pc.Entity; staves: pc.Entity[]; k: number; lit: boolean }>;
      for (const side of ["right", "bottom", "left"] as const) shutters[side] = { root: this.group("shutter", this.scene, [def.x, def.y, 0]), staves: [], k: 0, lit: false };
      const long = ring * Math.tan((3 * Math.PI) / 180) * 2 + 0.03;
      for (let from = -184; from < 176; from += 6) {
        const mid = from + 3;
        if (Math.abs(mid - 90) < DOOR_SLOT) continue;
        const turn = (mid * Math.PI) / 180;
        const side = (["right", "bottom", "left"] as const).find((name) => mid > SHUTTER[name][0] && mid < SHUTTER[name][1]);
        if (side) {
          // A shutter is iron, and slides back into the wall when the door stops against it.
          const stave = this.shape("box", shutters[side].root, [Math.cos(turn) * ring, Math.sin(turn) * ring, 0], [DOOR_WALL * 0.7, long, 1.3], m.iron, [0, 0, mid]);
          shutters[side].staves.push(stave);
        } else {
          // The staves either side of the slot are padded, and look it.
          const padded = Math.abs(mid - 90) < DOOR_SLOT + 13;
          this.shape("box", this.scene, [def.x + Math.cos(turn) * ring, def.y + Math.sin(turn) * ring, 0], [DOOR_WALL + (padded ? 0.06 : 0), long, 1.5], padded ? m.vermilion : Math.round(mid / 6) % 2 ? m.oak : m.oakDark, [0, 0, mid], true);
        }
      }
      // The lips of the slot in the top, in iron, so that it reads as the way in.
      for (const side of [-1, 1]) {
        const turn = ((90 + side * DOOR_SLOT) * Math.PI) / 180;
        this.shape("box", this.scene, [def.x + Math.cos(turn) * ring, def.y + Math.sin(turn) * ring, 0], [DOOR_WALL + 0.08, 0.12, 1.56], m.iron, [0, 0, 90 + side * DOOR_SLOT], true);
      }

      const rotor = this.group("rotor", this.scene, [def.x, def.y, 0]);
      this.shape("cylinder", rotor, [0, 0, 0], [0.6, 1.4, 0.6], m.oakDark, [90, 0, 0]);
      this.shape("cylinder", rotor, [0, 0, 0.72], [0.42, 0.08, 0.42], m.gold, [90, 0, 0]);
      for (let leaf = 0; leaf < 4; leaf += 1) {
        const blade = this.group("leaf", rotor, [0, 0, 0], [0, 0, 45 + leaf * 90]);
        const mid = (0.2 + def.r) / 2;
        this.shape("box", blade, [mid, 0, 0], [def.r - 0.2, 0.14, 1.36], m.vermilion);
        this.shape("box", blade, [def.r - 0.05, 0, 0], [0.1, 0.18, 1.42], m.oakDark);
        // Quilting: a row of gold studs along the edge that faces the audience.
        for (let stud = 0; stud < 4; stud += 1) this.shape("sphere", blade, [0.45 + stud * 0.3, 0, 0.69], [0.09, 0.09, 0.05], m.gold);
      }

      // The brake: a beam on a post, the gold pan on its long end and an iron shoe over the drum on its short one.
      const pivot = { x: def.pan.x - def.pan.w / 2 - 0.35, y: def.pan.y - 0.02 };
      this.shape("box", this.scene, [pivot.x, pivot.y - 0.75, BACK + 0.5], [0.12, 1.5, 0.12], m.iron, [0, 0, 0], true);
      this.shape("box", this.scene, [pivot.x, pivot.y - 0.1, BACK + 0.9], [0.1, 0.1, 0.9], m.iron, [0, 0, 0], true);
      const lever = this.group("lever", this.scene, [pivot.x, pivot.y, 0], [0, 0, 7]);
      const reach = def.pan.x + def.pan.w / 2 - pivot.x;
      this.shape("box", lever, [(reach - 0.6) / 2, -0.07, 0.56], [reach + 0.6, 0.09, 0.1], m.oakDark);
      this.shape("box", lever, [def.pan.x - pivot.x, -0.03, 0], [def.pan.w, 0.07, 1.15], m.gold);
      for (const side of [-1, 1]) this.shape("box", lever, [def.pan.x - pivot.x + (side * def.pan.w) / 2, 0.02, 0], [0.06, 0.16, 1.15], m.gold);
      // The shoe and its rod are at the back, out of the way of the slot he comes in by.
      const shoe = this.shape("box", this.scene, [def.x + ring * 0.62, def.y + ring * 0.86, SHOE_Z], [0.5, 0.2, 0.3], m.iron, [0, 0, -36]);
      const end = { x: pivot.x - 0.56, y: pivot.y - 0.02 };
      const foot = { x: def.x + ring * 0.62, y: def.y + ring * 0.86 + 0.2 };
      this.shape("box", this.scene, [(end.x + foot.x) / 2, (end.y + foot.y) / 2, SHOE_Z], [0.05, Math.hypot(foot.x - end.x, foot.y - end.y), 0.05], m.iron, [0, 0, Math.atan2(end.x - foot.x, foot.y - end.y) * RAD], true);
      this.shape("box", this.scene, [end.x, end.y, (0.56 + SHOE_Z) / 2], [0.06, 0.06, 0.56 - SHOE_Z], m.iron, [0, 0, 0], true);

      let bar: { root: pc.Entity; x: number; y: number; turn: number; k: number } | null = null;
      if (def.bar) {
        // The bar across the shutter that will not open, and the board outside the other one
        // that takes it off: both red, and a rope from one to the other round under the drum.
        const mid = (SHUTTER[def.bar.port][0] + SHUTTER[def.bar.port][1]) / 2;
        const turn = (mid * Math.PI) / 180;
        const out = ring + 0.17;
        const at = { x: def.x + Math.cos(turn) * out, y: def.y + Math.sin(turn) * out };
        const root = this.group("bar", this.scene, [at.x, at.y, 0.6], [0, 0, mid]);
        this.shape("box", root, [0, 0, 0], [0.16, 1.75, 0.5], m.vermilion);
        this.shape("box", root, [0.06, 0, 0.2], [0.14, 0.36, 0.2], m.iron);
        for (const along of [-0.8, 0.8]) this.shape("box", root, [-0.04, along, 0], [0.2, 0.12, 0.56], m.iron);
        const tread = def.bar.tread;
        const rise = (tread.x1 - tread.x0) * SHELF_FALL;
        this.shape("box", this.scene, [(tread.x0 + tread.x1) / 2, tread.y0 + rise / 2 + 0.03, 0], [Math.hypot(tread.x1 - tread.x0, rise), 0.07, 1.3], m.vermilion, [0, 0, -Math.atan(SHELF_FALL) * RAD], true);
        const z = BACK + 0.2;
        const low = def.y - ring - 0.5;
        const from = { x: tread.x0 + 0.15, y: tread.y0 + rise - 0.2 };
        this.shape("box", this.scene, [from.x, (from.y + low) / 2, z], [0.06, from.y - low, 0.06], m.canvas, [0, 0, 0], true);
        this.shape("box", this.scene, [(from.x + at.x) / 2, low, z], [Math.abs(from.x - at.x), 0.06, 0.06], m.canvas, [0, 0, 0], true);
        this.shape("box", this.scene, [at.x, (at.y + low) / 2, z], [0.06, Math.abs(at.y - low), 0.06], m.canvas, [0, 0, 0], true);
        for (const x of [from.x, at.x]) this.shape("cylinder", this.scene, [x, low, z], [0.26, 0.1, 0.26], m.iron, [90, 0, 0], true);
        bar = { root, x: at.x, y: at.y, turn: mid, k: 0 };
      }

      if (here) this.turns.push({ def, rotor, lever, shoe, k: 0, shutters, bar });
    }
  }

  /** A flap in a shelf: a board hinged at its high end, that lifts to let him up through it and drops shut under him. */
  private buildFlaps(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.flaps) {
      const length = Math.hypot(def.x1 - def.x0, def.y1 - def.y0);
      const tilt = Math.atan2(def.y1 - def.y0, def.x1 - def.x0) * RAD;
      const root = this.group("flap", this.scene, [def.x1, def.y1, 0], [0, 0, tilt]);
      this.shape("box", root, [-length / 2, -0.11, 0], [length, 0.16, 1.5], m.oak);
      this.shape("box", root, [-length + 0.08, -0.11, 0], [0.16, 0.2, 1.54], m.gold);
      for (const z of [-0.5, 0.5]) this.shape("box", root, [-0.16, -0.01, z], [0.4, 0.06, 0.18], m.iron);
      if (here) this.valves.push({ root, tilt, k: 0 });
    }
  }

  /** A cistern: the water in it, the tap over it, the sluice lever with its pan, and what runs out. */
  private buildTanks(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.tanks) {
      const side = def.spout.side;
      const face = side > 0 ? def.x1 : def.x0;
      const far = side > 0 ? def.x0 : def.x1;
      const wide = def.x1 - def.x0;
      const middle = (def.x0 + def.x1) / 2;
      // Iron bands across the back of it, so that it reads as one vessel.
      for (const y of [def.floor + 0.5, def.weir - 0.3]) this.shape("box", this.scene, [middle, y, BACK + 0.14], [wide + 0.9, 0.12, 0.08], m.iron, [0, 0, 0], true);
      const water = this.shape("box", this.scene, [middle, def.floor, 0], [wide, 0.01, 1.5], m.pool);
      water.enabled = false;

      // The pipe: along the back wall from the sluice, down, and out over the cistern.
      const z = BACK + 0.26;
      const head = def.pan.y - 0.45;
      const pivot = { x: def.pan.x + def.pan.w / 2 + 0.35, y: def.pan.y - 0.02 };
      this.shape("box", this.scene, [(pivot.x + def.tap.x) / 2, head, z], [Math.abs(def.tap.x - pivot.x) + 0.22, 0.22, 0.22], m.verdigris, [0, 0, 0], true);
      this.shape("box", this.scene, [def.tap.x, (head + def.tap.y) / 2, z], [0.22, head - def.tap.y + 0.22, 0.22], m.verdigris, [0, 0, 0], true);
      this.shape("box", this.scene, [def.tap.x, def.tap.y, z / 2], [0.22, 0.22, Math.abs(z)], m.verdigris, [0, 0, 0], true);
      this.shape("cylinder", this.scene, [def.tap.x, def.tap.y - 0.16, 0], [0.34, 0.2, 0.34], m.verdigris, [0, 0, 0], true);
      for (const y of [head - 0.6, def.tap.y + 0.5]) this.shape("box", this.scene, [def.tap.x, y, z], [0.3, 0.08, 0.3], m.iron, [0, 0, 0], true);
      const stream = this.shape("box", this.scene, [def.tap.x, def.tap.y, 0], [0.26, 0.01, 0.4], m.water);
      stream.enabled = false;

      // The sluice lever: a beam on a post, the gold pan on its long end and the valve on its short one.
      this.shape("box", this.scene, [pivot.x, pivot.y - 0.3, 0.52], [0.1, 0.7, 0.1], m.iron, [0, 0, 0], true);
      this.shape("box", this.scene, [pivot.x, head, (0.52 + z) / 2], [0.1, 0.1, 0.52 - z], m.iron, [0, 0, 0], true);
      const lever = this.group("lever", this.scene, [pivot.x, pivot.y, 0], [0, 0, -7]);
      const long = pivot.x - (def.pan.x - def.pan.w / 2);
      this.shape("box", lever, [(0.36 - long) / 2, -0.07, 0.52], [long + 0.36, 0.09, 0.1], m.oakDark);
      this.shape("box", lever, [def.pan.x - pivot.x, -0.03, 0], [def.pan.w, 0.07, 1.15], m.gold);
      for (const edge of [-1, 1]) this.shape("box", lever, [def.pan.x - pivot.x + (edge * def.pan.w) / 2, 0.02, 0], [0.06, 0.16, 1.15], m.gold);

      // What runs out: through the spout, or over the top of the far wall.
      const spout = this.shape("box", this.scene, [face + side * 0.55, def.spout.lip + 0.06, 0], [1.1, 0.12, 1], m.water);
      const weir = this.shape("box", this.scene, [far - side * 0.4, def.weir + 0.06, 0], [0.9, 0.12, 1], m.water);
      spout.enabled = false;
      weir.enabled = false;
      // The iron lips of the spout's mouth, so that it reads as a way out.
      for (const y of [def.spout.lip, def.spout.top]) this.shape("box", this.scene, [face + side * 0.15, y, 0], [0.4, 0.08, 1.56], m.iron, [0, 0, 0], true);

      // The padded board over the far wall hangs on two rods.
      const board = level.blocks.find((block) => block.soft && block.y - block.h / 2 > def.weir && Math.abs(block.x - far) < 0.4);
      if (board) for (const depth of [-0.5, 0.5]) this.shape("box", this.scene, [board.x, board.y + board.h / 2 + 0.9, depth], [0.06, 1.8, 0.06], m.iron, [0, 0, 0], true);

      if (here) this.vats.push({ def, lever, water, stream, spout, weir, k: 0, drip: 0 });
    }
  }

  /** A dumbwaiter: the shaft, the car on its rope, the windlass over it, and the gold pan it is hung against. */
  private buildLifts(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.lifts) {
      const foot = def.floor - 0.35;
      const wide = def.half * 2;
      const top = def.head + 0.32;
      // The back of the shaft, and its two walls with the ways through them.
      this.shape("box", this.scene, [def.x, (foot + def.head) / 2, BACK + 0.12], [wide + 0.3, def.head - foot, 0.08], m.oakDark, [0, 0, 0], true);
      for (const side of [-1, 1] as const) {
        const gaps = def.openings.filter((opening) => opening.side === side).sort((a, b) => a.y0 - b.y0);
        let from = foot;
        for (const span of [...gaps, { y0: def.head, y1: def.head }]) {
          if (span.y0 > from + 0.02) {
            this.shape("box", this.scene, [def.x + side * (def.half + 0.105), (from + span.y0) / 2, -0.1], [0.15, span.y0 - from, 1.7], m.oak, [0, 0, 0], true);
            // An iron shoe on each end of it, so that a doorway reads as one.
            for (const y of [from, span.y0]) this.shape("box", this.scene, [def.x + side * (def.half + 0.105), y, -0.1], [0.19, 0.08, 1.74], m.iron, [0, 0, 0], true);
          }
          from = span.y1;
        }
      }
      // The head of the shaft: a beam, the windlass, and the rope over to the pulley above the pan.
      this.shape("box", this.scene, [def.x, def.head, -0.1], [wide + 0.5, 0.14, 1.7], m.oakDark, [0, 0, 0], true);
      for (const side of [-1, 1]) this.shape("box", this.scene, [def.x + side * 0.42, top - 0.14, -0.3], [0.1, 0.42, 0.5], m.iron, [0, 0, 0], true);
      const drum = this.group("drum", this.scene, [def.x, top, -0.3]);
      this.shape("cylinder", drum, [0, 0, 0], [0.42, 0.7, 0.42], m.oak, [90, 0, 0]);
      this.shape("box", drum, [0, 0, 0.38], [0.5, 0.07, 0.05], m.iron);
      this.shape("box", drum, [0, 0, 0.38], [0.07, 0.5, 0.05], m.iron);
      const span = def.pan.x - def.x;
      this.shape("box", this.scene, [def.x + span / 2, top + 0.16, -0.3], [Math.abs(span), 0.05, 0.05], m.canvas, [0, 0, 0], true);
      this.shape("cylinder", this.scene, [def.pan.x, top, -0.3], [0.36, 0.12, 0.36], m.iron, [90, 0, 0], true);
      this.shape("box", this.scene, [def.pan.x, top, (BACK - 0.3) / 2], [0.1, 0.1, -0.3 - BACK], m.iron, [0, 0, 0], true);
      const rope = this.shape("box", this.scene, [def.x, top, -0.3], [0.05, 1, 0.05], m.canvas);
      const panRope = this.shape("box", this.scene, [def.pan.x, top, -0.3], [0.05, 1, 0.05], m.canvas);

      // The car: straw on its floor, a gold plate on its roof, and nothing across the front of it.
      const car = this.group("car", this.scene, [def.x, def.floor, 0]);
      this.shape("box", car, [0, def.tall / 2, -0.74], [wide, def.tall, 0.06], m.russet);
      for (const side of [-1, 1]) for (const z of [-0.7, 0.7]) this.shape("box", car, [side * (def.half - 0.05), def.tall / 2, z], [0.08, def.tall, 0.08], m.oakDark);
      const floor = this.group("floor", car, [0, -0.1, 0], [0, 0, -def.side * LIFT_TILT * RAD]);
      this.shape("box", floor, [0, 0, 0], [wide, 0.2, 1.5], m.hay);
      this.shape("box", floor, [0, 0.1, 0], [wide * 0.98, 0.05, 1.42], m.hayDark);
      for (const along of [-0.4, 0.4]) this.shape("box", floor, [along, 0, 0], [0.07, 0.21, 1.53], m.oakDark);
      const roof = this.group("roof", car, [0, def.tall - 0.1, 0], [0, 0, def.side * LIFT_TILT * RAD]);
      this.shape("box", roof, [0, 0, 0], [wide, 0.2, 1.5], m.oak);
      this.shape("box", roof, [0, 0.1, 0], [wide * 0.92, 0.04, 1.15], m.gold);
      this.shape("box", roof, [0, 0.2, -0.3], [0.2, 0.2, 0.2], m.iron);
      // Its padded doors, and the rails of its roof: each is there only while it is shut.
      const doors: pc.Entity[] = [];
      for (const side of [-1, 1]) {
        doors.push(this.shape("box", car, [side * (def.half - 0.04), (def.tall - 0.2) / 2, 0], [0.07, def.tall - 0.2, 1.36], m.hay));
        const rail = this.group("rail", car, [side * (def.half - 0.04), def.tall, 0]);
        for (const z of [-0.6, 0, 0.6]) this.shape("box", rail, [0, 0.3, z], [0.05, 0.6, 0.05], m.iron);
        this.shape("box", rail, [0, 0.58, 0], [0.06, 0.06, 1.3], m.iron);
        doors.push(rail);
      }

      // A gate at a landing: red bars that roll up to the lintel when the car is there.
      const gates = def.gates.map((each) => {
        const entity = this.group("gate", this.scene, [def.x + each.side * (def.half + 0.13), def.floor + each.floor * def.storey + 1.85, 0]);
        for (const z of [-0.6, -0.3, 0, 0.3, 0.6]) this.shape("box", entity, [0, -0.9, z], [0.07, 1.8, 0.07], m.vermilion);
        for (const y of [-0.12, -0.9, -1.7]) this.shape("box", entity, [0, y, 0], [0.09, 0.09, 1.36], m.iron);
        const k = each.floor === 0 ? 1 : 0;
        entity.setLocalScale(1, 1 - 0.88 * k, 1);
        return { entity, k };
      });

      // The pan, on its two chains.
      const pan = this.group("pan", this.scene, [def.pan.x, def.pan.y, 0]);
      this.shape("box", pan, [0, -0.03, 0], [def.pan.w, 0.07, 1.15], m.gold);
      for (const edge of [-1, 1]) {
        this.shape("box", pan, [(edge * def.pan.w) / 2, 0.02, 0], [0.06, 0.16, 1.15], m.gold);
        const lean = Math.atan2(def.pan.w / 2, 1.1);
        this.shape("box", pan, [(edge * def.pan.w) / 4, 0.55, -0.3], [0.04, Math.hypot(def.pan.w / 2, 1.1), 0.04], m.iron, [0, 0, edge * lean * RAD]);
      }
      this.shape("sphere", pan, [0, 1.1, -0.3], [0.14, 0.14, 0.14], m.iron);

      if (!here) {
        rope.setLocalScale(0.05, top - def.floor - def.tall, 0.05);
        rope.setLocalPosition(def.x, (top + def.floor + def.tall) / 2, -0.3);
        panRope.setLocalScale(0.05, top - def.pan.y - 1.1, 0.05);
        panRope.setLocalPosition(def.pan.x, (top + def.pan.y + 1.1) / 2, -0.3);
        doors.forEach((door, index) => (door.enabled = index === 0 || index === 3));
        continue;
      }
      const marks = [this.baleShape(this.scene, m.socket), this.baleShape(this.scene, m.socket)];
      this.hoists.push({ def, car, rope, pan, panRope, drum, doors, gates, marks });
    }
  }

  /** A barrel on its run: the rails over the gap, the treadle and the lever to the bucket, the crates, and the pan that lets it go. */
  private buildBarrels(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.barrels) {
      const fall = (def.rails.y1 - def.rails.y0) / (def.rails.x1 - def.rails.x0);
      const run = (x: number): number => def.rails.y0 + fall * (x - def.rails.x0);
      const turn = Math.atan(fall) * RAD;

      // Two iron rails across the gap, one at the front and one at the back: he goes down between them.
      const length = Math.hypot(def.rails.x1 - def.rails.x0, def.rails.y1 - def.rails.y0);
      for (const z of [-0.64, 0.64]) {
        this.shape("box", this.scene, [(def.rails.x0 + def.rails.x1) / 2, (def.rails.y0 + def.rails.y1) / 2 - 0.05, z], [length + 0.3, 0.1, 0.1], m.iron, [0, 0, turn], true);
      }
      // The bucket under it has iron bands, and stands on the end of a lever.
      const middle = (def.bucket.x0 + def.bucket.x1) / 2;
      for (const y of [def.bucket.y0 + 0.12, def.bucket.y0 + 0.6]) {
        this.shape("box", this.scene, [middle, y, -0.95], [def.bucket.x1 - def.bucket.x0 + 0.34, 0.08, 0.06], m.iron, [0, 0, 0], true);
      }
      // The treadle, on the far side of the gap: a copper plate standing a little proud of the run.
      const tread = (def.tread.x0 + def.tread.x1) / 2;
      this.shape("box", this.scene, [tread, run(tread) + 0.06, 0], [def.tread.x1 - def.tread.x0, 0.07, 1.36], m.copper, [0, 0, turn]);
      const pivot = { x: (tread + middle) / 2, y: (run(tread) - 0.75 + def.bucket.y0 - 0.32) / 2 };
      this.shape("box", this.scene, [pivot.x, pivot.y, (BACK - 0.6) / 2], [0.12, 0.12, -0.6 - BACK], m.iron, [0, 0, 0], true);
      this.shape("box", this.scene, [tread, run(tread) - 0.42, -0.6], [0.07, 0.7, 0.07], m.iron, [0, 0, 0], true);
      const reach = Math.hypot(middle - tread, def.bucket.y0 - 0.32 - (run(tread) - 0.75));
      const slope = Math.atan2(def.bucket.y0 - 0.32 - (run(tread) - 0.75), middle - tread) * RAD;
      const lever = this.group("lever", this.scene, [pivot.x, pivot.y, -0.6]);
      const beam = this.group("beam", lever, [0, 0, 0], [0, 0, slope]);
      this.shape("box", beam, [0, 0, 0], [reach + 0.3, 0.1, 0.1], m.oakDark);
      this.shape("box", beam, [reach / 2, 0.08, 0.6], [1.1, 0.08, 1.2], m.iron, [0, 0, -slope]);

      // The pan that lets it go, with its arm to the post; and under the post, the chock.
      const post = def.x - def.r - 0.1;
      const pan = this.group("pan", this.scene, [def.pan.x, def.pan.y, 0]);
      this.shape("box", pan, [0, -0.03, 0], [def.pan.w, 0.07, 1.15], m.gold);
      for (const edge of [-1, 1]) this.shape("box", pan, [(edge * def.pan.w) / 2, 0.02, 0], [0.06, 0.16, 1.15], m.gold);
      this.shape("box", pan, [(post - def.pan.x) / 2, -0.1, -0.5], [def.pan.x - post, 0.09, 0.1], m.oakDark);
      const foot = run(post) + 0.02;
      this.shape("box", this.scene, [post, (def.pan.y + foot + 0.5) / 2, -0.5], [0.07, def.pan.y - foot - 0.5, 0.07], m.iron, [0, 0, 0], true);
      const chock = this.group("chock", this.scene, [post + 0.02, foot + 0.2, 0]);
      this.shape("box", chock, [0, 0, 0], [0.34, 0.34, 1.1], m.vermilion, [0, 0, 45]);
      this.shape("box", chock, [0, 0.3, -0.5], [0.07, 0.5, 0.07], m.iron);

      // The barrel: its head has a cross on it and a red bung, so that it is seen to turn.
      const keg = this.group("barrel", this.scene, [def.x, def.y, 0]);
      this.shape("cylinder", keg, [0, 0, 0], [def.r * 2, 1.36, def.r * 2], m.oak, [90, 0, 0]);
      for (const z of [-0.5, 0.5]) this.shape("cylinder", keg, [0, 0, z], [def.r * 2.05, 0.1, def.r * 2.05], m.iron, [90, 0, 0]);
      this.shape("cylinder", keg, [0, 0, 0.68], [def.r * 1.84, 0.03, def.r * 1.84], m.russet, [90, 0, 0]);
      this.shape("box", keg, [0, 0, 0.71], [def.r * 1.8, 0.09, 0.02], m.oakDark);
      this.shape("box", keg, [0, 0, 0.71], [0.09, def.r * 1.8, 0.02], m.oakDark);
      this.shape("sphere", keg, [def.r * 0.45, def.r * 0.45, 0.72], [0.22, 0.22, 0.08], m.vermilion);

      // The crates across the floor below, and the boards of them that end up over the pit.
      const crate = (def.crates.y1 - def.crates.y0) / 3;
      const wide = def.crates.x1 - def.crates.x0;
      const crates = this.group("crates", this.scene, [(def.crates.x0 + def.crates.x1) / 2, def.crates.y0, 0]);
      for (let index = 0; index < 3; index += 1) {
        const y = (index + 0.5) * crate;
        const skew = (index - 1) * 5;
        this.shape("box", crates, [0, y, 0], [wide, crate - 0.04, 1.3], m.oak, [0, skew, 0]);
        for (const edge of [-0.4, 0.4]) this.shape("box", crates, [0, y + edge * crate, 0], [wide + 0.04, 0.07, 1.34], m.oakDark, [0, skew, 0]);
        this.shape("box", crates, [0, y, 0.66], [wide * 0.5, 0.07, 0.03], m.iron, [0, skew, 35]);
      }
      const lid = this.group("lid", this.scene, [def.pit.x, def.pit.y + 0.03, 0]);
      [-0.5, -0.02, 0.46].forEach((z, index) => this.shape("box", lid, [(index - 1) * 0.05, 0, z], [def.pit.w + 0.24, 0.08, 0.42], index === 1 ? m.oakDark : m.oak, [0, (index - 1) * 4, 0]));
      lid.enabled = false;

      if (here) this.kegs.push({ def, keg, chock, pan, lever, crates, lid, kick: 0, k: 0 });
    }
    // A feather bed: a quilt over the straw, buttoned down.
    for (const mat of level.mats) {
      const length = Math.hypot(mat.x1 - mat.x0, mat.y1 - mat.y0);
      const quilt = this.group("quilt", this.scene, [(mat.x0 + mat.x1) / 2, (mat.y0 + mat.y1) / 2, 0], [0, 0, Math.atan2(mat.y1 - mat.y0, mat.x1 - mat.x0) * RAD]);
      this.shape("box", quilt, [0, 0.04, -0.05], [length, 0.1, 1.5], m.canvas, [0, 0, 0], true);
      const buttons = Math.max(2, Math.round(length / 0.34));
      for (let index = 0; index < buttons; index += 1) {
        const along = -length / 2 + ((index + 0.5) * length) / buttons;
        this.shape("sphere", quilt, [along, 0.08, index % 2 ? 0.45 : 0.1], [0.09, 0.05, 0.09], m.vermilion, [0, 0, 0], true);
        this.shape("box", quilt, [along + length / buttons / 2, 0.07, -0.05], [0.02, 0.07, 1.5], m.plasterWarm, [0, 0, 0], true);
      }
    }
  }

  /**
   * A mine: a red plate let into the shelf, with a gold button in the middle of it for a bale,
   * a lit match-cord, and a pennant so that nobody can say they were not told.
   */
  private buildMines(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.mines) {
      const lean = def.turn * RAD;
      const root = this.group("mine", this.scene, [def.x, def.y, 0], [0, 0, lean]);
      this.shape("box", root, [0, 0, 0], [def.w + 0.16, 0.07, 1.34], m.iron);
      this.shape("box", root, [0, 0.04, 0], [def.w, 0.08, 1.2], m.vermilion);
      for (const along of [-1, 1]) for (const z of [-0.5, 0.5]) this.shape("sphere", root, [(along * def.w) / 2.6, 0.09, z], [0.09, 0.06, 0.09], m.iron);
      this.shape("cylinder", root, [0, 0.1, 0.15], [0.26, 0.08, 0.26], m.gold);
      const spark = this.shape("sphere", root, [0, 0.2, 0.15], [0.12, 0.12, 0.12], m.fire);
      // The pennant stands upright, whatever the shelf does.
      const staff = this.group("staff", root, [def.w / 2 + 0.16, 0, -0.66], [0, 0, -lean]);
      this.shape("box", staff, [0, 0.55, 0], [0.045, 1.1, 0.045], m.iron);
      this.shape("box", staff, [0.2, 0.92, 0], [0.38, 0.28, 0.03], m.vermilion);
      this.shape("sphere", staff, [0.2, 0.92, 0.03], [0.15, 0.19, 0.03], m.egg);
      this.shape("box", staff, [0.2, 0.92, 0.05], [0.03, 0.2, 0.01], m.ink, [0, 0, 25]);
      const scorch = this.group("scorch", this.scene, [def.x, def.y, 0], [0, 0, lean]);
      this.shape("box", scorch, [0, 0.01, 0], [def.w + 0.9, 0.03, 1.4], m.ink);
      for (const [along, z, size] of [[-0.7, 0.4, 0.3], [0.75, -0.3, 0.36], [0.2, 0.62, 0.24]] as const) this.shape("box", scorch, [along, 0.012, z], [size, 0.03, size], m.ink, [0, 40, 0]);
      scorch.enabled = false;
      if (here) this.charges.push({ root, scorch, spark });
    }
  }

  /** A tray of embers: a bed of coals, and flames that only stand up while a bale is burning there. */
  private buildHearths(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.hearths) {
      const root = this.group("hearth", this.scene, [def.x, def.y, 0], [0, 0, def.turn * RAD]);
      this.shape("box", root, [0, 0.04, 0], [def.w - 0.04, 0.1, 1.36], m.ember);
      const coals = Math.round(def.w / 0.2);
      for (let index = 0; index < coals; index += 1) {
        const at = -def.w / 2 + 0.12 + (index / (coals - 1)) * (def.w - 0.24);
        const paint = index % 3 === 0 ? m.fire : index % 3 === 1 ? m.ember : m.char;
        this.shape("sphere", root, [at, 0.1, ((index * 7) % 5) * 0.24 - 0.48], [0.2, 0.13, 0.2], paint);
      }
      const flames = [-0.36, -0.12, 0.12, 0.36].map((along, index) => {
        const flame = this.shape("cone", root, [along * def.w, 0.5, index % 2 ? 0.5 : -0.45], [0.3, 0.8, 0.2], index % 2 ? m.fire : m.gold);
        flame.enabled = false;
        return flame;
      });
      if (here) this.fires.push({ flames, x: def.x, y: def.y });
    }
  }

  /** A copper kettle on an iron fire-box: its lid is a cushion, and the fire-box stands open at the front. */
  private buildKettles(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.kettles) {
      const hearth = level.hearths[def.hearth];
      if (!hearth) continue;
      const far = Math.sign(def.toss.x) || 1;
      // The fire-box: a floor, two sides and a back plate that holds it to the wall.
      this.shape("box", this.scene, [hearth.x, hearth.y - 0.125, 0], [2.16, 0.25, 1.6], m.iron, [0, 0, 0], true);
      for (const side of [-1, 1]) this.shape("box", this.scene, [hearth.x + side * 0.98, hearth.y + 0.375, 0], [0.2, 0.75, 1.6], m.iron, [0, 0, 0], true);
      this.shape("box", this.scene, [hearth.x, hearth.y + 0.3, BACK + 0.3], [2.5, 1.5, 0.12], m.stoneDark, [0, 0, 0], true);
      for (const side of [-1, 1]) this.shape("box", this.scene, [hearth.x + side * 0.6, hearth.y - 0.5, BACK + 0.7], [0.12, 0.7, 0.12], m.iron, [35, 0, 0], true);
      // The kettle rocks as it comes to the boil.
      const pot = this.group("kettle", this.scene, [def.x, hearth.y + 0.75, 0]);
      const tall = def.y - 0.12 - (hearth.y + 0.75);
      this.shape("box", pot, [0, 0.06, 0], [1.74, 0.12, 1.5], m.iron);
      this.shape("sphere", pot, [0, tall * 0.5, 0], [1.72, tall * 1.08, 1.5], m.copper);
      this.shape("cylinder", pot, [0, tall * 0.2, 0], [1.6, 0.08, 1.6], m.gold);
      // The spout, on the side he comes from.
      this.shape("box", pot, [-far * 0.98, tall * 0.62, 0.35], [0.7, 0.2, 0.24], m.copper, [0, 0, far * 38]);
      this.shape("cylinder", pot, [-far * 1.24, tall * 0.83, 0.35], [0.26, 0.1, 0.26], m.gold, [0, 0, far * 38]);
      const lid = this.group("lid", this.scene, [def.x, def.y, 0]);
      this.shape("cylinder", lid, [0, -0.1, 0], [def.w + 0.2, 0.12, 1.45], m.copper);
      this.shape("box", lid, [0, -0.02, 0], [def.w - 0.06, 0.06, 1.2], m.vermilion);
      this.shape("box", lid, [0, 0.01, 0], [def.w - 0.36, 0.02, 1], m.gold);
      this.shape("box", lid, [far * (def.w / 2 - 0.06), 0.2, 0], [0.12, 0.4, 1.3], m.vermilion);
      if (here) this.boilers.push({ pot, lid, x: def.x, y: def.y });
    }
  }

  /** A jelly on a china stand: it shivers when it has thrown something, and sags with a bale in it. */
  private buildJellies(level: LevelDef, here: boolean): void {
    const m = this.m;
    const paints = [m.jellyRed, m.jellyGreen, m.jellyPlum];
    level.jellies.forEach((def, index) => {
      const root = this.group("jelly", this.scene, [def.x, def.y, 0], [0, 0, def.turn * RAD]);
      // The stand: a plate, a stem, and a foot against the wall.
      this.shape("cylinder", root, [0, -0.62, 0], [def.w + 0.24, 0.07, 1.7], m.china, [0, 0, 0], true);
      this.shape("cylinder", root, [0, -0.58, 0], [def.w + 0.3, 0.03, 1.76], m.gold, [0, 0, 0], true);
      this.shape("box", this.scene, [def.x, def.y - 0.9, BACK + 0.55], [0.16, 0.5, 1.1], m.china, [0, 0, 0], true);
      const dome = this.group("dome", root, [0, -0.6, 0]);
      const paint = paints[index % paints.length]!;
      this.shape("box", dome, [0, 0.28, 0], [def.w, 0.56, 1.4], paint);
      this.shape("sphere", dome, [0, 0.52, 0], [def.w * 0.98, 0.42, 1.38], paint);
      for (const along of [-0.34, 0, 0.34]) this.shape("sphere", dome, [along * def.w, 0.64, 0.5], [0.26, 0.2, 0.3], paint);
      const straw = this.baleShape(root);
      straw.setLocalPosition(0, -0.08, 0.05);
      straw.setLocalScale(0.94, 0.8, 1.04);
      straw.enabled = false;
      if (here) this.jells.push({ dome, straw });
    });
  }

  /** A pie in a blue dish on a stand, the gold pan that opens it, and the blackbirds inside. */
  private buildPies(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.pies) {
      const wide = def.w + 0.3;
      this.shape("box", this.scene, [def.x, def.y - def.deep - 0.1, 0], [wide, 0.2, 1.6], m.lapis, [0, 0, 0], true);
      this.shape("box", this.scene, [def.x - def.w / 2 - 0.075, def.y - def.deep / 2 + 0.05, 0], [0.15, def.deep + 0.1, 1.6], m.lapis, [0, 0, 0], true);
      this.shape("box", this.scene, [def.x + def.w / 2 + 0.075, def.y - def.deep / 2 + 0.175, 0], [0.15, def.deep + 0.35, 1.6], m.lapis, [0, 0, 0], true);
      this.shape("box", this.scene, [def.x, def.y - def.deep / 2, 0.82], [wide, def.deep, 0.06], m.lapis, [0, 0, 0], true);
      this.shape("box", this.scene, [def.x, def.y - def.deep * 0.5, 0.86], [wide * 0.9, 0.08, 0.03], m.gold, [0, 0, 0], true);
      const crust = this.group("crust", this.scene, [def.x, def.y, 0]);
      this.shape("box", crust, [0, -0.07, 0], [def.w, 0.14, 1.5], m.crust);
      for (let index = 0; index < 7; index += 1) this.shape("sphere", crust, [-def.w / 2 + 0.1 + index * ((def.w - 0.2) / 6), -0.04, 0.72], [0.24, 0.2, 0.2], m.crustDark);
      for (const along of [-0.3, 0, 0.3]) this.shape("box", crust, [along * def.w, 0.005, 0.1], [0.05, 0.02, 0.5], m.crustDark, [0, 25, 0]);
      const crumbs = this.group("crumbs", this.scene, [def.x, def.y, 0]);
      for (const [x, lean] of [[-0.55, 55], [-0.2, -20], [0.5, -50]] as const) this.shape("box", crumbs, [x * def.w * 0.9, -0.12, 0.3], [0.5, 0.1, 0.6], m.crust, [0, 0, lean]);
      this.shape("box", crumbs, [0, -def.deep + 0.05, 0], [def.w, 0.1, 1.5], m.crustDark);
      crumbs.enabled = false;
      // The gold pan on its bracket, and the cord from it down to the pie.
      const pan = def.pan;
      this.shape("box", this.scene, [pan.x, pan.y - 0.05, 0], [pan.w, 0.1, 1.3], m.gold, [0, 0, 0], true);
      this.shape("box", this.scene, [pan.x, pan.y - 0.35, BACK + 0.6], [0.14, 0.5, 1.2], m.iron, [0, 0, 0], true);
      const from = { x: pan.x - pan.w / 2, y: pan.y - 0.1 };
      const to = { x: def.x + def.w / 2 + 0.1, y: def.y + 0.35 };
      this.shape("box", this.scene, [(from.x + to.x) / 2, (from.y + to.y) / 2, -0.5], [Math.hypot(to.x - from.x, to.y - from.y), 0.04, 0.04], m.ink, [0, 0, Math.atan2(to.y - from.y, to.x - from.x) * RAD], true);
      if (!here) continue;
      this.pasties.push({ crust, crumbs, x: def.x, y: def.y });
      this.flock = { x: def.x, y: def.y, loose: -1 };
      for (let index = 0; index < 12; index += 1) {
        const bird = this.group("blackbird", this.scene, [def.x, def.y, 0]);
        this.shape("sphere", bird, [0, 0, 0], [0.3, 0.2, 0.2], m.ink);
        this.shape("sphere", bird, [0.14, 0.07, 0], [0.16, 0.15, 0.15], m.ink);
        this.shape("cone", bird, [0.26, 0.06, 0], [0.07, 0.14, 0.07], m.gold, [0, 0, -90]);
        this.shape("box", bird, [-0.2, 0.02, 0], [0.18, 0.03, 0.12], m.ink, [0, 0, 12]);
        const wings = [-1, 1].map((side) => {
          const wing = this.group("wing", bird, [0, 0.04, side * 0.08]);
          this.shape("box", wing, [0, 0, side * 0.16], [0.2, 0.03, 0.32], m.ink);
          return wing;
        });
        bird.enabled = false;
        this.birds.push({ root: bird, wings, seed: index });
      }
    }
  }

  /**
   * A boxing glove on lazy-tongs, in a cabinet on the wall: a red lamp on top that is alight
   * when it is wound, and a key in the side that turns while it winds.
   */
  private buildGloves(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.gloves) {
      const side = def.side;
      const wall = def.x - side * 0.35;
      this.shape("box", this.scene, [wall, def.y, 0], [0.7, 1.2, 1.5], m.oakDark, [0, 0, 0], true);
      this.shape("box", this.scene, [def.x - side * 0.02, def.y, 0], [0.08, 1.24, 1.54], m.gold, [0, 0, 0], true);
      this.shape("box", this.scene, [def.x, def.y, 0], [0.06, 0.9, 1.2], m.ink, [0, 0, 0], true);
      this.shape("box", this.scene, [wall, def.y + 0.63, 0], [0.76, 0.08, 1.56], m.oak, [0, 0, 0], true);
      const lamp = this.shape("sphere", this.scene, [wall, def.y + 0.8, 0.45], [0.26, 0.26, 0.26], m.fire);
      const key = this.group("key", this.scene, [wall, def.y - 0.1, 0.78]);
      this.shape("cylinder", key, [0, 0, 0], [0.1, 0.16, 0.1], m.gold, [90, 0, 0]);
      this.shape("box", key, [0, 0, 0.1], [0.46, 0.14, 0.05], m.gold);
      for (const end of [-1, 1]) this.shape("cylinder", key, [end * 0.23, 0, 0.1], [0.2, 0.05, 0.2], m.gold, [90, 0, 0]);
      // The arm: four crossed pairs of bars, which open out as it goes.
      const arm = this.group("arm", this.scene, [def.x, def.y, 0]);
      const bars: pc.Entity[] = [];
      for (let link = 0; link < 8; link += 1) bars.push(this.shape("box", arm, [0, 0, link % 2 ? 0.12 : -0.12], [0.5, 0.06, 0.06], m.iron));
      const fist = this.group("fist", arm);
      this.shape("cylinder", fist, [-side * 0.3, 0, 0], [0.5, 0.2, 0.5], m.canvas, [0, 0, 90]);
      this.shape("sphere", fist, [0, 0, 0], [0.74, 0.7, 0.72], m.glove);
      this.shape("sphere", fist, [side * 0.12, 0.2, 0.3], [0.36, 0.3, 0.3], m.glove);
      this.shape("box", fist, [side * 0.2, -0.02, 0], [0.04, 0.46, 0.5], m.gloveDark, [0, 0, 0]);
      if (here) this.fists.push({ fist, bars, key, lamp, side, was: 1 });
    }
  }

  /**
   * An egg trap: a hen of painted wood on a stick, with a key in her back, sitting in a nest; and
   * behind her a bar on a spring, standing ready to come over.
   */
  private buildTraps(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.traps) {
      const lean = Math.atan2(def.y1 - def.y0, def.x1 - def.x0);
      const long = Math.hypot(def.x1 - def.x0, def.y1 - def.y0);
      const mid = (def.x0 + def.x1) / 2;
      // The hen: flat, bright, and too still.
      const hen = this.group("decoy", this.scene, [mid + 0.25, def.floor, BACK + 0.62]);
      this.shape("box", hen, [0, 0.2, 0], [0.07, 0.4, 0.07], m.oakDark);
      this.shape("sphere", hen, [0, 0.72, 0], [1.3, 0.95, 0.5], m.woodHen);
      this.shape("sphere", hen, [-0.62, 0.86, 0], [0.5, 0.62, 0.36], m.woodHen, [0, 0, 30]);
      this.shape("sphere", hen, [0.52, 1.18, 0], [0.5, 0.52, 0.4], m.woodHen);
      this.shape("cone", hen, [0.82, 1.14, 0], [0.16, 0.26, 0.16], m.gold, [0, 0, -90]);
      this.shape("sphere", hen, [0.56, 1.5, 0], [0.3, 0.2, 0.1], m.vermilion);
      this.shape("sphere", hen, [0.62, 1.24, 0.21], [0.13, 0.13, 0.04], m.vellum);
      this.shape("sphere", hen, [0.64, 1.24, 0.23], [0.06, 0.06, 0.04], m.ink);
      this.shape("sphere", hen, [-0.05, 0.7, 0.24], [0.7, 0.5, 0.08], m.oak);
      const wind = this.group("wind", hen, [-0.2, 1.3, 0]);
      this.shape("box", wind, [0, 0, 0], [0.06, 0.34, 0.06], m.gold);
      this.shape("box", wind, [0, 0.2, 0], [0.34, 0.12, 0.05], m.gold);
      // The bar is hinged on the high rim, with its spring; it lies along the lid's line once it has gone.
      const hinge = this.group("hinge", this.scene, [def.x0, def.y0 + 0.06, 0], [0, 0, lean * RAD]);
      for (const z of [-0.5, 0.5]) this.shape("cylinder", hinge, [0, 0, z], [0.22, 0.3, 0.22], m.gold, [90, 0, 0], true);
      const bar = this.group("bar", hinge);
      for (const z of [-0.66, 0.66]) this.shape("box", bar, [long / 2, 0, z], [long, 0.09, 0.09], m.iron);
      this.shape("box", bar, [long, 0, 0], [0.1, 0.1, 1.4], m.iron);
      this.shape("box", bar, [long * 0.5, 0, 0], [0.07, 0.07, 1.4], m.iron);
      const straw = this.baleShape(this.scene);
      straw.setLocalPosition(mid, (def.y0 + def.y1) / 2 - 0.2, 0);
      straw.setLocalEulerAngles(0, 0, lean * RAD);
      straw.setLocalScale(1.06, 0.5, 1);
      straw.enabled = false;
      if (here) this.snares.push({ bar, hen, straw });
      else bar.setLocalEulerAngles(0, 0, 112);
    }
  }

  /**
   * The kitchen cat: black, with a white bib and gold eyes. She is made facing left, and her
   * feet are where she is. Asleep until the room is the one he is in, and after.
   */
  private buildCats(level: LevelDef, here: boolean): void {
    const m = this.m;
    for (const def of level.cats) {
      const root = this.group("cat", this.scene, [def.x, def.y, CAT_Z]);
      root.setLocalScale(1.18, 1.18, 1.18);
      const body = this.group("body", root);
      this.shape("sphere", body, [0, 0.4, 0], [1.05, 0.5, 0.5], m.cat);
      this.shape("sphere", body, [-0.36, 0.33, 0], [0.34, 0.36, 0.52], m.china);
      const head = this.group("head", body, [-0.56, 0.62, 0]);
      this.shape("sphere", head, [0, 0, 0], [0.48, 0.42, 0.46], m.cat);
      this.shape("sphere", head, [-0.16, -0.08, 0], [0.22, 0.18, 0.3], m.china);
      this.shape("sphere", head, [-0.27, -0.04, 0], [0.07, 0.06, 0.08], m.vermilion);
      const lids: pc.Entity[] = [];
      for (const z of [-0.14, 0.14]) {
        this.shape("cone", head, [0.04, 0.26, z], [0.18, 0.24, 0.12], m.cat, [0, 0, 8]);
        lids.push(this.shape("sphere", head, [-0.17, 0.06, z * 1.05], [0.1, 0.13, 0.12], m.gold));
        this.shape("sphere", head, [-0.2, 0.06, z * 1.05], [0.05, 0.11, 0.1], m.ink);
      }
      const tail = this.group("tail", body, [0.48, 0.44, 0]);
      this.shape("box", tail, [0, 0.3, 0], [0.09, 0.6, 0.09], m.cat);
      this.shape("sphere", tail, [0, 0.62, 0], [0.13, 0.16, 0.13], m.china);
      const legs: pc.Entity[] = [];
      for (const x of [-0.32, 0.3]) {
        for (const z of [-0.13, 0.13]) {
          const leg = this.group("leg", body, [x, 0.3, z]);
          this.shape("box", leg, [0, -0.15, 0], [0.11, 0.32, 0.11], m.cat);
          this.shape("sphere", leg, [-0.02, -0.29, 0], [0.15, 0.08, 0.13], m.china);
          legs.push(leg);
        }
      }
      const straw = this.baleShape(root);
      straw.setLocalScale(0.5, 0.5, 0.6);
      straw.enabled = false;
      const cat = { root, body, head, tail, legs, lids, straw, faces: -1, was: def.x };
      this.poseCat(cat, "asleep", 0, 0);
      if (here) this.mousers.push(cat);
    }
  }

  /** How she holds herself: asleep in a loaf, getting up, sprung, or sitting. `t` is how long she has been at it. */
  private poseCat(cat: (typeof this.mousers)[number], pose: "asleep" | "stir" | "crouch" | "leap" | "run" | "sit", t: number, part: number): void {
    const clock = this.clock;
    let low = 1;
    let tip = 0;
    let headUp = 0;
    let tail = -100;
    let eyes = 1;
    let stride = 0;
    if (pose === "asleep") {
      low = 0.72 + Math.sin(clock * 1.6) * 0.02;
      headUp = -0.22;
      tail = -128;
      eyes = 0.08;
    } else if (pose === "stir") {
      // One eye, then both; up; a long stretch with her tail in the air.
      const up = Math.min(1, t / 0.5);
      const stretch = Math.sin(Math.min(1, Math.max(0, (t - 0.6) / 1)) * Math.PI);
      low = 0.72 + up * 0.28;
      headUp = -0.22 * (1 - up) - stretch * 0.1;
      tip = -stretch * 14;
      tail = -128 + up * 150 + Math.sin(clock * 5) * 10;
      eyes = t < 0.25 ? 0.5 : 1.25;
    } else if (pose === "crouch") {
      // Down in front, up behind, and the wiggle that comes before she goes.
      low = 0.84;
      tip = 13;
      headUp = -0.06;
      tail = 30 + Math.sin(clock * 26) * 18;
      eyes = 1.4;
      cat.body.setLocalPosition(Math.sin(clock * 30) * 0.025, 0, 0);
    } else if (pose === "leap") {
      tip = 24 - part * 52;
      tail = -60;
      eyes = 1.4;
      stride = 62 - part * 40;
    } else if (pose === "run") {
      tail = 20 + Math.sin(clock * 9) * 8;
      stride = Math.sin(clock * 22) * 38;
    } else {
      // Sat up, with her tail going.
      tip = -22;
      headUp = 0.05;
      tail = -70 + Math.sin(clock * 3.2) * 16;
    }
    if (pose !== "crouch") cat.body.setLocalPosition(0, 0, 0);
    cat.body.setLocalScale(pose === "leap" ? 1.16 : 1, low, 1);
    cat.body.setLocalEulerAngles(0, 0, tip);
    cat.head.setLocalPosition(-0.56, 0.62 + headUp, 0);
    cat.head.setLocalEulerAngles(0, 0, -tip * 0.8);
    cat.tail.setLocalEulerAngles(0, 0, tail);
    for (const lid of cat.lids) lid.setLocalScale(0.1, 0.13 * eyes, 0.12);
    cat.legs.forEach((leg, index) => leg.setLocalEulerAngles(0, 0, pose === "leap" ? (index < 2 ? stride : -stride) : (index % 2 ? 1 : -1) * (index < 2 ? stride : -stride)));
  }

  /** One of the Queen's things, on its way down: a saucepan, a flat-iron, a rolling pin, or the kitchen sink. */
  private buildPot(kind: number): pc.Entity {
    const m = this.m;
    const pot = this.group("pot", this.scene);
    if (kind === 0) {
      this.shape("cylinder", pot, [0, 0, 0], [0.7, 0.44, 0.7], m.copper);
      this.shape("cylinder", pot, [0, 0.2, 0], [0.6, 0.06, 0.6], m.ink);
      this.shape("box", pot, [0.62, 0.12, 0], [0.6, 0.08, 0.12], m.iron);
    } else if (kind === 1) {
      this.shape("box", pot, [0, -0.1, 0], [0.8, 0.26, 0.5], m.iron);
      this.shape("cone", pot, [0.5, -0.1, 0], [0.5, 0.36, 0.26], m.iron, [0, 0, -90]);
      this.shape("box", pot, [-0.05, 0.22, 0], [0.5, 0.08, 0.12], m.oak);
      for (const end of [-0.26, 0.2]) this.shape("box", pot, [end, 0.1, 0], [0.07, 0.24, 0.1], m.iron);
    } else if (kind === 2) {
      this.shape("cylinder", pot, [0, 0, 0], [0.34, 0.8, 0.34], m.oak, [0, 0, 90]);
      for (const end of [-1, 1]) this.shape("cylinder", pot, [end * 0.52, 0, 0], [0.14, 0.3, 0.14], m.oakDark, [0, 0, 90]);
    } else {
      this.shape("box", pot, [0, -0.06, 0], [1.05, 0.5, 0.8], m.china);
      this.shape("box", pot, [0, 0.16, 0], [0.86, 0.1, 0.62], m.stoneDark);
      this.shape("box", pot, [-0.36, 0.36, -0.2], [0.08, 0.3, 0.08], m.gold);
      this.shape("box", pot, [-0.26, 0.5, -0.2], [0.26, 0.08, 0.08], m.gold);
    }
    return pot;
  }

  /** A cage: iron bars across the front and the back of it, low enough to see him over. */
  private buildCages(level: LevelDef): void {
    const m = this.m;
    for (const cage of level.cages) {
      const tall = cage.y1 - cage.y0 + 0.75;
      for (let x = cage.x0 + 0.12; x < cage.x1; x += 0.3) {
        for (const z of [0.72, -0.72]) this.shape("box", this.scene, [x, cage.y0 + tall / 2, z], [0.05, tall, 0.05], m.iron, [0, 0, 0], true);
      }
      for (const z of [0.72, -0.72]) this.shape("box", this.scene, [(cage.x0 + cage.x1) / 2, cage.y0 + tall, z], [cage.x1 - cage.x0 + 0.1, 0.07, 0.07], m.iron, [0, 0, 0], true);
      // Its sign: a hook, for anyone in doubt what becomes of an egg in here.
      const sign = this.group("sign", this.scene, [cage.x1 + 0.75, cage.y0 + 0.25, BACK + 0.3]);
      this.shape("box", sign, [0, 0, 0], [0.8, 0.8, 0.08], m.vermilion, [0, 0, 0], true);
      this.shape("box", sign, [0, 0.12, 0.06], [0.07, 0.42, 0.04], m.vellum, [0, 0, 0], true);
      this.shape("box", sign, [-0.1, -0.12, 0.06], [0.26, 0.07, 0.04], m.vellum, [0, 0, 0], true);
      this.shape("box", sign, [-0.2, -0.03, 0.06], [0.07, 0.2, 0.04], m.vellum, [0, 0, 0], true);
    }
  }

  /** The Queen's hook: a rope out of the top of the house, a wooden head, and three prongs with iron tips. */
  private buildClaw(): void {
    const m = this.m;
    const root = this.group("claw", this.scene);
    this.shape("box", root, [0, 30, 0], [0.07, 60, 0.07], m.canvas);
    this.shape("cylinder", root, [0, 0.12, 0], [0.56, 0.3, 0.56], m.oakDark);
    this.shape("cylinder", root, [0, 0.12, 0], [0.6, 0.1, 0.6], m.iron);
    this.shape("sphere", root, [0, 0.36, 0], [0.24, 0.24, 0.24], m.gold);
    const prongs = [0, 120, 240].map((around) => {
      const mount = this.group("mount", root, [0, 0, 0], [0, around + 90, 0]);
      const prong = this.group("prong", mount, [0.22, 0, 0]);
      this.shape("box", prong, [0.17, -0.3, 0], [0.11, 0.78, 0.13], m.oak, [0, 0, 28]);
      this.shape("box", prong, [0.25, -0.86, 0], [0.11, 0.62, 0.13], m.oak, [0, 0, -22]);
      this.shape("cone", prong, [0.06, -1.16, 0], [0.16, 0.34, 0.16], m.iron, [0, 0, -112]);
      return prong;
    });
    root.enabled = false;
    this.claw = { root, prongs };
  }

  private buildPans(level: LevelDef): void {
    const m = this.m;
    for (const pit of level.pits) {
      if (pit.hung) {
        // A pan in an iron box hung under the hole, with its own little fire beneath.
        const wide = pit.w > 2;
        this.pan(this.scene, [pit.x, pit.pan - 0.05, 0.1], wide ? 1.5 : 1.1);
        for (const side of [-1, 1]) this.shape("box", this.scene, [pit.x + side * (wide ? pit.w * 0.42 : 0.6), pit.pan - 0.2, BACK + 0.55], [0.1, 0.1, 1.2], m.iron, [0, 0, 0], true);
        if (wide) this.shape("box", this.scene, [pit.x, pit.pan - 0.04, 0], [pit.w - 0.1, 0.03, 1.46], m.ember, [0, 0, 0], true);
        const fires = wide ? 9 : 3;
        const spread = wide ? (pit.w * 0.84) / (fires - 1) : 0.3;
        for (let index = 0; index < fires; index += 1) {
          const flame = this.shape("cone", this.scene, [pit.x - (spread * (fires - 1)) / 2 + index * spread, pit.pan - (wide ? 0.42 : 0.2), 0.82], [0.2, 0.34, 0.1], m.fire);
          this.flames.push(flame);
        }
        continue;
      }
      const base = level.bottom + 1.2;
      this.shape("box", this.scene, [pit.x, (base + pit.pan) / 2 - 0.1, 0], [2, pit.pan - base - 0.2, 1.7], m.stoneDark, [0, 0, 0], true);
      this.shape("box", this.scene, [pit.x, base + 0.24, 0.86], [1, 0.34, 0.06], m.ink, [0, 0, 0], true);
      for (let index = 0; index < 3; index += 1) {
        const flame = this.shape("cone", this.scene, [pit.x - 0.3 + index * 0.3, base + 0.28, 0.9], [0.2, 0.34, 0.1], m.fire);
        this.flames.push(flame);
      }
      this.pan(this.scene, [pit.x, pit.pan - 0.05, 0.1], 1.5);
      // The hole's own sign, for anyone in doubt.
      const sign = this.group("sign", this.scene, [pit.x + 1.3, pit.pan + 2.3, BACK + 0.3]);
      this.shape("box", sign, [0, 0, 0], [0.9, 0.7, 0.08], m.vermilion, [0, 0, 0], true);
      this.shape("cylinder", sign, [-0.08, 0, 0.06], [0.4, 0.04, 0.4], m.iron, [90, 0, 0], true);
      this.shape("box", sign, [0.24, 0, 0.06], [0.3, 0.07, 0.04], m.iron, [0, 0, 0], true);
      this.shape("sphere", sign, [-0.08, 0, 0.09], [0.16, 0.16, 0.06], m.yolk, [0, 0, 0], true);

      const cook = this.person(this.scene, [pit.x - 1.75, level.bottom + 1.2, 0.2], m.plasterWarm);
      const spoon = this.group("spoon", cook.arms[1]!, [0, 0.42, 0]);
      this.shape("box", spoon, [0, 0.2, 0], [0.04, 0.5, 0.04], m.oak);
      this.shape("sphere", spoon, [0, 0.46, 0], [0.14, 0.18, 0.08], m.oak);
      this.cooks.push(cook);
    }
  }

  /** The trapdoor in the ceiling that he comes in by: two flaps on iron hangers. */
  private buildHatch(level: LevelDef, here: boolean): void {
    const m = this.m;
    const { x, y } = level.start;
    const sill = y - EGG.blunt - 0.06;
    const hang = level.top + 0.2 - sill;
    for (const side of [-1, 1]) {
      for (const z of [-0.6, 0.6]) this.shape("box", this.scene, [x + side * 0.64, sill + hang / 2, z], [0.07, hang, 0.07], m.iron, [0, 0, 0], true);
      this.shape("box", this.scene, [x + side * 0.64, sill - 0.02, 0], [0.09, 0.09, 1.3], m.iron, [0, 0, 0], true);
      const flap = this.group("flap", this.scene, [x + side * 0.6, sill, 0]);
      this.shape("box", flap, [-side * 0.29, -0.04, 0], [0.58, 0.08, 1.2], m.oak);
      this.shape("box", flap, [-side * 0.29, -0.09, 0], [0.5, 0.04, 0.2], m.iron);
      if (here) this.flaps.push({ entity: flap, side });
    }
  }

  /** The hen at the bottom of a room: a brown one keeping a roost, or the Empress herself with her brood. */
  private buildNest(level: LevelDef, here: boolean): void {
    const m = this.m;
    const nest = level.nest;
    const empress = level.ends === "nest";
    const feather = empress ? m.hen : m.russet;
    const x = (nest.x0 + nest.x1) / 2 + (empress ? (nest.x0 < 0 ? -0.2 : 0.2) : 0.2);
    const hen = this.group("hen", this.scene, [x, nest.y0 - 0.1, BACK + 0.55]);
    const size = empress ? 0.36 : 0.25;
    hen.setLocalScale(size, size, size * 0.84);
    this.shape("sphere", hen, [0, 2.3, 0], [6, 4.8, 6.4], feather);
    this.shape("sphere", hen, [0, 3.2, -2.9], [2.2, 2.6, 2.8], feather, [-30, 0, 0]);
    const head = this.group("head", hen, [0, 5.3, 1.9]);
    this.shape("sphere", head, [0, 0, 0], [2.2, 2.3, 2.2], feather);
    this.shape("cone", head, [0, -0.1, 1.25], [0.7, 0.9, 0.7], m.gold, [90, 0, 0]);
    this.shape("sphere", head, [0, -0.75, 0.95], [0.4, 0.7, 0.36], m.vermilion);
    for (const side of [-1, 1]) this.shape("sphere", head, [side * 0.62, 0.3, 0.86], [0.26, 0.3, 0.2], m.ink);
    for (const [offset, tall] of [[-0.35, 0.6], [0.15, 0.8], [0.6, 0.55]] as const) this.shape("sphere", head, [0, 1.2, offset - 0.1], [0.34, tall, 0.5], m.vermilion);
    if (empress) {
      this.shape("cylinder", head, [0, 1.25, 0.45], [1.1, 0.22, 1.1], m.gold);
      for (let spike = 0; spike < 5; spike += 1) {
        const turn = (spike / 5) * Math.PI * 2;
        this.shape("cone", head, [Math.cos(turn) * 0.46, 1.52, 0.45 + Math.sin(turn) * 0.46], [0.2, 0.42, 0.2], m.gold);
      }
    }
    const wings = [-1, 1].map((side) => {
      const wing = this.group("wing", hen, [side * 2.8, 2.6, 0.2]);
      this.shape("sphere", wing, [side * 0.5, -0.2, 0], [1.6, 3, 4.2], feather, [0, 0, side * -12]);
      return wing;
    });
    this.hens.push({ head, wings, here });
    if (!empress) return;
    for (let index = 0; index < 3; index += 1) {
      const chick = this.group("chick", this.scene, [nest.x0 + 0.3 + index * 0.75, nest.y0 + 0.2, 0.8 - (index % 2) * 0.2]);
      this.shape("sphere", chick, [0, 0, 0], [0.3, 0.28, 0.3], m.yolk);
      this.shape("sphere", chick, [0, 0.2, 0.06], [0.2, 0.2, 0.2], m.yolk);
      this.shape("cone", chick, [0, 0.19, 0.18], [0.07, 0.1, 0.07], m.vermilion, [90, 0, 0]);
      this.chicks.push({ entity: chick, base: nest.y0 + 0.2, here });
    }
  }

  private buildKing(): void {
    const m = this.m;
    const king = this.group("king", this.scene);
    this.king = king;
    this.eggShape(king, m.egg);
    // His sash, his face (which is on the side of him that faces the audience) and his crown.
    this.shape("cylinder", king, [0, -0.06, 0], [0.87, 0.1, 0.87], m.vermilion);
    this.shape("box", king, [0, -0.06, 0.43], [0.15, 0.15, 0.05], m.gold);
    for (const side of [-1, 1]) {
      this.shape("sphere", king, [side * 0.14, 0.2, 0.35], [0.11, 0.14, 0.08], m.ink);
      this.shape("box", king, [side * 0.15, 0.34, 0.31], [0.15, 0.03, 0.05], m.ink, [0, 0, side * 16]);
      const arm = this.group("arm", king, [side * 0.4, 0.02, 0.05]);
      this.shape("box", arm, [side * 0.12, 0, 0], [0.24, 0.07, 0.07], m.egg);
      this.shape("sphere", arm, [side * 0.26, 0, 0], [0.13, 0.13, 0.13], m.egg);
      this.arms.push(arm);
    }
    this.shape("sphere", king, [0, 0.06, 0.4], [0.15, 0.06, 0.06], m.ink);
    this.shape("cylinder", king, [0, EGG.sharp - 0.03, 0], [0.34, 0.12, 0.34], m.gold);
    for (let spike = 0; spike < 5; spike += 1) {
      const turn = (spike / 5) * Math.PI * 2;
      this.shape("cone", king, [Math.cos(turn) * 0.13, EGG.sharp + 0.1, Math.sin(turn) * 0.13], [0.09, 0.18, 0.09], m.gold);
    }
    const crackAt: Array<[Triple, Triple, Triple]> = [
      [[0.14, 0.42, 0.25], [0.035, 0.3, 0.03], [0, 0, 28]],
      [[0.26, 0.3, 0.2], [0.035, 0.2, 0.03], [0, 0, -40]],
      [[-0.2, -0.22, 0.3], [0.035, 0.32, 0.03], [0, 0, -24]],
      [[-0.3, -0.3, 0.2], [0.035, 0.22, 0.03], [0, 0, 44]],
    ];
    for (const [position, scale, euler] of crackAt) {
      const crack = this.shape("box", king, position, scale, m.ink, euler);
      crack.enabled = false;
      this.cracks.push(crack);
    }
  }

  /**
   * While a card covers the bottom `cover` pixels of the screen, look low enough that `lowest`
   * (a height in the house) is seen above it. `null` lets the camera go back to him.
   */
  hold(lowest: number | null, cover = 0, highest: number | null = null): void {
    this.holdAsk = lowest === null ? null : { lowest, cover, highest };
    if (lowest === null) this.held = null;
  }

  /** How many pixels at the top of the screen the HUD's bar covers: nothing that matters is to be shown under it. */
  cover(top: number): void {
    if (Math.abs(top - this.coverTop) > 0.5) this.snap = this.snap || this.coverTop === 0;
    this.coverTop = top;
  }

  /** He is still on his way down from the roost above. */
  get arriving(): boolean {
    return this.arrival !== null;
  }

  // ---------------------------------------------------------------- pointing

  /** Where on the kitchen's plane a point on the screen is. */
  pickPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const component = this.camera.camera;
    if (!component) return null;
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const near = component.screenToWorld(sx, sy, component.nearClip);
    const far = component.screenToWorld(sx, sy, component.farClip);
    const span = near.z - far.z;
    if (Math.abs(span) < 1e-6) return null;
    const k = near.z / span;
    return { x: near.x + (far.x - near.x) * k, y: near.y + (far.y - near.y) * k };
  }

  /** Show where a bale would go, or nothing. */
  aim(at: { x: number; y: number; turn: number } | null): void {
    if (!this.ghost) return;
    this.ghost.enabled = at !== null;
    if (!at) return;
    this.ghost.setLocalPosition(at.x, at.y, 0);
    this.ghost.setLocalEulerAngles(0, 0, at.turn * RAD);
  }

  // ---------------------------------------------------------------- every frame

  sync(game: Game, dt: number): void {
    this.clock += dt;
    const egg = game.egg;
    const king = this.king;
    if (king) {
      if (this.ending && this.ending.kind === "fried") {
        const end = this.ending;
        end.t += dt;
        const k = Math.min(1, end.t / 0.55);
        king.setLocalPosition(end.from.x + (end.to.x - end.from.x) * Math.min(1, k * 2), end.from.y + (end.to.y - end.from.y) * k * k, 0);
        king.setLocalEulerAngles(0, 0, end.from.turn * RAD + k * 200);
        if (k >= 1 && king.enabled) {
          king.enabled = false;
          this.fry(end.to);
        }
      } else if (this.ending && this.ending.kind === "caught") {
        // The prongs close on him, and up he goes: out in front of the house and through the top of it.
        const end = this.ending;
        end.t += dt;
        const grip = Math.min(1, end.t / HOOK.grip);
        const lift = Math.max(0, end.t - HOOK.grip);
        const up = 0.5 * HOOK.lift * lift * lift;
        const swing = Math.sin(end.t * 9) * 10 * Math.min(1, lift * 2);
        king.setLocalPosition(end.from.x, end.from.y + up, HOOK.front * grip);
        king.setLocalEulerAngles(0, 0, end.from.turn * RAD * (1 - grip) + swing);
        if (this.claw) {
          this.claw.root.enabled = true;
          this.claw.root.setLocalPosition(end.from.x, end.from.y + EGG.sharp + 0.5 + up, HOOK.front);
          this.claw.root.setLocalEulerAngles(0, 0, swing * 0.5);
          for (const prong of this.claw.prongs) prong.setLocalEulerAngles(0, 0, 24 - 30 * grip);
        }
      } else if (this.arrival && game.phase === "ready") {
        // A wriggle on the roost, then out past the edge of the floor and down on to the hatch,
        // in front of everything so that all of it is seen.
        const arrival = this.arrival;
        const from = arrival.from;
        arrival.t += dt;
        const wait = Math.min(1, arrival.t / ARRIVE.wait);
        const k = Math.min(1, Math.max(0, (arrival.t - ARRIVE.wait) / ARRIVE.fall));
        if (k > 0 && !arrival.gone) {
          arrival.gone = true;
          this.burst(from.x, from.y - 0.2, this.m.hay, 12, 0.4, 3);
          this.burst(from.x, from.y - 0.2, this.m.hayDark, 6, 0.26, 2);
        }
        const ease = k * k * (3 - 2 * k);
        const hop = Math.sin(Math.min(1, k * 2.2) * Math.PI) * 0.5;
        king.setLocalPosition(from.x + (egg.x - from.x) * ease + (k === 0 ? Math.sin(arrival.t * 34) * 0.05 * wait : 0), from.y + (egg.y - from.y) * k * k + hop, Math.sin(k * Math.PI) * 1.5);
        king.setLocalEulerAngles(0, 0, (from.turn + (egg.turn - from.turn) * ease) * RAD + (k === 0 ? Math.sin(arrival.t * 26) * 9 * wait : Math.sin(k * Math.PI) * -40));
        if (arrival.t >= ARRIVE.wait + ARRIVE.fall + ARRIVE.land) {
          this.arrival = null;
          this.held = null;
          this.burst(egg.x, egg.y - 0.4, this.m.dust, 6, 0.26, 1.6);
          this.shake = Math.max(this.shake, 0.2);
        }
      } else {
        this.arrival = null;
        king.setLocalPosition(egg.x, egg.y, 0);
        king.setLocalEulerAngles(0, 0, egg.turn * RAD);
      }
      const falling = egg.vy < -4 || egg.vy > 4;
      this.arms.forEach((arm, index) => arm.setLocalEulerAngles(0, 0, (index === 0 ? -1 : 1) * (falling ? 50 + Math.sin(this.clock * 30) * 20 : 0)));
      this.cracks.forEach((crack, index) => (crack.enabled = index < game.cracks * 2));
    }

    const live = new Set<number>();
    for (const bale of game.bales) {
      live.add(bale.id);
      let entity = this.bales.get(bale.id);
      if (!entity) {
        entity = this.baleShape(this.scene);
        this.bales.set(bale.id, entity);
      }
      entity.setLocalPosition(bale.x, bale.y, 0);
      entity.setLocalEulerAngles(0, 0, bale.turn * RAD);
      if (bale.burnt > 0) {
        let char = this.chars.get(bale.id);
        if (!char) {
          char = this.shape("box", entity, [0, 0, 0], [BALE_W * 1.02, 0.01, 0.94], this.m.char);
          this.chars.set(bale.id, char);
        }
        const up = Math.min(1, bale.burnt * 1.05) * BALE_H * 1.04;
        char.setLocalScale(BALE_W * 1.02, up, 0.94);
        char.setLocalPosition(0, -BALE_H * 0.52 + up / 2, 0);
        // It sags as it goes.
        entity.setLocalScale(1, 1 - 0.35 * bale.burnt * bale.burnt, 1);
      }
    }
    for (const [id, entity] of this.bales) {
      if (live.has(id)) continue;
      entity.destroy();
      this.bales.delete(id);
      this.chars.delete(id);
    }

    // Bales on their way in come from the audience's side of the missing wall.
    const coming = new Set<number>();
    for (const bale of game.incoming) {
      coming.add(bale.id);
      let flying = this.flying.get(bale.id);
      if (!flying) {
        flying = { bale: this.baleShape(this.scene), ring: this.hoop(this.scene, [bale.x, bale.y, 1], this.m.aim) };
        this.flying.set(bale.id, flying);
      }
      const k = bale.k;
      const lob = Math.sin(k * Math.PI) * 1.6;
      flying.bale.setLocalPosition(bale.x * (0.5 + 0.5 * k), bale.y + lob - (1 - k) * 2.5, (1 - k) * 14);
      flying.bale.setLocalEulerAngles((1 - k) * 220, (1 - k) * 60, bale.turn * RAD * k);
      const size = 3.2 - 1.3 * k;
      flying.ring.setLocalScale(size, size, size);
    }
    for (const [id, flying] of this.flying) {
      if (coming.has(id)) continue;
      flying.bale.destroy();
      flying.ring.destroy();
      this.flying.delete(id);
    }

    game.seesaws.forEach((saw, index) => this.planks[index]?.setLocalEulerAngles(0, 0, saw.turn * RAD));
    for (const socket of this.sockets) {
      const filled = game.bales.some((bale) => Math.hypot(bale.x - socket.x, bale.y - socket.y) < 0.5);
      socket.entity.enabled = !filled && !game.over;
      const pulse = 1 + Math.sin(this.clock * 4) * 0.03;
      socket.entity.setLocalScale(pulse, pulse, 1);
    }

    this.flames.forEach((flame, index) => {
      const lick = 0.3 + Math.abs(Math.sin(this.clock * 9 + index * 2)) * 0.2;
      flame.setLocalScale(0.2, lick, 0.1);
    });
    for (const cook of this.cooks) {
      const stir = Math.sin(this.clock * 3);
      cook.arms[1]!.setLocalEulerAngles(0, 0, -120 + stir * 16);
      cook.arms[0]!.setLocalEulerAngles(0, 0, 150);
    }
    game.wheels.forEach((state, index) => {
      const mill = this.mills[index];
      if (!mill) return;
      mill.wheel.setLocalEulerAngles(0, 0, state.turn * RAD);
      mill.k += ((state.open ? 1 : 0) - mill.k) * Math.min(1, dt * 10);
      mill.lever.setLocalEulerAngles(0, 0, -7 * (1 - mill.k));
      const at = mill.gate.getLocalPosition();
      mill.gate.setLocalPosition(at.x, mill.gateY + 0.42 * mill.k, at.z);
      // The water creeps down the trough from the sluice, then falls on the wheel for good.
      mill.stream.enabled = state.flow > 0;
      const length = Math.max(0.01, mill.reach * state.flow);
      mill.stream.setLocalScale(length, 0.16 + Math.sin(this.clock * 17) * 0.02, 0.7);
      mill.stream.setLocalPosition(mill.reach - length / 2, 0.07, 0);
      mill.fall.enabled = state.wet;
      if (state.wet) {
        const wobble = 0.34 + Math.sin(this.clock * 23) * 0.06;
        const scale = mill.fall.getLocalScale();
        mill.fall.setLocalScale(wobble, scale.y, 0.7);
        mill.drip -= dt;
        if (mill.drip <= 0) {
          mill.drip = 0.07;
          const n = Math.floor(this.clock * 14);
          const def = mill.def;
          this.puff([def.spout.x - 0.1 + ((n % 3) - 1) * 0.1, def.y + def.r * 0.85, ((n % 5) - 2) * 0.22], this.m.spray, 0.16 + (n % 3) * 0.04, 0.5, [def.way * (1.2 + (n % 4) * 0.5), 1.4 + (n % 3) * 0.6, 0]);
          // What the wheel has carried round runs off its low side.
          if (n % 2 === 0) this.puff([def.x + def.way * def.r * (0.55 + (n % 4) * 0.1), def.y - def.r * 0.75, ((n % 5) - 2) * 0.25], this.m.spray, 0.12, 0.6, [def.way * 0.3, -1, 0]);
        }
      }
    });
    for (const hen of this.hens) {
      const home = (hen.here && game.phase === "home") || (!hen.here && this.arrival !== null && this.arrival.t < ARRIVE.wait + 0.5);
      const beat = Math.sin(this.clock * (home ? 12 : 1.6));
      hen.head.setLocalEulerAngles(home ? 16 + beat * 8 : beat * 8, beat * 10, 0);
      hen.wings.forEach((wing, index) => wing.setLocalEulerAngles(0, 0, (index === 0 ? 1 : -1) * (home ? 30 + beat * 30 : 0)));
    }
    this.chicks.forEach((chick, index) => {
      const p = chick.entity.getLocalPosition();
      const home = chick.here && game.phase === "home";
      const hop = home ? Math.abs(Math.sin(this.clock * 9 + index)) * 0.4 : Math.max(0, Math.sin(this.clock * 2 + index * 2)) * 0.06;
      chick.entity.setLocalPosition(p.x, chick.base + hop, p.z);
    });
    this.hatch += ((this.hatchOpen ? 1 : 0) - this.hatch) * Math.min(1, dt * 12);
    for (const flap of this.flaps) flap.entity.setLocalEulerAngles(0, 0, flap.side * 82 * this.hatch);
    game.doors.forEach((state, index) => {
      const door = this.turns[index];
      if (!door) return;
      door.rotor.setLocalEulerAngles(0, 0, state.turn * RAD);
      door.k += ((state.braked ? 1 : 0) - door.k) * Math.min(1, dt * 10);
      door.lever.setLocalEulerAngles(0, 0, 7 * (1 - door.k));
      const ring = door.def.r + 0.06 + DOOR_WALL / 2;
      door.shoe.setLocalPosition(door.def.x + ring * (0.62 - 0.05 * door.k), door.def.y + ring * (0.86 - 0.07 * door.k) + 0.17, SHOE_Z);
      if (door.bar) {
        // Off its hooks it swings down and hangs by one end.
        const bar = door.bar;
        bar.k += ((state.barred ? 0 : 1) - bar.k) * Math.min(1, dt * 7);
        bar.root.setLocalPosition(bar.x - 0.25 * bar.k, bar.y - 1.1 * bar.k, 0.6);
        bar.root.setLocalEulerAngles(0, 0, bar.turn + 62 * bar.k);
      }
      // The shutter the door is going to stop against is lit as soon as the brake is on.
      const quarter = Math.max(1, Math.ceil((-state.turn + 0.03) / (Math.PI / 2)));
      const next = state.braked && !state.stopped ? PORTS[quarter % 4] : state.stopped ? state.open : null;
      for (const side of ["right", "bottom", "left"] as const) {
        const shutter = door.shutters[side];
        const lit = next === side;
        if (lit !== shutter.lit) {
          shutter.lit = lit;
          for (const stave of shutter.staves) if (stave.render) stave.render.material = lit ? this.m.aim : this.m.iron;
        }
        shutter.k += ((state.open === side ? 1 : 0) - shutter.k) * Math.min(1, dt * 9);
        shutter.root.setLocalPosition(door.def.x, door.def.y, -1.25 * shutter.k);
        shutter.root.setLocalScale(1, 1, 1 - 0.85 * shutter.k);
      }
    });

    game.flaps.forEach((state, index) => {
      const valve = this.valves[index];
      if (!valve) return;
      valve.k += ((state.open ? 1 : 0) - valve.k) * Math.min(1, dt * 16);
      valve.root.setLocalEulerAngles(0, 0, valve.tilt - 70 * valve.k);
    });
    game.tanks.forEach((state, index) => {
      const vat = this.vats[index];
      if (!vat) return;
      const def = vat.def;
      const middle = (def.x0 + def.x1) / 2;
      vat.k += ((state.open ? 1 : 0) - vat.k) * Math.min(1, dt * 10);
      vat.lever.setLocalEulerAngles(0, 0, -7 * (1 - vat.k));
      const deep = state.level - def.floor + (state.wet ? Math.sin(this.clock * 5) * 0.015 : 0);
      vat.water.enabled = deep > 0.03;
      if (deep > 0.03) {
        vat.water.setLocalScale(def.x1 - def.x0, deep, 1.5);
        vat.water.setLocalPosition(middle, def.floor + deep / 2, 0);
      }
      vat.stream.enabled = state.wet;
      const side = def.spout.side;
      if (state.wet) {
        const fall = Math.max(0.05, def.tap.y - 0.25 - state.level);
        vat.stream.setLocalScale(0.26 + Math.sin(this.clock * 23) * 0.05, fall, 0.4);
        vat.stream.setLocalPosition(def.tap.x, state.level + fall / 2, 0);
        vat.drip -= dt;
        if (vat.drip <= 0) {
          vat.drip = 0.08;
          const n = Math.floor(this.clock * 13);
          this.puff([def.tap.x + ((n % 3) - 1) * 0.12, state.level + 0.05, ((n % 5) - 2) * 0.15], this.m.spray, 0.13 + (n % 3) * 0.03, 0.4, [((n % 5) - 2) * 0.5, 1.2 + (n % 3) * 0.5, 0]);
          // And where it is running out, it runs out in a spray.
          if (state.over === "spout") this.puff([(side > 0 ? def.x1 : def.x0) + side * (0.9 + (n % 3) * 0.3), def.spout.lip + 0.1, ((n % 5) - 2) * 0.2], this.m.spray, 0.16, 0.7, [side * (1.6 + (n % 3) * 0.4), 0.4, 0]);
          if (state.over === "weir") this.puff([(side > 0 ? def.x0 : def.x1) - side * (0.6 + (n % 3) * 0.3), def.weir + 0.1, ((n % 5) - 2) * 0.2], this.m.spray, 0.16, 0.7, [-side * (1.6 + (n % 3) * 0.4), 0.4, 0]);
        }
      }
      vat.spout.enabled = state.over === "spout";
      vat.weir.enabled = state.over === "weir";
    });

    game.lifts.forEach((state, index) => {
      const lift = this.hoists[index];
      if (!lift) return;
      const def = lift.def;
      const top = def.head + 0.32;
      lift.car.setLocalPosition(def.x, state.y, 0);
      const hang = Math.max(0.05, top - state.y - def.tall);
      lift.rope.setLocalScale(0.05, hang, 0.05);
      lift.rope.setLocalPosition(def.x, top - hang / 2, -0.3);
      lift.pan.setLocalPosition(def.pan.x, state.pan, 0);
      const drop = Math.max(0.05, top - state.pan - 1.1);
      lift.panRope.setLocalScale(0.05, drop, 0.05);
      lift.panRope.setLocalPosition(def.pan.x, top - drop / 2, -0.3);
      lift.drum.setLocalEulerAngles(0, 0, (state.y - def.floor) * 150);
      state.doors.forEach((door, at) => {
        const entity = lift.doors[at];
        if (entity) entity.enabled = !door.open;
      });
      state.gates.forEach((open, at) => {
        const gate = lift.gates[at];
        if (!gate) return;
        gate.k += ((open ? 1 : 0) - gate.k) * Math.min(1, dt * 12);
        gate.entity.setLocalScale(1, 1 - 0.88 * gate.k, 1);
      });
      // Where the next bale goes: on the pan, and on the roof of the car.
      const pulse = 1 + Math.sin(this.clock * 4) * 0.03;
      const [onPan, onRoof] = lift.marks;
      if (onPan && onRoof) {
        onPan.enabled = onRoof.enabled = !game.over;
        onPan.setLocalPosition(def.pan.x, state.pan + (state.up + 0.5) * (BALE_H + 0.01), 0);
        onPan.setLocalScale(pulse, pulse, 1);
        onRoof.setLocalPosition(def.x, state.y + def.tall + 0.02 + (state.down + 0.5) * (BALE_H + 0.01), 0);
        onRoof.setLocalEulerAngles(0, 0, def.side * LIFT_TILT * RAD);
        onRoof.setLocalScale(pulse, pulse, 1);
      }
    });

    game.hearths.forEach((state, index) => {
      const fire = this.fires[index];
      if (!fire) return;
      fire.flames.forEach((flame, each) => {
        flame.enabled = state.left > 0;
        const lick = (0.55 + Math.abs(Math.sin(this.clock * 11 + each * 1.9)) * 0.7) * (0.45 + 0.55 * state.left);
        flame.setLocalScale(0.3, lick, 0.2);
        flame.setLocalPosition(flame.getLocalPosition().x, 0.55 + lick / 2, flame.getLocalPosition().z);
      });
      if (state.left > 0 && Math.random() < dt * 9) this.puff([fire.x + (Math.random() - 0.5) * 1.2, fire.y + 0.9, 0.2], Math.random() < 0.5 ? this.m.fire : this.m.steam, 0.2, 0.7, [(Math.random() - 0.5) * 0.6, 1.8 + Math.random(), 0]);
    });

    game.kettles.forEach((state, index) => {
      const boiler = this.boilers[index];
      if (!boiler) return;
      // It rocks harder the nearer the boil, and steams at the spout.
      boiler.pot.setLocalEulerAngles(0, 0, Math.sin(this.clock * 34) * 2.6 * state.heat * state.heat);
      const far = Math.sign(state.def.toss.x) || 1;
      if (state.heat > 0 && Math.random() < dt * (4 + 26 * state.heat)) {
        this.puff([boiler.x - far * 1.3, boiler.y - 0.2, 0.35], this.m.steam, 0.2 + 0.25 * state.heat, 0.8, [-far * (0.6 + state.heat), 1.6 + 1.6 * state.heat, 0]);
      }
      // The lid goes up with a bang, turns over and comes down again.
      const t = state.blew;
      const up = t >= 0 && t < 1.3 ? Math.max(0, 7.5 * t - 5.8 * t * t) : 0;
      const rattle = state.heat > 0.4 ? Math.abs(Math.sin(this.clock * 40)) * 0.05 * state.heat : 0;
      boiler.lid.setLocalPosition(boiler.x - far * up * 0.25, boiler.y + up + rattle, up > 0 ? -0.6 * Math.min(1, up) : 0);
      boiler.lid.setLocalEulerAngles(0, 0, up > 0 ? far * t * 290 : 0);
    });

    game.jellies.forEach((state, index) => {
      const jell = this.jells[index];
      if (!jell) return;
      // A shiver that dies away; and for ever after a bale, a sag.
      const t = state.threw;
      const shiver = t >= 0 && t < 1.6 ? Math.exp(-3 * t) * Math.cos(t * 24) * 0.34 : Math.sin(this.clock * 2.3 + index) * 0.015;
      const sag = state.set ? 0.82 : 1;
      jell.dome.setLocalScale(1 - shiver * 0.5, (1 + shiver) * sag, 1);
      jell.straw.enabled = state.set;
    });

    game.pies.forEach((state, index) => {
      const pie = this.pasties[index];
      if (!pie) return;
      pie.crust.enabled = state.open < 0;
      pie.crumbs.enabled = state.open >= 0;
      // The crust heaves a little: there is something under it.
      if (state.open < 0) pie.crust.setLocalPosition(pie.x, pie.y + Math.max(0, Math.sin(this.clock * 5.2)) * 0.025, 0);
      const out = state.open >= 0;
      if (out && game.flying) {
        const egg = game.egg;
        this.flock = { x: egg.x, y: egg.y, loose: -1 };
      } else if (out && this.flock.loose < 0) {
        this.flock.loose = this.clock;
      }
      const away = this.flock.loose < 0 ? 0 : this.clock - this.flock.loose;
      for (const bird of this.birds) {
        bird.root.enabled = out && away < 3.2;
        if (!bird.root.enabled) continue;
        const turn = bird.seed * 2.4 + this.clock * (2.2 + (bird.seed % 3) * 0.5);
        const ring = 0.55 + (bird.seed % 4) * 0.16 + away * (1.2 + (bird.seed % 5) * 0.5);
        const rise = away * (2.4 + (bird.seed % 3)) + 0.6 + Math.sin(turn * 1.7) * 0.22;
        const x = this.flock.x + Math.cos(turn) * ring;
        bird.root.setLocalPosition(x, this.flock.y + rise + Math.sin(turn) * 0.2, Math.sin(turn) * 0.8);
        bird.root.setLocalEulerAngles(0, Math.sin(turn) > 0 ? 180 : 0, 0);
        const flap = Math.sin(this.clock * 26 + bird.seed) * 55;
        bird.wings.forEach((wing, side) => wing.setLocalEulerAngles((side === 0 ? 1 : -1) * flap, 0, 0));
      }
    });

    game.gloves.forEach((state, index) => {
      const glove = this.fists[index];
      if (!glove) return;
      // Out with a bang, back in a moment; and then it sits well back while it winds, and comes
      // forward again with a little bounce when it is wound.
      const t = state.hit;
      const ready = state.wound >= 1;
      let out = 0.42 + Math.sin(this.clock * 31 + index) * 0.012;
      if (t >= 0 && t < 0.07) out = 0.42 + (2.1 - 0.42) * (t / 0.07);
      else if (t >= 0.07 && t < 0.3) out = 2.1 - Math.sin(((t - 0.07) / 0.23) * Math.PI) * 0.12;
      else if (t >= 0.3 && t < 0.8) out = 2.1 - (2.1 - 0.12) * ((t - 0.3) / 0.5) ** 2;
      else if (!ready) out = 0.12;
      else if (glove.was < 1) glove.was = -this.clock;
      if (ready && glove.was < 0) {
        const since = this.clock + glove.was;
        out = 0.42 + Math.exp(-7 * since) * Math.cos(since * 30) * 0.2 - Math.exp(-12 * since) * 0.3;
        if (since > 1) glove.was = 1;
      }
      if (!ready) glove.was = 0;
      glove.fist.setLocalPosition(glove.side * out, 0, 0);
      const span = (out - 0.3) / 4;
      const lean = Math.acos(Math.min(1, Math.max(0.05, span / 0.5))) * RAD;
      glove.bars.forEach((bar, link) => {
        const cell = Math.floor(link / 2);
        bar.setLocalPosition(glove.side * (span * (cell + 0.5)), 0, link % 2 ? 0.12 : -0.12);
        bar.setLocalEulerAngles(0, 0, link % 2 ? lean : -lean);
        bar.enabled = out > 0.34;
      });
      glove.key.setLocalEulerAngles(0, 0, ready ? 0 : -state.wound * 1440);
      glove.lamp.enabled = ready ? true : Math.floor(this.clock * 6) % 2 === 0 && state.wound > 0.8;
      const glow = ready ? 0.26 + Math.sin(this.clock * 6) * 0.02 : 0.16;
      glove.lamp.setLocalScale(glow, glow, glow);
    });

    game.cats.forEach((state, index) => {
      const cat = this.mousers[index];
      if (!cat) return;
      const def = state.def;
      let x = state.x;
      let y = state.y;
      let z = CAT_Z;
      cat.straw.enabled = false;
      if (state.state === "asleep") this.poseCat(cat, "asleep", 0, 0);
      else if (state.state === "awake") this.poseCat(cat, state.awake > CAT_STIR - 0.75 ? "crouch" : "stir", state.since, 0);
      else if (state.state === "leap") {
        // Up and over, and out to the front of the floor where the thing is.
        const part = Math.min(1, state.since / CAT_LEAP);
        y += Math.sin(part * Math.PI) * 0.9;
        z = CAT_Z * (1 - part);
        if (Math.abs(x - cat.was) > 0.001) cat.faces = Math.sign(x - cat.was);
        this.poseCat(cat, "leap", state.since, part);
      } else if (state.state === "fed") {
        // Off home with it, and down on it.
        const part = Math.min(1, state.since / 0.9);
        x += (def.x - x) * part;
        y += (def.y - y) * part + (part < 1 ? Math.abs(Math.sin(this.clock * 22)) * 0.08 : 0.26);
        z = CAT_Z * part;
        if (part < 1) cat.faces = Math.sign(def.x - state.x) || cat.faces;
        cat.straw.enabled = true;
        cat.straw.setLocalPosition(part < 1 ? -0.7 : 0, part < 1 ? 0.5 : -0.12, 0);
        this.poseCat(cat, part < 1 ? "run" : "asleep", state.since, part);
        if (part >= 1) for (const lid of cat.lids) lid.setLocalScale(0.1, 0.03, 0.12);
      } else {
        z = 0;
        this.poseCat(cat, "sit", state.since, 0);
      }
      cat.was = state.x;
      cat.root.setLocalPosition(x, y, z);
      cat.root.setLocalEulerAngles(0, cat.faces > 0 ? 180 : 0, 0);
    });

    game.traps.forEach((state, index) => {
      const snare = this.snares[index];
      if (!snare) return;
      // Ready, it stands back past upright and trembles; gone, it is flat on the nest in no time.
      const t = state.sprung;
      const turn = t < 0 ? 112 + Math.sin(this.clock * 23) * 0.5 : Math.max(0, 112 * (1 - t / 0.07)) + (t > 0.07 && t < 0.4 ? Math.abs(Math.sin((t - 0.07) * 40)) * 5 * (1 - (t - 0.07) / 0.33) : 0);
      snare.bar.setLocalEulerAngles(0, 0, turn);
      snare.straw.enabled = t >= 0 && state.by === "bale";
      // She nods, by clockwork, until the bar has her.
      if (t < 0) snare.hen.setLocalEulerAngles(0, 0, Math.sin(this.clock * 2.4) > 0.9 ? -7 : 0);
      else {
        snare.hen.setLocalScale(1, 0.34, 1);
        snare.hen.setLocalEulerAngles(0, 0, -6);
      }
    });

    const up = new Set<number>();
    for (const pot of game.pots) {
      up.add(pot.id);
      let entity = this.pots.get(pot.id);
      if (!entity) {
        entity = this.buildPot(pot.kind);
        this.pots.set(pot.id, entity);
      }
      entity.setLocalPosition(pot.x, pot.y, 0.05);
      entity.setLocalEulerAngles(0, 0, pot.kind === 3 ? Math.sin(this.clock * 3 + pot.id) * 14 : (this.clock * 150 + pot.id * 70) % 360);
    }
    for (const [id, entity] of this.pots) {
      if (up.has(id)) continue;
      entity.destroy();
      this.pots.delete(id);
    }

    game.mines.forEach((state, index) => {
      const charge = this.charges[index];
      if (!charge) return;
      charge.root.enabled = state.live;
      charge.scorch.enabled = !state.live;
      const flicker = 0.1 + Math.abs(Math.sin(this.clock * 11 + index)) * 0.1;
      charge.spark.setLocalScale(flicker, flicker * 1.3, flicker);
    });

    game.barrels.forEach((state, index) => {
      const keg = this.kegs[index];
      if (!keg) return;
      const def = keg.def;
      keg.keg.setLocalPosition(state.x, state.y, 0);
      keg.keg.setLocalEulerAngles(0, 0, state.turn * RAD);
      keg.k += ((state.state === "chocked" ? 0 : 1) - keg.k) * Math.min(1, dt * 10);
      keg.pan.setLocalPosition(def.pan.x, def.pan.y - 0.14 * keg.k, 0);
      keg.pan.setLocalEulerAngles(0, 0, 5 * keg.k);
      keg.chock.enabled = state.state === "chocked";
      keg.crates.enabled = state.crates;
      keg.lid.enabled = state.state === "sunk";
      keg.kick = Math.max(0, keg.kick - dt * 3);
      keg.lever.setLocalEulerAngles(0, 0, Math.sin(keg.kick * Math.PI) * 16);
    });

    // The hook is let down in front of the house as his time runs out, and goes back up if he gets away.
    if (this.claw && this.ending?.kind !== "caught") {
      const hook = game.phase === "run" ? game.hook : 0;
      this.reach = hook > 0 ? this.reach + (Math.max(hook, 0.12) - this.reach) * Math.min(1, dt * 7) : Math.max(0, this.reach - dt * 2.5);
      this.claw.root.enabled = this.reach > 0.005;
      if (this.claw.root.enabled) {
        const k = 1 - this.reach;
        const sway = Math.sin(this.clock * 5) * 4 * k;
        this.claw.root.setLocalPosition(egg.x + Math.sin(this.clock * 2.3) * 0.12 * k, egg.y + EGG.sharp + 0.5 + k * k * HOOK.up + k * 0.6, HOOK.front);
        this.claw.root.setLocalEulerAngles(0, 0, sway);
        const snap = 24 + Math.sin(this.clock * 12) * 5 * this.reach;
        for (const prong of this.claw.prongs) prong.setLocalEulerAngles(0, 0, snap);
      }
    }

    this.syncEffects(dt);
    this.follow(game, dt);
  }

  private follow(game: Game, dt: number): void {
    const level = this.level;
    const component = this.camera.camera;
    if (!level || !component) return;
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const half = Math.tan((FOV / 2) * (Math.PI / 180));
    // The bar of the HUD lies over the top of the screen, and nothing that matters is shown
    // under it. So the room is fitted into what is left: on a wide screen the camera stands
    // far enough back for all of it; on a narrow one the room begins lowered, with its
    // ceiling just under the bar, and is brought up the screen as he goes down it.
    const tall = Math.max(1, this.canvas.clientHeight);
    const under = Math.min(0.3, this.coverTop / tall);
    const roomTop = level.top + 0.55;
    const roomBottom = level.bottom + 0.2;
    const distance = Math.max(SHOW_W / 2 / (half * aspect), aspect > 0.8 ? (roomTop - roomBottom) / (1 - under) / 2 / half : 0);
    const seen = 2 * distance * half;
    const hidden = under * seen;
    const highest = roomTop + hidden - seen / 2;
    const lowest = roomBottom + seen / 2;
    // Where it does not all fit, he is kept two fifths of the way down what can be seen: there is more to see below him than above.
    const beside = game.egg.y - seen / 2 + hidden + 0.4 * (seen - hidden);
    let want = lowest >= highest ? (lowest + highest) / 2 : Math.min(highest, Math.max(lowest, beside));
    if (this.holdAsk) {
      // What is left of the screen above the card has to show `lowest` at its foot and, if it
      // can as well, `highest` at its head: where the two will not both fit, the head wins.
      const covered = (this.holdAsk.cover / Math.max(1, this.canvas.clientHeight)) * seen;
      const low = this.holdAsk.lowest - covered + seen / 2;
      const high = this.holdAsk.highest === null ? low : this.holdAsk.highest - seen / 2;
      this.held = Math.min(want, high > low ? high : (low + Math.max(high, low - 1.2)) / 2);
      this.holdAsk = null;
    }
    if (this.held !== null) want = this.held;
    this.lookY = this.snap ? want : this.lookY + (want - this.lookY) * Math.min(1, dt * 3);
    this.snap = false;

    this.shake = Math.max(0, this.shake - dt * 2.4);
    const jitter = this.shake * this.shake * 0.5;
    const midX = (level.left + level.right) / 2 + Math.sin(this.clock * 61) * jitter;
    const y = this.lookY + Math.cos(this.clock * 53) * jitter;
    // A little above, looking a little down: enough to see the tops of the floors.
    this.camera.setPosition(midX, y + distance * 0.1, distance);
    this.camera.lookAt(midX, y, 0);
    component.fov = FOV;
    component.horizontalFov = false;
  }

  // ---------------------------------------------------------------- effects

  private puff(at: Triple, material: pc.StandardMaterial, size: number, life: number, velocity: Triple): void {
    let entity = this.pool.pop();
    if (!entity) {
      entity = new pc.Entity("puff");
      entity.addComponent("render", { type: "sphere", material, castShadows: false, receiveShadows: false });
      this.scene.addChild(entity);
    }
    if (entity.render) entity.render.material = material;
    entity.enabled = true;
    entity.setPosition(at[0], at[1], at[2]);
    entity.setLocalScale(0.01, 0.01, 0.01);
    this.puffs.push({ entity, life, total: life, velocity: new pc.Vec3(velocity[0], velocity[1], velocity[2]), size });
  }

  private burst(x: number, y: number, material: pc.StandardMaterial, count: number, size: number, speed: number): void {
    for (let index = 0; index < count; index += 1) {
      const turn = (index / count) * Math.PI * 2 + this.clock;
      const fast = speed * (0.5 + ((index * 7) % 5) / 6);
      this.puff([x, y, 0.4], material, size * (0.6 + ((index * 7) % 5) / 6), 0.5 + ((index * 3) % 4) / 8, [Math.cos(turn) * fast, Math.sin(turn) * fast + 1.5, ((index % 3) - 1) * 1.2]);
    }
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
      puff.velocity.y -= 4 * dt;
      puff.entity.setLocalScale(size, size, size);
    }
  }

  private fry(at: { x: number; y: number }): void {
    const m = this.m;
    const fried = this.group("fried", this.scene, [at.x, at.y + 0.04, 0.1]);
    this.shape("cylinder", fried, [0, 0, 0], [1.2, 0.05, 1.05], m.albumen);
    this.shape("sphere", fried, [0.25, 0, 0.3], [0.5, 0.05, 0.4], m.albumen);
    this.shape("sphere", fried, [-0.05, 0.06, 0], [0.46, 0.22, 0.46], m.yolk);
    this.shape("cylinder", fried, [-0.05, 0.2, 0.05], [0.22, 0.07, 0.22], m.gold);
    this.fried = fried;
    for (let index = 0; index < 8; index += 1) this.puff([at.x - 0.5 + (index % 4) * 0.33, at.y + 0.2, 0.3], m.steam, 0.5, 0.9 + (index % 3) * 0.3, [((index % 3) - 1) * 0.4, 2.2 + (index % 2), 0]);
  }

  handle(event: GameEvent, game: Game): void {
    const m = this.m;
    const egg = game.egg;
    switch (event.type) {
      case "start":
        this.hatchOpen = true;
        break;
      case "bale":
        this.burst(event.x, event.y, m.hayDark, 4, 0.22, 1.4);
        break;
      case "burst":
        this.burst(event.x, event.y, m.hay, 14, 0.5, 4);
        this.burst(event.x, event.y, m.hayDark, 8, 0.3, 2.4);
        this.shake = Math.max(this.shake, 0.35);
        break;
      case "soft":
        // Into water with a splash, into straw with a cloud of it.
        if (
          game.wheels.some((wheel) => wheel.wet && Math.hypot(event.x - wheel.x, event.y - wheel.y) < wheel.def.r + 0.7) ||
          game.tanks.some((tank) => tank.wet && event.x > tank.def.x0 && event.x < tank.def.x1 && event.y - 0.6 < tank.level && event.y > tank.def.floor)
        ) {
          this.burst(event.x, event.y - 0.2, m.spray, 10, 0.24, 3.4);
        } else {
          this.burst(event.x, event.y - 0.4, m.hay, 8, 0.26, 2.4);
          this.burst(event.x, event.y - 0.4, m.hayDark, 5, 0.18, 1.6);
        }
        break;
      case "sluice":
        this.burst(event.x, event.y, m.dust, 5, 0.2, 1.4);
        this.shake = Math.max(this.shake, 0.15);
        break;
      case "water":
        this.burst(event.x, event.y, m.spray, 12, 0.3, 3.2);
        break;
      case "turning":
        this.burst(event.x, event.y, m.dust, 6, 0.2, 1.6);
        this.shake = Math.max(this.shake, 0.15);
        break;
      case "brake":
        this.burst(event.x, event.y, m.dust, 5, 0.2, 1.4);
        this.shake = Math.max(this.shake, 0.2);
        break;
      case "port": {
        const door = this.turns[0];
        if (door && event.port !== "top") {
          const turn = (((SHUTTER[event.port][0] + SHUTTER[event.port][1]) / 2) * Math.PI) / 180;
          this.burst(event.x + Math.cos(turn) * (door.def.r + 0.3), event.y + Math.sin(turn) * (door.def.r + 0.3), m.dust, 8, 0.24, 2.2);
        }
        this.shake = Math.max(this.shake, 0.3);
        break;
      }
      case "caged":
        this.burst(event.x, event.y - 0.3, m.hay, 6, 0.2, 1.6);
        break;
      case "unbar": {
        const bar = this.turns[0]?.bar;
        if (bar) this.burst(bar.x, bar.y, m.dust, 10, 0.26, 2.6);
        this.burst(event.x, event.y, m.dust, 5, 0.2, 1.4);
        this.shake = Math.max(this.shake, 0.3);
        break;
      }
      case "release":
        this.burst(event.x, event.y, m.hay, 10, 0.3, 3);
        this.burst(event.x, event.y, m.hayDark, 6, 0.22, 2);
        break;
      case "plug":
        this.burst(event.x, event.y, m.hayDark, 6, 0.22, 1.8);
        this.shake = Math.max(this.shake, 0.12);
        break;
      case "spill":
        this.burst(event.x, event.y, m.spray, 12, 0.26, 3);
        break;
      case "wash":
        this.burst(event.x, event.y, m.spray, 14, 0.3, 3.6);
        this.shake = Math.max(this.shake, 0.2);
        break;
      case "splash":
        this.burst(event.x, event.y, m.spray, 18, 0.3, 4.4);
        this.shake = Math.max(this.shake, 0.2);
        break;
      case "kindle":
        this.burst(event.x, event.y + 0.5, m.fire, 9, 0.3, 3);
        this.burst(event.x, event.y + 0.5, m.gold, 5, 0.16, 4);
        break;
      case "ash":
        this.burst(event.x, event.y, m.char, 12, 0.3, 2.2);
        this.burst(event.x, event.y + 0.2, m.steam, 6, 0.5, 1.4);
        break;
      case "toast":
        this.burst(event.x, event.y - 0.3, m.fire, 12, 0.3, 4);
        break;
      case "blow":
        this.burst(event.x, event.y + 0.2, m.steam, 22, 0.7, 5.5);
        this.burst(event.x, event.y + 0.2, m.spray, 10, 0.25, 7);
        this.shake = Math.max(this.shake, 0.6);
        break;
      case "boing": {
        const index = game.jellies.findIndex((jelly) => jelly.def.x === event.x && jelly.def.y === event.y);
        this.burst(event.x, event.y + 0.2, [m.jellyRed, m.jellyGreen, m.jellyPlum][Math.max(0, index) % 3]!, 7, 0.22, 3.4);
        this.shake = Math.max(this.shake, 0.12);
        break;
      }
      case "set":
        this.burst(event.x, event.y + 0.2, m.hay, 10, 0.34, 3);
        this.burst(event.x, event.y + 0.2, m.hayDark, 5, 0.22, 2);
        break;
      case "birds":
        this.burst(event.x, event.y + 0.1, m.crust, 12, 0.3, 5);
        this.burst(event.x, event.y + 0.1, m.ink, 14, 0.14, 6.5);
        this.shake = Math.max(this.shake, 0.3);
        break;
      case "drop":
        this.burst(event.x, event.y + 0.6, m.ink, 8, 0.12, 3);
        break;
      case "punch":
        // Stars, and whatever he hit.
        this.burst(event.x, event.y, m.gold, 9, 0.22, 6);
        this.burst(event.x, event.y, m.vellum, 6, 0.3, 3.5);
        if (event.what === "bale") {
          this.burst(event.x, event.y, m.hay, 18, 0.42, 6.5);
          this.burst(event.x, event.y, m.hayDark, 9, 0.3, 4.5);
        }
        this.shake = Math.max(this.shake, event.what === "egg" ? 0.55 : 0.4);
        break;
      case "wake":
        this.burst(event.x - 0.5, event.y + 1.1, m.gold, 3, 0.08, 2.5);
        break;
      case "leap":
        this.burst(event.x, event.y + 0.2, m.dust, 5, 0.2, 2);
        break;
      case "fetch":
        this.burst(event.x, event.y + 0.2, m.hay, 16, 0.4, 4.5);
        this.shake = Math.max(this.shake, 0.3);
        break;
      case "pounce":
        this.burst(event.x, event.y + 0.3, m.dust, 10, 0.3, 4);
        this.shake = Math.max(this.shake, 0.8);
        break;
      case "snap":
        this.burst(event.x, event.y + 0.9, m.dust, 10, 0.3, 3.5);
        this.burst(event.x, event.y + 0.9, m.woodHen, 7, 0.16, 5);
        this.burst(event.x, event.y + 0.9, m.gold, 4, 0.1, 6);
        if (event.by === "bale") this.burst(event.x, event.y + 0.9, m.hay, 12, 0.34, 4.5);
        this.shake = Math.max(this.shake, event.by === "egg" ? 0.9 : 0.5);
        break;
      case "pot": {
        const paint = event.kind === 3 ? m.china : event.kind === 2 ? m.oak : event.kind === 1 ? m.iron : m.copper;
        this.burst(event.x, event.y, paint, event.kind === 3 ? 12 : 7, 0.2, 5);
        this.burst(event.x, event.y, m.dust, 5, 0.3, 2);
        if (event.hit === "bale") {
          this.burst(event.x, event.y, m.hay, 16, 0.42, 5.5);
          this.burst(event.x, event.y, m.hayDark, 8, 0.3, 4);
        }
        if (game.phase !== "ready") this.shake = Math.max(this.shake, event.hit === "egg" ? 0.9 : event.hit === "bale" ? 0.35 : 0.14);
        break;
      }
      case "blast":
        this.burst(event.x, event.y + 0.3, m.fire, 18, 0.55, 6.5);
        this.burst(event.x, event.y + 0.3, m.ember, 12, 0.4, 4.5);
        this.burst(event.x, event.y + 0.6, m.steam, 9, 0.7, 2.4);
        this.burst(event.x, event.y + 0.2, m.iron, 6, 0.16, 7);
        if (event.by === "bale") {
          this.burst(event.x, event.y + 0.4, m.hay, 16, 0.4, 5.5);
          this.burst(event.x, event.y + 0.4, m.hayDark, 8, 0.28, 4);
        } else {
          this.burst(event.x, event.y + 0.5, m.egg, 14, 0.24, 7);
          this.burst(event.x, event.y + 0.5, m.yolk, 8, 0.2, 5);
        }
        this.shake = Math.max(this.shake, event.by === "egg" ? 1 : 0.7);
        break;
      case "hoist":
        this.burst(event.x, event.y - 0.2, m.dust, 5, 0.2, 1.4);
        this.shake = Math.max(this.shake, 0.12);
        break;
      case "landing":
        this.burst(event.x - 0.7, event.y, m.dust, 4, 0.2, 1.4);
        this.burst(event.x + 0.7, event.y, m.dust, 4, 0.2, 1.4);
        this.shake = Math.max(this.shake, 0.18);
        break;
      case "roll": {
        const keg = this.kegs[0];
        if (keg) this.burst(keg.def.x - keg.def.r, keg.def.y - keg.def.r * 0.7, m.vermilion, 6, 0.16, 3);
        this.burst(event.x, event.y, m.dust, 6, 0.24, 1.8);
        this.shake = Math.max(this.shake, 0.3);
        break;
      }
      case "tread": {
        const keg = this.kegs[0];
        if (keg) keg.kick = 1;
        this.burst(event.x, event.y - 0.6, m.dust, 6, 0.22, 2);
        if (event.threw) {
          this.burst(egg.x, egg.y - 0.3, m.hay, 10, 0.26, 3);
          this.burst(egg.x, egg.y - 0.3, m.hayDark, 5, 0.2, 2);
        }
        this.shake = Math.max(this.shake, 0.3);
        break;
      }
      case "crush":
        this.burst(event.x, event.y, m.hay, 16, 0.5, 4.5);
        this.burst(event.x, event.y, m.hayDark, 8, 0.3, 3);
        this.shake = Math.max(this.shake, 0.4);
        break;
      case "smash":
        this.burst(event.x, event.y, m.oak, 14, 0.4, 5);
        this.burst(event.x, event.y - 0.4, m.oakDark, 10, 0.3, 4);
        this.burst(event.x, event.y + 0.4, m.dust, 6, 0.3, 2);
        this.shake = Math.max(this.shake, 0.6);
        break;
      case "bung":
        this.burst(event.x, event.y + 0.8, m.dust, 12, 0.34, 3);
        this.burst(event.x, event.y + 0.8, m.oak, 6, 0.24, 2.4);
        this.shake = Math.max(this.shake, 0.7);
        break;
      case "knock":
        this.burst(event.x, event.y, m.dust, 7, 0.34, 2.4);
        this.shake = Math.max(this.shake, Math.min(0.9, event.jolt / 12));
        break;
      case "crack":
        this.burst(event.x, event.y, m.albumen, 5, 0.14, 3);
        break;
      case "fling":
        this.burst(egg.x, egg.y - 0.4, m.dust, 6, 0.3, 2);
        this.shake = Math.max(this.shake, 0.3);
        break;
      case "broken": {
        if (this.king) this.king.enabled = false;
        const mess = this.group("mess", this.scene, [event.x, event.y - 0.36, 0.2]);
        this.shape("sphere", mess, [0, 0, 0], [1.3, 0.12, 1.1], m.albumen);
        this.shape("sphere", mess, [0.1, 0.08, 0.1], [0.48, 0.24, 0.48], m.yolk);
        this.shape("sphere", mess, [-0.55, 0.1, 0], [0.5, 0.36, 0.5], m.egg, [0, 0, 40]);
        this.shape("sphere", mess, [0.6, 0.08, -0.2], [0.42, 0.3, 0.42], m.egg, [0, 0, -30]);
        this.shape("cylinder", mess, [0.75, 0.05, 0.4], [0.34, 0.12, 0.34], m.gold, [0, 0, 70]);
        this.mess = mess;
        this.burst(event.x, event.y, m.yolk, 12, 0.3, 5);
        this.burst(event.x, event.y, m.albumen, 10, 0.26, 4);
        this.shake = 1;
        break;
      }
      case "fried":
        this.ending = { kind: "fried", t: 0, from: { x: egg.x, y: egg.y, turn: egg.turn }, to: { x: event.x, y: event.y } };
        break;
      case "caught":
        this.ending = { kind: "caught", t: 0, from: { x: egg.x, y: egg.y, turn: egg.turn }, to: { x: egg.x, y: egg.y } };
        this.shake = Math.max(this.shake, 0.25);
        break;
      case "home":
        for (let index = 0; index < 10; index += 1) this.puff([egg.x - 1 + (index % 5) * 0.5, egg.y + 0.4, 0.6], index % 2 ? m.gold : m.vermilion, 0.2, 1 + (index % 3) * 0.2, [((index % 5) - 2) * 0.5, 3 + (index % 3), 0.4]);
        break;
      default:
        break;
    }
  }
}
