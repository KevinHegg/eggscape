import * as pc from "playcanvas";
import { chasms, courseEnd, heightAt, type CourseDef } from "../sim/course";
import { MEN, type Game, type GameEvent, type Prop, type Vec3 } from "../sim/game";

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
  private chock: pc.Entity | null = null;
  private queen: pc.Entity | null = null;
  private readonly mob = new Map<number, MobLook>();
  private readonly pans = new Map<number, pc.Entity>();
  private readonly sights = new Map<string, pc.Entity>();
  private readonly props = new Map<number, pc.Entity>();
  private readonly shots = new Map<number, pc.Entity>();

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
    else {
      this.shape("cylinder", root, [0, 0.9, 0], [0.3, 0.12, 0.3], m.gold, [0, 0, 0], batch);
      for (let spike = 0; spike < 5; spike += 1) {
        const turn = (spike / 5) * Math.PI * 2;
        this.shape("cone", root, [Math.cos(turn) * 0.12, 1.02, Math.sin(turn) * 0.12], [0.08, 0.16, 0.08], m.gold, [0, 0, 0], batch);
      }
    }
    const arms = [-1, 1].map((hand) => {
      const arm = this.group("arm", root, [hand * 0.21, 0.5, 0], [0, 0, hand * -150]);
      this.shape("box", arm, [0, 0.2, 0], [0.08, 0.4, 0.08], coat, [0, 0, 0], batch);
      return arm;
    });
    return { root, arms };
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

  load(game: Game): void {
    this.scene.destroy();
    this.scene = new pc.Entity("scene");
    this.app.root.addChild(this.scene);
    this.props.clear();
    this.shots.clear();
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
    this.buildMob(game);
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
    // The castle gate he has just come out of.
    const gate = this.group("gate", this.scene, [0, 0, 13]);
    this.shape("box", gate, [0, 4.5, 0], [16, 9, 2.4], m.stone, [0, 0, 0], true);
    this.shape("box", gate, [0, 2.2, -1.25], [4.4, 4.4, 0.2], m.ink, [0, 0, 0], true);
    for (const side of [-1, 1]) {
      this.shape("cylinder", gate, [side * 8.5, 6, 0], [4.4, 12, 4.4], m.stone, [0, 0, 0], true);
      this.shape("cone", gate, [side * 8.5, 14, 0], [5.2, 4.4, 5.2], m.vermilion, [0, 0, 0], true);
    }
    // Bunting across the street: it is a feast day, and he is the feast.
    const flags = [m.vermilion, m.gold, m.lapis, m.verdigris];
    for (const d of [14, 32, course.tower.d + 30, course.tower.d + 52]) {
      const y = heightAt(course, d) + 7.2;
      this.shape("box", this.scene, [0, y, -d], [course.width + 3, 0.04, 0.04], m.oakDark, [0, 0, 0], true);
      for (let flag = 0; flag < 11; flag += 1) {
        const x = (flag - 5) * 1.15;
        const sag = (1 - (x / 6.3) ** 2) * 0.5;
        this.shape("cone", this.scene, [x, y - 0.32 - sag, -d], [0.5, 0.6, 0.05], flags[flag % flags.length]!, [180, 0, 0], true);
      }
    }
  }

  /** Timbered houses stepping down both sides of the street. */
  private buildHouses(course: CourseDef): void {
    const m = this.m;
    const half = course.width / 2;
    const plasters = [m.plaster, m.plasterWarm, m.plasterCool];
    const roofs = [m.vermilion, m.lapis, m.verdigris, m.oakDark];
    const canal = chasms(course)[0];
    const yard = course.finish - 8;
    for (const side of [-1, 1]) {
      let d = -8;
      let index = side < 0 ? 0 : 5;
      while (d < yard) {
        const unit = this.chance();
        const long = 6.4 + unit * 2.4;
        const deep = 5 + ((index * 7) % 3) * 0.7;
        const floors = 2 + ((index * 5 + (side < 0 ? 1 : 0)) % 2);
        index += 1;
        if (canal && d + long > canal.d0 - 0.6 && d < canal.d1 + 0.6) {
          d = canal.d1 + 0.8;
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
    for (const gap of chasms(course)) {
      const lip = heightAt(course, gap.d0 - 0.01);
      const far = heightAt(course, gap.d1 + 0.01);
      const wide = gap.d1 - gap.d0;
      const water = Math.min(lip, far) - 9;
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
      // What is left of the old bridge: splintered planks on the right, where nothing stands now.
      this.shape("box", this.scene, [2.9, lip - 0.02, -(gap.d0 + 0.5)], [2.4, 0.14, 1.6], m.oak, [5, 8, 0], true);
      this.shape("box", this.scene, [4.2, lip - 0.3, -(gap.d0 + 1)], [1.1, 0.14, 2.1], m.oakDark, [-24, -14, 0], true);
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
    const lineY = heightAt(course, course.finish);
    for (const side of [-1, 1]) this.shape("cylinder", this.scene, [side * (half + 0.3), lineY + 3, -course.finish], [0.24, 6, 0.24], m.oakDark, [0, 0, 0], true);
    this.shape("box", this.scene, [0, lineY + 5.4, -course.finish], [course.width + 0.8, 1, 0.08], m.lapis, [0, 0, 0], true);
    this.shape("box", this.scene, [0, lineY + 4.8, -course.finish], [course.width + 0.8, 0.14, 0.1], m.gold, [0, 0, 0], true);

    const roostY = heightAt(course, course.roost);
    const roost = this.group("roost", this.scene, [0, roostY, -course.roost]);
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
    const post = course.windlass;
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

    const well = course.well;
    const wellRoot = this.group("well", this.scene, [well.x, heightAt(course, well.d), -well.d]);
    this.shape("cylinder", wellRoot, [0, 0.7, 0], [2.3, 1.4, 2.3], m.stone, [0, 0, 0], true);
    this.shape("cylinder", wellRoot, [0, 1.36, 0], [1.7, 0.1, 1.7], m.water, [0, 0, 0], true);
    for (const side of [-1, 1]) this.shape("box", wellRoot, [side * 1, 2.2, 0], [0.16, 2, 0.16], m.oakDark, [0, 0, 0], true);
    this.shape("box", wellRoot, [0, 3.3, 0], [2.6, 0.14, 1.5], m.vermilion, [0, 0, 0], true);
    this.shape("cylinder", wellRoot, [0, 2.9, 0], [0.24, 2, 0.24], m.oak, [0, 0, 90], true);

    const sacks = course.sacks;
    const pile = this.group("sacks", this.scene, [sacks.x, heightAt(course, sacks.d), -sacks.d]);
    for (const [x, y, z, turn] of [[-0.6, 0.4, -0.3, 10], [0.55, 0.4, -0.2, -14], [0, 0.4, 0.6, 30], [-0.3, 1.1, -0.1, -8], [0.4, 1.1, 0.2, 22], [0, 1.75, 0, 4]] as const) {
      this.shape("sphere", pile, [x, y, z], [1.25, 0.8, 1], m.canvas, [0, turn, 0], true);
    }
    this.shape("box", pile, [0, 0.1, 0], [2.6, 0.2, 2.4], m.oakDark, [0, 0, 0], true);

    // The Queen, on a balcony over the far street, with her best frying pan.
    const queenD = course.wain.d + 5;
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
        const roostY = heightAt(game.course, game.course.roost);
        const from = cart.getPosition();
        const to = new pc.Vec3(0, roostY + 0.9, -game.course.roost + 5.2);
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
    this.syncMob(game, dt);
    this.syncPans(game);
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
      const near = game.course.roost - game.distance < 70;
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
    if (!this.tower) return;
    // While the rope holds it sways a hair in the wind, to show how little is holding it.
    const sway = tower.state === "held" ? Math.sin(this.clock * 1.3) * 0.25 : 0;
    this.tower.setLocalEulerAngles((-tower.angle * 180) / Math.PI - sway, 0, 0);
    if (this.belfry) this.belfry.enabled = game.bell.state === "hung";
    if (this.shoring) this.shoring.enabled = tower.angle < def.lean + 0.12;
    if (this.capstan) this.capstan.enabled = !game.targets.find((target) => target.id === "windlass")?.done || tower.state === "held";
    if (this.rope) {
      this.rope.enabled = tower.state === "held";
      if (this.rope.enabled) {
        const post = game.course.windlass;
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
    if (this.wain) {
      const p = game.wain.body.translation();
      const q = game.wain.body.rotation();
      this.wain.setPosition(p.x, p.y, p.z);
      this.wain.setRotation(q.x, q.y, q.z, q.w);
      if (game.wain.state === "wrecked") this.wain.setLocalEulerAngles(-18, 9, 14);
      if (game.wain.state === "away" && this.frame % 3 === 0) this.puff({ x: p.x, y: p.y - 0.5, z: p.z + 1.2 }, this.m.dust, 0.7, 0.4, [0, 0.8, 1.5]);
    }
    if (this.chock) this.chock.enabled = game.wain.state === "chocked" && !game.targets.find((target) => target.id === "wain")?.done;
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
      const k = Math.min(1, pan.t / 0.7);
      look.setPosition(pan.from.x + (pan.to.x - pan.from.x) * k, pan.from.y + (pan.to.y - pan.from.y) * k + Math.sin(k * Math.PI) * 2.2, pan.from.z + (pan.to.z - pan.from.z) * k);
      look.rotateLocal(19, 7, 23);
    }
    for (const [id, look] of this.pans) {
      if (alive.has(id)) continue;
      look.destroy();
      this.pans.delete(id);
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
      const big = target.kind === "rank" ? 2.6 : 3.4;
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
  pick(clientX: number, clientY: number, game: Game): string | null {
    const camera = this.camera.camera;
    if (!camera) return null;
    const box = this.canvas.getBoundingClientRect();
    let best: string | null = null;
    let nearest = Math.max(64, box.width * 0.17);
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
      eye = new pc.Vec3(4 + drift, heightAt(course, 26) + (portrait ? 25 : 16), -24);
      gaze = new pc.Vec3(-1, heightAt(course, course.tower.d) - (portrait ? 26 : 2), -course.tower.d - (portrait ? 0 : 6));
    } else if (game.phase === "won" && game.after > 0.4) {
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
    if (event.type === "letGo") {
      // The rope whips free: a line of dust from the quay up to the tower's head.
      const def = game.course.tower;
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
    if (event.type === "slam") {
      this.shake = 1.5;
      const def = game.course.tower;
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
    if (event.type === "wainOff") this.burst({ x: event.at.x, y: event.at.y - 0.4, z: event.at.z - 1.4 }, m.gold, 7, 0.35, 6);
    if (event.type === "wainCrash") {
      this.shake = Math.min(1.4, this.shake + 0.6);
      this.burst(event.at, m.yolk, 12, 0.7, 8);
      this.burst(event.at, m.oak, 8, 0.5, 6);
      this.burst(event.at, m.spray, 8, 0.8, 5);
      this.pulse({ x: event.at.x, y: event.at.y - 0.6, z: event.at.z }, m.dust, 1.5, 10, 0.5);
    }
    if (event.type === "finish") {
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
