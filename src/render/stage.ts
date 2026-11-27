import * as pc from "playcanvas";
import { BALE_H, BALE_W, EGG, eggOutline, type Block, type Game, type GameEvent, type LevelDef, type WheelDef } from "../sim/kitchen";

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
  private holdAsk: { lowest: number; cover: number } | null = null;
  /** The water wheels of the room being played, and how far open each sluice is drawn. */
  private mills: Array<{ def: WheelDef; wheel: pc.Entity; lever: pc.Entity; gate: pc.Entity; gateY: number; stream: pc.Entity; reach: number; fall: pc.Entity; k: number; drip: number }> = [];
  private flames: pc.Entity[] = [];
  private fried: pc.Entity | null = null;
  private mess: pc.Entity | null = null;
  private catcher: pc.Entity | null = null;
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
      water: this.paint("water", INK.water, { gloss: 0.9, glow: 0.45, opacity: 0.88 }),
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
    this.catcher = null;
    this.ending = null;
    this.shake = 0;
    this.hatch = 0;
    this.hatchOpen = false;
    this.arrival = arrive ? { from: arrive, t: 0, gone: false } : null;
    this.mills = [];
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
      this.buildPans(level);
      this.buildNest(level, here);
      if (level.hatch) this.buildHatch(level, here);
    }
    this.buildKing();

    const m = this.m;
    this.ghost = this.baleShape(this.scene, m.ghost);
    this.ghost.enabled = false;
    for (const socket of game.level.sockets) {
      if (!socket.seat) continue;
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
    const rail = level.wheels.length === 0;
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
      this.shape("box", plank, [def.side * (def.seat - 0.06), 0.3, 0], [0.12, 0.4, 1.3], m.vermilion);
      // The end that wants a bale: painted so it reads as a target.
      this.shape("box", plank, [-def.side * (def.load - 0.55), 0.065, 0], [0.9, 0.02, 1.2], m.gold);
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
  hold(lowest: number | null, cover = 0): void {
    this.holdAsk = lowest === null ? null : { lowest, cover };
    if (lowest === null) this.held = null;
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
    }
    for (const [id, entity] of this.bales) {
      if (live.has(id)) continue;
      entity.destroy();
      this.bales.delete(id);
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
    if (this.catcher) {
      const k = Math.min(1, (this.ending?.t ?? 1) + dt * 3);
      if (this.ending) this.ending.t = k;
      this.catcher.setLocalScale(1.7 * k, 1.7 * k, 1.7 * k);
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
    // Far enough back for the whole width; on a wide screen, for the whole height as well.
    const distance = Math.max(SHOW_W / 2 / (half * aspect), aspect > 0.8 ? SHOW_H / 2 / half : 0);
    const seen = 2 * distance * half;
    const midY = (level.top + level.bottom) / 2;
    const room = level.top - level.bottom + 1.4;
    const slack = Math.max(0, (room - seen) / 2);
    // On a tall screen there is room to spare: give it to the top, where the bar of the HUD is.
    const lift = Math.max(0, Math.min(0.5, (seen - (room - 0.9)) / 2));
    let want = Math.min(midY + slack, Math.max(midY - slack, game.egg.y - seen * 0.12)) + lift;
    if (this.holdAsk) {
      const covered = (this.holdAsk.cover / Math.max(1, this.canvas.clientHeight)) * seen;
      this.held = Math.min(want, this.holdAsk.lowest - covered + seen / 2);
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
        if (game.wheels.some((wheel) => wheel.wet && Math.hypot(event.x - wheel.x, event.y - wheel.y) < wheel.def.r + 0.7)) {
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
      case "caught": {
        const catcher = this.person(this.scene, [egg.x + (egg.x > 2.4 ? -1 : 1), egg.y - EGG.blunt - 0.05, 0.5], m.plasterWarm);
        catcher.arms[0]!.setLocalEulerAngles(0, 0, 100);
        this.pan(catcher.arms[0]!, [0, 0.46, 0], 0.46);
        catcher.root.setLocalScale(0.01, 0.01, 0.01);
        this.catcher = catcher.root;
        this.ending = { kind: "caught", t: 0, from: { x: egg.x, y: egg.y, turn: egg.turn }, to: { x: egg.x, y: egg.y } };
        break;
      }
      case "home":
        for (let index = 0; index < 10; index += 1) this.puff([egg.x - 1 + (index % 5) * 0.5, egg.y + 0.4, 0.6], index % 2 ? m.gold : m.vermilion, 0.2, 1 + (index % 3) * 0.2, [((index % 5) - 2) * 0.5, 3 + (index % 3), 0.4]);
        break;
      default:
        break;
    }
  }
}
